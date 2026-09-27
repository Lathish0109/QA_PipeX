import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qapipex/db';
import { BugTrackerClient } from '@qapipex/bug-tracker-client';
import type { TestCase, TestStep } from '@qapipex/shared-types';
import { signEvidenceUrl } from './evidence';
import { getActiveAIService } from './ai-provider';

type TestResultRow = Database['public']['Tables']['test_results']['Row'];
type TestCaseRow = Database['public']['Tables']['test_cases']['Row'];
type FailureAnalysisRow = Database['public']['Tables']['failure_analyses']['Row'];

function toSharedTestCase(row: TestCaseRow): TestCase {
  return {
    id: row.id,
    projectId: row.project_id,
    requirementId: row.requirement_id,
    title: row.title,
    description: row.description ?? '',
    type: row.type,
    steps: (row.steps as unknown as TestStep[]) ?? [],
    expectedResult: row.expected_result,
    status: row.status,
    generatedBy: row.generated_by,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Runs AI failure analysis for one failed/errored test result and persists it.
 * Best-effort: returns null (never throws) if the AI service isn't configured
 * or the call fails — callers should treat this as "not analyzed yet", not a
 * hard error, since it's frequently invoked automatically after a run.
 */
export async function runFailureAnalysis(
  supabase: SupabaseClient<Database>,
  testResult: TestResultRow,
): Promise<FailureAnalysisRow | null> {
  const { data: testCaseRow } = await supabase
    .from('test_cases')
    .select('*')
    .eq('id', testResult.test_case_id)
    .single();
  if (!testCaseRow) return null;

  let aiService;
  try {
    aiService = await getActiveAIService(supabase);
  } catch {
    return null;
  }

  const [screenshotUrl, traceUrl, consoleLogUrl] = await Promise.all([
    signEvidenceUrl(testResult.screenshot_url),
    signEvidenceUrl(testResult.trace_url),
    signEvidenceUrl(testResult.console_log_url),
  ]);

  let analysis;
  try {
    analysis = await aiService.analyzeFailure({
      testCase: toSharedTestCase(testCaseRow),
      testResult: {
        id: testResult.id,
        testRunId: testResult.test_run_id,
        testCaseId: testResult.test_case_id,
        status: testResult.status,
        durationMs: testResult.duration_ms ?? 0,
        errorMessage: testResult.error_message ?? undefined,
        evidence: {},
        createdAt: testResult.created_at,
      },
      evidence: {
        screenshotUrl: screenshotUrl ?? undefined,
        traceUrl: traceUrl ?? undefined,
        consoleLogUrl: consoleLogUrl ?? undefined,
      },
    });
  } catch (err) {
    console.error('Failure analysis failed:', err);
    return null;
  }

  const { data: inserted, error } = await supabase
    .from('failure_analyses')
    .insert({
      test_result_id: testResult.id,
      summary: analysis.summary,
      expected_behavior: analysis.expectedBehavior,
      actual_behavior: analysis.actualBehavior,
      root_cause_hypothesis: analysis.rootCauseHypothesis ?? null,
      confidence_level: analysis.confidenceLevel,
      error_category: analysis.errorCategory,
      suggested_severity: analysis.suggestedSeverity,
      suggested_priority: analysis.suggestedPriority,
      reproduction_steps: analysis.reproductionSteps,
    })
    .select('*')
    .single();

  if (error || !inserted) {
    console.error('Failed to persist failure analysis:', error?.message);
    return null;
  }
  return inserted;
}

/**
 * Looks up whether this test case already has a bug filed for it, from any
 * previous failure. ICore's Automation API has no way to check whether a bug
 * is still open (it's create-only, see BugTrackerClient's doc comment) — so
 * "already has a bug" here means "ever had one filed", not "has an open one".
 * That's a deliberate trade-off: re-filing a duplicate on every recurrence of
 * a known issue is worse (ICore's own docs warn against exactly this — a
 * blanket per-failure report floods the tracker with noise) than occasionally
 * staying silent on a bug that was fixed and then genuinely regressed.
 */
async function findExistingBugForTestCase(
  supabase: SupabaseClient<Database>,
  testCaseId: string,
): Promise<Database['public']['Tables']['bug_references']['Row'] | null> {
  const { data: priorResults } = await supabase
    .from('test_results')
    .select('id')
    .eq('test_case_id', testCaseId);
  const resultIds = (priorResults ?? []).map((r) => r.id);
  if (resultIds.length === 0) return null;

  const { data: priorAnalyses } = await supabase
    .from('failure_analyses')
    .select('id')
    .in('test_result_id', resultIds);
  const analysisIds = (priorAnalyses ?? []).map((a) => a.id);
  if (analysisIds.length === 0) return null;

  const { data: existingBug } = await supabase
    .from('bug_references')
    .select('*')
    .in('failure_analysis_id', analysisIds)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return existingBug ?? null;
}

/**
 * Generates a bug report from a failure analysis and sends it to the ICore
 * Bug Tracker. Best-effort like runFailureAnalysis — returns null rather
 * than throwing when the AI service or Bug Tracker credentials aren't set.
 *
 * De-duplicates against ICore: if this test case already has a bug filed
 * from any earlier failure, this links the new failure_analysis to that same
 * bug instead of drafting and creating another one — see
 * findExistingBugForTestCase for why.
 */
export async function syncBugForAnalysis(
  supabase: SupabaseClient<Database>,
  analysis: FailureAnalysisRow,
  testResult: TestResultRow,
): Promise<Database['public']['Tables']['bug_references']['Row'] | null> {
  const { data: testCaseRow } = await supabase
    .from('test_cases')
    .select('*')
    .eq('id', testResult.test_case_id)
    .single();
  if (!testCaseRow) return null;

  const existingBug = await findExistingBugForTestCase(supabase, testResult.test_case_id);
  if (existingBug) {
    const { data: linkedBug, error: linkError } = await supabase
      .from('bug_references')
      .insert({
        failure_analysis_id: analysis.id,
        external_bug_id: existingBug.external_bug_id,
        external_bug_url: existingBug.external_bug_url,
        cached_status: existingBug.cached_status,
        last_synced_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (linkError) {
      console.error('Failed to link recurrence to existing bug:', linkError.message);
      return null;
    }
    return linkedBug;
  }

  let aiService;
  try {
    aiService = await getActiveAIService(supabase);
  } catch {
    return null;
  }

  const sharedTestCase = toSharedTestCase(testCaseRow);
  const sharedAnalysis = {
    id: analysis.id,
    testResultId: analysis.test_result_id,
    summary: analysis.summary,
    expectedBehavior: analysis.expected_behavior,
    actualBehavior: analysis.actual_behavior,
    rootCauseHypothesis: analysis.root_cause_hypothesis ?? undefined,
    confidenceLevel: (analysis.confidence_level ?? 'low') as 'low' | 'medium' | 'high',
    errorCategory: analysis.error_category ?? '',
    suggestedSeverity: (analysis.suggested_severity ?? 'medium') as
      | 'low'
      | 'medium'
      | 'high'
      | 'critical',
    suggestedPriority: (analysis.suggested_priority ?? 'medium') as
      | 'low'
      | 'medium'
      | 'high'
      | 'urgent',
    reproductionSteps: (analysis.reproduction_steps as unknown as string[]) ?? [],
    createdAt: analysis.created_at,
  };

  let content;
  try {
    content = await aiService.generateBugReport({ failureAnalysis: sharedAnalysis, testCase: sharedTestCase });
  } catch (err) {
    console.error('Bug report generation failed:', err);
    return null;
  }

  const [screenshotUrl, traceUrl, consoleLogUrl] = await Promise.all([
    signEvidenceUrl(testResult.screenshot_url),
    signEvidenceUrl(testResult.trace_url),
    signEvidenceUrl(testResult.console_log_url),
  ]);
  const evidenceLinks = [screenshotUrl, traceUrl, consoleLogUrl].filter((v): v is string => Boolean(v));

  const client = new BugTrackerClient();

  let created;
  try {
    created = await client.createBug({
      ...content,
      evidenceLinks,
      source: 'qa-system',
      sourceRefs: {
        testRunId: testResult.test_run_id,
        testResultId: testResult.id,
        testCaseId: sharedTestCase.id,
        projectId: sharedTestCase.projectId,
      },
    });
  } catch (err) {
    console.error('Bug Tracker sync failed:', err);
    return null;
  }

  const { data: bugRef, error } = await supabase
    .from('bug_references')
    .insert({
      failure_analysis_id: analysis.id,
      external_bug_id: created.id,
      external_bug_url: created.url,
      cached_status: created.status,
      last_synced_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    console.error('Failed to persist bug reference:', error.message);
    return null;
  }
  return bugRef;
}

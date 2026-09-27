import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runFailureAnalysis, syncBugForAnalysis } from '@/lib/pipeline';
import { createServiceClient } from '@qapipex/db';
import type { WorkerRunRequest, WorkerRunResponse } from '@qapipex/shared-types';
import type { Database } from '@qapipex/db';

/**
 * Runs failure analysis + bug sync for every failed result in the background,
 * after the HTTP response has already been sent — a run with several
 * failures shouldn't force the client to wait through N sequential AI calls
 * on top of the Playwright execution it's already waiting on.
 *
 * Uses the service-role client rather than the request-scoped cookie client:
 * Next.js's cookies()-backed client is only valid for the lifetime of the
 * request, and this deliberately keeps running after the response returns.
 * That's safe here — this is server-initiated background work, not a
 * user-facing query, so bypassing RLS is the same trust boundary the worker
 * itself already operates in.
 */
function runFailureAnalysisPipelineInBackground(
  failedResults: Database['public']['Tables']['test_results']['Row'][],
): void {
  if (failedResults.length === 0) return;
  const serviceClient = createServiceClient();
  (async () => {
    for (const result of failedResults) {
      const analysis = await runFailureAnalysis(serviceClient, result);
      if (analysis) {
        await syncBugForAnalysis(serviceClient, analysis, result);
      }
    }
  })().catch((err) => {
    console.error('Background failure-analysis pipeline crashed:', err);
  });
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('test_runs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ testRuns: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const projectId = typeof body.projectId === 'string' ? body.projectId : null;
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, base_url')
    .eq('id', projectId)
    .single();
  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const { data: approvedCases, error: casesError } = await supabase
    .from('test_cases')
    .select('id, steps, expected_result')
    .eq('project_id', projectId)
    .eq('status', 'approved');

  if (casesError) {
    return NextResponse.json({ error: casesError.message }, { status: 500 });
  }
  if (!approvedCases || approvedCases.length === 0) {
    return NextResponse.json(
      { error: 'No approved test cases for this project yet' },
      { status: 400 },
    );
  }

  const { data: testRun, error: runInsertError } = await supabase
    .from('test_runs')
    .insert({
      project_id: projectId,
      triggered_by: user.id,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (runInsertError || !testRun) {
    return NextResponse.json(
      { error: runInsertError?.message ?? 'Failed to create test run' },
      { status: 500 },
    );
  }

  const workerUrl = process.env.WORKER_URL;
  const workerSecret = process.env.WORKER_SHARED_SECRET;
  if (!workerUrl || !workerSecret) {
    await supabase.from('test_runs').update({ status: 'error' }).eq('id', testRun.id);
    return NextResponse.json(
      { error: 'WORKER_URL / WORKER_SHARED_SECRET are not configured on the server.' },
      { status: 503 },
    );
  }

  const runRequest: WorkerRunRequest = {
    testRunId: testRun.id,
    projectId,
    baseUrl: project.base_url,
    testCases: approvedCases.map((tc) => ({
      id: tc.id,
      steps: (tc.steps as unknown as WorkerRunRequest['testCases'][number]['steps']) ?? [],
      expectedResult: tc.expected_result,
    })),
  };

  let workerResponse: WorkerRunResponse;
  try {
    const res = await fetch(`${workerUrl}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify(runRequest),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      throw new Error(`Worker returned ${res.status}: ${await res.text()}`);
    }
    workerResponse = (await res.json()) as WorkerRunResponse;
  } catch (err) {
    await supabase.from('test_runs').update({ status: 'error' }).eq('id', testRun.id);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Worker not reachable: ${err.message}`
            : 'Worker not reachable — is `npm run dev:worker` running?',
      },
      { status: 502 },
    );
  }

  const { data: insertedResults, error: resultsInsertError } = await supabase
    .from('test_results')
    .insert(
      workerResponse.results.map((r) => ({
        test_run_id: testRun.id,
        test_case_id: r.testCaseId,
        status: r.status,
        duration_ms: r.durationMs,
        error_message: r.errorMessage,
        screenshot_url: r.screenshotPath,
        trace_url: r.tracePath,
        console_log_url: r.consoleLogPath,
      })),
    )
    .select('*');

  if (resultsInsertError) {
    return NextResponse.json({ error: resultsInsertError.message }, { status: 500 });
  }

  const { data: updatedRun, error: updateError } = await supabase
    .from('test_runs')
    .update({ status: workerResponse.runStatus, completed_at: new Date().toISOString() })
    .eq('id', testRun.id)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Best-effort: analyze failures and sync bugs. Kicked off after the
  // response below is sent, not awaited here — see
  // runFailureAnalysisPipelineInBackground's doc comment for why. If
  // ANTHROPIC_API_KEY / BUG_TRACKER_* aren't configured, it silently no-ops
  // and the failures just sit unanalyzed until configured later.
  const failedResults = (insertedResults ?? []).filter(
    (r) => r.status === 'failed' || r.status === 'error',
  );
  runFailureAnalysisPipelineInBackground(failedResults);

  return NextResponse.json({ testRun: updatedRun }, { status: 201 });
}

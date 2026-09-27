import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveAIService, getActiveProvider, isProviderConfiguredAnywhere } from '@/lib/ai-provider';
import { AI_PROVIDER_ENV_VAR, AI_PROVIDER_LABELS } from '@qapipex/ai-service';
import type { Json } from '@qapipex/db';
import type { PageElementSnapshot, WorkerSnapshotResponse } from '@qapipex/shared-types';

/**
 * Best-effort: grounds generated selectors in the real page, but a requirement
 * a user hasn't set up a live site for yet (or a worker that's briefly down)
 * shouldn't block test case generation — it just falls back to guessing.
 */
async function tryCapturePageSnapshot(baseUrl: string): Promise<PageElementSnapshot[] | undefined> {
  const workerUrl = process.env.WORKER_URL;
  const workerSecret = process.env.WORKER_SHARED_SECRET;
  if (!workerUrl || !workerSecret) return undefined;

  try {
    const res = await fetch(`${workerUrl}/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerSecret}` },
      body: JSON.stringify({ baseUrl }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as WorkerSnapshotResponse;
    return body.elements;
  } catch {
    return undefined;
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: requirement, error: reqError } = await supabase
    .from('requirements')
    .select('*')
    .eq('id', id)
    .single();

  if (reqError || !requirement) {
    return NextResponse.json({ error: reqError?.message ?? 'Requirement not found' }, { status: 404 });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, base_url')
    .eq('id', requirement.project_id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Requirement has no associated project' }, { status: 500 });
  }

  const { data: credentials } = await supabase
    .from('project_credentials')
    .select('label')
    .eq('project_id', project.id);

  const provider = await getActiveProvider(supabase);
  if (!(await isProviderConfiguredAnywhere(supabase, provider))) {
    return NextResponse.json(
      {
        error: `${AI_PROVIDER_LABELS[provider]} is selected in Settings, but ${AI_PROVIDER_ENV_VAR[provider]} is not configured on the server yet.`,
      },
      { status: 503 },
    );
  }
  const aiService = await getActiveAIService(supabase);
  const pageSnapshot = await tryCapturePageSnapshot(project.base_url);

  let generated;
  try {
    generated = await aiService.generateTestCases({
      requirementText: requirement.text,
      baseUrl: project.base_url,
      availableCredentialLabels: (credentials ?? []).map((c) => c.label),
      pageSnapshot,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI test case generation failed' },
      { status: 502 },
    );
  }

  if (generated.length === 0) {
    return NextResponse.json({ error: 'AI returned no test cases' }, { status: 502 });
  }

  // Regenerating replaces the previous AI draft rather than piling on top of it.
  // Cases a human has already approved or rejected are a recorded decision and are kept.
  const { error: deleteError } = await supabase
    .from('test_cases')
    .delete()
    .eq('requirement_id', id)
    .eq('status', 'draft');

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('test_cases')
    .insert(
      generated.map((tc) => ({
        project_id: project.id,
        requirement_id: id,
        title: tc.title,
        description: tc.description,
        type: tc.type,
        steps: tc.steps as unknown as Json,
        expected_result: tc.expectedResult,
        status: 'draft' as const,
        generated_by: 'ai' as const,
      })),
    )
    .select('*');

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ testCases: inserted }, { status: 201 });
}

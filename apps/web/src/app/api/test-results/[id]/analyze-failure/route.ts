import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runFailureAnalysis, syncBugForAnalysis } from '@/lib/pipeline';
import { getActiveProvider } from '@/lib/ai-provider';
import { AI_PROVIDER_ENV_VAR, AI_PROVIDER_LABELS, isProviderConfigured } from '@qapipex/ai-service';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: testResult, error } = await supabase
    .from('test_results')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !testResult) {
    return NextResponse.json({ error: 'Test result not found' }, { status: 404 });
  }
  if (testResult.status !== 'failed' && testResult.status !== 'error') {
    return NextResponse.json({ error: 'Only failed/errored results can be analyzed' }, { status: 400 });
  }

  const analysis = await runFailureAnalysis(supabase, testResult);
  if (!analysis) {
    const provider = await getActiveProvider(supabase);
    const hint = isProviderConfigured(provider)
      ? `${AI_PROVIDER_LABELS[provider]} is configured but the call failed — check the server logs for the real error (e.g. billing/rate limits).`
      : `${AI_PROVIDER_LABELS[provider]} is selected in Settings, but ${AI_PROVIDER_ENV_VAR[provider]} is not configured on the server yet.`;
    return NextResponse.json({ error: `Analysis failed — ${hint}` }, { status: 503 });
  }

  const bugRef = await syncBugForAnalysis(supabase, analysis, testResult);

  return NextResponse.json({ analysis, bugReference: bugRef }, { status: 201 });
}

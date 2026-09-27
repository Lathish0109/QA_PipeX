import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveProvider, isProviderConfiguredAnywhere } from '@/lib/ai-provider';
import { AI_PROVIDERS, type AIProvider } from '@qapipex/ai-service';

export async function GET() {
  const supabase = await createClient();
  const active = await getActiveProvider(supabase);
  const availability = Object.fromEntries(
    await Promise.all(AI_PROVIDERS.map(async (p) => [p, await isProviderConfiguredAnywhere(supabase, p)])),
  ) as Record<AIProvider, boolean>;

  return NextResponse.json({ active, availability });
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
  const provider = body.provider;
  if (!AI_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: `provider must be one of ${AI_PROVIDERS.join(', ')}` }, { status: 400 });
  }

  const { error } = await supabase
    .from('app_settings')
    .update({ value: { provider }, updated_by: user.id })
    .eq('key', 'ai_provider');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ active: provider });
}

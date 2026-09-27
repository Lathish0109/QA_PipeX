import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encryptSecret } from '@qapipex/db';
import { AI_PROVIDERS, type AIProvider } from '@qapipex/ai-service';

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('ai_provider_keys').select('provider, updated_at');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stored = Object.fromEntries(
    AI_PROVIDERS.map((p) => [p, data?.find((row) => row.provider === p)?.updated_at ?? null]),
  ) as Record<AIProvider, string | null>;

  return NextResponse.json({ stored });
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
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';

  if (!AI_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: `provider must be one of ${AI_PROVIDERS.join(', ')}` }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
  }

  let encryptedKey: string;
  try {
    encryptedKey = encryptSecret(apiKey);
  } catch {
    return NextResponse.json(
      { error: 'CREDENTIALS_ENCRYPTION_KEY is not configured on the server yet.' },
      { status: 503 },
    );
  }

  const { error } = await supabase
    .from('ai_provider_keys')
    .upsert({ provider, encrypted_key: encryptedKey, updated_by: user.id }, { onConflict: 'provider' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
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

  const { error } = await supabase.from('ai_provider_keys').delete().eq('provider', provider);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

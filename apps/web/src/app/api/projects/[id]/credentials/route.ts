import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encryptSecret } from '@qapipex/db';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Never select encrypted_password here — the browser has no business
  // seeing it even in encrypted form.
  const { data, error } = await supabase
    .from('project_credentials')
    .select('id, project_id, label, username, created_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ credentials: data });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!label || !username || !password) {
    return NextResponse.json({ error: 'label, username, and password are required' }, { status: 400 });
  }

  let encryptedPassword: string;
  try {
    encryptedPassword = encryptSecret(password);
  } catch {
    return NextResponse.json(
      { error: 'CREDENTIALS_ENCRYPTION_KEY is not configured on the server yet.' },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from('project_credentials')
    .insert({ project_id: id, label, username, encrypted_password: encryptedPassword })
    .select('id, project_id, label, username, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ credential: data }, { status: 201 });
}

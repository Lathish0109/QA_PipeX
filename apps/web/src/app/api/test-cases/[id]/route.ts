import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { TestStep } from '@qapipex/shared-types';
import type { Json } from '@qapipex/db';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const update: {
    title?: string;
    description?: string | null;
    expected_result?: string;
    steps?: Json;
  } = {};

  if (typeof body.title === 'string') update.title = body.title.trim();
  if (typeof body.description === 'string') update.description = body.description.trim();
  if (typeof body.expectedResult === 'string') update.expected_result = body.expectedResult.trim();
  if (Array.isArray(body.steps)) update.steps = body.steps as TestStep[] as unknown as Json;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('test_cases')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ testCase: data });
}

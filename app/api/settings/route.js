import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const user = await requireUser();
    const sb = await createSupabaseServer();
    const { data } = await sb.from('settings').select('*').eq('user_id', user.id).single();
    return NextResponse.json(data || {});
  } catch {
    return NextResponse.json({}, { status: 401 });
  }
}

export async function PATCH(req) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const sb = await createSupabaseServer();
    const { error } = await sb.from('settings').upsert({
      user_id: user.id,
      ...body,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
}

import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';

export async function GET() {
  try {
    const user = await requireUser();
    const sb = await createSupabaseServer();
    const { data, error } = await sb.from('clients').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, clients: data });
  } catch {
    return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
  }
}

export async function POST(request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const sb = await createSupabaseServer();
    const { data, error } = await sb.from('clients')
      .insert([{ ...body, user_id: user.id, updated_at: new Date().toISOString() }])
      .select().single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, client: data });
  } catch {
    return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
  }
}

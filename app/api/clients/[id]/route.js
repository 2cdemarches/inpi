import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const sb = await createSupabaseServer();
    const { data, error } = await sb.from('clients').select('*').eq('id', id).eq('user_id', user.id).single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    return NextResponse.json({ ok: true, client: data });
  } catch {
    return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const body = await request.json();
    const sb = await createSupabaseServer();
    const { data, error } = await sb.from('clients')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', user.id)
      .select().single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, client: data });
  } catch {
    return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const sb = await createSupabaseServer();
    const { error } = await sb.from('clients').delete().eq('id', id).eq('user_id', user.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
  }
}

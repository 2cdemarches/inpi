import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';

export async function GET() {
  try {
    const user = await requireUser();
    const sb = await createSupabaseServer();
    const { data, error } = await sb.from('modeles').select('*').eq('user_id', user.id).order('nom');
    if (error) throw error;
    return NextResponse.json({ ok: true, modeles: data || [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const user = await requireUser();
    const sb = await createSupabaseServer();
    const body = await req.json();
    const { data, error } = await sb.from('modeles').insert({ ...body, user_id: user.id }).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, modele: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

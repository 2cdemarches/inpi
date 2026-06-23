import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';

export async function DELETE(req, { params }) {
  try {
    const user = await requireUser();
    const sb = await createSupabaseServer();
    const { id } = await params;
    await sb.from('modeles').delete().eq('id', id).eq('user_id', user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

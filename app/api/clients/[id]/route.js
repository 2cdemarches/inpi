import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

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
    const admin = adminSb();

    // Vérifier que le client appartient bien à cet utilisateur
    const { data: client } = await admin.from('clients').select('id').eq('id', id).eq('user_id', user.id).single();
    if (!client) return NextResponse.json({ ok: false, error: 'Client introuvable' }, { status: 404 });

    // Supprimer les dépendances en cascade (RLS bypass via adminSb)
    await admin.from('signature_requests').delete().eq('client_id', id);
    await admin.from('documents').delete().eq('client_id', id);

    const { error } = await admin.from('clients').delete().eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Non authentifié' }, { status: 401 });
  }
}

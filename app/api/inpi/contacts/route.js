import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function GET(req) {
  try {
    const user = await requireUser();
    const sb   = await createSupabaseServer();
    const formaliteId = new URL(req.url).searchParams.get('formalite_id');
    if (!formaliteId) return NextResponse.json({ error: 'formalite_id requis' }, { status: 400 });

    const { data } = await adminSb().from('inpi_contacts')
      .select('email, sent_at')
      .eq('user_id', user.id)
      .eq('formalite_id', formaliteId)
      .order('sent_at', { ascending: false });

    return NextResponse.json({ ok: true, contacts: data ?? [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

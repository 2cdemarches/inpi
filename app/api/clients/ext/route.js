import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET /api/clients/ext?token=XXX — liste clients pour l'extension Chrome (auth par bookmarklet_token)
export async function GET(req) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return NextResponse.json({ ok: false, error: 'Token requis' }, { status: 401 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Retrouver le user via son bookmarklet_token
  const { data: settings } = await sb.from('settings')
    .select('user_id')
    .eq('bookmarklet_token', token)
    .single();

  if (!settings) return NextResponse.json({ ok: false, error: 'Token invalide' }, { status: 401 });

  const { data: clients } = await sb.from('clients')
    .select('id, denomination, type_societe, civilite, prenom, nom, capital, siege_social, ville_siege, objet_social, date_naissance, ville_naissance, cp_naissance, nationalite, adresse, date_signature, ville_signature, nb_actions, email, telephone')
    .eq('user_id', settings.user_id)
    .order('denomination');

  return NextResponse.json({ ok: true, clients: clients || [] });
}

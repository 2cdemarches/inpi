import { createSupabaseAdmin } from '@/lib/supabase-server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(req) {
  const { email, password, nom_cabinet } = await req.json();

  // Créer le compte
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // pas de vérification par email
    user_metadata: { nom_cabinet },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Créer la ligne settings pour ce cabinet
  await admin.from('settings').insert({
    user_id: data.user.id,
    nom_cabinet: nom_cabinet || '',
  });

  // Connecter directement
  const sb = await createSupabaseServer();
  await sb.auth.signInWithPassword({ email, password });

  return NextResponse.json({ ok: true });
}

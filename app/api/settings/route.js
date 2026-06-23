import { createClient } from '@supabase/supabase-js';

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function GET() {
  const { data, error } = await sb().from('settings').select('*').eq('id', 1).single();
  if (error) return Response.json({ nom_cabinet: '', representant_cabinet: '', adresse_cabinet: '' });
  return Response.json(data);
}

export async function PATCH(req) {
  const body = await req.json();
  const { error } = await sb().from('settings').upsert({ id: 1, ...body, updated_at: new Date().toISOString() });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

import { createClient } from '@supabase/supabase-js';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function GET(req, { params }) {
  const { token } = await params;
  const docType   = new URL(req.url).searchParams.get('doc');
  if (!docType) return new Response('doc requis', { status: 400 });

  const sb = adminSb();
  const { data: request } = await sb.from('signature_requests')
    .select('id, status, expires_at')
    .eq('token', token)
    .single();

  if (!request) return new Response('Lien invalide', { status: 404 });
  if (new Date(request.expires_at) < new Date()) return new Response('Lien expiré', { status: 410 });

  const { data: fileData, error } = await sb.storage
    .from('signatures')
    .download(`${request.id}/${docType}.pdf`);

  if (error || !fileData) return new Response('Document introuvable', { status: 404 });

  const buf = await fileData.arrayBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'inline',
      'Cache-Control':       'private, max-age=300',
    },
  });
}

import { createClient } from '@supabase/supabase-js';
import { requireUser } from '@/lib/supabase-server';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function GET(req, { params }) {
  const { token: requestId } = await params;
  const docType = new URL(req.url).searchParams.get('doc');
  if (!docType) return new Response('doc requis', { status: 400 });

  // Vérifier que l'utilisateur est connecté et propriétaire
  const user  = await requireUser();
  const admin = adminSb();

  const { data: request, error: dbErr } = await admin
    .from('signature_requests')
    .select('id, user_id, status')
    .eq('id', requestId)
    .eq('user_id', user.id)
    .single();

  if (dbErr || !request) return new Response('Demande introuvable', { status: 404 });

  // Chercher d'abord le signé, sinon le paraphé
  const paths = request.status === 'signed'
    ? [`${requestId}/${docType}_signed.pdf`, `${requestId}/${docType}.pdf`]
    : [`${requestId}/${docType}.pdf`];

  let fileData = null;
  let usedPath = null;
  for (const path of paths) {
    const { data, error } = await admin.storage.from('signatures').download(path);
    if (!error && data) { fileData = data; usedPath = path; break; }
  }

  if (!fileData) {
    // Log pour debug
    const { data: list } = await admin.storage.from('signatures').list(requestId);
    const available = (list || []).map(f => f.name).join(', ') || 'aucun';
    return new Response(`Fichier introuvable. Disponibles : ${available}`, { status: 404 });
  }

  const buf  = await fileData.arrayBuffer();
  const isSigned = usedPath?.includes('_signed');
  const name = isSigned ? `${docType}_signé.pdf` : `${docType}.pdf`;

  return new Response(buf, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}

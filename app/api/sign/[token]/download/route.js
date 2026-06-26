import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// GET /api/sign/[requestId]/download?doc=statuts
// token param ici est en réalité l'ID de la demande (route réutilisée)
export async function GET(req, { params }) {
  const { token: requestId } = await params;
  const docType = new URL(req.url).searchParams.get('doc');

  // Authentification cabinet
  const user = await requireUser();
  const sb   = await createSupabaseServer();

  const { data: request } = await sb.from('signature_requests')
    .select('id, user_id, status, documents')
    .eq('id', requestId)
    .eq('user_id', user.id)
    .single();

  if (!request) return new Response('Introuvable', { status: 404 });

  const admin = adminSb();
  const file  = request.status === 'signed' ? `${docType}_signed.pdf` : `${docType}.pdf`;

  const { data: fileData, error } = await admin.storage
    .from('signatures')
    .download(`${requestId}/${file}`);

  if (error || !fileData) return new Response('Fichier introuvable', { status: 404 });

  const buf  = await fileData.arrayBuffer();
  const name = request.status === 'signed' ? `${docType}_signé.pdf` : `${docType}.pdf`;

  return new Response(buf, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}

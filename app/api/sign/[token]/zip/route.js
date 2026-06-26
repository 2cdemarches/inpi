import { createClient } from '@supabase/supabase-js';
import { requireUser } from '@/lib/supabase-server';
import AdmZip from 'adm-zip';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// GET /api/sign/[requestId]/zip — télécharge tous les docs signés en ZIP
export async function GET(req, { params }) {
  const { token: requestId } = await params;

  const user  = await requireUser();
  const admin = adminSb();

  const { data: request } = await admin
    .from('signature_requests')
    .select('id, user_id, status, documents, signer_name, clients(denomination)')
    .eq('id', requestId)
    .eq('user_id', user.id)
    .single();

  if (!request || request.status !== 'signed') {
    return new Response('Demande introuvable ou non signée', { status: 404 });
  }

  const zip    = new AdmZip();
  const denomination = request.clients?.denomination || 'client';

  for (const doc of (request.documents || [])) {
    const path = `${requestId}/${doc.type}_signed.pdf`;
    const { data: fileData } = await admin.storage.from('signatures').download(path);
    if (!fileData) continue;
    const buf = Buffer.from(await fileData.arrayBuffer());
    zip.addFile(`${doc.label || doc.type}_signé.pdf`, buf);
  }

  const zipBuf = zip.toBuffer();
  const safeNom = denomination.replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_');

  return new Response(zipBuf, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${safeNom}_documents_signés.zip"`,
    },
  });
}

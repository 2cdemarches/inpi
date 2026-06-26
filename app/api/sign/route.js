import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { generatePdf, findSource } from '@/lib/generate-doc';
import { addParaphes } from '@/lib/paraphe';
import { sendMail } from '@/lib/mailer';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://inpi-ten.vercel.app';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const DOC_LABELS = {
  statuts:       'Statuts',
  pouvoir:       'Pouvoir',
  souscripteurs: 'Liste des souscripteurs',
  dnc:           'Déclaration de non-condamnation',
};

async function sendSignatureEmail({ settings, to, toName, clientName, signUrl, docs }) {
  const cabinetName = settings?.nom_cabinet || '2C Expertise';
  const docList = docs.map(d => `<li>${DOC_LABELS[d] || d}</li>`).join('');
  await sendMail(settings, {
    to,
    subject: `Documents à signer — ${clientName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
        <div style="background:#1e40af;padding:24px 32px;border-radius:12px 12px 0 0">
          <h1 style="color:white;margin:0;font-size:20px">Documents à signer</h1>
        </div>
        <div style="background:#f8fafc;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0">
          <p>Bonjour ${toName || ''},</p>
          <p style="margin-top:16px">Vous trouverez ci-dessous les documents relatifs à la constitution de <strong>${clientName}</strong> à signer électroniquement.</p>
          <p style="margin-top:16px"><strong>Documents à signer :</strong></p>
          <ul style="margin:8px 0 24px 0;padding-left:20px">${docList}</ul>
          <a href="${signUrl}" style="display:inline-block;background:#1e40af;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
            ✍️ Signer les documents
          </a>
          <p style="margin-top:24px;font-size:13px;color:#64748b">Ce lien est valable 30 jours. Si vous avez des questions, contactez votre cabinet.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="font-size:12px;color:#94a3b8">${cabinetName} — Signature électronique sécurisée</p>
        </div>
      </div>
    `,
  });
}

// POST /api/sign  { clientId, documents: ['statuts','pouvoir',...], email, emailName }
export async function POST(req) {
  try {
    const user = await requireUser();
    const sb   = await createSupabaseServer();
    const body = await req.json();
    const { clientId, documents, email: emailOverride, emailName } = body;

    if (!clientId || !documents?.length) {
      return NextResponse.json({ error: 'clientId et documents requis' }, { status: 400 });
    }

    const { data: client } = await sb.from('clients').select('*').eq('id', clientId).eq('user_id', user.id).single();
    if (!client) return NextResponse.json({ error: 'Client introuvable' }, { status: 404 });

    const { data: settings } = await sb.from('settings').select('*').eq('user_id', user.id).single();

    // Générer les PDFs paraphés et les stocker dans Supabase Storage
    const admin = adminSb();
    const storedDocs = [];

    for (const docType of documents) {
      const sourcePath = findSource(client.type_societe, docType);
      if (!sourcePath) continue;

      let pdfBuf = await generatePdf(sourcePath, docType, client, settings || {});
      pdfBuf = await addParaphes(pdfBuf, client);

      const fileName = `${docType}.pdf`;
      // Stockage temporaire — sera remplacé par le signé
      storedDocs.push({ type: docType, label: DOC_LABELS[docType] || docType, fileName });
    }

    // Créer la demande de signature en DB
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: req2, error } = await admin.from('signature_requests').insert({
      client_id:  clientId,
      user_id:    user.id,
      token,
      documents:  storedDocs,
      status:     'pending',
      expires_at: expiresAt,
      signer_name: emailName || '',
      audit_trail: [{ event: 'created', at: new Date().toISOString(), by: user.email }],
    }).select().single();

    if (error) throw new Error(error.message);

    // Stocker les PDFs dans Supabase Storage (bucket: signatures)
    for (const docType of documents) {
      const sourcePath = findSource(client.type_societe, docType);
      if (!sourcePath) continue;
      let pdfBuf = await generatePdf(sourcePath, docType, client, settings || {});
      pdfBuf = await addParaphes(pdfBuf, client);
      await admin.storage.from('signatures').upload(`${req2.id}/${docType}.pdf`, pdfBuf, { contentType: 'application/pdf', upsert: true });
    }

    // Envoyer l'email (email fourni manuellement ou email du client en DB)
    const to = emailOverride || client.email;
    const signUrl = `${APP_URL}/sign/${token}`;
    if (to) {
      await sendSignatureEmail({
        settings, to,
        toName:      emailName || `${client.prenom} ${client.nom}`,
        clientName:  client.denomination,
        signUrl,
        docs: documents,
      });
    }

    return NextResponse.json({ ok: true, token, signUrl, requestId: req2.id });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/sign?id=xxx
export async function DELETE(req) {
  try {
    const user  = await requireUser();
    const admin = adminSb();
    const id    = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
    await admin.from('signature_requests').delete().eq('id', id).eq('user_id', user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sign — liste des demandes pour l'utilisateur connecté
export async function GET() {
  try {
    const user  = await requireUser();
    const admin = adminSb(); // service role pour bypasser RLS
    const { data, error } = await admin.from('signature_requests')
      .select('id, client_id, token, status, documents, signer_name, signer_ip, signed_at, expires_at, created_at, audit_trail, clients(denomination, type_societe)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, requests: data || [] });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/sign?id=xxx — déjà défini plus haut, on le laisse

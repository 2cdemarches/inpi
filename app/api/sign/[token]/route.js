import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://inpi-ten.vercel.app';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// GET /api/sign/[token] — infos publiques pour la page de signature
export async function GET(req, { params }) {
  const { token } = await params;
  const sb = adminSb();

  const { data, error } = await sb.from('signature_requests')
    .select('id,status,documents,expires_at,signer_name,clients(denomination,prenom,nom,civilite)')
    .eq('token', token)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 });
  if (data.status === 'signed') return NextResponse.json({ error: 'already_signed', signedAt: data.signed_at }, { status: 409 });
  if (new Date(data.expires_at) < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 });

  return NextResponse.json({
    ok: true,
    requestId:   data.id,
    status:      data.status,
    signerName:  data.signer_name,
    denomination: data.clients?.denomination,
    documents:   data.documents,
    expiresAt:   data.expires_at,
  });
}

// POST /api/sign/[token] — soumettre la signature
export async function POST(req, { params }) {
  const { token } = await params;
  const sb = adminSb();

  const { data: request } = await sb.from('signature_requests')
    .select('*')
    .eq('token', token)
    .single();

  if (!request) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });
  if (request.status === 'signed') return NextResponse.json({ error: 'Déjà signé' }, { status: 409 });
  if (new Date(request.expires_at) < new Date()) return NextResponse.json({ error: 'Lien expiré' }, { status: 410 });

  const body      = await req.json();
  const { signatureDataUrl, signerName } = body;
  if (!signatureDataUrl) return NextResponse.json({ error: 'Signature manquante' }, { status: 400 });

  const signerIp  = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const signedAt  = new Date().toISOString();
  const signedDocs = [];

  // Appliquer la signature sur chaque PDF
  for (const doc of (request.documents || [])) {
    const docType = doc.type;

    // Télécharger le PDF paraphé depuis Storage
    const { data: fileData, error: dlErr } = await sb.storage
      .from('signatures')
      .download(`${request.id}/${docType}.pdf`);

    if (dlErr || !fileData) continue;

    const pdfBytes   = await fileData.arrayBuffer();
    const pdfDoc     = await PDFDocument.load(pdfBytes);
    const pages      = pdfDoc.getPages();
    const lastPage   = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();
    const font       = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Décoder le dataURL de la signature (PNG base64)
    const base64     = signatureDataUrl.replace(/^data:image\/png;base64,/, '');
    const sigBytes   = Buffer.from(base64, 'base64');
    const sigImage   = await pdfDoc.embedPng(sigBytes);

    // Zone signature : bas-droite (même position que le cadre dans paraphe.js)
    const boxW = 220, boxH = 70;
    const x    = width - boxW - 40;
    const y    = 50;

    // Effacer le fond du cadre et dessiner la signature
    lastPage.drawRectangle({ x, y, width: boxW, height: boxH, color: rgb(1, 1, 1) });
    lastPage.drawImage(sigImage, { x: x + 4, y: y + 4, width: boxW - 8, height: boxH - 8 });

    // Nom + date sous la signature
    const info = `${signerName || ''} — ${new Date(signedAt).toLocaleDateString('fr-FR')}`;
    const infoSize = 7;
    const infoW  = font.widthOfTextAtSize(info, infoSize);
    lastPage.drawText(info, { x: x + (boxW - infoW) / 2, y: y - 13, size: infoSize, font, color: rgb(0.3, 0.3, 0.3) });

    // Horodatage INPI-grade en bas de page
    const stamp = `Signé électroniquement le ${new Date(signedAt).toLocaleString('fr-FR')} — IP: ${signerIp}`;
    lastPage.drawText(stamp, { x: 28, y: 8, size: 6, font, color: rgb(0.6, 0.6, 0.6) });

    const signedBytes = await pdfDoc.save();
    const signedBuf   = Buffer.from(signedBytes);

    // Sauvegarder le PDF signé
    await sb.storage.from('signatures').upload(
      `${request.id}/${docType}_signed.pdf`, signedBuf,
      { contentType: 'application/pdf', upsert: true }
    );

    signedDocs.push({ type: docType, label: doc.label, signedFile: `${docType}_signed.pdf` });
  }

  // Mettre à jour la demande
  const auditTrail = [...(request.audit_trail || []), {
    event: 'signed', at: signedAt, ip: signerIp, name: signerName,
  }];

  await sb.from('signature_requests').update({
    status:      'signed',
    signed_at:   signedAt,
    signer_name: signerName,
    signer_ip:   signerIp,
    documents:   (request.documents || []).map(d => ({
      ...d,
      signedFile: `${d.type}_signed.pdf`,
    })),
    audit_trail: auditTrail,
  }).eq('id', request.id);

  // Notifier le cabinet par email
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (RESEND_KEY) {
    const { data: settings } = await sb.from('settings').select('nom_cabinet').eq('user_id', request.user_id).single();
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: `Signature <signature@2c-expertise.fr>`,
        to:   [process.env.CABINET_EMAIL || 'l.levy@2c-expertise.fr'],
        subject: `✅ Documents signés — ${signerName}`,
        html: `<p><strong>${signerName}</strong> vient de signer les documents.</p><p>IP : ${signerIp}</p><p>Date : ${new Date(signedAt).toLocaleString('fr-FR')}</p><p><a href="${APP_URL}">Voir dans l'outil</a></p>`,
      }),
    });
  }

  return NextResponse.json({ ok: true, signedAt, docs: signedDocs });
}

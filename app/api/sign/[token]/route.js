import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { sendMail } from '@/lib/mailer';

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

    // Effacer le fond du cadre (blanc) et y placer la signature dessinée
    lastPage.drawRectangle({ x, y, width: boxW, height: boxH, color: rgb(1, 1, 1) });
    lastPage.drawImage(sigImage, { x: x + 4, y: y + 4, width: boxW - 8, height: boxH - 8 });

    // Horodatage en bas de page (le nom est déjà écrit par paraphe.js)
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
  let notifError = null;
  try {
    const { data: settings } = await sb.from('settings').select('*').eq('user_id', request.user_id).single();
    // Utiliser gmail_user comme destinataire de fallback si email_cabinet absent
    const cabinetEmail = settings?.email_cabinet || settings?.gmail_user;
    if (!cabinetEmail) throw new Error('Aucun email cabinet configuré dans Paramètres');

    const APP_URL_SIGN = process.env.NEXT_PUBLIC_APP_URL || 'https://inpi-ten.vercel.app';
    await sendMail(settings, {
      to:      cabinetEmail,
      subject: `✅ Documents signés — ${signerName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;color:#1e293b">
          <h2 style="color:#16a34a">✅ Documents signés</h2>
          <p><strong>${signerName}</strong> vient de signer les documents.</p>
          <table style="border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Date</td><td><strong>${new Date(signedAt).toLocaleString('fr-FR')}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Signataire</td><td>${signerName}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">IP</td><td>${signerIp}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Documents</td><td>${signedDocs.map(d => d.label).join(', ')}</td></tr>
          </table>
          <a href="${APP_URL_SIGN}/signature" style="display:inline-block;background:#1e40af;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">
            Voir le suivi des signatures →
          </a>
        </div>
      `,
    });
  } catch (e) {
    notifError = e.message; // on renvoie l'erreur dans la réponse pour debug
  }

  return NextResponse.json({ ok: true, signedAt, docs: signedDocs, notifError });
}

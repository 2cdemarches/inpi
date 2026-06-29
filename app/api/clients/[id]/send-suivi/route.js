import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { sendMail } from '@/lib/mailer';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://inpi-ten.vercel.app';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// POST /api/clients/[id]/send-suivi
// Génère (ou réutilise) le suivi_token et envoie l'email de suivi au client
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const user    = await requireUser();
    const sb      = await createSupabaseServer();
    const body    = await request.json().catch(() => ({}));
    const emailOverride = body?.email?.trim() || null;

    // Charger le client
    const { data: client, error } = await sb
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !client) {
      return NextResponse.json({ ok: false, error: 'Client introuvable' }, { status: 404 });
    }

    // Générer un suivi_token si absent (cas ancien client)
    let token = client.suivi_token;
    if (!token) {
      token = crypto.randomUUID();
      const admin = adminSb();
      await admin.from('clients').update({ suivi_token: token }).eq('id', id);
    }

    const suiviUrl = `${APP_URL}/suivi/${token}`;
    const toEmail  = emailOverride || client.email;

    if (!toEmail) {
      // Pas d'email : retourner juste le lien sans envoyer
      return NextResponse.json({ ok: true, suiviUrl, sent: false, reason: 'Pas d\'email configuré pour ce client' });
    }

    // Charger les settings pour l'email
    const { data: settings } = await sb.from('settings').select('*').eq('user_id', user.id).single();
    const cabinetName = settings?.nom_cabinet || 'Votre cabinet';

    // Envoyer l'email
    await sendMail(settings, {
      to: toEmail,
      subject: `Suivi de votre dossier — ${client.denomination}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
          <div style="background:linear-gradient(135deg,#4f46e5,#3730a3);padding:28px 32px;border-radius:12px 12px 0 0">
            <h1 style="color:white;margin:0;font-size:20px;font-weight:700">Votre dossier de création</h1>
            <p style="color:#c7d2fe;margin:6px 0 0;font-size:14px">${client.denomination}</p>
          </div>
          <div style="background:#f8fafc;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none">
            <p style="margin:0 0 16px">Bonjour ${client.prenom || client.nom || ''},</p>
            <p style="margin:0 0 24px;color:#475569">
              Vous pouvez suivre en temps réel l'avancement de la création de votre société
              <strong>${client.denomination}</strong> en cliquant sur le bouton ci-dessous.
            </p>
            <div style="text-align:center;margin:24px 0">
              <a href="${suiviUrl}"
                style="display:inline-block;background:#4f46e5;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">
                📋 Suivre mon dossier
              </a>
            </div>
            <p style="margin:24px 0 0;font-size:13px;color:#64748b">
              Ou copiez ce lien dans votre navigateur :<br/>
              <a href="${suiviUrl}" style="color:#4f46e5;font-size:12px;word-break:break-all">${suiviUrl}</a>
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
            <p style="font-size:12px;color:#94a3b8;margin:0">${cabinetName} — Ce lien est personnel, ne le partagez pas.</p>
          </div>
        </div>
      `,
    });

    // Mettre à jour la date d'envoi
    await adminSb().from('clients').update({ suivi_sent_at: new Date().toISOString() }).eq('id', id);

    return NextResponse.json({ ok: true, suiviUrl, sent: true, sentTo: toEmail });

  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

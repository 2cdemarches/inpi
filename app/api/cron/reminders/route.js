import { createClient } from '@supabase/supabase-js';
import { sendMail } from '@/lib/mailer';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://inpi-ten.vercel.app';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// GET /api/cron/reminders — appelé par Vercel Cron chaque lundi 9h
export async function GET(req) {
  // Sécurité : vérifier le header Vercel Cron
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sb  = adminSb();
  const now = new Date();

  // Récupérer toutes les demandes en attente avec relances activées, non expirées
  const { data: requests } = await sb.from('signature_requests')
    .select('*, clients(denomination), settings:user_id(nom_cabinet, gmail_user, gmail_app_password)')
    .eq('status', 'pending')
    .eq('reminders_enabled', true)
    .gt('expires_at', now.toISOString());

  const results = [];

  for (const req of (requests || [])) {
    const email = req.signer_email;
    if (!email) { results.push({ id: req.id, skipped: 'no email' }); continue; }

    const settings = Array.isArray(req.settings) ? req.settings[0] : req.settings;
    const denomination = req.clients?.denomination || '';
    const signUrl = `${APP_URL}/sign/${req.token}`;

    // Calculer jours restants
    const daysLeft = Math.ceil((new Date(req.expires_at) - now) / 86400000);

    try {
      await sendMail(settings, {
        to:      email,
        subject: `Rappel : documents à signer — ${denomination}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
            <div style="background:#f59e0b;padding:20px 32px;border-radius:12px 12px 0 0">
              <h1 style="color:white;margin:0;font-size:18px">⏰ Rappel — Documents en attente de signature</h1>
            </div>
            <div style="background:#f8fafc;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0">
              <p>Bonjour ${req.signer_name || ''},</p>
              <p style="margin-top:12px">Nous vous rappelons que des documents relatifs à la constitution de <strong>${denomination}</strong> sont en attente de votre signature.</p>
              <p style="margin-top:12px;color:#b45309">⚠️ Le lien expire dans <strong>${daysLeft} jour${daysLeft > 1 ? 's' : ''}</strong>.</p>
              <div style="margin:24px 0">
                <a href="${signUrl}" style="display:inline-block;background:#1e40af;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
                  ✍️ Signer les documents
                </a>
              </div>
              <p style="font-size:12px;color:#94a3b8">Si vous avez déjà signé, ignorez ce message.</p>
            </div>
          </div>
        `,
      });

      // Mettre à jour last_reminder_at
      await sb.from('signature_requests').update({ last_reminder_at: now.toISOString() }).eq('id', req.id);
      results.push({ id: req.id, sent: email });
    } catch (e) {
      results.push({ id: req.id, error: e.message });
    }
  }

  return Response.json({ ok: true, processed: results.length, results });
}

import { createClient } from '@supabase/supabase-js';
import { sendMail } from '@/lib/mailer';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://inpi-ten.vercel.app';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// GET /api/cron/reminders — appelé par Vercel Cron chaque jour à 8h
// Envoie les relances selon la fréquence configurée par user dans settings
export async function GET(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sb  = adminSb();
  const now = new Date();

  // Récupérer tous les users avec relances activées
  const { data: allSettings } = await sb.from('settings')
    .select('user_id, nom_cabinet, gmail_user, gmail_app_password, email_cabinet, reminders_enabled, reminder_frequency_days')
    .eq('reminders_enabled', true);

  const results = [];

  for (const settings of (allSettings || [])) {
    const freqDays = settings.reminder_frequency_days || 7;
    const freqMs   = freqDays * 24 * 60 * 60 * 1000;

    // Demandes en attente de cet user, non expirées
    const { data: requests } = await sb.from('signature_requests')
      .select('id, token, signer_name, signer_email, expires_at, last_reminder_at, created_at, clients(denomination)')
      .eq('user_id', settings.user_id)
      .eq('status', 'pending')
      .gt('expires_at', now.toISOString());

    for (const req of (requests || [])) {
      if (!req.signer_email) { results.push({ id: req.id, skipped: 'no email' }); continue; }

      // Vérifier si assez de temps s'est écoulé depuis le dernier rappel (ou depuis la création)
      const lastSent = req.last_reminder_at ? new Date(req.last_reminder_at) : new Date(req.created_at);
      if (now - lastSent < freqMs) { results.push({ id: req.id, skipped: 'too soon' }); continue; }

      const denomination = req.clients?.denomination || '';
      const daysLeft     = Math.ceil((new Date(req.expires_at) - now) / 86400000);
      const signUrl      = `${APP_URL}/sign/${req.token}`;

      try {
        await sendMail(settings, {
          to:      req.signer_email,
          subject: `Rappel : documents à signer — ${denomination}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
              <div style="background:#f59e0b;padding:20px 32px;border-radius:12px 12px 0 0">
                <h1 style="color:white;margin:0;font-size:18px">⏰ Rappel — Documents en attente de signature</h1>
              </div>
              <div style="background:#f8fafc;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0">
                <p>Bonjour ${req.signer_name || ''},</p>
                <p style="margin-top:12px">Des documents relatifs à la constitution de <strong>${denomination}</strong> sont en attente de votre signature.</p>
                <p style="margin-top:12px;color:#b45309">⚠️ Le lien expire dans <strong>${daysLeft} jour${daysLeft > 1 ? 's' : ''}</strong>.</p>
                <div style="margin:24px 0">
                  <a href="${signUrl}" style="display:inline-block;background:#1e40af;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600">
                    ✍️ Signer les documents
                  </a>
                </div>
                <p style="font-size:12px;color:#94a3b8">Si vous avez déjà signé, ignorez ce message.</p>
              </div>
            </div>
          `,
        });

        await sb.from('signature_requests').update({ last_reminder_at: now.toISOString() }).eq('id', req.id);
        results.push({ id: req.id, sent: req.signer_email });
      } catch (e) {
        results.push({ id: req.id, error: e.message });
      }
    }
  }

  return Response.json({ ok: true, processed: results.length, results });
}

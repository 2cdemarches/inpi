/**
 * Envoie un email via Resend (API fetch, aucune dépendance native).
 * Configurez RESEND_API_KEY dans les variables d'environnement Vercel.
 * @param {object} settings - ligne settings de la DB (smtp_from, nom_cabinet, email_cabinet)
 * @param {object} mail - { to, subject, html }
 */
export async function sendMail(settings, mail) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) throw new Error('RESEND_API_KEY manquante — ajoutez-la dans les variables Vercel');

  const from = settings?.smtp_from || `${settings?.nom_cabinet || '2C Expertise'} <onboarding@resend.dev>`;

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body:    JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend ${res.status}: ${err}`);
  }
}

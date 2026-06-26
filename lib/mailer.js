/**
 * Envoie un email via SMTP (settings) ou Resend (fallback).
 * @param {object} settings - ligne settings de la DB (smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, nom_cabinet)
 * @param {object} mail - { to, subject, html }
 */
export async function sendMail(settings, mail) {
  const smtpHost = settings?.smtp_host;
  const smtpUser = settings?.smtp_user;
  const smtpPass = settings?.smtp_pass;
  const smtpPort = settings?.smtp_port || 587;
  const from     = settings?.smtp_from || `${settings?.nom_cabinet || '2C Expertise'} <noreply@2c-expertise.fr>`;

  if (smtpHost && smtpUser && smtpPass) {
    // Import dynamique pour éviter que Turbopack bundle nodemailer
    const nodemailer  = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host:   smtpHost,
      port:   smtpPort,
      secure: smtpPort === 465,
      auth:   { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({ from, to: mail.to, subject: mail.subject, html: mail.html });
    return;
  }

  // Fallback Resend
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) throw new Error('Aucun serveur mail configuré (SMTP ou Resend)');

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body:    JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}

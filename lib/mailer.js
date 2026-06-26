/**
 * Envoie un email via SMTP Gmail avec un mot de passe d'application.
 * Credentials stockés par user dans settings (gmail_user, gmail_app_password).
 * Utilise require() (CommonJS) pour contourner le bundling Turbopack.
 */

export async function sendMail(settings, mail) {
  const gmailUser = settings?.gmail_user;
  const gmailPass = settings?.gmail_app_password;

  if (!gmailUser || !gmailPass) {
    throw new Error('Gmail non configuré — allez dans ⚙️ Paramètres et renseignez votre adresse Gmail et mot de passe d\'application');
  }

  // require() évite l'analyse statique de Turbopack (serverExternalPackages dans next.config.js)
  const nodemailer = require('nodemailer');

  const displayName = settings?.nom_cabinet || '2C Expertise';
  const from        = `"${displayName}" <${gmailUser}>`;

  const transporter = nodemailer.createTransport({
    host:   'smtp.gmail.com',
    port:   465,
    secure: true,
    auth:   { user: gmailUser, pass: gmailPass },
  });

  await transporter.sendMail({
    from,
    to:      mail.to,
    subject: mail.subject,
    html:    mail.html,
  });
}

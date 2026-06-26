/**
 * Envoie un email via l'API Gmail de l'utilisateur (OAuth2 + fetch pur).
 * Credentials stockés par user dans la table settings (gmail_refresh_token, gmail_email).
 * Fallback sur les variables d'environnement globales GMAIL_* si présentes.
 */

async function getAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Gmail OAuth erreur: ${data.error_description || JSON.stringify(data)}`);
  return data.access_token;
}

function buildRawEmail({ from, to, subject, html }) {
  const b = 'b_' + Date.now();
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${b}"`,
    '',
    `--${b}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html).toString('base64'),
    `--${b}--`,
  ];
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

/**
 * @param {object} settings  - ligne settings du user (gmail_refresh_token, gmail_email, nom_cabinet, smtp_from)
 * @param {object} mail      - { to, subject, html }
 */
export async function sendMail(settings, mail) {
  const refreshToken = settings?.gmail_refresh_token || process.env.GMAIL_REFRESH_TOKEN;
  const gmailEmail   = settings?.gmail_email         || process.env.GMAIL_ADDRESS;

  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
    throw new Error('GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET manquants dans les variables Vercel');
  }
  if (!refreshToken) {
    throw new Error('Gmail non connecté — allez dans ⚙️ Paramètres et cliquez "Connecter Gmail"');
  }

  const displayName = settings?.nom_cabinet || '2C Expertise';
  const from        = settings?.smtp_from || `${displayName} <${gmailEmail}>`;
  const accessToken = await getAccessToken(refreshToken);
  const raw         = buildRawEmail({ from, to: mail.to, subject: mail.subject, html: mail.html });

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method:  'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API ${res.status}: ${err}`);
  }
}

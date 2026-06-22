import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

// ── Cache token par clé d'intégration ────────────────────────────────────────
const tokenCache = new Map(); // integrationKey → { token, expires }

async function getToken(cfg) {
  const cacheKey = cfg.DOCUSIGN_INTEGRATION_KEY;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.token;

  const { DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_PRIVATE_KEY, DOCUSIGN_ENV } = cfg;
  if (!DOCUSIGN_INTEGRATION_KEY || !DOCUSIGN_USER_ID || !DOCUSIGN_PRIVATE_KEY) {
    throw new Error('Clés DocuSign manquantes — configure-les dans Paramètres');
  }

  const oauthHost = DOCUSIGN_ENV === 'production' ? 'account.docusign.com' : 'account-d.docusign.com';
  const pemKey = DOCUSIGN_PRIVATE_KEY.replace(/\\n/g, '\n');

  const privateKey = await crypto.subtle.importKey(
    'pkcs8', pemToBuffer(pemKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'signature impersonation' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(DOCUSIGN_INTEGRATION_KEY)
    .setSubject(DOCUSIGN_USER_ID)
    .setAudience(oauthHost)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch(`https://${oauthHost}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`DocuSign auth : ${data.error_description || data.error}`);

  tokenCache.set(cacheKey, { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 });
  return data.access_token;
}

function pemToBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN.*?-----/g, '').replace(/-----END.*?-----/g, '').replace(/\s/g, '');
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

const STATUT_FR = {
  created:   { label: 'Créé',    color: 'slate'  },
  sent:      { label: 'Envoyé',  color: 'blue'   },
  delivered: { label: 'Ouvert',  color: 'indigo' },
  completed: { label: 'Signé',   color: 'green'  },
  declined:  { label: 'Refusé',  color: 'red'    },
  voided:    { label: 'Annulé',  color: 'orange' },
  expired:   { label: 'Expiré',  color: 'amber'  },
};

export async function GET(request) {
  try {
    const cfg = {
      DOCUSIGN_INTEGRATION_KEY: process.env.DOCUSIGN_INTEGRATION_KEY,
      DOCUSIGN_USER_ID:         process.env.DOCUSIGN_USER_ID,
      DOCUSIGN_ACCOUNT_ID:      process.env.DOCUSIGN_ACCOUNT_ID,
      DOCUSIGN_PRIVATE_KEY:     process.env.DOCUSIGN_PRIVATE_KEY,
      DOCUSIGN_ENV:             process.env.DOCUSIGN_ENV || 'production',
    };

    const token = await getToken(cfg);
    const apiHost = cfg.DOCUSIGN_ENV === 'production' ? 'na4.docusign.net' : 'demo.docusign.net';
    const fromDate = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];

    const res = await fetch(
      `https://${apiHost}/restapi/v2.1/accounts/${cfg.DOCUSIGN_ACCOUNT_ID}/envelopes?from_date=${fromDate}&include=recipients&order_by=last_modified&order=desc`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DocuSign API ${res.status} : ${err.slice(0, 300)}`);
    }

    const data = await res.json();
    const envelopes = (data.envelopes || []).map(env => {
      const signers = env.recipients?.signers || [];
      const statut = STATUT_FR[env.status] || { label: env.status, color: 'slate' };
      return {
        id:             env.envelopeId,
        sujet:          env.emailSubject || 'Sans titre',
        statut:         env.status,
        statut_label:   statut.label,
        statut_color:   statut.color,
        date_creation:  env.createdDateTime,
        date_modif:     env.lastModifiedDateTime,
        date_signature: env.completedDateTime || null,
        date_expiration:env.expireDateTime || null,
        signataires:    signers.map(s => ({
          nom:    s.name,
          email:  s.email,
          statut: s.status,
          date:   s.signedDateTime || null,
        })),
      };
    });

    return NextResponse.json({ ok: true, total: envelopes.length, envelopes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

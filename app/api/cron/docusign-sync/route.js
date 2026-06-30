import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Obtenir un access_token Gmail depuis le refresh_token
async function getGmailToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Impossible de rafraîchir le token Gmail');
  return data.access_token;
}

// Lister les emails DocuSign non lus
async function listDocuSignEmails(accessToken) {
  const q = encodeURIComponent('from:dse@eumail.docusign.net is:unread');
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data.messages ?? [];
}

// Lire un email et extraire sujet + date
async function getEmail(accessToken, msgId) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const headers = data.payload?.headers ?? [];
  const subject = headers.find(h => h.name === 'Subject')?.value ?? '';
  const date    = headers.find(h => h.name === 'Date')?.value ?? null;
  return { id: msgId, subject, date: date ? new Date(date).toISOString() : new Date().toISOString() };
}

// Marquer l'email comme lu
async function markRead(accessToken, msgId) {
  await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  });
}

// Parser le sujet DocuSign → { denomination, signed }
// "Complétée : LEYZINO" → signed
// "LEYZINO" → sent
function parseSubject(subject) {
  const completed = subject.match(/^Compl[ée]t[ée]e?\s*:\s*(.+)$/i);
  if (completed) return { denomination: completed[1].trim(), signed: true };
  // Ignorer les sujets DocuSign génériques (rappels, annulations, etc.)
  if (/rappel|void|annul|reminder|cancel|declined/i.test(subject)) return null;
  const clean = subject.trim();
  if (clean.length < 2) return null;
  return { denomination: clean, signed: false };
}

// GET /api/cron/docusign-sync — appelé par le cron Vercel
export async function GET(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = adminSb();
  const results = { processed: 0, signed: 0, sent: 0, errors: [] };

  try {
    // Récupérer tous les utilisateurs avec Gmail OAuth configuré
    const { data: allSettings } = await sb
      .from('settings')
      .select('user_id, gmail_refresh_token')
      .not('gmail_refresh_token', 'is', null);

    if (!allSettings?.length) return NextResponse.json({ ok: true, message: 'Aucun compte Gmail connecté', ...results });

    for (const s of allSettings) {
      try {
        const accessToken = await getGmailToken(s.gmail_refresh_token);
        const messages    = await listDocuSignEmails(accessToken);
        if (!messages.length) continue;

        // Charger les clients de cet utilisateur
        const { data: clients } = await sb
          .from('clients')
          .select('id, denomination')
          .eq('user_id', s.user_id);

        for (const msg of messages) {
          try {
            const email  = await getEmail(accessToken, msg.id);
            const parsed = parseSubject(email.subject);
            if (!parsed) { await markRead(accessToken, msg.id); continue; }

            // Chercher le client par dénomination (exact ou partial)
            const denom = parsed.denomination.toLowerCase();
            const client = clients?.find(c => {
              const cd = (c.denomination ?? '').toLowerCase();
              return cd === denom || cd.includes(denom) || denom.includes(cd);
            });

            if (!client) {
              results.errors.push(`Client introuvable : "${parsed.denomination}"`);
              await markRead(accessToken, msg.id);
              continue;
            }

            // Chercher une signature_request existante pour ce client
            const { data: existing } = await sb
              .from('signature_requests')
              .select('id, status')
              .eq('client_id', client.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            if (parsed.signed) {
              // Marquer comme signé
              if (existing?.id) {
                await sb.from('signature_requests').update({
                  status:    'signed',
                  signed_at: email.date,
                }).eq('id', existing.id);
              } else {
                await sb.from('signature_requests').insert({
                  client_id:  client.id,
                  status:     'signed',
                  signed_at:  email.date,
                  source:     'docusign',
                  expires_at: email.date,
                  documents:  [],
                  created_at: email.date,
                });
              }
              results.signed++;
            } else {
              // Email d'envoi → créer une demande pending si aucune n'existe
              if (!existing || existing.status === 'signed') {
                await sb.from('signature_requests').insert({
                  client_id:  client.id,
                  status:     'pending',
                  source:     'docusign',
                  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                  documents:  [],
                  created_at: email.date,
                });
                results.sent++;
              }
            }

            await markRead(accessToken, msg.id);
            results.processed++;
          } catch (e) {
            results.errors.push(e.message);
          }
        }
      } catch (e) {
        results.errors.push(`user ${s.user_id}: ${e.message}`);
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

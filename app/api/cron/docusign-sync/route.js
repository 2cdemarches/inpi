import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Parser le sujet DocuSign → { denomination, signed } ou null
function parseSubject(subject) {
  if (!subject) return null;
  const completed = subject.match(/^Compl[ée]t[ée]e?\s*:\s*(.+)$/i);
  if (completed) return { denomination: completed[1].trim(), signed: true };
  if (/rappel|void|annul|reminder|cancel|declin/i.test(subject)) return null;
  const clean = subject.trim();
  if (clean.length < 2) return null;
  return { denomination: clean, signed: false };
}

function imapHost(email) {
  const domain = (email ?? '').split('@')[1]?.toLowerCase() ?? '';
  if (domain.includes('ionos') || domain.includes('1and1'))  return 'imap.ionos.com';
  if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) return 'outlook.office365.com';
  if (domain.includes('yahoo'))  return 'imap.mail.yahoo.com';
  return 'imap.gmail.com'; // défaut
}

async function processUser(sb, { user_id, gmail_user, gmail_app_password, imap_host }) {
  const result = { signed: 0, sent: 0, errors: [] };

  const client = new ImapFlow({
    host:   imap_host?.trim() || imapHost(gmail_user),
    port:   993,
    secure: true,
    auth:   { user: gmail_user, pass: gmail_app_password },
    logger: false,
  });

  await client.connect();
  try {
    await client.mailboxOpen('INBOX');

    // Chercher les emails non lus de DocuSign
    const msgs = await client.search({ from: 'dse@eumail.docusign.net', seen: false });
    if (!msgs.length) return result;

    // Charger les clients du cabinet
    const { data: clients } = await sb
      .from('clients')
      .select('id, denomination')
      .eq('user_id', user_id);

    for await (const msg of client.fetch(msgs, { envelope: true })) {
      const subject = msg.envelope?.subject ?? '';
      const date    = msg.envelope?.date ?? new Date();
      const parsed  = parseSubject(subject);

      // Marquer comme lu dans tous les cas
      await client.messageFlagsAdd(msg.seq, ['\\Seen']);

      if (!parsed) continue;

      const denom  = parsed.denomination.toLowerCase();
      const match  = clients?.find(c => {
        const cd = (c.denomination ?? '').toLowerCase();
        return cd === denom || cd.includes(denom) || denom.includes(cd);
      });

      if (!match) {
        result.errors.push(`Client introuvable : "${parsed.denomination}"`);
        continue;
      }

      const { data: existing } = await sb
        .from('signature_requests')
        .select('id, status')
        .eq('client_id', match.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const dateIso = new Date(date).toISOString();

      if (parsed.signed) {
        if (existing?.id) {
          await sb.from('signature_requests').update({ status: 'signed', signed_at: dateIso }).eq('id', existing.id);
        } else {
          await sb.from('signature_requests').insert({
            user_id: s.user_id, client_id: match.id, status: 'signed', signed_at: dateIso,
            expires_at: dateIso, documents: [], created_at: dateIso,
          });
        }
        result.signed++;
      } else {
        if (!existing || existing.status === 'signed') {
          await sb.from('signature_requests').insert({
            user_id: s.user_id, client_id: match.id, status: 'pending',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            documents: [], created_at: dateIso,
          });
          result.sent++;
        }
      }
    }
  } finally {
    await client.logout();
  }

  return result;
}

export async function GET(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = adminSb();
  const totals = { processed: 0, signed: 0, sent: 0, errors: [] };

  const { data: allSettings } = await sb
    .from('settings')
    .select('user_id, gmail_user, gmail_app_password, imap_host')
    .not('gmail_user', 'is', null)
    .not('gmail_app_password', 'is', null);

  for (const s of allSettings ?? []) {
    try {
      const r = await processUser(sb, s);
      totals.signed += r.signed;
      totals.sent   += r.sent;
      totals.errors.push(...r.errors);
      totals.processed++;
    } catch (e) {
      totals.errors.push(`${s.gmail_user}: ${e.message}`);
    }
  }

  return NextResponse.json({ ok: true, ...totals });
}

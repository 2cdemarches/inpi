import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function imapHost(email) {
  const domain = (email ?? '').split('@')[1]?.toLowerCase() ?? '';
  if (domain.includes('ionos') || domain.includes('1and1')) return 'imap.ionos.com';
  if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) return 'outlook.office365.com';
  if (domain.includes('yahoo')) return 'imap.mail.yahoo.com';
  return 'imap.gmail.com';
}

function parseSubject(subject) {
  if (!subject) return null;
  const completed = subject.match(/^Compl[ée]t[ée]e?\s*:\s*(.+)$/i);
  if (completed) return { denomination: completed[1].trim(), signed: true };
  if (/rappel|void|annul|reminder|cancel|declin/i.test(subject)) return null;
  const clean = subject.trim();
  if (clean.length < 2) return null;
  return { denomination: clean, signed: false };
}

// GET — test connexion uniquement (lecture, sans mise à jour)
export async function GET() {
  try {
    const user = await requireUser();
    const sb = adminSb();
    const { data: s } = await sb.from('settings').select('gmail_user, gmail_app_password').eq('user_id', user.id).single();
    if (!s?.gmail_user || !s?.gmail_app_password)
      return NextResponse.json({ ok: false, error: 'Adresse email ou mot de passe non configuré' });

    const host = imapHost(s.gmail_user);
    const imap = new ImapFlow({ host, port: 993, secure: true, auth: { user: s.gmail_user, pass: s.gmail_app_password }, logger: false });
    await imap.connect();
    await imap.mailboxOpen('INBOX');
    const msgs = await imap.search({ from: 'dse@eumail.docusign.net' });
    const last10 = msgs.slice(-10);
    const found = [];
    for await (const msg of imap.fetch(last10, { envelope: true, flags: true })) {
      found.push({ subject: msg.envelope?.subject ?? '', date: msg.envelope?.date ?? null, seen: msg.flags?.has('\\Seen') ?? false });
    }
    await imap.logout();
    return NextResponse.json({ ok: true, host, email: s.gmail_user, total_docusign: msgs.length, derniers: found.reverse() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}

// POST — sync réelle : traite les emails non lus et met à jour les statuts
export async function POST() {
  try {
    const user = await requireUser();
    const sb = adminSb();
    const { data: s } = await sb.from('settings').select('gmail_user, gmail_app_password').eq('user_id', user.id).single();
    if (!s?.gmail_user || !s?.gmail_app_password)
      return NextResponse.json({ ok: false, error: 'Adresse email ou mot de passe non configuré' });

    const { data: clients } = await sb.from('clients').select('id, denomination').eq('user_id', user.id);
    const userId = user.id;

    const host = imapHost(s.gmail_user);
    const imap = new ImapFlow({ host, port: 993, secure: true, auth: { user: s.gmail_user, pass: s.gmail_app_password }, logger: false });
    await imap.connect();
    await imap.mailboxOpen('INBOX');

    // Sync manuelle : on traite les 50 derniers emails DocuSign (lus ou non)
    const allMsgs = await imap.search({ from: 'dse@eumail.docusign.net' });
    const msgs = allMsgs.slice(-50);
    const result = { processed: 0, signed: 0, sent: 0, skipped: 0, not_found: [], errors: [] };

    for await (const msg of imap.fetch(msgs, { envelope: true, flags: true })) {
      const subject = msg.envelope?.subject ?? '';
      const date    = msg.envelope?.date ?? new Date();
      const parsed  = parseSubject(subject);

      if (!parsed) continue;

      const denom = parsed.denomination.toLowerCase();
      const match = clients?.find(c => {
        const cd = (c.denomination ?? '').toLowerCase();
        return cd === denom || cd.includes(denom) || denom.includes(cd);
      });

      if (!match) { result.not_found.push(parsed.denomination); continue; }

      const dateIso = new Date(date).toISOString();
      const { data: existing } = await sb.from('signature_requests').select('id, status').eq('client_id', match.id).order('created_at', { ascending: false }).limit(1).single();

      if (parsed.signed) {
        if (existing?.status === 'signed') { result.skipped++; continue; } // déjà à jour
        if (existing?.id) {
          const { error: e } = await sb.from('signature_requests').update({ status: 'signed', signed_at: dateIso }).eq('id', existing.id);
          if (e) { result.errors.push(`${match.denomination || match.id}: ${e.message}`); continue; }
        } else {
          const { error: e } = await sb.from('signature_requests').insert({ user_id: userId, client_id: match.id, status: 'signed', signed_at: dateIso, expires_at: dateIso, documents: [], created_at: dateIso });
          if (e) { result.errors.push(`${match.denomination || match.id}: ${e.message}`); continue; }
        }
        result.signed++;
      } else {
        if (existing && existing.status !== 'signed') { result.skipped++; continue; } // pending déjà présent
        const { error: e } = await sb.from('signature_requests').insert({ user_id: userId, client_id: match.id, status: 'pending', expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), documents: [], created_at: dateIso });
        if (e) { result.errors.push(`${match.denomination || match.id}: ${e.message}`); continue; }
        result.sent++;
      }
      result.processed++;
    }

    await imap.logout();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}

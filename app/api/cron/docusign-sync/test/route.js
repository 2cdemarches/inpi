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

// GET /api/cron/docusign-sync/test — test manuel pour l'utilisateur connecté
export async function GET() {
  try {
    const user = await requireUser();
    const sb = adminSb();

    const { data: s } = await sb
      .from('settings')
      .select('gmail_user, gmail_app_password')
      .eq('user_id', user.id)
      .single();

    if (!s?.gmail_user || !s?.gmail_app_password) {
      return NextResponse.json({ ok: false, error: 'Adresse email ou mot de passe non configuré dans les paramètres' });
    }

    const host = imapHost(s.gmail_user);
    const client = new ImapFlow({
      host, port: 993, secure: true,
      auth: { user: s.gmail_user, pass: s.gmail_app_password },
      logger: false,
    });

    await client.connect();
    await client.mailboxOpen('INBOX');

    // Chercher TOUS les emails DocuSign (lus + non lus) pour le test
    const msgs = await client.search({ from: 'dse@eumail.docusign.net' });
    const last10 = msgs.slice(-10);

    const found = [];
    for await (const msg of client.fetch(last10, { envelope: true })) {
      found.push({
        subject: msg.envelope?.subject ?? '(sans sujet)',
        date:    msg.envelope?.date ?? null,
        seen:    msg.flags?.has('\\Seen') ?? false,
      });
    }

    await client.logout();

    return NextResponse.json({
      ok: true,
      host,
      email: s.gmail_user,
      total_docusign: msgs.length,
      derniers: found.reverse(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}

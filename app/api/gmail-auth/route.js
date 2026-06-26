import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-server';

const APP_URL   = process.env.NEXT_PUBLIC_APP_URL || 'https://inpi-ten.vercel.app';
const CLIENT_ID = process.env.GMAIL_CLIENT_ID;

export async function GET() {
  await requireUser(); // doit être connecté

  if (!CLIENT_ID) {
    return NextResponse.json({ error: 'GMAIL_CLIENT_ID manquant dans les variables Vercel' }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  `${APP_URL}/api/gmail-callback`,
    response_type: 'code',
    scope:         'https://mail.google.com/',
    access_type:   'offline',
    prompt:        'consent',
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

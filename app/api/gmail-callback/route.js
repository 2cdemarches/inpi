import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';

const APP_URL       = process.env.NEXT_PUBLIC_APP_URL || 'https://inpi-ten.vercel.app';
const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(`${APP_URL}/?gmail_error=${error || 'no_code'}`);
  }

  try {
    const user = await requireUser();

    // Échanger le code contre les tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  `${APP_URL}/api/gmail-callback`,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.refresh_token) throw new Error('Refresh token absent — relancez la connexion');

    // Récupérer l'email Gmail via userinfo
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = await infoRes.json();

    // Sauvegarder dans settings de l'utilisateur
    const sb = await createSupabaseServer();
    await sb.from('settings').upsert({
      user_id:              user.id,
      gmail_refresh_token:  tokens.refresh_token,
      gmail_email:          info.email,
    }, { onConflict: 'user_id' });

    return NextResponse.redirect(`${APP_URL}/?gmail_ok=1`);
  } catch (e) {
    return NextResponse.redirect(`${APP_URL}/?gmail_error=${encodeURIComponent(e.message)}`);
  }
}

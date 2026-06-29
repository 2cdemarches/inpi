import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGIN = 'https://guichet-unique.inpi.fr';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function jwtExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return payload.exp ? payload.exp * 1000 : null;
  } catch { return null; }
}

function corsHeaders(origin) {
  // Accepter guichet-unique.inpi.fr, les extensions Chrome et notre propre domaine
  const isChromeExt = origin?.startsWith('chrome-extension://');
  const isAllowed   = isChromeExt || origin === ALLOWED_ORIGIN || origin === process.env.NEXT_PUBLIC_APP_URL;
  const o = isAllowed ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin':      o || '*',
    'Access-Control-Allow-Methods':     'POST, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// Preflight CORS
export async function OPTIONS(req) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin') || '') });
}

// POST /api/inpi-token  { bearer, user_token }
export async function POST(req) {
  const origin = req.headers.get('origin') || '';
  const hdrs   = corsHeaders(origin);

  try {
    const { bearer, refresh_token, user_token } = await req.json();
    if (!bearer) return NextResponse.json({ ok: false, error: 'bearer manquant' }, { status: 400, headers: hdrs });
    if (!user_token) return NextResponse.json({ ok: false, error: 'user_token manquant' }, { status: 400, headers: hdrs });

    // Valider le user_token pour identifier l'utilisateur (token stocké dans settings)
    const sb = adminSb();
    const { data: settings } = await sb.from('settings')
      .select('user_id')
      .eq('bookmarklet_token', user_token)
      .single();

    if (!settings) return NextResponse.json({ ok: false, error: 'Token utilisateur invalide' }, { status: 401, headers: hdrs });

    const userId = settings.user_id;

    // Lire l'expiration depuis le JWT
    const exp = jwtExpiry(bearer);
    if (exp && exp < Date.now()) {
      return NextResponse.json({ ok: false, error: 'Bearer JWT déjà expiré' }, { status: 400, headers: hdrs });
    }

    // Sauvegarder le bearer dans settings + dans le cache tokens
    const expiresAt = exp ? new Date(exp).toISOString() : null;
    const settingsUpdate = { inpi_bearer: bearer, updated_at: new Date().toISOString() };
    if (refresh_token) settingsUpdate.inpi_refresh_token = refresh_token;
    await sb.from('settings').update(settingsUpdate).eq('user_id', userId);
    await sb.from('tokens').upsert({
      key: 'inpi_bearer', user_id: userId, value: bearer,
      expires_at: expiresAt, updated_at: new Date().toISOString(),
    }, { onConflict: 'key,user_id' });

    const expiresInMin = exp ? Math.round((exp - Date.now()) / 60000) : null;
    return NextResponse.json({ ok: true, expiresInMin }, { headers: hdrs });

  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: hdrs });
  }
}

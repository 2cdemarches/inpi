import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GU = 'https://guichet-unique.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function jwtExpiresInMin(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (!payload.exp) return null;
    return Math.round((payload.exp * 1000 - Date.now()) / 60000);
  } catch { return null; }
}

async function callUserLogged(bearer, refreshToken) {
  const cookies = [
    bearer       ? `BEARER=${bearer}`              : '',
    refreshToken ? `REFRESH_TOKEN=${refreshToken}` : '',
  ].filter(Boolean).join('; ');

  const res = await fetch(`${GU}/api/user/logged`, {
    method: 'GET',
    headers: {
      'Accept':          'application/json',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      'Connection':      'keep-alive',
      'FromFO':          '1',
      'User-Agent':       UA,
      'sec-ch-ua':        '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-fetch-dest':   'empty',
      'sec-fetch-mode':   'cors',
      'sec-fetch-site':   'same-origin',
      'Cookie':           cookies,
    },
  });

  if (!res.ok) return null;

  // Nouveau BEARER dans Set-Cookie ?
  const rawCookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') || '').split(/,(?=\s*\w+=)/);

  const parsed = {};
  for (const c of rawCookies) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) parsed[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }

  const newBearer  = parsed['BEARER']        || null;
  const newRefresh = parsed['REFRESH_TOKEN'] || null;

  // INPI retourne "deleted" quand il détecte un appel serveur — ignorer
  if (newBearer === 'deleted') return null;
  if (newBearer) return { bearer: newBearer, refresh: newRefresh || refreshToken };

  // Parfois le token est dans le body JSON
  const json = await res.json().catch(() => null);
  const bodyToken = json?.token || json?.bearer || json?.accessToken || null;
  if (bodyToken && bodyToken !== 'deleted') {
    return { bearer: bodyToken, refresh: json?.refreshToken || refreshToken };
  }

  return null;
}

export async function GET(req) {
  // Vérifier le secret cron
  const secret = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = adminSb();
  const results = [];

  // Récupérer tous les utilisateurs avec un REFRESH_TOKEN stocké
  const { data: allSettings } = await sb
    .from('settings')
    .select('user_id, inpi_bearer, inpi_refresh_token')
    .not('inpi_refresh_token', 'is', null);

  if (!allSettings?.length) {
    return NextResponse.json({ ok: true, message: 'Aucun token à rafraîchir', refreshed: 0 });
  }

  for (const s of allSettings) {
    const { user_id, inpi_bearer, inpi_refresh_token } = s;
    if (!inpi_refresh_token) continue;

    const expiresIn = inpi_bearer ? jwtExpiresInMin(inpi_bearer) : null;

    // Rafraîchir seulement si expiré ou expire dans < 30 min
    if (expiresIn !== null && expiresIn > 30) {
      results.push({ user_id, status: 'skipped', expiresIn });
      continue;
    }

    try {
      const renewed = await callUserLogged(inpi_bearer, inpi_refresh_token);
      if (!renewed) {
        results.push({ user_id, status: 'failed', reason: 'no_new_bearer' });
        continue;
      }

      // Décoder expiration du nouveau JWT
      const newExpMin = jwtExpiresInMin(renewed.bearer);
      const expiresAt = newExpMin
        ? new Date(Date.now() + newExpMin * 60 * 1000).toISOString()
        : null;

      await sb.from('settings').update({
        inpi_bearer:        renewed.bearer,
        inpi_refresh_token: renewed.refresh || inpi_refresh_token,
        updated_at:         new Date().toISOString(),
      }).eq('user_id', user_id);

      await sb.from('tokens').upsert({
        key:        'inpi_bearer',
        user_id,
        value:      renewed.bearer,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key,user_id' });

      results.push({ user_id, status: 'refreshed', expiresIn: newExpMin });
    } catch (e) {
      results.push({ user_id, status: 'error', error: e.message });
    }
  }

  const refreshed = results.filter(r => r.status === 'refreshed').length;
  return NextResponse.json({ ok: true, refreshed, results });
}

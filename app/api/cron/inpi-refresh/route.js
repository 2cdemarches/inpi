import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GU       = 'https://guichet-unique.inpi.fr';
const PORTAIL  = 'https://procedures.inpi.fr';
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

function parseCookieHeader(arr) {
  const out = {};
  for (const c of arr) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

function getSetCookies(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res.headers.get('set-cookie') || '';
  return raw ? raw.split(/,(?=\s*\w+=)/) : [];
}

// ── Étape 1 : Login sur procedures.inpi.fr ────────────────────────────────────
async function loginPortail(email, password) {
  const res = await fetch(`${PORTAIL}/security/v1/inpiconnect/login`, {
    method: 'POST',
    headers: {
      'Accept':           'application/json, text/*',
      'Accept-Encoding':  'gzip, deflate, br, zstd',
      'Accept-Language':  'fr-FR,fr;q=0.9',
      'Content-Type':     'application/json; charset=UTF-8',
      'Connection':       'keep-alive',
      'Origin':           PORTAIL,
      'Referer':          `${PORTAIL}/?/login`,
      'User-Agent':       UA,
      'x-client-version': '1.27.1-1782135754341',
      'sec-ch-ua':        '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-fetch-dest':   'empty',
      'sec-fetch-mode':   'cors',
      'sec-fetch-site':   'same-origin',
    },
    body: JSON.stringify({ username: email, password }),
  });

  if (!res.ok) throw new Error(`Login portail échoué : ${res.status}`);

  // Récupérer le PHPSESSID du Set-Cookie
  const sessionCookies = parseCookieHeader(getSetCookies(res));
  const phpsessid = sessionCookies['PHPSESSID'] || null;

  const json = await res.json().catch(() => null);
  // La réponse contient data.csrftoken mais pas de token SSO direct
  const csrftoken = json?.data?.csrftoken || null;

  return { phpsessid, csrftoken, json };
}

// ── Étape 2 : Obtenir le token SSO depuis procedures.inpi.fr ─────────────────
async function getSsoToken(phpsessid, csrftoken) {
  // Essayer les endpoints connus pour récupérer le JWT SSO vers guichet-unique
  const endpoints = [
    `/security/v1/inpiconnect/sso-token`,
    `/security/v1/inpiconnect/token`,
    `/api/sso/token`,
    `/security/v1/inpiconnect/redirect?service=guichet`,
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${PORTAIL}${ep}`, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'Accept':          'application/json, text/*',
          'Connection':      'keep-alive',
          'Origin':          PORTAIL,
          'Referer':         `${PORTAIL}/?/`,
          'User-Agent':      UA,
          'x-csrf-token':    csrftoken || '',
          'x-client-version': '1.27.1-1782135754341',
          'Cookie':          phpsessid ? `PHPSESSID=${phpsessid}` : '',
        },
      });

      if (res.status === 302 || res.status === 301) {
        // Redirect vers guichet avec ?token=JWT
        const location = res.headers.get('location') || '';
        const match = location.match(/[?&]token=(eyJ[^&]+)/);
        if (match) return match[1];
      }

      if (res.ok) {
        const body = await res.json().catch(() => null);
        const token = body?.token || body?.ssoToken || body?.jwt || body?.data?.token;
        if (token && token.startsWith('eyJ')) return token;
      }
    } catch { /* essayer l'endpoint suivant */ }
  }
  return null;
}

// ── Étape 3 : Échange SSO → BEARER sur guichet-unique.inpi.fr ────────────────
async function exchangeSsoToken(ssoToken, phpsessid) {
  const url = `${GU}/login/sso/e-procedure?token=${encodeURIComponent(ssoToken)}`;
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      'Connection':      'keep-alive',
      'Referer':         `${PORTAIL}/?/`,
      'User-Agent':      UA,
      'sec-fetch-dest':  'document',
      'sec-fetch-mode':  'navigate',
      'sec-fetch-site':  'cross-site',
      ...(phpsessid ? { 'Cookie': `PHPSESSID=${phpsessid}` } : {}),
    },
  });

  const cookies = parseCookieHeader(getSetCookies(res));
  const bearer  = cookies['BEARER']        || null;
  const refresh = cookies['REFRESH_TOKEN'] || null;

  if (!bearer || bearer === 'deleted') return null;
  return { bearer, refresh };
}

// ── Login complet (portail → SSO → guichet) ───────────────────────────────────
async function fullLogin(email, password) {
  const { phpsessid, csrftoken } = await loginPortail(email, password);
  if (!phpsessid) throw new Error('PHPSESSID non reçu après login');

  const ssoToken = await getSsoToken(phpsessid, csrftoken);
  if (!ssoToken) throw new Error('Token SSO introuvable — endpoint de redirection inconnu');

  return await exchangeSsoToken(ssoToken, phpsessid);
}

// ── Stocker les tokens en DB ──────────────────────────────────────────────────
async function storeTokens(sb, userId, bearer, refresh) {
  const expMin   = jwtExpiresInMin(bearer);
  const expiresAt = expMin ? new Date(Date.now() + expMin * 60 * 1000).toISOString() : null;

  await sb.from('settings').update({
    inpi_bearer:        bearer,
    inpi_refresh_token: refresh || null,
    updated_at:         new Date().toISOString(),
  }).eq('user_id', userId);

  await sb.from('tokens').upsert({
    key: 'inpi_bearer', user_id: userId,
    value: bearer, expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key,user_id' });

  return expMin;
}

// ── Route GET /api/cron/inpi-refresh ─────────────────────────────────────────
export async function GET(req) {
  const secret = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = adminSb();
  const results = [];

  // Récupérer tous les utilisateurs avec email INPI configuré
  const { data: allSettings } = await sb
    .from('settings')
    .select('user_id, inpi_bearer, inpi_refresh_token, inpi_email, inpi_password');

  if (!allSettings?.length) {
    return NextResponse.json({ ok: true, message: 'Aucun compte INPI configuré', refreshed: 0 });
  }

  for (const s of allSettings) {
    const { user_id, inpi_bearer, inpi_refresh_token, inpi_email, inpi_password } = s;
    if (!inpi_email || !inpi_password) continue;

    const expiresIn = inpi_bearer ? jwtExpiresInMin(inpi_bearer) : null;

    // Ne pas rafraîchir si valide encore > 30 min
    if (expiresIn !== null && expiresIn > 30) {
      results.push({ user_id, status: 'skipped', expiresIn });
      continue;
    }

    try {
      const tokens = await fullLogin(inpi_email, inpi_password);
      if (!tokens) {
        results.push({ user_id, status: 'failed', reason: 'login_no_bearer' });
        continue;
      }

      const expMin = await storeTokens(sb, user_id, tokens.bearer, tokens.refresh || inpi_refresh_token);
      results.push({ user_id, status: 'refreshed', expiresIn: expMin });
    } catch (e) {
      results.push({ user_id, status: 'error', error: e.message });
    }
  }

  const refreshed = results.filter(r => r.status === 'refreshed').length;
  return NextResponse.json({ ok: true, refreshed, results });
}

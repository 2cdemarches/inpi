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

// ── Étape 0 : Récupérer les cookies WAF (Incapsula) ─────────────────────────
async function getWafCookies() {
  const res = await fetch(`${PORTAIL}/`, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      'Connection':      'keep-alive',
      'User-Agent':      UA,
      'sec-fetch-dest':  'document',
      'sec-fetch-mode':  'navigate',
      'sec-fetch-site':  'none',
    },
  });
  const cookies = parseCookieHeader(getSetCookies(res));
  // Retourner la chaîne de cookies pour injection dans les requêtes suivantes
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── Étape 1 : Login → PHPSESSID ──────────────────────────────────────────────
async function loginPortail(email, password, wafCookies = '') {
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
      'Cookie':           wafCookies,
    },
    body: JSON.stringify({ ref: email, password }),
  });

  if (!res.ok) throw new Error(`Login portail échoué : ${res.status}`);

  // Accumuler les cookies de la réponse (PHPSESSID + éventuels cookies WAF mis à jour)
  const newCookies = parseCookieHeader(getSetCookies(res));
  const phpsessid = newCookies['PHPSESSID'] || null;
  if (!phpsessid) throw new Error('PHPSESSID non reçu après login');

  // Fusionner les cookies WAF avec le nouveau PHPSESSID
  const allCookies = wafCookies
    ? wafCookies.split('; ').filter(c => !c.startsWith('PHPSESSID=')).join('; ') + `; PHPSESSID=${phpsessid}`
    : `PHPSESSID=${phpsessid}`;

  return { phpsessid, allCookies };
}

// ── Étape 2 : Récupérer l'URL SSO avec le token JWT ──────────────────────────
async function getSsoUrl(allCookies) {
  const res = await fetch(`${PORTAIL}/app/v1/website/url?wsCode=COMPANY_FORM_CHECK`, {
    method: 'GET',
    headers: {
      'Accept':           'application/json, text/*',
      'Accept-Encoding':  'gzip, deflate, br, zstd',
      'Accept-Language':  'fr-FR,fr;q=0.9',
      'Connection':       'keep-alive',
      'Referer':          `${PORTAIL}/?/home`,
      'User-Agent':       UA,
      'x-client-version': '1.27.1-1782135754341',
      'sec-ch-ua':        '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-fetch-dest':   'empty',
      'sec-fetch-mode':   'cors',
      'sec-fetch-site':   'same-origin',
      'Cookie':           allCookies,
    },
  });

  if (!res.ok) throw new Error(`URL SSO échouée : ${res.status}`);

  const json = await res.json();
  const ssoUrl = json?.data?.useUrl || null;
  if (!ssoUrl) throw new Error(`useUrl absent de la réponse : ${JSON.stringify(json?.data)}`);

  return ssoUrl;
}

// ── Étape 3 : Échanger l'URL SSO → BEARER + REFRESH_TOKEN ────────────────────
async function exchangeSsoUrl(ssoUrl) {
  const res = await fetch(ssoUrl, {
    method:   'GET',
    redirect: 'follow',
    headers: {
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      'Connection':      'keep-alive',
      'Referer':         `${PORTAIL}/?/home`,
      'User-Agent':      UA,
      'sec-fetch-dest':  'document',
      'sec-fetch-mode':  'navigate',
      'sec-fetch-site':  'cross-site',
    },
  });

  const cookies = parseCookieHeader(getSetCookies(res));
  const bearer  = cookies['BEARER']        || null;
  const refresh = cookies['REFRESH_TOKEN'] || null;

  if (!bearer || bearer === 'deleted') {
    throw new Error(`BEARER non reçu (statut ${res.status})`);
  }
  return { bearer, refresh };
}

// ── Login complet en 4 étapes ─────────────────────────────────────────────────
async function fullLogin(email, password) {
  const wafCookies            = await getWafCookies();
  const { allCookies }        = await loginPortail(email, password, wafCookies);
  const ssoUrl                = await getSsoUrl(allCookies);
  return await exchangeSsoUrl(ssoUrl);
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

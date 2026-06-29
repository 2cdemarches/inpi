import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GU      = 'https://guichet-unique.inpi.fr';
const PORTAIL = 'https://procedures.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSetCookies(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res.headers.get('set-cookie') || '';
  return raw ? raw.split(/,(?=\s*\w+=)/) : [];
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

export async function GET(req) {
  const secret = new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = adminSb();
  const { data: s } = await sb.from('settings')
    .select('inpi_email, inpi_password, inpi_incap_cookie')
    .eq('user_id', 'a18b292a-13b8-453b-9a94-b5b50f227c51')
    .single();

  const log = [];

  // Étape 0 : WAF
  const r0 = await fetch(`${PORTAIL}/`, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': UA } });
  const c0 = parseCookieHeader(getSetCookies(r0));
  log.push({ step: 0, url: PORTAIL, status: r0.status, cookies: Object.keys(c0) });
  let cookieJar = Object.entries(c0).map(([k,v]) => `${k}=${v}`).join('; ');

  // Étape 1 : Login
  const r1 = await fetch(`${PORTAIL}/security/v1/inpiconnect/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Accept': 'application/json, text/*',
      'Content-Type': 'application/json; charset=UTF-8',
      'Origin': PORTAIL,
      'Referer': `${PORTAIL}/?/login`,
      'User-Agent': UA,
      'x-client-version': '1.27.1-1782135754341',
      'Cookie': cookieJar,
    },
    body: JSON.stringify({ ref: s.inpi_email, password: s.inpi_password }),
  });
  const c1 = parseCookieHeader(getSetCookies(r1));
  const body1 = await r1.json().catch(() => null);
  log.push({ step: 1, status: r1.status, cookies: Object.keys(c1), login_ok: body1?.message === 'Request successful' });

  const phpsessid = c1['PHPSESSID'];
  if (phpsessid) {
    cookieJar = cookieJar.split('; ').filter(c => !c.startsWith('PHPSESSID=')).join('; ');
    cookieJar = [cookieJar, `PHPSESSID=${phpsessid}`].filter(Boolean).join('; ');
  }

  // Étape 2 : URL SSO
  const r2 = await fetch(`${PORTAIL}/app/v1/website/url?wsCode=COMPANY_FORM_CHECK`, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      'Accept': 'application/json, text/*',
      'Referer': `${PORTAIL}/?/home`,
      'User-Agent': UA,
      'x-client-version': '1.27.1-1782135754341',
      'Cookie': cookieJar,
    },
  });
  const c2 = parseCookieHeader(getSetCookies(r2));
  const body2 = await r2.json().catch(() => null);
  const ssoUrl = body2?.data?.useUrl || null;
  log.push({ step: 2, status: r2.status, cookies: Object.keys(c2), has_sso_url: !!ssoUrl, sso_url_start: ssoUrl?.slice(0, 60) });

  // Étape 3 : Suivre l'URL SSO manuellement
  if (ssoUrl) {
    // Injecter le cookie Incapsula de guichet-unique.inpi.fr si disponible
    const incapVal = s?.inpi_incap_cookie || '';
    log.push({ step: '2.5_incap_check', incap_cookie_length: incapVal.length, incap_cookie_preview: incapVal.slice(0, 10) || '(vide)' });
    if (incapVal) {
      const incapEntry = `visid_incap_2207353=${incapVal}`;
      cookieJar = cookieJar ? `${cookieJar}; ${incapEntry}` : incapEntry;
    }
    let url = ssoUrl;
    for (let i = 0; i < 8; i++) {
      const r = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'Accept': 'text/html,*/*', 'User-Agent': UA, 'Referer': PORTAIL, 'Cookie': cookieJar },
      });
      const cx = parseCookieHeader(getSetCookies(r));
      const location = r.headers.get('location') || null;
      const allHeaders = {};
      r.headers.forEach((v, k) => { allHeaders[k] = v; });
      log.push({
        step: `3.${i}`,
        url: url.slice(0, 80),
        status: r.status,
        set_cookies: Object.keys(cx),
        has_bearer: !!cx['BEARER'],
        location: location?.slice(0, 80),
        all_response_headers: Object.keys(allHeaders),
      });
      for (const [k,v] of Object.entries(cx)) {
        cookieJar = cookieJar.split('; ').filter(c => !c.startsWith(`${k}=`)).join('; ');
        cookieJar = [cookieJar, `${k}=${v}`].filter(Boolean).join('; ');
      }
      if (cx['BEARER'] || !location) break;
      url = location.startsWith('http') ? location : `${GU}${location}`;
    }
  }

  return NextResponse.json({ log });
}

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const GU = 'https://guichet-unique.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function jwtIsValid(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return p.exp && p.exp * 1000 > Date.now() + 60000;
  } catch { return false; }
}
function jwtExpiry(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return p.exp ? new Date(p.exp * 1000).toLocaleString('fr-FR') : null;
  } catch { return null; }
}

function parseCookieHeader(arr) {
  const out = {};
  for (const c of (arr ?? [])) {
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

async function refreshViaToken(refreshToken) {
  const res = await fetch(`${GU}/api/token/refresh`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Referer: `${GU}/`,
      Origin: GU,
      FromFO: '1',
      Cookie: `REFRESH_TOKEN=${refreshToken}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const cookies = parseCookieHeader(getSetCookies(res));
  const bearer  = cookies['BEARER'] || null;
  const refresh = cookies['REFRESH_TOKEN'] || null;
  if (!bearer) {
    const body = await res.text().catch(() => '');
    throw new Error(`BEARER absent (status ${res.status}) — ${body.slice(0, 200)}`);
  }
  return { bearer, refresh };
}

// GET /api/inpi-check
export async function GET() {
  try {
    const user = await requireUser();
    const sb = adminSb();
    const { data: s } = await sb.from('settings').select('inpi_bearer, inpi_refresh_token').eq('user_id', user.id).single();

    if (!s?.inpi_bearer) return NextResponse.json({ ok: false, status: 'no_token', message: 'Aucun token INPI en base' });

    const valid = jwtIsValid(s.inpi_bearer);
    const expiry = jwtExpiry(s.inpi_bearer);
    const hasRefresh = !!s.inpi_refresh_token;

    if (valid) {
      const res = await fetch(`${GU}/api/formalities?page=1&pageSize=1`, {
        headers: { Accept: 'application/json', 'User-Agent': UA, FromFO: '1', Cookie: `BEARER=${s.inpi_bearer}` },
      });
      if (res.ok) return NextResponse.json({ ok: true, status: 'connected', expiry, hasRefresh });
      return NextResponse.json({ ok: false, status: 'invalid', message: "Token rejeté par l'INPI", expiry, hasRefresh });
    }

    return NextResponse.json({ ok: false, status: 'expired', message: `Token expiré (${expiry})`, expiry, hasRefresh });
  } catch (e) {
    return NextResponse.json({ ok: false, status: 'error', message: e.message });
  }
}

// POST /api/inpi-check — force le renouvellement
export async function POST() {
  try {
    const user = await requireUser();
    const sb = adminSb();
    const { data: s } = await sb.from('settings').select('inpi_refresh_token').eq('user_id', user.id).single();

    if (!s?.inpi_refresh_token) {
      return NextResponse.json({ ok: false, status: 'no_refresh', message: 'Aucun REFRESH_TOKEN en base — collez-le dans le champ ci-dessous et enregistrez' });
    }

    const { bearer, refresh } = await refreshViaToken(s.inpi_refresh_token);

    const expiry = jwtExpiry(bearer);
    await sb.from('settings').update({
      inpi_bearer: bearer,
      ...(refresh ? { inpi_refresh_token: refresh } : {}),
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id);

    return NextResponse.json({ ok: true, status: 'refreshed', expiry });
  } catch (e) {
    return NextResponse.json({ ok: false, status: 'refresh_failed', message: e.message });
  }
}

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GU = 'https://guichet-unique.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function parseCookies(arr) {
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

async function refreshBearer(refreshToken) {
  if (!refreshToken) return null;
  const res = await fetch(`${GU}/api/token/refresh`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Accept': 'application/json', 'Content-Type': 'application/json',
      'User-Agent': UA, 'Referer': `${GU}/`, 'Origin': GU, 'FromFO': '1',
      'Cookie': `REFRESH_TOKEN=${refreshToken}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok && res.status !== 0) return null;
  const cookies = parseCookies(getSetCookies(res));
  return cookies['BEARER'] ? { bearer: cookies['BEARER'], refresh: cookies['REFRESH_TOKEN'] ?? refreshToken } : null;
}

function jwtIsValid(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return p.exp && p.exp * 1000 > Date.now() + 60000;
  } catch { return false; }
}

// GET /api/inpi/formalite/[id] — public, no login required
export async function GET(req, { params }) {
  const { id } = await params;
  const sb = adminSb();

  const { data: settings } = await sb.from('settings')
    .select('inpi_bearer, inpi_refresh_token, user_id')
    .not('inpi_refresh_token', 'is', null)
    .limit(1)
    .single();

  if (!settings) return NextResponse.json({ error: 'Configuration INPI absente' }, { status: 503 });

  let bearer = jwtIsValid(settings.inpi_bearer) ? settings.inpi_bearer : null;

  if (!bearer && settings.inpi_refresh_token) {
    const renewed = await refreshBearer(settings.inpi_refresh_token);
    if (renewed) {
      bearer = renewed.bearer;
      await sb.from('settings').update({
        inpi_bearer: bearer,
        ...(renewed.refresh ? { inpi_refresh_token: renewed.refresh } : {}),
      }).eq('user_id', settings.user_id);
    }
  }

  if (!bearer) return NextResponse.json({ error: 'Token INPI expiré' }, { status: 503 });

  const res = await fetch(`${GU}/api/formalities/${id}`, {
    headers: {
      Accept: 'application/json', 'User-Agent': UA, 'FromFO': '1',
      Cookie: `BEARER=${bearer}; REFRESH_TOKEN=${settings.inpi_refresh_token ?? ''}`,
    },
  });

  if (res.status === 404) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: `INPI ${res.status}` }, { status: 502 });

  const data = await res.json();
  return NextResponse.json({ ok: true, data });
}

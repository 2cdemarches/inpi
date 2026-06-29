import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';

const GU = 'https://guichet-unique.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

// GET /api/inpi-debug — temporaire pour diagnostiquer le refresh
export async function GET() {
  try {
    await requireUser();
    const sb = await createSupabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    const { data: settings } = await sb.from('settings')
      .select('inpi_bearer,inpi_refresh_token').eq('user_id', user.id).single();

    const bearer       = (settings?.inpi_bearer        || '').trim() || null;
    const refreshToken = (settings?.inpi_refresh_token || '').trim() || null;

    const cookieStr = [
      bearer       ? `BEARER=${bearer}`              : '',
      refreshToken ? `REFRESH_TOKEN=${refreshToken}` : '',
    ].filter(Boolean).join('; ');

    const res = await fetch(`${GU}/api/user/logged`, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: `${GU}/`,
        FromFO: '1',
        Cookie: cookieStr,
      },
    });

    const statusCode  = res.status;
    const setCookieRaw = res.headers.get('set-cookie') ?? '';
    const allSetCookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [setCookieRaw];

    const parsedCookies = {};
    for (const c of allSetCookies) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) parsedCookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim().slice(0, 40) + '…';
    }

    let body = null;
    try { body = await res.json(); } catch { body = await res.text().catch(() => null); }

    // Détecter si le BEARER a été extrait
    const newBearer = parsedCookies['BEARER']
      ?? body?.token ?? body?.bearer ?? body?.data?.token ?? null;

    return NextResponse.json({
      has_bearer:        !!bearer,
      has_refresh_token: !!refreshToken,
      refresh_token_len: refreshToken?.length ?? 0,
      bearer_expired: (() => {
        try {
          const p = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString());
          return { exp: p.exp, expired: p.exp * 1000 < Date.now(), expires_in_min: Math.round((p.exp * 1000 - Date.now()) / 60000) };
        } catch { return null; }
      })(),
      gu_response: {
        status: statusCode,
        set_cookie_headers: allSetCookies.length,
        parsed_cookies: parsedCookies,
        body_keys: body && typeof body === 'object' ? Object.keys(body) : body?.slice?.(0, 200),
      },
      new_bearer_found: !!newBearer,
      new_bearer_prefix: newBearer?.slice(0, 20) ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

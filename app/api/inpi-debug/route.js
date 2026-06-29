import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';

const GU = 'https://guichet-unique.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

function jwtExpiry(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return { exp: p.exp, expired: p.exp * 1000 < Date.now(), expires_in_min: Math.round((p.exp * 1000 - Date.now()) / 60000) };
  } catch { return null; }
}

async function tryRefresh(bearer, refreshToken) {
  const cookieStr = [
    bearer       ? `BEARER=${bearer}`              : '',
    refreshToken ? `REFRESH_TOKEN=${refreshToken}` : '',
  ].filter(Boolean).join('; ');

  const res = await fetch(`${GU}/api/user/logged`, {
    headers: { 'User-Agent': UA, Accept: 'application/json', Referer: `${GU}/`, FromFO: '1', Cookie: cookieStr },
  });

  const allSetCookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);

  const parsedCookies = {};
  for (const c of allSetCookies) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) parsedCookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }

  let body = null;
  try { body = await res.json(); } catch { body = await res.text().catch(() => null); }

  const newBearer = parsedCookies['BEARER'] ?? body?.token ?? body?.bearer ?? body?.data?.token ?? null;
  const isDeleted = newBearer === 'deleted' || newBearer === '';

  return {
    status: res.status,
    new_bearer_value: isDeleted ? 'deleted (session invalidée!)' : (newBearer ? 'JWT valide reçu ✓' : 'aucun bearer dans la réponse'),
    new_bearer_expiry: (newBearer && !isDeleted) ? jwtExpiry(newBearer) : null,
    set_cookies: Object.keys(parsedCookies),
    body_preview: body && typeof body === 'object' ? body : String(body).slice(0, 200),
    success: !!newBearer && !isDeleted,
  };
}

// GET /api/inpi-debug
export async function GET() {
  try {
    await requireUser();
    const sb = await createSupabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    const { data: settings } = await sb.from('settings')
      .select('inpi_bearer,inpi_refresh_token').eq('user_id', user.id).single();

    const bearer       = (settings?.inpi_bearer        || '').trim() || null;
    const refreshToken = (settings?.inpi_refresh_token || '').trim() || null;

    const currentExpiry = bearer ? jwtExpiry(bearer) : null;

    // Tester le refresh même si le token est encore valide
    const refreshTest = (bearer || refreshToken)
      ? await tryRefresh(bearer, refreshToken)
      : { error: 'Pas de bearer ni refresh_token configuré' };

    return NextResponse.json({
      configuration: {
        has_bearer: !!bearer,
        has_refresh_token: !!refreshToken,
        refresh_token_length: refreshToken?.length ?? 0,
      },
      current_bearer: currentExpiry,
      refresh_test: refreshTest,
      conclusion: refreshTest?.success
        ? '✅ Le renouvellement serveur FONCTIONNE'
        : '❌ Le renouvellement serveur NE FONCTIONNE PAS — INPI rejette les appels hors navigateur',
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

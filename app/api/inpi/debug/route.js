import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-server';
import { createSupabaseServer } from '@/lib/supabase-server';

const GU   = 'https://guichet-unique.inpi.fr';
const PROC = 'https://procedures.inpi.fr';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function GET() {
  try {
    await requireUser();
    const sb = await createSupabaseServer();
    const user = await (await import('@/lib/supabase-server')).requireUser();
    const { data: settings } = await sb.from('settings')
      .select('inpi_rne_username,inpi_rne_password').eq('user_id', user.id).single();

    const email    = settings?.inpi_rne_username?.trim();
    const password = settings?.inpi_rne_password?.trim();

    // Étape 1 : session
    const s1 = await fetch(`${PROC}/?/login`, {
      headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow',
    }).catch(e => ({ ok: false, error: e.message }));

    const s1Cookies = s1?.headers ? getCookiesStr(s1) : '';

    // Étape 2 : login
    const s2 = await fetch(`${PROC}/security/v1/inpiconnect/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json',
        'User-Agent': UA, Origin: PROC, Referer: `${PROC}/?/login`,
        ...(s1Cookies ? { Cookie: s1Cookies } : {}),
      },
      body: JSON.stringify({ ref: email, password }),
    });

    const s2Body = await s2.json().catch(() => null);
    const s2Cookies = getCookiesStr(s2);
    const csrftoken = s2Body?.data?.csrftoken;
    const allCookies = [s1Cookies, s2Cookies].filter(Boolean).join('; ');

    // Étape 3 : tentatives SSO
    const ssoAttempts = [];
    const urls = [
      `${GU}/sso?token=${csrftoken}`,
      `${GU}/sso/callback?token=${csrftoken}`,
      `${GU}/inpiconnect/callback?token=${csrftoken}`,
      `${GU}/?token=${csrftoken}`,
      `${GU}/api/sso/login`,
    ];

    for (const url of urls) {
      const isPost = url.endsWith('/login');
      const r = await fetch(url, {
        method: isPost ? 'POST' : 'GET',
        headers: {
          'User-Agent': UA, Accept: 'application/json, text/html, */*',
          Referer: PROC, Origin: PROC, Cookie: allCookies,
          ...(isPost ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(isPost ? { body: JSON.stringify({ ref: email, password }) } : {}),
        redirect: 'manual',
      }).catch(e => ({ status: 0, error: e.message }));

      const setCookies = r?.headers ? [...(r.headers.getSetCookie?.() ?? [])].join(' | ') : '';
      const location = r?.headers?.get('location') ?? null;
      const body = r?.text ? await r.text().catch(() => '') : '';

      ssoAttempts.push({
        url,
        status: r.status,
        location,
        setCookies: setCookies.slice(0, 300),
        body: body.slice(0, 300),
      });
    }

    return NextResponse.json({
      login_status: s2.status,
      login_body: s2Body,
      csrftoken: csrftoken?.slice(0, 20) + '...',
      ssoAttempts,
    });

  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function getCookiesStr(res) {
  const arr = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);
  return arr.map(c => c.split(';')[0]).join('; ');
}

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const GU = 'https://guichet-unique.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

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

// GET /api/inpi-check — vérifie si le bearer INPI est valide
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
      // Vérifier en appelant vraiment l'API INPI
      const res = await fetch(`${GU}/api/formalities?page=1&pageSize=1`, {
        headers: { Accept: 'application/json', 'User-Agent': UA, 'FromFO': '1', Cookie: `BEARER=${s.inpi_bearer}` },
      });
      if (res.ok) return NextResponse.json({ ok: true, status: 'connected', expiry, hasRefresh });
      return NextResponse.json({ ok: false, status: 'invalid', message: 'Token expiré ou rejeté par l\'INPI', expiry, hasRefresh });
    }

    return NextResponse.json({ ok: false, status: 'expired', message: `Token expiré (${expiry})`, expiry, hasRefresh });
  } catch (e) {
    return NextResponse.json({ ok: false, status: 'error', message: e.message });
  }
}

// POST /api/inpi-check — force le renouvellement du token via REFRESH_TOKEN
export async function POST() {
  try {
    const user = await requireUser();
    const sb = adminSb();
    const { data: s } = await sb.from('settings').select('inpi_refresh_token, inpi_email, inpi_password').eq('user_id', user.id).single();

    if (!s?.inpi_refresh_token && (!s?.inpi_email || !s?.inpi_password)) {
      return NextResponse.json({ ok: false, message: 'Aucun REFRESH_TOKEN ni identifiants INPI configurés' });
    }

    // Appeler le cron de refresh pour cet utilisateur uniquement
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://inpi-ten.vercel.app'}/api/cron/inpi-refresh`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
    });
    const json = await res.json().catch(() => ({}));

    // Re-vérifier le token après refresh
    const { data: s2 } = await sb.from('settings').select('inpi_bearer').eq('user_id', user.id).single();
    const valid = s2?.inpi_bearer ? jwtIsValid(s2.inpi_bearer) : false;
    const expiry = s2?.inpi_bearer ? jwtExpiry(s2.inpi_bearer) : null;

    if (valid) return NextResponse.json({ ok: true, status: 'refreshed', expiry });
    return NextResponse.json({ ok: false, status: 'refresh_failed', message: json?.results?.[0]?.error || 'Renouvellement échoué', cronResult: json });
  } catch (e) {
    return NextResponse.json({ ok: false, status: 'error', message: e.message });
  }
}

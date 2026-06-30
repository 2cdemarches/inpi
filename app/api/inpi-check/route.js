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

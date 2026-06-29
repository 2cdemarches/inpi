import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const GU = 'https://guichet-unique.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ── Cache BEARER en DB ────────────────────────────────────────────────────────
async function getCachedBearer(userId) {
  const { data } = await adminSb().from('tokens')
    .select('value,expires_at').eq('key', 'inpi_bearer').eq('user_id', userId).single();
  if (!data?.value) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date(Date.now() + 5 * 60 * 1000)) return null;
  return data.value;
}

async function storeBearer(userId, bearer, refresh = null) {
  // Lire l'expiration depuis le JWT
  let ttlMs = 90 * 60 * 1000;
  try {
    const payload = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString());
    if (payload.exp) ttlMs = Math.max(0, payload.exp * 1000 - Date.now() - 5 * 60 * 1000);
  } catch {}

  const sb = adminSb();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await sb.from('tokens').upsert(
    { key: 'inpi_bearer', user_id: userId, value: bearer, expires_at: expiresAt, updated_at: new Date().toISOString() },
    { onConflict: 'key,user_id' }
  );
  if (refresh) {
    await sb.from('tokens').upsert(
      { key: 'inpi_refresh', user_id: userId, value: refresh, expires_at: null, updated_at: new Date().toISOString() },
      { onConflict: 'key,user_id' }
    );
  }
}

// ── Renouveler le BEARER via /api/user/logged ─────────────────────────────────
async function refreshBearer(bearer, refreshToken) {
  const cookieStr = [
    bearer       ? `BEARER=${bearer}`               : '',
    refreshToken ? `REFRESH_TOKEN=${refreshToken}`  : '',
  ].filter(Boolean).join('; ');

  const res = await fetch(`${GU}/api/user/logged`, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      Referer: `${GU}/`,
      'FromFO': '1',
      Cookie: cookieStr,
    },
  });

  if (!res.ok) return null;

  // Nouveau BEARER dans Set-Cookie
  const setCookies = parseCookies(getSetCookiesArr(res));
  if (setCookies['BEARER']) return { bearer: setCookies['BEARER'], refresh: setCookies['REFRESH_TOKEN'] ?? refreshToken };

  // Ou dans le body
  const json = await res.json().catch(() => null);
  const token = json?.token ?? json?.bearer ?? json?.data?.token;
  if (token) return { bearer: token, refresh: json?.refresh_token ?? refreshToken };

  return null;
}

// ── Route GET /api/inpi-auth ──────────────────────────────────────────────────
export async function GET() {
  try {
    const user = await requireUser();
    const sb = await createSupabaseServer();

    // Lire BEARER + REFRESH_TOKEN depuis settings
    const { data: settings } = await sb.from('settings')
      .select('inpi_bearer,inpi_refresh_token').eq('user_id', user.id).single();

    const storedBearer  = (settings?.inpi_bearer        || '').trim() || null;
    const refreshToken  = (settings?.inpi_refresh_token || '').trim() || null;

    if (!refreshToken && !storedBearer) {
      return NextResponse.json({ ok: false, error: 'TOKEN_MISSING' }, { status: 401 });
    }

    // 1. Vérifier si le bearer stocké est encore valide (décoder le JWT directement)
    //    Ne JAMAIS appeler /api/user/logged si le bearer est encore valide —
    //    INPI détecte l'appel serveur et retourne BEARER=deleted, invalidant la session.
    function jwtIsValid(token, marginMin = 5) {
      if (!token || token === 'deleted') return false;
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        return !!payload.exp && payload.exp * 1000 > Date.now() + marginMin * 60 * 1000;
      } catch { return false; }
    }

    let bearer = jwtIsValid(storedBearer) ? storedBearer : null;

    // 2. Si expiré, renouveler via /api/user/logged (seulement si vraiment nécessaire)
    if (!bearer) {
      if (!refreshToken) {
        return NextResponse.json({ ok: false, error: 'TOKEN_EXPIRED' }, { status: 401 });
      }
      const renewed = await refreshBearer(storedBearer, refreshToken);
      // Ignorer "deleted" — INPI invalide la session si appelé depuis un serveur
      if (!renewed || renewed.bearer === 'deleted' || !jwtIsValid(renewed.bearer, 0)) {
        return NextResponse.json({ ok: false, error: 'TOKEN_EXPIRED' }, { status: 401 });
      }
      bearer = renewed.bearer;
      await storeBearer(user.id, bearer, renewed.refresh);
      await sb.from('settings').update({ inpi_bearer: bearer }).eq('user_id', user.id);
    }

    // 3. Récupérer les formalités
    const ALL_STATUSES = [
      'RECEIVED','PAYMENT_VALIDATION_PENDING','PAID','SIGNATURE_PENDING','PAYMENT_PENDING',
      'SIGNED','AMENDMENT_PENDING','AMENDMENT_SIGNATURE_PENDING','AMENDMENT_SIGNED',
      'AMENDMENT_PAYMENT_PENDING','AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID',
      'AMENDED','VALIDATION_PENDING','EXPIRED','VALIDATED','REJECTED',
      'VALIDATED_BO_AMENDMENT_SIGNED','VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING',
      'COMPLIANCE_INSEE_PENDING','ERROR_DECLARATION_INSEE','ERROR_INSEE_EXISTS_PM','ERROR_VALIDATION',
    ].map(s => `status%5B%5D=${s}`).join('&');

    let formalites = [];
    for (let page = 1; page <= 20; page++) {
      const res = await fetch(
        `${GU}/api/formalities/dashboard-list?${ALL_STATUSES}&order%5Bcreated%5D=desc&page=${page}&itemsPerPage=50`,
        { headers: { Accept: 'application/ld+json, application/json', 'User-Agent': UA, 'FromFO': '1', Cookie: `BEARER=${bearer}; REFRESH_TOKEN=${refreshToken}` } }
      );

      if (res.status === 401) {
        // Renouveler et retenter
        const renewed = await refreshBearer(bearer, refreshToken);
        if (!renewed) return NextResponse.json({ ok: false, error: 'TOKEN_EXPIRED' }, { status: 401 });
        bearer = renewed.bearer;
        await storeBearer(user.id, bearer, renewed.refresh);
        await sb.from('settings').update({ inpi_bearer: bearer }).eq('user_id', user.id);
        continue; // retenter la même page
      }

      if (!res.ok) throw new Error(`GU API ${res.status}`);

      const data = await res.json();
      const items = buildList(data);
      formalites = formalites.concat(items);
      const total = data?.['hydra:totalItems'] ?? data?.totalItems ?? null;
      if (total !== null && formalites.length >= total) break;
      if (items.length < 50) break;
    }

    return NextResponse.json({ ok: true, stats: buildStats(formalites), total: formalites.length, formalites });

  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// ── Helpers cookies ───────────────────────────────────────────────────────────
function getSetCookiesArr(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res.headers.get('set-cookie') ?? '';
  return raw ? raw.split(/,(?=\s*\w+=)/) : [];
}

function parseCookies(arr) {
  const out = {};
  for (const c of arr) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

// ── Helpers données ───────────────────────────────────────────────────────────
function buildList(raw) {
  const items = raw?.['hydra:member'] ?? raw?.member ?? raw?.items ?? raw?.data ?? (Array.isArray(raw) ? raw : []);
  return items.map(f => ({
    id:           f.id ?? f['@id'],
    siren:        f.siren ?? f.companyDetails?.siren ?? f.company?.siren,
    denomination: f.companyName ?? f.denomination ?? f.raisonSociale ?? f.company?.denomination,
    type:         f.formType ?? f.type ?? f.formalityType,
    statut:       f.status ?? f.statut,
    statut_label: labelStatut(f.status ?? f.statut),
    statut_color: colorStatut(f.status ?? f.statut),
    date_depot:   f.createdAt ?? f.dateDepot,
    date_modif:   f.updatedAt ?? f.dateModification,
    commentaire:  f.commentaire ?? f.motifRejet ?? null,
  }));
}

function buildStats(list) {
  return {
    total:                     list.length,
    validees:                  list.filter(f => ['VALIDATED','VALIDATED_BO_AMENDMENT_SIGNED','VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING'].includes(f.statut)).length,
    rejetees:                  list.filter(f => ['REJECTED','ERROR_VALIDATION','ERROR_DECLARATION_INSEE','ERROR_INSEE_EXISTS_PM'].includes(f.statut)).length,
    en_attente_regularisation: list.filter(f => ['AMENDMENT_PENDING','AMENDMENT_SIGNATURE_PENDING','AMENDMENT_SIGNED','AMENDMENT_PAYMENT_PENDING','AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID','AMENDED'].includes(f.statut)).length,
    en_attente_validation:     list.filter(f => ['VALIDATION_PENDING','RECEIVED'].includes(f.statut)).length,
  };
}

function labelStatut(s) {
  const map = {
    RECEIVED: 'Reçue', PAYMENT_PENDING: 'Paiement en attente',
    PAYMENT_VALIDATION_PENDING: 'Validation paiement', PAID: 'Payée',
    SIGNATURE_PENDING: 'Signature en attente', SIGNED: 'Signée',
    VALIDATION_PENDING: 'En attente de validation', VALIDATED: 'Validée',
    REJECTED: 'Rejetée', EXPIRED: 'Expirée',
    AMENDMENT_PENDING: 'Régularisation', AMENDED: 'Régularisée',
    COMPLIANCE_INSEE_PENDING: 'En cours INSEE', ERROR_VALIDATION: 'Erreur validation',
    ERROR_DECLARATION_INSEE: 'Erreur INSEE', ERROR_INSEE_EXISTS_PM: 'SIREN déjà existant',
    VALIDATED_BO_AMENDMENT_SIGNED: 'Validée', VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING: 'Validée',
  };
  return map[s] ?? s ?? '—';
}

function colorStatut(s) {
  if (!s) return 'slate';
  if (['VALIDATED','VALIDATED_BO_AMENDMENT_SIGNED','VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING'].includes(s)) return 'green';
  if (['REJECTED','ERROR_VALIDATION','ERROR_DECLARATION_INSEE','ERROR_INSEE_EXISTS_PM'].includes(s)) return 'red';
  if (['AMENDMENT_PENDING','AMENDMENT_SIGNATURE_PENDING','AMENDMENT_SIGNED','AMENDMENT_PAYMENT_PENDING',
       'AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID','AMENDED'].includes(s)) return 'amber';
  if (['VALIDATION_PENDING','RECEIVED'].includes(s)) return 'blue';
  if (['PAYMENT_PENDING','PAYMENT_VALIDATION_PENDING','PAID',
       'SIGNATURE_PENDING','SIGNED','COMPLIANCE_INSEE_PENDING'].includes(s)) return 'blue';
  return 'slate';
}

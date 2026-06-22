import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * BEARER INPI expire en ~2h.
 * On stocke le token rafraîchi dans Supabase pour persister entre les appels serverless.
 * INPI_BEARER + INPI_REFRESH_TOKEN dans Vercel = valeurs initiales / de secours.
 */

const GU = 'https://guichet-unique.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── Lecture / écriture token dans Supabase ────────────────────────────────────
async function getStoredToken() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('tokens').select('value,expires_at').eq('key', 'inpi_bearer').single();
  if (!data) return null;
  // Valide si expire dans plus de 5 min
  if (data.expires_at && new Date(data.expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
    return data.value;
  }
  return null; // expiré
}

async function getStoredRefresh() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from('tokens').select('value').eq('key', 'inpi_refresh').single();
  return data?.value ?? null;
}

async function storeTokens(bearer, refresh, expiresInMs = 100 * 60 * 1000) {
  const sb = getSupabase();
  if (!sb) return;
  const expiresAt = new Date(Date.now() + expiresInMs).toISOString();
  await sb.from('tokens').upsert({ key: 'inpi_bearer', value: bearer, expires_at: expiresAt, updated_at: new Date().toISOString() });
  if (refresh) {
    await sb.from('tokens').upsert({ key: 'inpi_refresh', value: refresh, expires_at: null, updated_at: new Date().toISOString() });
  }
}

// ── Refresh du BEARER via le REFRESH_TOKEN ────────────────────────────────────
async function tryRefresh(currentBearer, refreshToken) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': UA,
    Referer: `${GU}/`,
    Origin: GU,
    Cookie: `BEARER=${currentBearer}; REFRESH_TOKEN=${refreshToken}`,
  };

  const res = await fetch(`${GU}/api/token/refresh`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).catch(() => null);

  if (res) {
    const setCookies = getSetCookies(res);
    const cookies = parseCookies(setCookies);
    if (cookies['BEARER']) {
      return { bearer: cookies['BEARER'], refresh: cookies['REFRESH_TOKEN'] ?? refreshToken };
    }
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      const token = json.token ?? json.access_token ?? json.bearer;
      if (token) return { bearer: token, refresh: json.refresh_token ?? refreshToken };
    }
  }
  return null;
}

// ── Obtenir un BEARER valide ──────────────────────────────────────────────────
async function getBearer() {
  // 1. Chercher dans Supabase un token encore valide
  const stored = await getStoredToken();
  if (stored) return stored;

  // 2. Récupérer les valeurs de base
  const envBearer  = process.env.INPI_BEARER;
  const envRefresh = process.env.INPI_REFRESH_TOKEN;
  if (!envBearer) throw new Error('INPI_BEARER manquant dans Vercel → Settings → Environment Variables');

  // 3. Essayer de rafraîchir avec le refresh token (Supabase d'abord, puis env var)
  const refreshToken = (await getStoredRefresh()) ?? envRefresh;
  if (refreshToken) {
    const renewed = await tryRefresh(envBearer, refreshToken).catch(() => null);
    if (renewed) {
      await storeTokens(renewed.bearer, renewed.refresh);
      return renewed.bearer;
    }
  }

  // 4. Utiliser le BEARER de l'env var directement (peut fonctionner s'il vient d'être mis à jour)
  // On le stocke aussi pour ne pas re-tester pendant 90min
  await storeTokens(envBearer, envRefresh, 90 * 60 * 1000);
  return envBearer;
}

// ── Appel API guichet-unique ──────────────────────────────────────────────────
async function guCall(path, bearerOverride) {
  const bearer = bearerOverride ?? await getBearer();

  const res = await fetch(`${GU}${path}`, {
    headers: { Accept: 'application/ld+json, application/json', 'User-Agent': UA, Referer: `${GU}/`, Cookie: `BEARER=${bearer}` },
  });

  if (res.status === 401) {
    // Token refusé — invalider le stockage et réessayer une fois
    const sb = getSupabase();
    if (sb) await sb.from('tokens').delete().eq('key', 'inpi_bearer');

    const envBearer  = process.env.INPI_BEARER;
    const envRefresh = process.env.INPI_REFRESH_TOKEN;
    const refreshToken = (await getStoredRefresh()) ?? envRefresh;

    if (refreshToken) {
      const renewed = await tryRefresh(envBearer ?? '', refreshToken).catch(() => null);
      if (renewed) {
        await storeTokens(renewed.bearer, renewed.refresh);
        return guCall(path, renewed.bearer);
      }
    }

    throw new Error(
      'Token INPI expiré. Reconnectez-vous sur guichet-unique.inpi.fr puis :\n' +
      '1. F12 → Application → Cookies → guichet-unique.inpi.fr\n' +
      '2. Copiez BEARER → Vercel > INPI_BEARER\n' +
      '3. Copiez REFRESH_TOKEN → Vercel > INPI_REFRESH_TOKEN\n' +
      '4. Redéployez'
    );
  }

  if (!res.ok) throw new Error(`INPI ${res.status} sur ${path}`);
  return res.json();
}

// ── Route GET /api/inpi-auth ──────────────────────────────────────────────────
export async function GET() {
  try {
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
      const listData = await guCall(`/api/formalities/dashboard-list?${ALL_STATUSES}&order%5Bcreated%5D=desc&page=${page}&itemsPerPage=50`);
      const items = buildList(listData);
      formalites = formalites.concat(items);
      const hydraTotal = listData?.['hydra:totalItems'] ?? listData?.totalItems ?? null;
      if (hydraTotal !== null && formalites.length >= hydraTotal) break;
      if (items.length < 50) break;
    }

    return NextResponse.json({ ok: true, stats: buildStatsFromList(formalites), total: formalites.length, formalites });

  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getSetCookies(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res.headers.get('set-cookie');
  if (!raw) return [];
  return raw.split(/,(?=\s*\w+=)/);
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

function buildStatsFromList(list) {
  return {
    total:                     list.length,
    validees:                  list.filter(f => ['VALIDATED','VALIDATED_BO_AMENDMENT_SIGNED','VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING'].includes(f.statut)).length,
    rejetees:                  list.filter(f => ['REJECTED','ERROR_VALIDATION','ERROR_DECLARATION_INSEE','ERROR_INSEE_EXISTS_PM'].includes(f.statut)).length,
    en_attente_regularisation: list.filter(f => ['AMENDMENT_PENDING','AMENDMENT_SIGNATURE_PENDING','AMENDMENT_SIGNED','AMENDMENT_PAYMENT_PENDING','AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID','AMENDED'].includes(f.statut)).length,
    en_attente_validation:     list.filter(f => ['VALIDATION_PENDING','RECEIVED'].includes(f.statut)).length,
  };
}

function buildList(raw) {
  const items = raw?.['hydra:member'] ?? raw?.member ?? raw?.items ?? (Array.isArray(raw) ? raw : []);
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
       'AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID','AMENDED','VALIDATION_PENDING'].includes(s)) return 'amber';
  if (['RECEIVED','PAYMENT_PENDING','PAYMENT_VALIDATION_PENDING','PAID',
       'SIGNATURE_PENDING','SIGNED','COMPLIANCE_INSEE_PENDING'].includes(s)) return 'blue';
  return 'slate';
}

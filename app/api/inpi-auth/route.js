import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const GU = 'https://guichet-unique.inpi.fr';
const PROC = 'https://procedures.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ── Tokens par user dans Supabase ─────────────────────────────────────────────
async function getStoredToken(userId) {
  const { data } = await adminSb().from('tokens').select('value,expires_at')
    .eq('key', 'inpi_bearer').eq('user_id', userId).single();
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) > new Date(Date.now() + 5 * 60 * 1000)) return data.value;
  return null;
}

async function getStoredRefresh(userId) {
  const { data } = await adminSb().from('tokens').select('value')
    .eq('key', 'inpi_refresh').eq('user_id', userId).single();
  return data?.value ?? null;
}

async function storeTokens(userId, bearer, refresh, expiresInMs = 100 * 60 * 1000) {
  const sb = adminSb();
  const expiresAt = new Date(Date.now() + expiresInMs).toISOString();
  await sb.from('tokens').upsert({ key: 'inpi_bearer', user_id: userId, value: bearer, expires_at: expiresAt, updated_at: new Date().toISOString() }, { onConflict: 'key,user_id' });
  if (refresh) {
    await sb.from('tokens').upsert({ key: 'inpi_refresh', user_id: userId, value: refresh, expires_at: null, updated_at: new Date().toISOString() }, { onConflict: 'key,user_id' });
  }
}

// ── Login INPI avec email + mdp ───────────────────────────────────────────────
async function loginToInpi(email, password) {
  // Essayer plusieurs endpoints et formats de credentials
  // Étape 1 : charger la page de login pour obtenir les cookies de session
  const sessionRes = await fetch(`${PROC}/?/login`, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'fr-FR,fr;q=0.9' },
    redirect: 'follow',
  }).catch(() => null);

  const sessionCookies = sessionRes ? getSetCookies(sessionRes).join('; ') : '';

  // Étape 2 : login avec les cookies de session
  const res = await fetch(`${PROC}/security/v1/inpiconnect/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Accept: 'application/json, text/*',
      'User-Agent': UA,
      Origin: PROC,
      Referer: `${PROC}/?/login`,
      'X-Client-Version': '1.27.0-1776089031331',
      'Accept-Language': 'fr-FR,fr;q=0.9',
      ...(sessionCookies ? { Cookie: sessionCookies } : {}),
    },
    body: JSON.stringify({ ref: email, password }),
  }).catch(e => { throw new Error(`Connexion INPI impossible : ${e.message}`); });

  const txt = await res.text().catch(() => '');

  if (!res.ok) {
    throw new Error(`Identifiants INPI invalides (${res.status}). Vérifiez email et mot de passe dans ⚙️ Paramètres. Détail : ${txt.slice(0, 200)}`);
  }

  const json = JSON.parse(txt || '{}');
  const bearer = json.token ?? json.access_token ?? json.bearer ?? json.jwt;
  if (bearer) return { bearer, refresh: json.refresh_token ?? null };

  // Le token peut aussi arriver dans les cookies Set-Cookie de la réponse login
  const allCookies = parseCookies([...getSetCookies(res), ...(sessionCookies ? [sessionCookies] : [])]);
  if (allCookies['BEARER']) return { bearer: allCookies['BEARER'], refresh: allCookies['REFRESH_TOKEN'] ?? null };

  throw new Error('Connexion INPI : token non trouvé dans la réponse : ' + txt.slice(0, 200));
}

// ── Refresh du BEARER ─────────────────────────────────────────────────────────
async function tryRefresh(bearer, refreshToken) {
  const res = await fetch(`${GU}/api/token/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA, Referer: `${GU}/`, Origin: GU, Cookie: `BEARER=${bearer}; REFRESH_TOKEN=${refreshToken}` },
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).catch(() => null);
  if (!res) return null;
  const setCookies = getSetCookies(res);
  const cookies = parseCookies(setCookies);
  if (cookies['BEARER']) return { bearer: cookies['BEARER'], refresh: cookies['REFRESH_TOKEN'] ?? refreshToken };
  if (res.ok) {
    const json = await res.json().catch(() => ({}));
    const token = json.token ?? json.access_token ?? json.bearer;
    if (token) return { bearer: token, refresh: json.refresh_token ?? refreshToken };
  }
  return null;
}

// ── Obtenir un BEARER valide ───────────────────────────────────────────────────
async function getBearer(userId, creds) {
  // 1. Token en cache encore valide ?
  const cached = await getStoredToken(userId);
  if (cached) return cached;

  // 2. Refresh automatique avec le refresh token (longue durée)
  const refreshToken = creds.refresh ?? (await getStoredRefresh(userId));
  if (refreshToken) {
    const currentBearer = creds.bearer ?? '';
    const renewed = await tryRefresh(currentBearer, refreshToken).catch(() => null);
    if (renewed) {
      await storeTokens(userId, renewed.bearer, renewed.refresh);
      return renewed.bearer;
    }
  }

  // 3. Bearer manuel des settings (sans cache = premier appel ou après expiration totale)
  if (creds.bearer) {
    // Stocker pour la prochaine fois (durée 110 min)
    await storeTokens(userId, creds.bearer, refreshToken || null, 110 * 60 * 1000);
    return creds.bearer;
  }

  throw new Error('Token INPI expiré. Reconnectez-vous sur guichet-unique.inpi.fr, copiez BEARER et REFRESH_TOKEN dans ⚙️ Paramètres.');
}

// ── Appel API guichet-unique (avec retry refresh sur 401) ─────────────────────
async function guCall(path, bearer, userId, creds) {
  const hdrs = { Accept: 'application/ld+json, application/json', 'User-Agent': UA, Referer: `${GU}/`, Cookie: `BEARER=${bearer}` };
  const res = await fetch(`${GU}${path}`, { headers: hdrs });

  if (res.status === 401) {
    // Invalider le cache et tenter un refresh
    try { await adminSb().from('tokens').delete().in('key', ['inpi_bearer']).eq('user_id', userId); } catch {}

    const refreshToken = creds.refresh ?? (await getStoredRefresh(userId));
    if (refreshToken) {
      const renewed = await tryRefresh(bearer, refreshToken).catch(() => null);
      if (renewed) {
        await storeTokens(userId, renewed.bearer, renewed.refresh);
        const res2 = await fetch(`${GU}${path}`, { headers: { ...hdrs, Cookie: `BEARER=${renewed.bearer}` } });
        if (res2.ok) return res2.json();
      }
    }

    throw new Error('Session INPI expirée. Reconnectez-vous sur guichet-unique.inpi.fr et copiez BEARER + REFRESH_TOKEN dans ⚙️ Paramètres.');
  }

  if (!res.ok) throw new Error(`INPI ${res.status} sur ${path}`);
  return res.json();
}

// ── Route GET /api/inpi-auth ──────────────────────────────────────────────────
export async function GET() {
  try {
    const user = await requireUser();
    const sb = await createSupabaseServer();
    const { data: settings } = await sb.from('settings').select('inpi_bearer,inpi_refresh_token,inpi_login,inpi_password').eq('user_id', user.id).single();

    const creds = {
      bearer:   (settings?.inpi_bearer        || process.env.INPI_BEARER        || '').trim() || null,
      refresh:  (settings?.inpi_refresh_token || process.env.INPI_REFRESH_TOKEN || '').trim() || null,
    };

    const bearer = await getBearer(user.id, creds);

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
      const data = await guCall(`/api/formalities/dashboard-list?${ALL_STATUSES}&order%5Bcreated%5D=desc&page=${page}&itemsPerPage=50`, bearer, user.id, creds);
      const items = buildList(data);
      formalites = formalites.concat(items);
      const total = data?.['hydra:totalItems'] ?? data?.totalItems ?? null;
      if (total !== null && formalites.length >= total) break;
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
       'AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID','AMENDED'].includes(s)) return 'amber';
  if (['VALIDATION_PENDING','RECEIVED'].includes(s)) return 'blue';
  if (['PAYMENT_PENDING','PAYMENT_VALIDATION_PENDING','PAID',
       'SIGNATURE_PENDING','SIGNED','COMPLIANCE_INSEE_PENDING'].includes(s)) return 'blue';
  return 'slate';
}

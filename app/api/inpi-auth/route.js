import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const GU = 'https://guichet-unique.inpi.fr';
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
  // Essayer plusieurs endpoints/formats connus
  const attempts = [
    { url: `${GU}/api/login`,     body: { login: email, password } },
    { url: `${GU}/api/login`,     body: { email, password } },
    { url: `${GU}/api/login`,     body: { username: email, password } },
    { url: `${GU}/api/sso/login`, body: { login: email, password } },
    { url: `${GU}/api/sso/login`, body: { email, password } },
    { url: `${GU}/api/sso/login`, body: { username: email, password } },
    { url: `${GU}/login`,         body: { login: email, password } },
    { url: `${GU}/login`,         body: { email, password } },
  ];

  let lastError = '';
  for (const { url, body } of attempts) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA, Referer: `${GU}/`, Origin: GU },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res || res.status === 404 || res.status === 405) continue;

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      lastError = `${res.status} sur ${url} — ${txt.slice(0, 200)}`;
      continue; // essayer le suivant
    }

    const setCookies = getSetCookies(res);
    const cookies = parseCookies(setCookies);
    if (cookies['BEARER']) return { bearer: cookies['BEARER'], refresh: cookies['REFRESH_TOKEN'] ?? null };

    const json = await res.json().catch(() => ({}));
    const token = json.token ?? json.access_token ?? json.bearer ?? json.jwt;
    if (token) return { bearer: token, refresh: json.refresh_token ?? null };
  }

  throw new Error(`Connexion INPI échouée : ${lastError || 'endpoint introuvable'}. Vérifiez vos identifiants dans ⚙️ Paramètres.`);
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

// ── Obtenir un BEARER valide pour ce user ─────────────────────────────────────
async function getBearer(userId, inpiLogin, inpiPassword) {
  // 1. Token encore valide en cache
  const stored = await getStoredToken(userId);
  if (stored) return stored;

  // 2. Essayer le refresh
  const refresh = await getStoredRefresh(userId);
  if (refresh) {
    const storedBearer = await adminSb().from('tokens').select('value').eq('key', 'inpi_bearer').eq('user_id', userId).single().then(r => r.data?.value ?? '');
    const renewed = await tryRefresh(storedBearer, refresh).catch(() => null);
    if (renewed) {
      await storeTokens(userId, renewed.bearer, renewed.refresh);
      return renewed.bearer;
    }
  }

  // 3. Re-login avec les credentials
  if (!inpiLogin || !inpiPassword) {
    throw new Error('Identifiants INPI non configurés. Allez dans ⚙️ Paramètres pour renseigner votre login et mot de passe INPI.');
  }
  const { bearer, refresh: newRefresh } = await loginToInpi(inpiLogin, inpiPassword);
  await storeTokens(userId, bearer, newRefresh);
  return bearer;
}

// ── Appel API guichet-unique ──────────────────────────────────────────────────
async function guCall(path, bearer, userId, inpiLogin, inpiPassword) {
  const res = await fetch(`${GU}${path}`, {
    headers: { Accept: 'application/ld+json, application/json', 'User-Agent': UA, Referer: `${GU}/`, Cookie: `BEARER=${bearer}` },
  });

  if (res.status === 401) {
    // Token refusé — invalider et re-login
    await adminSb().from('tokens').delete().eq('key', 'inpi_bearer').eq('user_id', userId);
    if (!inpiLogin || !inpiPassword) throw new Error('Session INPI expirée. Renseignez vos identifiants dans ⚙️ Paramètres.');
    const { bearer: newBearer, refresh } = await loginToInpi(inpiLogin, inpiPassword);
    await storeTokens(userId, newBearer, refresh);
    // Retry
    const retry = await fetch(`${GU}${path}`, {
      headers: { Accept: 'application/ld+json, application/json', 'User-Agent': UA, Referer: `${GU}/`, Cookie: `BEARER=${newBearer}` },
    });
    if (!retry.ok) throw new Error(`INPI ${retry.status}`);
    return retry.json();
  }

  if (!res.ok) throw new Error(`INPI ${res.status} sur ${path}`);
  return res.json();
}

// ── Route GET /api/inpi-auth ──────────────────────────────────────────────────
export async function GET() {
  try {
    const user = await requireUser();
    const sb = await createSupabaseServer();
    const { data: settings } = await sb.from('settings').select('inpi_login,inpi_password').eq('user_id', user.id).single();

    const inpiLogin    = settings?.inpi_login    || process.env.INPI_LOGIN    || null;
    const inpiPassword = settings?.inpi_password || process.env.INPI_PASSWORD || null;

    const bearer = await getBearer(user.id, inpiLogin, inpiPassword);

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
      const data = await guCall(`/api/formalities/dashboard-list?${ALL_STATUSES}&order%5Bcreated%5D=desc&page=${page}&itemsPerPage=50`, bearer, user.id, inpiLogin, inpiPassword);
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
       'AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID','AMENDED','VALIDATION_PENDING'].includes(s)) return 'amber';
  if (['RECEIVED','PAYMENT_PENDING','PAYMENT_VALIDATION_PENDING','PAID',
       'SIGNATURE_PENDING','SIGNED','COMPLIANCE_INSEE_PENDING'].includes(s)) return 'blue';
  return 'slate';
}

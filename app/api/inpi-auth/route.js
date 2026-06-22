import { NextResponse } from 'next/server';

/**
 * Auth guichet-unique.inpi.fr via BEARER + REFRESH_TOKEN stockés dans Vercel.
 * Le BEARER expire en ~2h. On le renouvelle via le REFRESH_TOKEN.
 * Quand le REFRESH_TOKEN expire (semaines/mois), mettre à jour les vars Vercel.
 */

const GU = 'https://guichet-unique.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

let cachedBearer  = null;
let cachedRefresh = null;
let bearerExp     = 0;

// ── Renouvellement BEARER via REFRESH_TOKEN ───────────────────────────────────
async function refreshBearer(refreshToken) {
  const endpoints = [
    { url: `${GU}/api/token/refresh`,        body: { refresh_token: refreshToken } },
    { url: `${GU}/api/user/refresh-token`,   body: { refreshToken } },
    { url: `${GU}/api/authentication_token`, body: { refresh_token: refreshToken } },
  ];

  for (const ep of endpoints) {
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA, Referer: `${GU}/` },
      body: JSON.stringify(ep.body),
    }).catch(() => null);

    if (!res) continue;

    const cookies = parseCookies(getSetCookies(res));
    if (cookies['BEARER']) return { bearer: cookies['BEARER'], refresh: cookies['REFRESH_TOKEN'] ?? refreshToken };

    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      const token = json.token ?? json.access_token ?? json.bearer ?? null;
      if (token) return { bearer: token, refresh: json.refresh_token ?? refreshToken };
    }
  }
  return null;
}

// ── Récupère BEARER valide ────────────────────────────────────────────────────
async function getBearer() {
  // Utiliser le cache si encore valide
  if (cachedBearer && Date.now() < bearerExp) return cachedBearer;

  const envBearer  = process.env.INPI_BEARER;
  const envRefresh = process.env.INPI_REFRESH_TOKEN;

  if (!envBearer) throw new Error('INPI_BEARER manquant dans les variables Vercel');

  // Essayer de renouveler si on a un refresh token
  if (envRefresh) {
    const refreshToken = cachedRefresh ?? envRefresh;
    const renewed = await refreshBearer(refreshToken).catch(() => null);
    if (renewed) {
      cachedBearer  = renewed.bearer;
      cachedRefresh = renewed.refresh;
      bearerExp     = Date.now() + 100 * 60 * 1000;
      return cachedBearer;
    }
  }

  // Fallback : utiliser le BEARER de l'env var tel quel
  cachedBearer = envBearer;
  bearerExp    = Date.now() + 90 * 60 * 1000;
  return cachedBearer;
}

// ── Appel API guichet-unique ──────────────────────────────────────────────────
async function guCall(path) {
  const bearer = await getBearer();

  const res = await fetch(`${GU}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': UA,
      Referer: `${GU}/`,
      Cookie: `BEARER=${bearer}${cachedRefresh ? `; REFRESH_TOKEN=${cachedRefresh}` : ''}`,
    },
  });

  if (res.status === 401) {
    // Token expiré → forcer refresh
    cachedBearer = null;
    bearerExp    = 0;
    const bearer2 = await getBearer();
    const res2 = await fetch(`${GU}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': UA, Referer: `${GU}/`, Cookie: `BEARER=${bearer2}` },
    });
    if (!res2.ok) throw new Error(`INPI ${path} : ${res2.status} — le BEARER a expiré, mettez à jour INPI_BEARER dans Vercel`);
    return res2.json();
  }

  if (!res.ok) throw new Error(`INPI ${path} : ${res.status}`);
  return res.json();
}

// ── Route GET /api/inpi-auth ──────────────────────────────────────────────────
export async function GET() {
  try {
    const ALL_STATUSES = 'status%5B%5D=RECEIVED&status%5B%5D=PAYMENT_VALIDATION_PENDING&status%5B%5D=PAID&status%5B%5D=SIGNATURE_PENDING&status%5B%5D=PAYMENT_PENDING&status%5B%5D=SIGNED&status%5B%5D=AMENDMENT_PENDING&status%5B%5D=AMENDMENT_SIGNATURE_PENDING&status%5B%5D=AMENDMENT_SIGNED&status%5B%5D=AMENDMENT_PAYMENT_PENDING&status%5B%5D=AMENDMENT_PAYMENT_VALIDATION_PENDING&status%5B%5D=AMENDMENT_PAID&status%5B%5D=AMENDED&status%5B%5D=VALIDATION_PENDING&status%5B%5D=EXPIRED&status%5B%5D=VALIDATED&status%5B%5D=REJECTED&status%5B%5D=VALIDATED_BO_AMENDMENT_SIGNED&status%5B%5D=VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING&status%5B%5D=COMPLIANCE_INSEE_PENDING&status%5B%5D=ERROR_DECLARATION_INSEE&status%5B%5D=ERROR_INSEE_EXISTS_PM&status%5B%5D=ERROR_VALIDATION';

    // Charger toutes les pages (max 500 dossiers)
    let formalites = [];
    for (let page = 1; page <= 10; page++) {
      const listData = await guCall(`/api/formalities/dashboard-list?${ALL_STATUSES}&order%5Bcreated%5D=desc&page=${page}&itemsPerPage=50`);
      const items = buildList(listData);
      formalites = formalites.concat(items);
      const total = listData?.['hydra:totalItems'] ?? listData?.totalItems ?? items.length;
      if (formalites.length >= total || items.length < 50) break;
    }

    const stats = buildStatsFromList(formalites);

    return NextResponse.json({ ok: true, stats, total: formalites.length, formalites });

  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e.message,
      hint: e.message.includes('expiré')
        ? 'Allez sur formalites.inpi.fr → F12 → Application → Cookies → guichet-unique.inpi.fr → copiez BEARER dans Vercel'
        : 'Vérifiez INPI_BEARER dans les variables Vercel',
    }, { status: 500 });
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
  if (!s) return '—';
  const map = {
    RECEIVED: 'Reçue', PAYMENT_PENDING: 'Paiement en attente',
    PAYMENT_VALIDATION_PENDING: 'Validation paiement', PAID: 'Payée',
    SIGNATURE_PENDING: 'Signature en attente', SIGNED: 'Signée',
    VALIDATION_PENDING: 'En attente de validation', VALIDATED: 'Validée',
    REJECTED: 'Rejetée', EXPIRED: 'Expirée',
    AMENDMENT_PENDING: 'Régularisation', AMENDED: 'Régularisée',
    COMPLIANCE_INSEE_PENDING: 'En cours INSEE', ERROR_VALIDATION: 'Erreur validation',
  };
  return map[s] ?? s;
}

function colorStatut(s) {
  if (!s) return 'slate';
  if (['VALIDATED','VALIDATED_BO_AMENDMENT_SIGNED','VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING'].includes(s)) return 'green';
  if (['REJECTED','ERROR_VALIDATION','ERROR_DECLARATION_INSEE','ERROR_INSEE_EXISTS_PM'].includes(s)) return 'red';
  if (['AMENDMENT_PENDING','AMENDMENT_SIGNATURE_PENDING','AMENDMENT_SIGNED','AMENDMENT_PAYMENT_PENDING','AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID','AMENDED','VALIDATION_PENDING'].includes(s)) return 'amber';
  if (['RECEIVED','PAYMENT_PENDING','PAYMENT_VALIDATION_PENDING','PAID','SIGNATURE_PENDING','SIGNED','COMPLIANCE_INSEE_PENDING'].includes(s)) return 'blue';
  return 'slate';
}

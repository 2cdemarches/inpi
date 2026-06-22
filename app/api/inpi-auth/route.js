import { NextResponse } from 'next/server';

/**
 * Flow SSO INPI :
 * 1. POST procedures.inpi.fr/security/v1/inpiconnect/login  → cookie WMIGSISQBXoulnyZ (JWT HS512)
 * 2. GET  guichet-unique.inpi.fr/?/ets/{JWT}                → cookie BEARER (JWT RS256)
 * 3. GET  guichet-unique.inpi.fr/api/formalities/…          → données formalités
 */

const PROC  = 'https://procedures.inpi.fr';
const GU    = 'https://guichet-unique.inpi.fr';
const UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const XV    = '1.27.0-1776089031331';

let cache = null;
let cacheExp = 0;

// ── Étape 1 : login procedures.inpi.fr ───────────────────────────────────────
async function loginProcedures(ref, password) {
  const res = await fetch(`${PROC}/security/v1/inpiconnect/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/*',
      'User-Agent': UA,
      'x-client-version': XV,
      Referer: `${PROC}/?/login`,
      Origin: PROC,
    },
    body: JSON.stringify({ ref, password }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Login procedures.inpi.fr échoué (${res.status}) : ${t.slice(0, 200)}`);
  }

  const setCookies = getSetCookies(res);
  const cookies = parseCookies(setCookies);

  // Le JWT HS512 peut avoir n'importe quel nom — on cherche celui qui commence par eyJ
  const jwtCookie = Object.entries(cookies).find(([, v]) => v.startsWith('eyJ'));
  const jwt = jwtCookie?.[1] ?? null;

  // Debug temporaire
  if (!jwt) {
    const raw = res.headers.get('set-cookie') ?? '';
    throw new Error(`JWT introuvable. Cookies reçus: [${Object.keys(cookies).join(', ')}] | raw set-cookie: ${raw.slice(0,300)}`);
  }

  const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  return { jwt, cookieStr };
}

// ── Étape 2 : échange JWT → BEARER sur guichet-unique.inpi.fr ────────────────
async function exchangeForBearer(jwt, procCookies) {
  // Appel à la page SSO qui valide le JWT et pose le cookie BEARER
  const ssoUrl = `${GU}/?/ets/${jwt}`;

  const res = await fetch(ssoUrl, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      Referer: `${PROC}/?/home`,
      Cookie: procCookies,
      fromfo: '1',
    },
    redirect: 'follow',
  });

  const setCookies = getSetCookies(res);
  const cookies = parseCookies(setCookies);

  const bearer = cookies['BEARER'] ?? null;
  const refresh = cookies['REFRESH_TOKEN'] ?? null;

  if (!bearer) {
    // Essai alternatif : appel direct à /api/user/logged avec fromfo
    const res2 = await fetch(`${GU}/api/user/logged`, {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: `${GU}/`,
        fromfo: '1',
        Cookie: `${procCookies}`,
      },
    });
    const sc2 = getSetCookies(res2);
    const c2 = parseCookies(sc2);
    if (c2['BEARER']) return c2;
    throw new Error('BEARER cookie non reçu — le SSO n\'a pas fonctionné');
  }

  return cookies;
}

// ── Session complète ──────────────────────────────────────────────────────────
async function getSession() {
  if (cache && Date.now() < cacheExp) return cache;

  const ref      = process.env.INPI_EMAIL;
  const password = process.env.INPI_PASSWORD;
  if (!ref || !password) throw new Error('INPI_EMAIL et INPI_PASSWORD manquants dans les variables Vercel');

  const { jwt, cookieStr: procCookies } = await loginProcedures(ref, password);
  const guCookies = await exchangeForBearer(jwt, procCookies);

  const bearer  = guCookies['BEARER'];
  const refresh = guCookies['REFRESH_TOKEN'];
  const cookieStr = [
    ...Object.entries(guCookies).map(([k, v]) => `${k}=${v}`),
  ].join('; ');

  cache    = { cookieStr, bearer, refresh };
  cacheExp = Date.now() + 100 * 60 * 1000; // 100 min (token expire en 2h)
  return cache;
}

// ── Appel API guichet-unique ──────────────────────────────────────────────────
async function guCall(path) {
  const session = await getSession();

  const res = await fetch(`${GU}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': UA,
      Referer: `${GU}/`,
      Cookie: session.cookieStr,
    },
  });

  if (res.status === 401 || res.status === 403) {
    cache = null;
    const s2 = await getSession();
    const r2 = await fetch(`${GU}${path}`, {
      headers: { Accept: 'application/json', 'User-Agent': UA, Referer: `${GU}/`, Cookie: s2.cookieStr },
    });
    if (!r2.ok) throw new Error(`INPI ${path} : ${r2.status}`);
    return r2.json();
  }

  if (!res.ok) throw new Error(`INPI ${path} : ${res.status}`);
  return res.json();
}

// ── Route GET /api/inpi-auth ──────────────────────────────────────────────────
export async function GET() {
  try {
    const [countData, listData] = await Promise.all([
      guCall('/api/formalities/count-by-status'),
      guCall('/api/formalities/dashboard-list?status%5B%5D=RECEIVED&status%5B%5D=PAYMENT_VALIDATION_PENDING&status%5B%5D=PAID&status%5B%5D=SIGNATURE_PENDING&status%5B%5D=PAYMENT_PENDING&status%5B%5D=SIGNED&status%5B%5D=AMENDMENT_PENDING&status%5B%5D=AMENDMENT_SIGNATURE_PENDING&status%5B%5D=AMENDMENT_SIGNED&status%5B%5D=AMENDMENT_PAYMENT_PENDING&status%5B%5D=AMENDMENT_PAYMENT_VALIDATION_PENDING&status%5B%5D=AMENDMENT_PAID&status%5B%5D=AMENDED&status%5B%5D=VALIDATION_PENDING&status%5B%5D=EXPIRED&status%5B%5D=VALIDATED&status%5B%5D=REJECTED&status%5B%5D=VALIDATED_BO_AMENDMENT_SIGNED&status%5B%5D=VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING&status%5B%5D=COMPLIANCE_INSEE_PENDING&status%5B%5D=ERROR_DECLARATION_INSEE&status%5B%5D=ERROR_INSEE_EXISTS_PM&status%5B%5D=ERROR_VALIDATION&order%5Bcreated%5D=desc&page=1&itemsPerPage=50'),
    ]);

    const stats = buildStats(countData);
    const formalites = buildList(listData);

    return NextResponse.json({ ok: true, stats, total: formalites.length, formalites });

  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e.message,
      hint: 'Vérifiez INPI_EMAIL et INPI_PASSWORD dans les variables Vercel',
    }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Extrait les Set-Cookie compatibles Node 18+ et versions antérieures
function getSetCookies(res) {
  if (typeof res.headers.getSetCookie === 'function') {
    return res.headers.getSetCookie();
  }
  // Fallback : header set-cookie unique (les headers sont souvent fusionnés avec ', ')
  const raw = res.headers.get('set-cookie');
  if (!raw) return [];
  // Séparer sur ', ' mais pas à l'intérieur des dates (qui contiennent ', ')
  return raw.split(/,(?=\s*\w+=)/);
}

function parseCookies(setCookieArray) {
  const out = {};
  for (const c of setCookieArray) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    out[k] = v;
  }
  return out;
}

function buildStats(raw) {
  if (Array.isArray(raw)) {
    const find = (...codes) => codes.reduce((s, c) => s + (raw.find(x => x.status === c)?.count ?? 0), 0);
    return {
      total:                     raw.reduce((s, x) => s + (x.count ?? 0), 0),
      validees:                  find('VALIDATED', 'VALIDATED_BO_AMENDMENT_SIGNED', 'VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING'),
      rejetees:                  find('REJECTED'),
      en_attente_regularisation: find('AMENDMENT_PENDING', 'AMENDMENT_SIGNATURE_PENDING', 'AMENDMENT_SIGNED', 'AMENDMENT_PAYMENT_PENDING', 'AMENDMENT_PAYMENT_VALIDATION_PENDING', 'AMENDMENT_PAID', 'AMENDED'),
      en_attente_validation:     find('VALIDATION_PENDING', 'RECEIVED'),
    };
  }
  return raw ?? {};
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
    RECEIVED: 'Reçue', PAYMENT_PENDING: 'Paiement en attente', PAYMENT_VALIDATION_PENDING: 'Validation paiement',
    PAID: 'Payée', SIGNATURE_PENDING: 'Signature en attente', SIGNED: 'Signée',
    VALIDATION_PENDING: 'En attente de validation', VALIDATED: 'Validée', REJECTED: 'Rejetée',
    EXPIRED: 'Expirée', AMENDMENT_PENDING: 'Régularisation', AMENDED: 'Régularisée',
    COMPLIANCE_INSEE_PENDING: 'En cours INSEE', ERROR_VALIDATION: 'Erreur validation',
  };
  return map[s] ?? s;
}

function colorStatut(s) {
  if (!s) return 'slate';
  if (['VALIDATED','VALIDATED_BO_AMENDMENT_SIGNED','VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING'].includes(s)) return 'green';
  if (['REJECTED','ERROR_VALIDATION','ERROR_DECLARATION_INSEE','ERROR_INSEE_EXISTS_PM'].includes(s)) return 'red';
  if (['AMENDMENT_PENDING','AMENDMENT_SIGNATURE_PENDING','AMENDMENT_SIGNED','AMENDMENT_PAYMENT_PENDING','AMENDMENT_PAID','AMENDED','VALIDATION_PENDING'].includes(s)) return 'amber';
  if (['RECEIVED','PAYMENT_PENDING','PAYMENT_VALIDATION_PENDING','PAID','SIGNATURE_PENDING','SIGNED','COMPLIANCE_INSEE_PENDING'].includes(s)) return 'blue';
  return 'slate';
}

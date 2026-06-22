import { NextResponse } from 'next/server';

/**
 * Connexion à formalites.inpi.fr avec email + mot de passe
 * puis récupération des formalités via leur API interne.
 *
 * Flow :
 * 1. POST /api/auth/login → récupère le JWT/cookie de session
 * 2. GET /api/formalites  → liste des dossiers authentifié
 */

const BASE = 'https://formalites.inpi.fr';

// Cache session en mémoire (reset à chaque redéploiement Vercel)
let cachedSession = null;
let sessionExpires = 0;

async function login() {
  const email    = process.env.INPI_EMAIL;
  const password = process.env.INPI_PASSWORD;

  if (!email || !password) {
    throw new Error('INPI_EMAIL et INPI_PASSWORD manquants dans les variables Vercel');
  }

  // Étape 1 : récupérer le CSRF token / page de login
  const loginPage = await fetch(`${BASE}/login`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    redirect: 'follow',
  });

  const cookies = loginPage.headers.get('set-cookie') || '';
  const html = await loginPage.text();

  // Extraire le CSRF token (champ _csrf ou xsrf selon leur implémentation)
  const csrfMatch = html.match(/name="_csrf"\s+value="([^"]+)"/i)
    || html.match(/name="csrf[_-]?token"\s+value="([^"]+)"/i)
    || html.match(/"csrf[Tt]oken"\s*:\s*"([^"]+)"/);
  const csrf = csrfMatch?.[1] || '';

  // Extraire le cookie de session initial
  const sessionCookie = extractCookies(cookies);

  // Étape 2 : POST les identifiants
  const loginRes = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'Cookie': sessionCookie,
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });

  // Si JSON → JWT token
  let token = null;
  let newCookies = loginRes.headers.get('set-cookie') || '';

  if (loginRes.status >= 200 && loginRes.status < 400) {
    const ct = loginRes.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await loginRes.json().catch(() => ({}));
      token = data.token || data.access_token || data.jwt || null;
    }
  }

  const allCookies = mergeCookies(sessionCookie, newCookies);

  if (!token && !allCookies) {
    throw new Error(`Login échoué (statut ${loginRes.status}) — vérifiez INPI_EMAIL et INPI_PASSWORD`);
  }

  cachedSession = { token, cookies: allCookies };
  sessionExpires = Date.now() + 55 * 60 * 1000; // 55 minutes
  return cachedSession;
}

async function getSession() {
  if (cachedSession && Date.now() < sessionExpires) return cachedSession;
  return await login();
}

// Appel authentifié à l'API INPI
async function inpiCall(path) {
  const session = await getSession();

  const headers = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'application/json',
    ...(session.token  ? { Authorization: `Bearer ${session.token}` } : {}),
    ...(session.cookies ? { Cookie: session.cookies } : {}),
  };

  const res = await fetch(`${BASE}${path}`, { headers });

  if (res.status === 401) {
    // Session expirée → forcer re-login
    cachedSession = null;
    const session2 = await login();
    const headers2 = {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json',
      ...(session2.token   ? { Authorization: `Bearer ${session2.token}` }  : {}),
      ...(session2.cookies ? { Cookie: session2.cookies } : {}),
    };
    const res2 = await fetch(`${BASE}${path}`, { headers: headers2 });
    return res2.json();
  }

  if (!res.ok) throw new Error(`INPI ${path} : ${res.status}`);
  return res.json();
}

// ── GET /api/inpi-auth — stats + liste des formalités ────────────────────────

export async function GET() {
  try {
    // Tentatives sur plusieurs endpoints possibles de leur API interne
    let formalites = [];
    let stats = null;

    // Essai 1 : endpoint dashboard / statistiques
    try {
      const s = await inpiCall('/api/v1/dashboard/statistics');
      stats = s;
    } catch (_) {}

    // Essai 2 : liste des formalités
    try {
      const f = await inpiCall('/api/v1/formalites?page=0&size=100&sort=dateDepot,desc');
      formalites = f?.content || f?.formalites || f?.results || f || [];
    } catch (_) {
      // Essai 3 : autre chemin possible
      try {
        const f2 = await inpiCall('/api/formalites?page=1&limit=100');
        formalites = f2?.data || f2?.items || f2 || [];
      } catch (_) {}
    }

    // Calcul des stats depuis la liste si pas d'endpoint dédié
    if (!stats && formalites.length > 0) {
      stats = {
        total:         formalites.length,
        en_attente:    formalites.filter(f => ['EN_ATTENTE', 'ATTENTE_REGULARISATION', 'ATTENTE_VALIDATION'].includes(f.statut)).length,
        validees:      formalites.filter(f => ['VALIDE', 'ENREGISTRE', 'VALIDEE'].includes(f.statut)).length,
        rejetees:      formalites.filter(f => ['REJETE', 'REJETEE'].includes(f.statut)).length,
        en_cours:      formalites.filter(f => ['EN_COURS', 'EN_COURS_DE_TRAITEMENT'].includes(f.statut)).length,
      };
    }

    const normalized = formalites.map(f => ({
      id:           f.numeroDossier || f.id || f.reference,
      siren:        f.siren || f.entreprise?.siren,
      denomination: f.raisonSociale || f.denomination || f.entreprise?.denomination || f.nomEntreprise,
      type:         f.typeFormalite?.libelle || f.typeLibelle || f.type,
      statut:       f.statut,
      statut_label: labelStatut(f.statut),
      statut_color: colorStatut(f.statut),
      date_depot:   f.dateDepot || f.dateSoumission || f.createdAt,
      date_modif:   f.dateModification || f.updatedAt,
      commentaire:  f.commentaire || f.motifRejet || null,
    }));

    return NextResponse.json({
      ok: true,
      stats,
      total: normalized.length,
      formalites: normalized,
    });

  } catch (e) {
    // Si login échoue → donner des détails pour debug
    return NextResponse.json({
      ok: false,
      error: e.message,
      hint: 'Vérifiez INPI_EMAIL et INPI_PASSWORD dans vos variables Vercel',
    }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractCookies(setCookieHeader) {
  if (!setCookieHeader) return '';
  return setCookieHeader
    .split(',')
    .map(c => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function mergeCookies(existing, newCookies) {
  const all = [existing, extractCookies(newCookies)].filter(Boolean).join('; ');
  return all;
}

function labelStatut(s) {
  const map = {
    EN_ATTENTE:              'En attente',
    ATTENTE_REGULARISATION:  'Régularisation',
    ATTENTE_VALIDATION:      'Validation',
    EN_COURS_DE_TRAITEMENT:  'En cours',
    VALIDE:                  'Validée',
    VALIDEE:                 'Validée',
    ENREGISTRE:              'Enregistrée',
    REJETE:                  'Rejetée',
    REJETEE:                 'Rejetée',
    BROUILLON:               'Brouillon',
    CLASSE_SANS_SUITE:       'Classée sans suite',
  };
  return map[s] || s || '—';
}

function colorStatut(s) {
  if (['VALIDE','VALIDEE','ENREGISTRE'].includes(s)) return 'green';
  if (['REJETE','REJETEE'].includes(s)) return 'red';
  if (['ATTENTE_REGULARISATION','ATTENTE_VALIDATION'].includes(s)) return 'amber';
  if (['EN_COURS_DE_TRAITEMENT','EN_COURS'].includes(s)) return 'blue';
  if (s === 'BROUILLON') return 'slate';
  return 'slate';
}

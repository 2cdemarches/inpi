import { NextResponse } from 'next/server';

const BASE = 'https://procedures.inpi.fr';
const CLIENT_VERSION = '1.27.0-1776089031331';

let cachedSession = null;
let sessionExpires = 0;

async function login() {
  const ref      = process.env.INPI_EMAIL;
  const password = process.env.INPI_PASSWORD;

  if (!ref || !password) {
    throw new Error('INPI_EMAIL et INPI_PASSWORD manquants dans les variables Vercel');
  }

  const res = await fetch(`${BASE}/security/v1/inpiconnect/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'x-client-version': CLIENT_VERSION,
      Referer: `${BASE}/?/login`,
    },
    body: JSON.stringify({ ref, password }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Login INPI échoué (${res.status}) : ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  if (!json?.data) {
    throw new Error('Réponse login inattendue : ' + JSON.stringify(json).slice(0, 200));
  }

  // Récupère tous les cookies Set-Cookie
  const rawCookies = res.headers.getSetCookie?.() || [];
  const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');

  if (!cookieStr) {
    throw new Error('Aucun cookie reçu après login — identifiants incorrects ?');
  }

  cachedSession = { cookies: cookieStr };
  sessionExpires = Date.now() + 50 * 60 * 1000; // 50 min
  return cachedSession;
}

async function getSession() {
  if (cachedSession && Date.now() < sessionExpires) return cachedSession;
  return await login();
}

async function apiCall(path) {
  const session = await getSession();

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: 'application/json, text/*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'x-client-version': CLIENT_VERSION,
      Referer: `${BASE}/`,
      Cookie: session.cookies,
    },
  });

  if (res.status === 401 || res.status === 403) {
    cachedSession = null;
    const session2 = await login();
    const res2 = await fetch(`${BASE}${path}`, {
      headers: {
        Accept: 'application/json, text/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'x-client-version': CLIENT_VERSION,
        Referer: `${BASE}/`,
        Cookie: session2.cookies,
      },
    });
    if (!res2.ok) throw new Error(`INPI ${path} : ${res2.status}`);
    return res2.json();
  }

  if (!res.ok) throw new Error(`INPI ${path} : ${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    const raw = await apiCall('/app/v1/website/all');

    // Extraire les formalités depuis la réponse (structure à adapter selon le vrai retour)
    const formalites = extractFormalites(raw);
    const stats      = computeStats(formalites);

    return NextResponse.json({
      ok: true,
      stats,
      total: formalites.length,
      formalites,
      _debug: {
        raw_keys: Object.keys(raw || {}),
        data_type: typeof raw?.data,
        data_is_array: Array.isArray(raw?.data),
        data_keys: raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? Object.keys(raw.data) : null,
        webapps_type: typeof raw?.data?.webapps,
        webapps_is_array: Array.isArray(raw?.data?.webapps),
        webapps_keys: raw?.data?.webapps && !Array.isArray(raw.data.webapps) ? Object.keys(raw.data.webapps) : null,
        webapps_preview: JSON.stringify(raw?.data?.webapps)?.slice(0, 500),
      },
    });

  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e.message,
      hint: 'Vérifiez INPI_EMAIL et INPI_PASSWORD dans les variables Vercel',
    }, { status: 500 });
  }
}

function extractFormalites(raw) {
  // Structure réelle : raw.data.webapps
  const webapps = raw?.data?.webapps;
  if (Array.isArray(webapps)) return webapps.map(normalize);
  if (webapps && typeof webapps === 'object') {
    // webapps peut être un objet dont les valeurs sont des tableaux
    const arrays = Object.values(webapps).filter(v => Array.isArray(v));
    if (arrays.length) return arrays.flat().map(normalize);
  }

  if (Array.isArray(raw)) return raw.map(normalize);
  for (const key of ['formalites', 'dossiers', 'procedures', 'items', 'results', 'content']) {
    if (Array.isArray(raw?.[key])) return raw[key].map(normalize);
    if (Array.isArray(raw?.data?.[key])) return raw.data[key].map(normalize);
  }
  return [];
}

function normalize(f) {
  return {
    id:           f.numeroDossier || f.id || f.reference || f.ref,
    siren:        f.siren || f.entreprise?.siren || f.sirenEntreprise,
    denomination: f.raisonSociale || f.denomination || f.entreprise?.denomination || f.nomEntreprise || f.nom,
    type:         f.typeFormalite?.libelle || f.typeLibelle || f.type || f.nature,
    statut:       f.statut || f.etat || f.status,
    statut_label: labelStatut(f.statut || f.etat || f.status),
    statut_color: colorStatut(f.statut || f.etat || f.status),
    date_depot:   f.dateDepot || f.dateSoumission || f.dateCreation || f.createdAt,
    date_modif:   f.dateModification || f.dateMaj || f.updatedAt,
    commentaire:  f.commentaire || f.motifRejet || f.observation || null,
  };
}

function computeStats(list) {
  return {
    total:    list.length,
    validees: list.filter(f => ['VALIDE','VALIDEE','ENREGISTRE','IMMATRICULE'].includes(f.statut?.toUpperCase())).length,
    rejetees: list.filter(f => ['REJETE','REJETEE','REFUSE','REFUSEE'].includes(f.statut?.toUpperCase())).length,
    en_attente_regularisation: list.filter(f => f.statut?.toUpperCase().includes('REGULARISATION')).length,
    en_attente_validation:     list.filter(f => f.statut?.toUpperCase().includes('VALIDATION')).length,
  };
}

function labelStatut(s) {
  if (!s) return '—';
  const map = {
    EN_ATTENTE:              'En attente',
    ATTENTE_REGULARISATION:  'Régularisation',
    ATTENTE_VALIDATION:      'Validation',
    EN_COURS_DE_TRAITEMENT:  'En cours',
    VALIDE:                  'Validée',
    VALIDEE:                 'Validée',
    ENREGISTRE:              'Enregistrée',
    IMMATRICULE:             'Immatriculée',
    REJETE:                  'Rejetée',
    REJETEE:                 'Rejetée',
    REFUSE:                  'Refusée',
    BROUILLON:               'Brouillon',
    CLASSE_SANS_SUITE:       'Classée sans suite',
  };
  return map[s.toUpperCase()] || s;
}

function colorStatut(s) {
  if (!s) return 'slate';
  const u = s.toUpperCase();
  if (['VALIDE','VALIDEE','ENREGISTRE','IMMATRICULE'].includes(u)) return 'green';
  if (['REJETE','REJETEE','REFUSE','REFUSEE'].includes(u)) return 'red';
  if (u.includes('REGULARISATION') || u.includes('VALIDATION')) return 'amber';
  if (u.includes('COURS') || u.includes('TRAITEMENT')) return 'blue';
  return 'slate';
}

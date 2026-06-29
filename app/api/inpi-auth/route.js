import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const GU   = 'https://guichet-unique.inpi.fr';
const PROC = 'https://procedures.inpi.fr';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ── Cache token par userId ────────────────────────────────────────────────────
async function getCachedBearer(userId) {
  const { data } = await adminSb().from('tokens')
    .select('value,expires_at').eq('key', 'inpi_bearer').eq('user_id', userId).single();
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date(Date.now() + 5 * 60 * 1000)) return null;
  return data.value;
}

async function storeBearer(userId, bearer, refresh = null, ttlMs = 90 * 60 * 1000) {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const sb = adminSb();
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

// ── Login INPI + échange SSO pour obtenir le BEARER GU ───────────────────────
async function loginAndGetBearer(email, password) {
  // Étape 1 : charger la page login pour les cookies de session
  const sessionRes = await fetch(`${PROC}/?/login`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow',
  }).catch(() => null);
  const sessionCookies = sessionRes ? getSetCookiesStr(sessionRes) : '';

  // Étape 2 : login INPIConnect
  const loginRes = await fetch(`${PROC}/security/v1/inpiconnect/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Accept: 'application/json, text/*',
      'User-Agent': UA,
      Origin: PROC,
      Referer: `${PROC}/?/login`,
      'Accept-Language': 'fr-FR,fr;q=0.9',
      ...(sessionCookies ? { Cookie: sessionCookies } : {}),
    },
    body: JSON.stringify({ ref: email, password }),
  });

  if (!loginRes.ok) {
    const txt = await loginRes.text().catch(() => '');
    throw new Error(`Login INPI échoué (${loginRes.status}) : ${txt.slice(0, 150)}`);
  }

  const loginJson = await loginRes.json().catch(() => ({}));
  const loginCookies = getSetCookiesStr(loginRes);
  // Combiner toutes les cookies de session (PHPSESSID + incapsula partagés sur *.inpi.fr)
  const allCookies = [sessionCookies, loginCookies].filter(Boolean).join('; ');

  // Étape 3 : appeler GET /api/user/logged sur le GU avec les cookies de session
  // Le GU partage les cookies de session avec procedures.inpi.fr via le domaine .inpi.fr
  const loggedRes = await fetch(`${GU}/api/user/logged`, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      Referer: `${PROC}/?home`,
      Cookie: allCookies,
    },
    redirect: 'follow',
  }).catch(e => { throw new Error(`Connexion GU impossible : ${e.message}`); });

  const loggedCookies = parseCookies(getSetCookiesArr(loggedRes));
  if (loggedCookies['BEARER']) return { bearer: loggedCookies['BEARER'], refresh: loggedCookies['REFRESH_TOKEN'] ?? null };

  // Étape 4 : essayer aussi avec csrftoken explicite en query param
  const csrftoken = loginJson?.data?.csrftoken;
  if (csrftoken) {
    const res2 = await fetch(`${GU}/api/user/logged?csrftoken=${csrftoken}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: `${PROC}/?home`, Cookie: allCookies },
      redirect: 'follow',
    }).catch(() => null);
    if (res2) {
      const c2 = parseCookies(getSetCookiesArr(res2));
      if (c2['BEARER']) return { bearer: c2['BEARER'], refresh: c2['REFRESH_TOKEN'] ?? null };
      // Parfois le token est dans le body
      const j2 = await res2.json().catch(() => null);
      const t2 = j2?.token ?? j2?.bearer ?? j2?.data?.token ?? j2?.data?.bearer;
      if (t2) return { bearer: t2, refresh: j2?.refresh_token ?? null };
    }
  }

  throw new Error('Impossible d\'obtenir le BEARER GU. Vérifiez vos identifiants INPI dans ⚙️ Paramètres.');
}

// ── Route GET /api/inpi-auth ──────────────────────────────────────────────────
export async function GET() {
  try {
    const user = await requireUser();
    const sb = await createSupabaseServer();
    const { data: settings } = await sb.from('settings')
      .select('inpi_rne_username,inpi_rne_password').eq('user_id', user.id).single();

    const email    = (settings?.inpi_rne_username || process.env.INPI_RNE_USERNAME || '').trim();
    const password = (settings?.inpi_rne_password || process.env.INPI_RNE_PASSWORD || '').trim();

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: 'TOKEN_MISSING' }, { status: 401 });
    }

    // Récupérer ou renouveler le BEARER GU
    let bearer = await getCachedBearer(user.id);
    if (!bearer) {
      const result = await loginAndGetBearer(email, password);
      bearer = result.bearer;
      await storeBearer(user.id, bearer, result.refresh);
    }

    // Récupérer les formalités depuis le tableau de bord GU
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
        { headers: { Accept: 'application/ld+json, application/json', 'User-Agent': UA, Cookie: `BEARER=${bearer}` } }
      );

      if (res.status === 401) {
        // Token expiré — invalider le cache et retenter avec un nouveau login
        try { await adminSb().from('tokens').delete().eq('key', 'inpi_bearer').eq('user_id', user.id); } catch {}
        const r2 = await loginAndGetBearer(email, password);
        bearer = r2.bearer;
        await storeBearer(user.id, bearer, r2.refresh);
        // Retenter la même page
        const res2 = await fetch(
          `${GU}/api/formalities/dashboard-list?${ALL_STATUSES}&order%5Bcreated%5D=desc&page=${page}&itemsPerPage=50`,
          { headers: { Accept: 'application/ld+json, application/json', 'User-Agent': UA, Cookie: `BEARER=${bearer}` } }
        );
        if (!res2.ok) throw new Error(`GU API ${res2.status}`);
        const data2 = await res2.json();
        const items2 = buildList(data2);
        formalites = formalites.concat(items2);
        const total2 = data2?.['hydra:totalItems'] ?? data2?.totalItems ?? null;
        if (total2 !== null && formalites.length >= total2) break;
        if (items2.length < 50) break;
        continue;
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
    const msg = e.message;
    if (msg === 'TOKEN_MISSING') return NextResponse.json({ ok: false, error: 'TOKEN_MISSING' }, { status: 401 });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// ── Helpers cookies ───────────────────────────────────────────────────────────
function getSetCookiesArr(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res.headers.get('set-cookie');
  if (!raw) return [];
  return raw.split(/,(?=\s*\w+=)/);
}

function getSetCookiesStr(res) {
  return getSetCookiesArr(res).map(c => c.split(';')[0]).join('; ');
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

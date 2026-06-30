import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const GU = 'https://guichet-unique.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function parseCookies(arr) {
  const out = {};
  for (const c of arr) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}
function getSetCookies(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res.headers.get('set-cookie') || '';
  return raw ? raw.split(/,(?=\s*\w+=)/) : [];
}
function jwtIsValid(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return p.exp && p.exp * 1000 > Date.now() + 60000;
  } catch { return false; }
}

async function fetchInpiStatut(dossierId, userId) {
  try {
    const sb = adminSb();
    const { data: settings } = await sb.from('settings')
      .select('inpi_bearer, inpi_refresh_token')
      .eq('user_id', userId)
      .single();
    if (!settings) return null;

    let bearer = jwtIsValid(settings.inpi_bearer) ? settings.inpi_bearer : null;
    if (!bearer && settings.inpi_refresh_token) {
      const res = await fetch(`${GU}/api/token/refresh`, {
        method: 'POST', redirect: 'manual',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json',
          'User-Agent': UA, 'Referer': `${GU}/`, 'Origin': GU, 'FromFO': '1',
          'Cookie': `REFRESH_TOKEN=${settings.inpi_refresh_token}` },
        body: JSON.stringify({ refresh_token: settings.inpi_refresh_token }),
      });
      const cookies = parseCookies(getSetCookies(res));
      if (cookies['BEARER']) {
        bearer = cookies['BEARER'];
        await sb.from('settings').update({
          inpi_bearer: bearer,
          ...(cookies['REFRESH_TOKEN'] ? { inpi_refresh_token: cookies['REFRESH_TOKEN'] } : {}),
        }).eq('user_id', userId);
      }
    }
    if (!bearer) return null;

    const r = await fetch(`${GU}/api/formalities/${dossierId}`, {
      headers: { Accept: 'application/json', 'User-Agent': UA, 'FromFO': '1',
        Cookie: `BEARER=${bearer}` },
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.status ?? data.statut ?? null;
  } catch { return null; }
}

const STATUTS_DEPOT = [
  'RECEIVED','PAYMENT_PENDING','PAYMENT_VALIDATION_PENDING','PAID',
  'SIGNATURE_PENDING','SIGNED','AMENDMENT_PENDING','AMENDMENT_SIGNATURE_PENDING',
  'AMENDMENT_SIGNED','AMENDMENT_PAYMENT_PENDING','AMENDMENT_PAYMENT_VALIDATION_PENDING',
  'AMENDMENT_PAID','AMENDED','VALIDATION_PENDING',
  'VALIDATED','VALIDATED_BO_AMENDMENT_SIGNED','VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING',
  'COMPLIANCE_INSEE_PENDING',
];
const STATUTS_IMMAT = [
  'VALIDATED','VALIDATED_BO_AMENDMENT_SIGNED','VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING',
];

// GET /api/suivi/[token] — public, no auth required
export async function GET(request, { params }) {
  try {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 });

    const sb = adminSb();

    // Récupérer le client par son token de suivi
    const { data: client, error } = await sb
      .from('clients')
      .select('id,user_id,denomination,type_societe,capital,ville_siege,prenom,nom,email,date_signature,statuts_manuels,docusign_envelope_id,inpi_dossier_id,created_at')
      .eq('suivi_token', token)
      .single();

    if (error || !client) {
      return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 });
    }

    // Récupérer la dernière demande de signature pour ce client
    const { data: signReqs } = await sb
      .from('signature_requests')
      .select('id,status,signed_at,expires_at,signer_name,documents')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(5);

    const lastSign = signReqs?.[0] ?? null;

    const statuts = client.statuts_manuels || [];

    // Récupérer le statut INPI réel si un dossier est lié
    let inpiStatut = null;
    if (client.inpi_dossier_id && client.user_id) {
      inpiStatut = await fetchInpiStatut(client.inpi_dossier_id, client.user_id);
    }

    const steps = buildTimeline(client, lastSign, statuts, inpiStatut);

    return NextResponse.json({
      ok: true,
      client: {
        denomination: client.denomination,
        type_societe:  client.type_societe,
        capital:       client.capital,
        ville_siege:   client.ville_siege,
        prenom:        client.prenom,
        nom:           client.nom,
        date_signature: client.date_signature,
        created_at:    client.created_at,
      },
      steps,
      statuts_manuels: statuts,
    });

  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── Construire la timeline ─────────────────────────────────────────────────────
function buildTimeline(client, lastSign, statuts, inpiStatut = null) {
  const steps = [];

  // 1. Dossier créé
  steps.push({
    id:       'creation',
    label:    'Dossier créé',
    desc:     'Votre dossier a été enregistré dans notre système.',
    done:     true,
    date:     client.created_at ? new Date(client.created_at).toLocaleDateString('fr-FR') : null,
    icon:     'folder',
  });

  // 2. Statuts générés (vérifier si au moins un doc a été produit)
  const hasDocs = statuts.some(s =>
    ['Acompte reçu','Solde reçu','Pièces reçues','Envoyé pour signature','Signé','Déposé INPI','Immatriculé','Dossier clôturé'].includes(s.label)
  );
  const statutsDate = statuts.find(s => s.label === 'Pièces reçues')?.date ?? null;
  steps.push({
    id:    'statuts',
    label: 'Statuts rédigés',
    desc:  'Les statuts et documents constitutifs ont été préparés.',
    done:  hasDocs || !!client.date_signature,
    date:  statutsDate || (client.date_signature ? client.date_signature : null),
    icon:  'document',
  });

  // 3. Signature
  const isSigned  = lastSign?.status === 'signed';
  const isPending = lastSign?.status === 'pending' && lastSign?.expires_at && new Date(lastSign.expires_at) >= new Date();
  const signDate  = isSigned && lastSign?.signed_at
    ? new Date(lastSign.signed_at).toLocaleDateString('fr-FR')
    : null;

  steps.push({
    id:      'signature',
    label:   'Signature électronique',
    desc:    isSigned
      ? `Documents signés le ${signDate}${lastSign?.signer_name ? ' par ' + lastSign.signer_name : ''}.`
      : isPending
        ? 'Lien de signature envoyé — en attente de votre signature.'
        : 'Signature des documents constitutifs.',
    done:    isSigned,
    pending: isPending && !isSigned,
    date:    signDate,
    icon:    'pen',
  });

  // 4. Dépôt INPI — priorité au statut INPI réel, sinon statuts_manuels
  const depositedManuel = statuts.some(s => s.label === 'Déposé INPI');
  const depositedInpi   = inpiStatut ? STATUTS_DEPOT.includes(inpiStatut) : false;
  const deposited       = depositedManuel || depositedInpi;
  const depositDate     = statuts.find(s => s.label === 'Déposé INPI')?.date ?? null;
  const depotPending    = depositedInpi && !STATUTS_IMMAT.includes(inpiStatut);
  steps.push({
    id:    'depot',
    label: 'Dépôt au Registre National',
    desc:  deposited
      ? 'Votre dossier a été reçu par l\'INPI (Guichet Unique).'
      : 'Envoi du dossier complet au Guichet Unique de l\'INPI.',
    done:    deposited && !depotPending,
    pending: depotPending,
    date:    depositDate,
    icon:    'building',
  });

  // 5. Immatriculation — validé par l'INPI
  const immatManuel = statuts.some(s => s.label === 'Immatriculé');
  const immatInpi   = inpiStatut ? STATUTS_IMMAT.includes(inpiStatut) : false;
  const immat       = immatManuel || immatInpi;
  const immatDate   = statuts.find(s => s.label === 'Immatriculé')?.date ?? null;
  steps.push({
    id:    'immatriculation',
    label: 'Immatriculation',
    desc:  immat
      ? 'Votre société est officiellement immatriculée au RCS !'
      : 'Validation par l\'INPI et attribution du SIREN.',
    done:  immat,
    date:  immatDate,
    icon:  'check',
  });

  return steps;
}

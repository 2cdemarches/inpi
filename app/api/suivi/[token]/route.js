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
  return map[s] ?? s ?? null;
}
function colorStatut(s) {
  if (!s) return 'slate';
  if (['VALIDATED','VALIDATED_BO_AMENDMENT_SIGNED','VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING'].includes(s)) return 'green';
  if (['REJECTED','ERROR_VALIDATION','ERROR_DECLARATION_INSEE','ERROR_INSEE_EXISTS_PM'].includes(s)) return 'red';
  if (['AMENDMENT_PENDING','AMENDMENT_SIGNATURE_PENDING','AMENDMENT_SIGNED','AMENDMENT_PAYMENT_PENDING',
       'AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID','AMENDED'].includes(s)) return 'amber';
  return 'blue';
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
      .select('id,user_id,denomination,type_societe,capital,ville_siege,prenom,nom,email,date_signature,statuts_manuels,docusign_envelope_id,inpi_dossier_id,inpi_formalite_id,inpi_statut,created_at')
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

    // Statut INPI : priorité au champ stocké en DB (mis à jour à chaque sync)
    // Fallback : appel API live si inpi_dossier_id défini (anciens clients)
    let inpiStatut = client.inpi_statut ?? null;
    if (!inpiStatut && client.inpi_dossier_id && client.user_id) {
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
      inpi: inpiStatut ? {
        statut:       inpiStatut,
        statut_label: labelStatut(inpiStatut),
        statut_color: colorStatut(inpiStatut),
      } : null,
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

  // 1. Documents créés / modifiés — toujours terminé (le dossier existe)
  steps.push({
    id:    'documents',
    label: 'Documents créés',
    desc:  'Les statuts et documents constitutifs ont été préparés.',
    done:  true,
    date:  client.created_at ? new Date(client.created_at).toLocaleDateString('fr-FR') : null,
    icon:  'document',
  });

  // 2. En attente de signature DocuSign
  const isSigned  = lastSign?.status === 'signed';
  const isPending = lastSign?.status === 'pending' && lastSign?.expires_at && new Date(lastSign.expires_at) >= new Date();
  steps.push({
    id:      'attente_signature',
    label:   'En attente de signature',
    desc:    isSigned
      ? 'Documents envoyés et signés via DocuSign.'
      : isPending
        ? 'Lien de signature envoyé — en attente de votre signature.'
        : 'Les documents vous seront envoyés pour signature électronique.',
    done:    isSigned,
    pending: isPending && !isSigned,
    date:    null,
    icon:    'pen',
  });

  // 3. Documents signés
  const signDate = isSigned && lastSign?.signed_at
    ? new Date(lastSign.signed_at).toLocaleDateString('fr-FR')
    : null;
  steps.push({
    id:    'signe',
    label: 'Documents signés',
    desc:  isSigned
      ? `Signature effectuée le ${signDate}${lastSign?.signer_name ? ' par ' + lastSign.signer_name : ''}.`
      : 'Signature électronique des documents constitutifs.',
    done:  isSigned,
    date:  signDate,
    icon:  'check',
  });

  // 4. En attente de validation INPI (avec sous-étapes)
  const isDepose   = !!inpiStatut || statuts.some(s => s.label === 'Déposé INPI');
  const isValide   = inpiStatut ? STATUTS_IMMAT.includes(inpiStatut) : statuts.some(s => s.label === 'Immatriculé');
  const isRejete   = inpiStatut ? ['REJECTED','ERROR_VALIDATION','ERROR_DECLARATION_INSEE','ERROR_INSEE_EXISTS_PM'].includes(inpiStatut) : false;
  const isAmend    = inpiStatut ? ['AMENDMENT_PENDING','AMENDMENT_SIGNATURE_PENDING','AMENDMENT_SIGNED',
    'AMENDMENT_PAYMENT_PENDING','AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID','AMENDED'].includes(inpiStatut) : false;

  // Sous-étapes INPI (visibles quand le dossier est déposé)
  const substeps = [];
  if (isDepose) {
    substeps.push({
      id: 'recu', label: 'Dossier reçu par l\'INPI',
      done: true, color: 'green',
    });
    if (isRejete) {
      substeps.push({ id: 'rejete', label: 'Dossier rejeté — corrections requises', done: false, color: 'red' });
    } else if (isAmend) {
      substeps.push({ id: 'regularisation', label: 'En cours de régularisation', done: false, color: 'amber', pending: true });
    } else if (!isValide) {
      substeps.push({ id: 'validation', label: 'Vérification en cours par l\'INPI', done: false, color: 'blue', pending: true });
    }
  }

  steps.push({
    id:       'inpi',
    label:    'En attente de validation INPI',
    desc:     isDepose
      ? isValide ? 'Dossier validé par le Guichet Unique.' : 'Votre dossier est en cours d\'examen par l\'INPI.'
      : 'Envoi du dossier complet au Guichet Unique de l\'INPI.',
    done:     isValide,
    pending:  isDepose && !isValide && !isRejete,
    date:     statuts.find(s => s.label === 'Déposé INPI')?.date ?? null,
    icon:     'building',
    substeps,
  });

  // 5. Validé / Immatriculé
  const immatDate = statuts.find(s => s.label === 'Immatriculé')?.date ?? null;
  steps.push({
    id:    'valide',
    label: 'Immatriculé',
    desc:  isValide
      ? `Votre société est officiellement immatriculée${client.siren ? ' — SIREN : ' + client.siren : ''} !`
      : 'Validation par l\'INPI et attribution du numéro SIREN.',
    done:  isValide,
    date:  immatDate,
    icon:  'check',
  });

  return steps;
}

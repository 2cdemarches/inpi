import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// GET /api/suivi/[token] — public, no auth required
export async function GET(request, { params }) {
  try {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 });

    const sb = adminSb();

    // Récupérer le client par son token de suivi
    const { data: client, error } = await sb
      .from('clients')
      .select('id,denomination,type_societe,capital,ville_siege,prenom,nom,email,date_signature,statuts_manuels,docusign_envelope_id,inpi_dossier_id,created_at')
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

    // Construire la timeline de progression
    const statuts = client.statuts_manuels || [];

    // Étapes fixes du parcours
    const steps = buildTimeline(client, lastSign, statuts);

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
function buildTimeline(client, lastSign, statuts) {
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

  // 4. Dépôt INPI
  const deposited = statuts.some(s => s.label === 'Déposé INPI');
  const depositDate = statuts.find(s => s.label === 'Déposé INPI')?.date ?? null;
  steps.push({
    id:    'depot',
    label: 'Dépôt au Registre National',
    desc:  deposited
      ? 'Votre dossier a été déposé auprès de l\'INPI (Guichet Unique).'
      : 'Envoi du dossier complet au Guichet Unique de l\'INPI.',
    done:  deposited,
    date:  depositDate,
    icon:  'building',
  });

  // 5. Immatriculation
  const immat = statuts.some(s => s.label === 'Immatriculé');
  const immatDate = statuts.find(s => s.label === 'Immatriculé')?.date ?? null;
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

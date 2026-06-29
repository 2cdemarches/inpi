import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { getInpiToken } from '@/lib/inpi';

const RNE = 'https://registre-national-entreprises.inpi.fr/api';

// ── Route GET /api/inpi-auth ──────────────────────────────────────────────────
// Récupère le statut INPI de chaque client qui a un inpi_dossier_id
export async function GET() {
  try {
    const user = await requireUser();
    const sb = await createSupabaseServer();

    // Token RNE
    let token;
    try {
      token = await getInpiToken(user.id);
    } catch {
      return NextResponse.json({ ok: false, error: 'TOKEN_MISSING' }, { status: 401 });
    }

    const headers = { Authorization: `Bearer ${token}` };

    // Récupérer les clients avec un numéro de dossier INPI
    const { data: clients, error } = await sb
      .from('clients')
      .select('id, denomination, type_societe, inpi_dossier_id')
      .eq('user_id', user.id)
      .not('inpi_dossier_id', 'is', null)
      .neq('inpi_dossier_id', '');

    if (error) throw new Error(error.message);
    if (!clients?.length) {
      return NextResponse.json({ ok: true, stats: buildStats([]), total: 0, formalites: [] });
    }

    // Vérifier le statut de chaque dossier en parallèle (max 5 à la fois)
    const formalites = [];
    for (let i = 0; i < clients.length; i += 5) {
      const batch = clients.slice(i, i + 5);
      const results = await Promise.all(batch.map(async (client) => {
        try {
          const res = await fetch(`${RNE}/formalities/${client.inpi_dossier_id}`, { headers });
          if (!res.ok) return buildFallback(client, res.status === 404 ? 'NOT_FOUND' : 'ERROR');
          const data = await res.json();
          return buildItem(client, data);
        } catch {
          return buildFallback(client, 'ERROR');
        }
      }));
      formalites.push(...results);
    }

    return NextResponse.json({
      ok: true,
      stats: buildStats(formalites),
      total: formalites.length,
      formalites,
    });

  } catch (e) {
    if (e.message === 'TOKEN_MISSING' || e.message.includes('manquants')) {
      return NextResponse.json({ ok: false, error: 'TOKEN_MISSING' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildItem(client, data) {
  const statut = data.status ?? data.statut ?? data.etat ?? null;
  return {
    id:           client.inpi_dossier_id,
    siren:        data.siren ?? data.companyDetails?.siren ?? null,
    denomination: client.denomination,
    type:         client.type_societe ?? data.formType ?? data.type ?? null,
    statut,
    statut_label: labelStatut(statut),
    statut_color: colorStatut(statut),
    date_depot:   data.createdAt ?? data.dateDepot ?? data.created ?? null,
    date_modif:   data.updatedAt ?? data.dateModification ?? data.updated ?? null,
    commentaire:  data.commentaire ?? data.motifRejet ?? null,
  };
}

function buildFallback(client, statut) {
  return {
    id:           client.inpi_dossier_id,
    siren:        null,
    denomination: client.denomination,
    type:         client.type_societe,
    statut,
    statut_label: statut === 'NOT_FOUND' ? 'Introuvable' : 'Erreur',
    statut_color: 'slate',
    date_depot:   null,
    date_modif:   null,
    commentaire:  null,
  };
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
    NOT_FOUND: 'Introuvable', ERROR: 'Erreur',
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

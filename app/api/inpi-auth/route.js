import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { getInpiToken } from '@/lib/inpi';

const RNE = 'https://registre-national-entreprises.inpi.fr/api';

// ── Route GET /api/inpi-auth ──────────────────────────────────────────────────
export async function GET() {
  try {
    const user = await requireUser();

    // Récupérer le token RNE (lit les credentials depuis settings en DB)
    let token;
    try {
      token = await getInpiToken(user.id);
    } catch {
      return NextResponse.json({ ok: false, error: 'TOKEN_MISSING' }, { status: 401 });
    }

    const headers = { Authorization: `Bearer ${token}` };

    // Récupérer toutes les formalités (paginées)
    let formalites = [];
    for (let page = 1; page <= 20; page++) {
      const res = await fetch(
        `${RNE}/formalities/paginated?page=${page}&pageSize=50&order=createdAt&direction=desc`,
        { headers }
      );

      // Fallback sur l'endpoint non paginé si paginated n'existe pas
      if (res.status === 404) {
        const res2 = await fetch(`${RNE}/formalities`, { headers });
        if (!res2.ok) throw new Error(`Erreur API formalités: ${res2.status}`);
        const data2 = await res2.json();
        formalites = buildList(data2);
        break;
      }

      if (!res.ok) throw new Error(`Erreur API formalités: ${res.status}`);

      const data = await res.json();
      const items = buildList(data);
      formalites = formalites.concat(items);

      const total = data?.totalItems ?? data?.total ?? data?.['hydra:totalItems'] ?? null;
      if (total !== null && formalites.length >= total) break;
      if (items.length < 50) break;
    }

    return NextResponse.json({
      ok: true,
      stats: buildStatsFromList(formalites),
      total: formalites.length,
      formalites,
    });

  } catch (e) {
    const msg = e.message;
    if (msg === 'TOKEN_MISSING' || msg.includes('manquants')) {
      return NextResponse.json({ ok: false, error: 'TOKEN_MISSING' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  const items = raw?.data ?? raw?.items ?? raw?.['hydra:member'] ?? raw?.member ?? (Array.isArray(raw) ? raw : []);
  return items.map(f => ({
    id:           f.id ?? f.liasseNumber ?? f['@id'],
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
       'AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID','AMENDED'].includes(s)) return 'amber';
  if (['VALIDATION_PENDING','RECEIVED'].includes(s)) return 'blue';
  if (['PAYMENT_PENDING','PAYMENT_VALIDATION_PENDING','PAID',
       'SIGNATURE_PENDING','SIGNED','COMPLIANCE_INSEE_PENDING'].includes(s)) return 'blue';
  return 'slate';
}

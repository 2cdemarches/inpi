import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// POST /api/clients/sync-inpi
// Body : { formalites: [...] }  — tableau venant de /api/inpi-auth
// Pour chaque formalité INPI :
//   1. Si un client a déjà cet inpi_formalite_id → on met à jour siren si besoin
//   2. Sinon → on crée un client par formalité (1 formalité = 1 client)
export async function POST(req) {
  try {
    const user = await requireUser();
    const { formalites } = await req.json();

    if (!Array.isArray(formalites) || formalites.length === 0) {
      return NextResponse.json({ ok: false, error: 'Aucune formalité fournie' }, { status: 400 });
    }

    const sb = adminSb();

    // Charger tous les clients existants de cet utilisateur
    const { data: existingClients, error: fetchErr } = await sb
      .from('clients')
      .select('id, denomination, inpi_formalite_id, siren')
      .eq('user_id', user.id);

    if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });

    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const f of formalites) {
      const fId   = String(f.id ?? '');
      const denom = (f.denomination ?? '').trim();
      if (!fId && !denom) { results.skipped++; continue; }

      // 1. Client déjà lié à cette formalité → mettre à jour statut + siren
      const byId = fId ? existingClients.find(c => c.inpi_formalite_id === fId) : null;
      if (byId) {
        const patch = { inpi_statut: f.statut ?? null, updated_at: new Date().toISOString() };
        if (f.siren && byId.siren !== f.siren) patch.siren = f.siren;
        await sb.from('clients').update(patch).eq('id', byId.id);
        results.updated++;
        continue;
      }

      // 2. Créer un client minimal depuis la formalité INPI
      const FORMES_VALIDES = ['SASU', 'SAS', 'EURL', 'SARL', 'SCI', 'Micro-entreprise'];
      const formeRaw = (f.forme_juridique ?? '').toUpperCase();
      const type_societe = FORMES_VALIDES.find(v => formeRaw.includes(v.toUpperCase())) ?? 'SASU';
      const { error: insertErr } = await sb.from('clients').insert({
        user_id:            user.id,
        denomination:       denom || '',
        siren:              f.siren || null,
        inpi_formalite_id:  fId || null,
        inpi_statut:        f.statut ?? null,
        type_societe,
        // Champs obligatoires en DB — vides pour les imports INPI
        // Champs personnels — vides pour les imports INPI
        civilite:              '',
        prenom:                '',
        nom:                   '',
        date_naissance:        '',
        ville_naissance:       '',
        cp_naissance:          '',
        nationalite:           'Française',
        adresse:               '',
        adresse_cp:            '',
        adresse_ville:         '',
        nom_pere:              '',
        nom_mere:              '',
        email:                 '',
        telephone:             '',
        // Champs société
        siege_social:          '',
        ville_siege:           '',
        objet_social:          '',
        capital:               0,
        nb_actions:            0,
        // Champs signature
        date_signature:        '',
        ville_signature:       '',
        date_premier_exercice: '',
        notes:                 '',
        statuts_manuels:       [],
        created_at:         new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      });

      if (insertErr) {
        results.errors.push(`${denom}: ${insertErr.message}`);
        results.skipped++;
      } else {
        results.created++;
        existingClients.push({ id: 'new', denomination: denom, inpi_formalite_id: fId, siren: f.siren });
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

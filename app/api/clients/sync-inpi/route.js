import { NextResponse } from 'next/server';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// POST /api/clients/sync-inpi
// Body : { formalites: [...] }  — tableau venant de /api/inpi-auth
// Pour chaque formalité INPI :
//   1. Si un client a déjà cet inpi_formalite_id → on met à jour siren + inpi_formalite_id
//   2. Sinon si un client a la même dénomination → on lie (inpi_formalite_id + siren)
//   3. Sinon → on crée un client minimal avec les données INPI
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

    const results = { created: 0, linked: 0, updated: 0, skipped: 0, errors: [] };

    for (const f of formalites) {
      const fId   = String(f.id ?? '');
      const denom = (f.denomination ?? '').trim();
      if (!fId && !denom) { results.skipped++; continue; }

      // 1. Client déjà lié à cette formalité
      const byId = fId ? existingClients.find(c => c.inpi_formalite_id === fId) : null;
      if (byId) {
        if (f.siren && byId.siren !== f.siren) {
          await sb.from('clients').update({ siren: f.siren, updated_at: new Date().toISOString() }).eq('id', byId.id);
          results.updated++;
        } else {
          results.skipped++;
        }
        continue;
      }

      // 2. Client avec même dénomination (correspondance exacte ou partielle)
      const byDenom = denom
        ? existingClients.find(c => {
            const cd = (c.denomination ?? '').trim().toLowerCase();
            const fd = denom.toLowerCase();
            return cd === fd || cd.includes(fd) || fd.includes(cd);
          })
        : null;

      if (byDenom) {
        await sb.from('clients').update({
          inpi_formalite_id: fId || null,
          ...(f.siren ? { siren: f.siren } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', byDenom.id);
        // Mettre à jour le cache local
        byDenom.inpi_formalite_id = fId;
        results.linked++;
        continue;
      }

      // 3. Créer un client minimal depuis la formalité INPI
      const typeMap = { 'Création': 'SASU', 'Modification': 'SASU', 'Cessation': 'SASU' };
      const { error: insertErr } = await sb.from('clients').insert({
        user_id:            user.id,
        denomination:       denom || '',
        siren:              f.siren || null,
        inpi_formalite_id:  fId || null,
        type_societe:       typeMap[f.type] || 'SASU',
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
        // Ajouter au cache local pour éviter les doublons si même dénomination
        existingClients.push({ id: 'new', denomination: denom, inpi_formalite_id: fId, siren: f.siren });
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

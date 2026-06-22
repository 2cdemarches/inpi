import { NextResponse } from 'next/server';

// data.inpi.fr — API publique RNE, aucune clé requise
// Doc : https://data.inpi.fr

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const siren = searchParams.get('siren')?.replace(/\s/g, '');

  if (!siren) {
    return NextResponse.json({ ok: false, error: 'Paramètre siren requis' }, { status: 400 });
  }

  if (!/^\d{9}$/.test(siren)) {
    return NextResponse.json({ ok: false, error: 'SIREN invalide (9 chiffres)' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://data.inpi.fr/entreprises/${siren}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Formalites-Tracker/1.0',
      },
    });

    if (res.status === 404) {
      return NextResponse.json({ ok: false, error: 'Entreprise non trouvée dans le RNE' }, { status: 404 });
    }

    if (!res.ok) {
      throw new Error(`data.inpi.fr : ${res.status}`);
    }

    const data = await res.json();

    // Normalise les champs selon la structure retournée par data.inpi.fr
    const denomination =
      data?.identite?.denomination ||
      data?.denomination ||
      data?.raisonSociale ||
      null;

    const formeJuridique =
      data?.identite?.formeJuridique?.libelle ||
      data?.formeJuridique?.libelle ||
      data?.formeJuridique ||
      null;

    const dateImmatriculation =
      data?.identite?.dateImmatriculation ||
      data?.dateImmatriculation ||
      null;

    const dateRadiation =
      data?.identite?.dateRadiation ||
      data?.dateRadiation ||
      null;

    const adresse =
      data?.siege?.adresse ||
      data?.adresseSiege ||
      null;

    const capital =
      data?.identite?.capital?.montant ||
      data?.capital ||
      null;

    return NextResponse.json({
      ok: true,
      siren,
      denomination,
      formeJuridique,
      dateImmatriculation,
      dateRadiation,
      actif: !dateRadiation,
      adresse,
      capital,
      raw: data,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

const tokenCache = new Map();

async function getToken(cfg) {
  const cacheKey = cfg.INPI_CLIENT_ID;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.token;

  const { INPI_CLIENT_ID, INPI_CLIENT_SECRET, INPI_ENV } = cfg;
  if (!INPI_CLIENT_ID || !INPI_CLIENT_SECRET) {
    throw new Error('Clés INPI manquantes — configure-les dans Paramètres');
  }

  const host = INPI_ENV === 'production' ? 'api.guichet-entreprises.fr' : 'api-sandbox.guichet-entreprises.fr';

  const res = await fetch(`https://${host}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: INPI_CLIENT_ID,
      client_secret: INPI_CLIENT_SECRET,
      scope: 'formalites:read',
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`INPI auth : ${data.error_description || data.error}`);

  tokenCache.set(cacheKey, { token: data.access_token, expires: Date.now() + (data.expires_in - 30) * 1000 });
  return data.access_token;
}

const STATUT_INPI = {
  BROUILLON:              { label: 'Brouillon',        color: 'slate'  },
  DEPOSE:                 { label: 'Déposé',           color: 'blue'   },
  EN_COURS_DE_TRAITEMENT: { label: 'En cours',         color: 'indigo' },
  COMPLEMENT_DEMANDE:     { label: 'Complément requis', color: 'amber'  },
  VALIDE:                 { label: 'Validé',           color: 'teal'   },
  ENREGISTRE:             { label: 'Enregistré',       color: 'green'  },
  REJETE:                 { label: 'Rejeté',           color: 'red'    },
  CLASSE_SANS_SUITE:      { label: 'Classé sans suite', color: 'orange' },
};

export async function GET(request) {
  try {
    const cfg = {
      INPI_CLIENT_ID:     process.env.INPI_CLIENT_ID,
      INPI_CLIENT_SECRET: process.env.INPI_CLIENT_SECRET,
      INPI_ENV:           process.env.INPI_ENV || 'production',
    };

    const token = await getToken(cfg);
    const host = cfg.INPI_ENV === 'production' ? 'api.guichet-entreprises.fr' : 'api-sandbox.guichet-entreprises.fr';

    const res = await fetch(
      `https://${host}/v1/formalites?page=1&pageSize=100&order=dateDepot:desc`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`INPI API ${res.status} : ${err.slice(0, 300)}`);
    }

    const data = await res.json();
    const raw = data.results || data.formalites || [];

    const dossiers = raw.map(d => {
      const code = d.statut || d.etatTraitement?.code || 'DEPOSE';
      const statut = STATUT_INPI[code] || { label: code, color: 'slate' };
      return {
        id:           d.numeroDossier || d.id,
        siren:        d.siren || d.entreprise?.siren,
        denomination: d.entreprise?.denomination || d.denomination || `Dossier ${d.numeroDossier}`,
        type:         d.typeFormalite?.libelle || d.type || '—',
        statut:       code,
        statut_label: statut.label,
        statut_color: statut.color,
        date_depot:   d.dateDepot || d.createdAt,
        date_modif:   d.dateModification || d.updatedAt,
        commentaire:  d.commentaire || d.motifRejet || null,
      };
    });

    return NextResponse.json({ ok: true, total: dossiers.length, dossiers });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

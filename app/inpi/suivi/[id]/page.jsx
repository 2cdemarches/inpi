import { createClient } from '@supabase/supabase-js';

const GU = 'https://guichet-unique.inpi.fr';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function adminSb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function labelStatut(s) {
  const map = {
    RECEIVED: 'Reçue', PAYMENT_PENDING: 'Paiement en attente',
    PAYMENT_VALIDATION_PENDING: 'Validation paiement', PAID: 'Payée',
    SIGNATURE_PENDING: 'En attente de signature', SIGNED: 'Signée',
    AMENDMENT_PENDING: 'Régularisation requise', AMENDMENT_SIGNATURE_PENDING: 'Signature régularisation',
    AMENDMENT_SIGNED: 'Régularisation signée', AMENDMENT_PAYMENT_PENDING: 'Paiement régularisation',
    AMENDMENT_PAYMENT_VALIDATION_PENDING: 'Validation paiement régularisation',
    AMENDMENT_PAID: 'Régularisation payée', AMENDED: 'Régularisée',
    VALIDATION_PENDING: 'En attente de validation', VALIDATED: 'Validée',
    REJECTED: 'Rejetée', EXPIRED: 'Expirée',
    VALIDATED_BO_AMENDMENT_SIGNED: 'Validée', VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING: 'Validée',
    COMPLIANCE_INSEE_PENDING: 'En attente INSEE', ERROR_DECLARATION_INSEE: 'Erreur INSEE',
    ERROR_INSEE_EXISTS_PM: 'Erreur INSEE', ERROR_VALIDATION: 'Erreur validation',
  };
  return map[s] ?? s ?? '—';
}

function colorStatut(s) {
  if (!s) return 'slate';
  if (['VALIDATED','VALIDATED_BO_AMENDMENT_SIGNED','VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING'].includes(s)) return 'green';
  if (['REJECTED','ERROR_VALIDATION','ERROR_DECLARATION_INSEE','ERROR_INSEE_EXISTS_PM'].includes(s)) return 'red';
  if (['AMENDMENT_PENDING','AMENDMENT_SIGNATURE_PENDING','AMENDMENT_SIGNED','AMENDMENT_PAYMENT_PENDING','AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID','AMENDED'].includes(s)) return 'amber';
  return 'blue';
}

const COLOR = {
  green: 'bg-green-50 text-green-700 border-green-200',
  red:   'bg-red-50 text-red-600 border-red-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  blue:  'bg-blue-50 text-blue-700 border-blue-200',
  slate: 'bg-slate-50 text-slate-500 border-slate-200',
};
const DOT = { green: 'bg-green-500', red: 'bg-red-500', amber: 'bg-amber-500', blue: 'bg-blue-500', slate: 'bg-slate-400' };

async function getFormalite(id) {
  const sb = adminSb();
  const { data: settings } = await sb.from('settings')
    .select('inpi_bearer, inpi_refresh_token')
    .not('inpi_bearer', 'is', null)
    .limit(1)
    .single();

  if (!settings?.inpi_bearer) return null;

  const res = await fetch(`${GU}/api/formalities/${id}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': UA,
      'FromFO': '1',
      Cookie: `BEARER=${settings.inpi_bearer}; REFRESH_TOKEN=${settings.inpi_refresh_token ?? ''}`,
    },
  });

  if (!res.ok) return null;
  return res.json();
}

export default async function SuiviPage({ params }) {
  const { id } = await params;
  let f = null;
  try { f = await getFormalite(id); } catch {}

  if (!f) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center max-w-sm">
          <p className="text-4xl mb-4">🔍</p>
          <p className="font-semibold text-slate-800">Dossier introuvable</p>
          <p className="text-sm text-slate-400 mt-2">Ce lien est invalide ou la formalité n'existe plus.</p>
        </div>
      </div>
    );
  }

  const statut      = f.status ?? f.statut;
  const statutLabel = labelStatut(statut);
  const statutColor = colorStatut(statut);
  const etapes      = (f.validationsRequests ?? []).map(v => ({
    numero:       v.validationNumber,
    statut:       v.status,
    statut_label: labelStatut(v.status),
    statut_color: colorStatut(v.status),
    organisme:    v.partnerCenter?.name ?? v.partner?.denomination ?? null,
    motif_rejet:  v.rejectionReasons ?? null,
    date:         v.statusDate ?? null,
  }));

  const typeFormalite = { M: 'Modification', C: 'Création', CE: 'Cessation', R: 'Reprise', REC: 'Rectification' }[f.typeFormalite] ?? f.typeFormalite ?? '';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-xs">I</div>
          <div>
            <p className="font-bold text-slate-900 text-sm">Suivi de formalité</p>
            <p className="text-xs text-slate-400">Guichet Unique INPI</p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-slate-900 text-lg">{f.companyName ?? f.denomination ?? '—'}</p>
              <p className="text-sm text-slate-400 mt-0.5">
                {f.siren && <span className="mr-3">SIREN {f.siren}</span>}
                {typeFormalite && <span className="font-medium text-slate-500">{typeFormalite}</span>}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0 ${COLOR[statutColor]}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${DOT[statutColor]}`} />
              {statutLabel}
            </span>
          </div>
          {f.created && (
            <p className="text-xs text-slate-400 mt-3">Déposé le {new Date(f.created).toLocaleDateString('fr-FR')}</p>
          )}
        </div>

        {etapes.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Suivi des étapes</p>
            <div className="space-y-0">
              {etapes.map((e, j) => (
                <div key={j} className="flex items-start gap-3">
                  <div className="flex flex-col items-center mt-1">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT[e.statut_color] ?? 'bg-slate-300'}`} />
                    {j < etapes.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1 min-h-[20px]" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium text-slate-700">{e.organisme || `Étape ${e.numero}`}</p>
                    <p className={`text-xs mt-0.5 font-medium ${
                      e.statut_color === 'green' ? 'text-green-600' :
                      e.statut_color === 'red'   ? 'text-red-500' :
                      e.statut_color === 'amber' ? 'text-amber-600' : 'text-blue-500'
                    }`}>{e.statut_label}</p>
                    {e.date && <p className="text-xs text-slate-400">{new Date(e.date).toLocaleDateString('fr-FR')}</p>}
                    {e.motif_rejet && <p className="text-xs text-red-400 italic mt-0.5">{e.motif_rejet}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400">Mis à jour automatiquement · Dossier n°{id}</p>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

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

const STATUTS_VALIDES = [
  'VALIDATED', 'VALIDATED_BO_AMENDMENT_SIGNED', 'VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING',
];
const STATUTS_SIGNES = ['SIGNED', 'AMENDMENT_SIGNED', ...STATUTS_VALIDES];

export default function SuiviPage() {
  const { id } = useParams();
  const [f, setF]               = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [registre, setRegistre] = useState(null); // { found: bool, url, nom, siren }

  useEffect(() => {
    fetch(`/api/inpi/formalite/${id}`)
      .then(r => r.json())
      .then(json => {
        if (!json.ok) { setError(json.error || 'Dossier introuvable'); return; }
        const data = json.data;
        setF(data);
        const statut = data.status ?? data.statut;
        const siren  = data.siren;
        if (STATUTS_SIGNES.includes(statut) && siren) {
          setRegistre({
            url: `https://www.inpi.fr/fiche-entreprise?q=${siren}`,
            validated: STATUTS_VALIDES.includes(statut),
            siren,
          });
        }
      })
      .catch(() => setError('Erreur de chargement'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 text-sm">Chargement…</p>
    </div>
  );

  if (error || !f) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center max-w-sm">
        <p className="text-4xl mb-4">🔍</p>
        <p className="font-semibold text-slate-800">Dossier introuvable</p>
        <p className="text-sm text-slate-400 mt-2">{error || 'Ce lien est invalide ou la formalité n\'existe plus.'}</p>
      </div>
    </div>
  );

  const statut      = f.status ?? f.statut;
  const statutLabel = labelStatut(statut);
  const statutColor = colorStatut(statut);
  const etapes      = (f.validationsRequests ?? []).map(v => ({
    statut_label: labelStatut(v.status),
    statut_color: colorStatut(v.status),
    organisme:    v.partnerCenter?.name ?? v.partner?.denomination ?? null,
    motif_rejet:  v.rejectionReasons ?? null,
    date:         v.statusDate ?? null,
    numero:       v.validationNumber,
  }));
  const typeFormalite = { M: 'Modification', C: 'Création', CE: 'Cessation', R: 'Reprise', REC: 'Rectification' }[f.typeFormalite] ?? '';

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
              <p className="font-bold text-slate-900 text-lg">{f.companyName ?? '—'}</p>
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
          {f.created && <p className="text-xs text-slate-400 mt-3">Déposé le {new Date(f.created).toLocaleDateString('fr-FR')}</p>}
        </div>

        {etapes.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Suivi des étapes</p>
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
        )}

        {/* Bloc fiche INPI */}
        {registre && (
          <div className={`border rounded-2xl p-5 ${registre.validated ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${registre.validated ? 'bg-green-100' : 'bg-blue-100'}`}>
                <svg className={`w-5 h-5 ${registre.validated ? 'text-green-600' : 'text-blue-600'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={registre.validated
                    ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    : "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"}
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${registre.validated ? 'text-green-800' : 'text-blue-800'}`}>
                  {registre.validated ? 'Dossier validé par l\'INPI' : 'Dossier signé — en cours de traitement'}
                </p>
                <p className={`text-xs mt-0.5 ${registre.validated ? 'text-green-600' : 'text-blue-600'}`}>
                  {registre.validated
                    ? 'Votre formalité a été validée. Retrouvez votre fiche sur le site INPI.'
                    : 'Votre dossier est signé et en cours de traitement par l\'INPI.'}
                </p>
                <a
                  href={registre.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 mt-3 px-4 py-2 text-white text-xs font-medium rounded-lg transition-colors ${registre.validated ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  Voir la fiche sur l'INPI
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400">Mis à jour automatiquement · Dossier n°{id}</p>
      </div>
    </div>
  );
}

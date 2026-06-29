'use client';
import { useState, useEffect } from 'react';

// ── Icônes ───────────────────────────────────────────────────────────────────
function Icon({ name, className = 'w-5 h-5' }) {
  const icons = {
    folder: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    ),
    document: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    pen: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
    building: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    check: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };
  return icons[name] ?? icons.document;
}

// ── Composant step ────────────────────────────────────────────────────────────
function Step({ step, isLast }) {
  const done    = step.done;
  const pending = step.pending && !done;

  const circleCls = done
    ? 'bg-indigo-600 border-indigo-600 text-white'
    : pending
      ? 'bg-amber-400 border-amber-400 text-white animate-pulse'
      : 'bg-white border-slate-200 text-slate-300';

  const labelCls = done ? 'text-slate-900 font-semibold' : pending ? 'text-amber-700 font-semibold' : 'text-slate-400';
  const descCls  = done ? 'text-slate-600' : pending ? 'text-amber-600' : 'text-slate-400';

  return (
    <div className="flex gap-4">
      {/* Ligne verticale + cercle */}
      <div className="flex flex-col items-center">
        <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${circleCls}`}>
          {done ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <Icon name={step.icon} className="w-4 h-4" />
          )}
        </div>
        {!isLast && (
          <div className={`w-0.5 flex-1 mt-1 ${done ? 'bg-indigo-200' : 'bg-slate-100'}`} style={{ minHeight: '32px' }} />
        )}
      </div>

      {/* Contenu */}
      <div className="pb-8 flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className={`text-sm ${labelCls}`}>{step.label}</p>
          <div className="flex items-center gap-2">
            {step.date && (
              <span className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-2.5 py-0.5">{step.date}</span>
            )}
            {done && (
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5 font-medium">✓ Terminé</span>
            )}
            {pending && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 font-medium">En cours</span>
            )}
          </div>
        </div>
        <p className={`text-xs mt-1 leading-relaxed ${descCls}`}>{step.desc}</p>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function SuiviPage({ params }) {
  const [token, setToken]   = useState(null);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  // Récupérer le token depuis params (Next.js 15 async params)
  useEffect(() => {
    params.then?.(p => setToken(p.token)).catch(() => {});
    if (!params.then) setToken(params.token);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/suivi/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setData(d);
        else setError(d.error || 'Dossier introuvable');
      })
      .catch(() => setError('Erreur de connexion'))
      .finally(() => setLoading(false));
  }, [token]);

  // Calculer la progression
  const steps       = data?.steps || [];
  const doneCount   = steps.filter(s => s.done).length;
  const progress    = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const currentStep = steps.find(s => s.pending) ?? steps.filter(s => !s.done)[0] ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm leading-none">Suivi de dossier</p>
            <p className="text-xs text-slate-400">Création d'entreprise</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-5">

          {/* États de chargement / erreur */}
          {loading && (
            <div className="text-center py-20 text-slate-400">
              <svg className="w-8 h-8 mx-auto mb-3 animate-spin opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <p className="text-sm">Chargement de votre dossier…</p>
            </div>
          )}

          {error && (
            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-8 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <p className="font-semibold text-slate-800 mb-1">Dossier introuvable</p>
              <p className="text-sm text-slate-500">Ce lien est invalide ou a expiré. Contactez votre cabinet.</p>
            </div>
          )}

          {!loading && data && (
            <>
              {/* Carte identité dossier */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-5">
                  <p className="text-indigo-200 text-xs font-medium uppercase tracking-wider mb-1">Votre dossier</p>
                  <h1 className="text-white text-xl font-bold leading-tight">{data.client.denomination}</h1>
                  <p className="text-indigo-200 text-sm mt-1">
                    {data.client.type_societe}
                    {data.client.capital ? ` · ${data.client.capital.toLocaleString('fr-FR')} €` : ''}
                    {data.client.ville_siege ? ` · ${data.client.ville_siege}` : ''}
                  </p>
                </div>

                {/* Barre de progression */}
                <div className="px-6 py-4 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-500">Progression</span>
                    <span className="text-xs font-bold text-indigo-600">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-700"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  {currentStep && (
                    <p className="text-xs text-slate-500 mt-2">
                      Étape en cours : <span className="font-medium text-slate-700">{currentStep.label}</span>
                    </p>
                  )}
                  {progress === 100 && (
                    <p className="text-xs text-green-600 font-medium mt-2">🎉 Votre société est immatriculée !</p>
                  )}
                </div>

                {/* Infos client */}
                <div className="px-6 py-3 flex flex-wrap gap-x-6 gap-y-1">
                  <span className="text-xs text-slate-400">
                    Gérant : <span className="text-slate-700 font-medium">{data.client.prenom} {data.client.nom}</span>
                  </span>
                  {data.client.date_signature && (
                    <span className="text-xs text-slate-400">
                      Signé le : <span className="text-slate-700 font-medium">{data.client.date_signature}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-6">Avancement du dossier</h2>
                <div>
                  {steps.map((step, i) => (
                    <Step key={step.id} step={step} isLast={i === steps.length - 1} />
                  ))}
                </div>
              </div>

              {/* Statuts manuels récents */}
              {data.statuts_manuels?.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Historique</h2>
                  <div className="space-y-2">
                    {[...data.statuts_manuels].reverse().map((s, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                        <span className="text-sm text-slate-700">{s.label}</span>
                        <span className="text-xs text-slate-400 bg-slate-50 rounded-full px-2.5 py-0.5">{s.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              <p className="text-center text-xs text-slate-400 pb-4">
                Pour toute question, contactez votre cabinet directement.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

'use client';
import { useState, useEffect, useCallback } from 'react';

const COLOR = {
  green:  'bg-green-50 text-green-700 border-green-200',
  red:    'bg-red-50 text-red-600 border-red-200',
  amber:  'bg-amber-50 text-amber-700 border-amber-200',
  blue:   'bg-blue-50 text-blue-700 border-blue-200',
  slate:  'bg-slate-50 text-slate-500 border-slate-200',
};
const DOT = { green: 'bg-green-500', red: 'bg-red-500', amber: 'bg-amber-500', blue: 'bg-blue-500', slate: 'bg-slate-400' };

function Badge({ label, color = 'slate' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${COLOR[color]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOT[color]}`} />
      {label}
    </span>
  );
}

const DOT_COLOR = { green: 'bg-green-500', red: 'bg-red-500', amber: 'bg-amber-500', blue: 'bg-blue-500', slate: 'bg-slate-400' };

function EtapeTag({ e }) {
  return (
    <div className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-100 rounded-lg px-2 py-1">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_COLOR[e.statut_color] ?? 'bg-slate-300'}`} />
      <span className="text-slate-500">{e.organisme || `Étape ${e.numero}`}</span>
      <span className="text-slate-300">·</span>
      <span className={`font-medium ${
        e.statut_color === 'green' ? 'text-green-600' :
        e.statut_color === 'red'   ? 'text-red-500' :
        e.statut_color === 'amber' ? 'text-amber-600' : 'text-slate-500'
      }`}>{e.statut_label}</span>
      {e.motif_rejet && <span className="text-red-400 italic ml-1">— {e.motif_rejet}</span>}
    </div>
  );
}

function FicheModal({ f, onClose }) {
  const [copied, setCopied] = useState(false);
  const lienSuivi = `${window.location.origin}/suivi/${f.id}`;

  function copier() {
    navigator.clipboard.writeText(lienSuivi).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-900 text-lg">{f.denomination}</p>
            <p className="text-sm text-slate-400 mt-0.5">
              {f.siren && <span className="mr-3">SIREN {f.siren}</span>}
              {f.type && <span className="text-slate-500 font-medium">{f.type}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-1 text-xl leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Statut global */}
          <div className="flex items-center gap-3">
            <Badge label={f.statut_label} color={f.statut_color} />
            {f.date_depot && <span className="text-xs text-slate-400">Déposé le {new Date(f.date_depot).toLocaleDateString('fr-FR')}</span>}
            {f.date_modif && <span className="text-xs text-slate-400">· Màj {new Date(f.date_modif).toLocaleDateString('fr-FR')}</span>}
          </div>

          {f.commentaire && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600">
              {f.commentaire}
            </div>
          )}

          {/* Historique étapes */}
          {f.etapes?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Historique de validation</p>
              <div className="space-y-2">
                {f.etapes.map((e, j) => (
                  <div key={j} className="flex items-start gap-3">
                    <div className="flex flex-col items-center mt-1">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT_COLOR[e.statut_color] ?? 'bg-slate-300'}`} />
                      {j < f.etapes.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1 min-h-[16px]" />}
                    </div>
                    <div className="pb-2">
                      <p className="text-sm font-medium text-slate-700">{e.organisme || `Étape ${e.numero}`}</p>
                      <p className={`text-xs mt-0.5 font-medium ${
                        e.statut_color === 'green' ? 'text-green-600' :
                        e.statut_color === 'red'   ? 'text-red-500' :
                        e.statut_color === 'amber' ? 'text-amber-600' : 'text-slate-400'
                      }`}>{e.statut_label}</p>
                      {e.date && <p className="text-xs text-slate-400">{new Date(e.date).toLocaleDateString('fr-FR')}</p>}
                      {e.motif_rejet && <p className="text-xs text-red-400 italic mt-0.5">{e.motif_rejet}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lien de suivi client */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Lien de suivi client</p>
            <div className="flex gap-2">
              <input readOnly value={lienSuivi} className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-600 truncate" />
              <button onClick={copier} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${copied ? 'bg-green-500 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}>
                {copied ? '✓ Copié' : 'Copier'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">Ce lien permet au client de suivre l'avancement sans se connecter.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InpiPage() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [search, setSearch]   = useState('');
  const [filtre, setFiltre]   = useState('tous');
  const [fiche, setFiche]     = useState(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/inpi-auth');
      const json = await res.json();
      if (json.error === 'TOKEN_EXPIRED' || json.error === 'TOKEN_MISSING') {
        throw new Error(json.error);
      }
      if (json.error) throw new Error(json.error);
      setData(json);
      try { localStorage.setItem('inpi_cache', JSON.stringify(json)); } catch {}
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    try { const c = localStorage.getItem('inpi_cache'); if (c) setData(JSON.parse(c)); } catch {}
  }, []);
  useEffect(() => { load(); }, []);

  const formalites = data?.formalites || [];
  const stats      = data?.stats || {};

  const STATUTS = {
    validees:       ['VALIDATED','VALIDATED_BO_AMENDMENT_SIGNED','VALIDATED_BO_AMENDMENT_SIGNATURE_PENDING'],
    rejetees:       ['REJECTED','ERROR_VALIDATION','ERROR_DECLARATION_INSEE','ERROR_INSEE_EXISTS_PM'],
    regularisation: ['AMENDMENT_PENDING','AMENDMENT_SIGNATURE_PENDING','AMENDMENT_SIGNED','AMENDMENT_PAYMENT_PENDING','AMENDMENT_PAYMENT_VALIDATION_PENDING','AMENDMENT_PAID','AMENDED'],
    validation:     ['VALIDATION_PENDING','RECEIVED'],
  };

  const filtered = formalites.filter(f => {
    const matchSearch = !search ||
      f.denomination?.toLowerCase().includes(search.toLowerCase()) ||
      f.siren?.includes(search);
    const matchFiltre = filtre === 'tous' || (STATUTS[filtre] || []).includes(f.statut);
    return matchSearch && matchFiltre;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-xs">I</div>
            <div>
              <p className="font-bold text-slate-900">INPI — Formalités</p>
              <p className="text-xs text-slate-400">{formalites.length} dossier{formalites.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-orange-600 bg-orange-50 border border-orange-100 rounded-xl hover:bg-orange-100 disabled:opacity-50">
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualiser
            </button>
            <a href="/" className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl">← Clients</a>
          </div>
        </div>
      </header>

      <div className="px-6 py-6 max-w-6xl mx-auto space-y-6">
        {/* Bandeau expiration token */}
        {data?.expiresInMin != null && data.expiresInMin < 30 && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 flex items-center justify-between text-sm text-amber-800">
            <span>⚠️ Token INPI expire dans <strong>{data.expiresInMin} min</strong> — renouvelez-le dans ⚙️ Paramètres</span>
            <a href="https://guichet-unique.inpi.fr" target="_blank" className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium">Ouvrir INPI</a>
          </div>
        )}

        {/* Stats */}
        {(!loading || data) && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Validées',         val: stats.validees,                  color: 'text-green-600', bg: 'bg-green-50 border-green-100', key: 'validees' },
              { label: 'Rejetées',         val: stats.rejetees,                  color: 'text-red-500',   bg: 'bg-red-50 border-red-100',     key: 'rejetees' },
              { label: 'En validation',    val: stats.en_attente_validation,     color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-100',   key: 'validation' },
              { label: 'Régularisation',   val: stats.en_attente_regularisation, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100', key: 'regularisation' },
            ].map(s => (
              <button key={s.key} onClick={() => setFiltre(filtre === s.key ? 'tous' : s.key)}
                className={`${s.bg} border rounded-2xl p-4 text-left transition-all hover:shadow-sm ${filtre === s.key ? 'ring-2 ring-offset-1 ring-current' : ''}`}>
                <p className={`text-2xl font-bold ${s.color}`}>{s.val ?? '—'}</p>
                <p className="text-xs text-slate-500 mt-1">{s.label}</p>
              </button>
            ))}
          </div>
        )}

        {/* Barre de recherche */}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par dénomination ou SIREN…"
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white" />

        {/* États */}
        {loading && !data && <p className="text-center text-slate-400 py-16">Chargement des formalités…</p>}
        {(error === 'TOKEN_EXPIRED' || error === 'TOKEN_MISSING') && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 text-sm text-amber-800 space-y-3">
            <p className="font-bold text-base">🔑 Connexion INPI requise</p>
            <p>Renseignez votre <strong>REFRESH_TOKEN</strong> dans <strong>⚙️ Paramètres → INPI (Guichet Unique)</strong> et sauvegardez.</p>
            <button onClick={load} className="mt-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium">
              Réessayer
            </button>
          </div>
        )}
        {error && error !== 'TOKEN_EXPIRED' && error !== 'TOKEN_MISSING' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-600">
            <p className="font-semibold mb-1">Erreur de connexion INPI</p>
            <p>{error}</p>
          </div>
        )}

        {/* Liste */}
        {(!loading || data) && !error && (
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-center text-slate-400 py-10 text-sm">Aucun résultat</p>}
            {filtered.map((f, i) => {
              const derniereEtape = f.etapes?.length > 0 ? f.etapes[f.etapes.length - 1] : null;
              return (
                <div key={f.id ?? i}
                  className="bg-white border border-slate-100 rounded-2xl px-4 py-3 cursor-pointer hover:border-orange-200 hover:shadow-sm transition-all"
                  onClick={() => setFiche(f)}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{f.denomination || '—'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {f.siren && <span className="mr-3">SIREN {f.siren}</span>}
                        {f.type && <span className="mr-3 font-medium text-slate-500">{f.type}</span>}
                        {f.date_depot && <span>{new Date(f.date_depot).toLocaleDateString('fr-FR')}</span>}
                      </p>
                      {f.commentaire && <p className="text-xs text-red-400 mt-1 italic truncate">{f.commentaire}</p>}
                      {derniereEtape && (
                        <div className="mt-1.5">
                          <EtapeTag e={derniereEtape} />
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      <Badge label={f.statut_label} color={f.statut_color} />
                      {f.etapes?.length > 1 && (
                        <span className="text-xs text-slate-400">{f.etapes.length} étapes</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

    {fiche && <FicheModal f={fiche} onClose={() => setFiche(null)} />}
  );
}

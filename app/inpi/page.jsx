'use client';
import { useState, useEffect } from 'react';

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

export default function InpiPage() {
  const [data, setData]       = useState(() => {
    try { const c = localStorage.getItem('inpi_cache'); return c ? JSON.parse(c) : null; } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [search, setSearch]   = useState('');
  const [filtre, setFiltre]   = useState('tous');

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/inpi-auth');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      try { localStorage.setItem('inpi_cache', JSON.stringify(json)); } catch {}
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

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
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-600">
            <p className="font-semibold mb-1">Erreur de connexion INPI</p>
            <p>{error}</p>
            <p className="mt-2 text-red-400">Renseignez vos identifiants INPI dans ⚙️ Paramètres.</p>
          </div>
        )}

        {/* Liste */}
        {(!loading || data) && !error && (
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-center text-slate-400 py-10 text-sm">Aucun résultat</p>}
            {filtered.map((f, i) => (
              <div key={f.id ?? i} className="bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{f.denomination || '—'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {f.siren && <span className="mr-3">SIREN {f.siren}</span>}
                    {f.type && <span className="mr-3">{f.type}</span>}
                    {f.date_depot && <span>{new Date(f.date_depot).toLocaleDateString('fr-FR')}</span>}
                  </p>
                  {f.commentaire && <p className="text-xs text-slate-400 mt-1 italic truncate">{f.commentaire}</p>}
                </div>
                <div className="flex-shrink-0">
                  <Badge label={f.statut_label} color={f.statut_color} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

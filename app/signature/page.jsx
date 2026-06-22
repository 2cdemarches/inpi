'use client';
import { useState, useEffect } from 'react';

const DS_LABELS = {
  completed: 'Signé ✓', sent: 'Envoyé', delivered: 'Reçu',
  declined: 'Refusé', voided: 'Annulé', created: 'Créé', 'waiting for others': 'En attente',
};
const DS_COLORS = {
  completed: 'green', sent: 'blue', delivered: 'blue',
  declined: 'red', voided: 'red', created: 'slate', 'waiting for others': 'amber',
};

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

export default function SignaturePage() {
  const [envelopes, setEnvelopes] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState('');
  const [filtre, setFiltre]       = useState('tous');

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/docusign');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setEnvelopes(json.envelopes || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const stats = {
    completed: envelopes.filter(e => e.status === 'completed').length,
    sent:      envelopes.filter(e => ['sent','delivered','waiting for others'].includes(e.status)).length,
    declined:  envelopes.filter(e => ['declined','voided'].includes(e.status)).length,
    created:   envelopes.filter(e => e.status === 'created').length,
  };

  const filtered = envelopes.filter(e => {
    const matchSearch = !search ||
      e.emailSubject?.toLowerCase().includes(search.toLowerCase()) ||
      e.envelopeId?.includes(search);
    const matchFiltre = filtre === 'tous' ||
      (filtre === 'completed' && e.status === 'completed') ||
      (filtre === 'sent'      && ['sent','delivered','waiting for others'].includes(e.status)) ||
      (filtre === 'declined'  && ['declined','voided'].includes(e.status));
    return matchSearch && matchFiltre;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xs">DS</div>
            <div>
              <p className="font-bold text-slate-900">DocuSign — Signatures</p>
              <p className="text-xs text-slate-400">{envelopes.length} enveloppe{envelopes.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 disabled:opacity-50">
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
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Signés',       val: stats.completed, color: 'text-green-600', bg: 'bg-green-50 border-green-100',  key: 'completed' },
              { label: 'En cours',     val: stats.sent,      color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-100',    key: 'sent' },
              { label: 'Refusés',      val: stats.declined,  color: 'text-red-500',   bg: 'bg-red-50 border-red-100',      key: 'declined' },
              { label: 'Non envoyés',  val: stats.created,   color: 'text-slate-500', bg: 'bg-slate-50 border-slate-100',  key: 'created' },
            ].map(s => (
              <button key={s.key} onClick={() => setFiltre(filtre === s.key ? 'tous' : s.key)}
                className={`${s.bg} border rounded-2xl p-4 text-left transition-all hover:shadow-sm ${filtre === s.key ? 'ring-2 ring-offset-1 ring-current' : ''}`}>
                <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                <p className="text-xs text-slate-500 mt-1">{s.label}</p>
              </button>
            ))}
          </div>
        )}

        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par objet ou ID d'enveloppe…"
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />

        {loading && <p className="text-center text-slate-400 py-16">Chargement DocuSign…</p>}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-600">
            <p className="font-semibold mb-1">Erreur DocuSign</p>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-center text-slate-400 py-10 text-sm">Aucun résultat</p>}
            {filtered.map(env => (
              <div key={env.envelopeId} className="bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{env.emailSubject || 'Sans objet'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {env.sentDateTime && <span className="mr-3">Envoyé le {new Date(env.sentDateTime).toLocaleDateString('fr-FR')}</span>}
                    {env.completedDateTime && <span className="text-green-600">Signé le {new Date(env.completedDateTime).toLocaleDateString('fr-FR')}</span>}
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5 font-mono truncate">{env.envelopeId}</p>
                </div>
                <div className="flex-shrink-0">
                  <Badge label={DS_LABELS[env.status] || env.status} color={DS_COLORS[env.status] || 'slate'} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

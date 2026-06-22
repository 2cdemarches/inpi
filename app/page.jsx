'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

function apiFetch(url) {
  return fetch(url).then(r => r.json());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

const COLOR_CLASSES = {
  slate:  { bg: 'bg-slate-100',   text: 'text-slate-700',   dot: 'bg-slate-400'   },
  blue:   { bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500'    },
  indigo: { bg: 'bg-indigo-50',   text: 'text-indigo-700',  dot: 'bg-indigo-500'  },
  green:  { bg: 'bg-green-50',    text: 'text-green-700',   dot: 'bg-green-500'   },
  red:    { bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500'     },
  amber:  { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500'   },
  orange: { bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-400'  },
  teal:   { bg: 'bg-teal-50',     text: 'text-teal-700',    dot: 'bg-teal-500'    },
};

function Badge({ label, color = 'slate' }) {
  const c = COLOR_CLASSES[color] || COLOR_CLASSES.slate;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
      <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>
        <p className="font-semibold">Erreur de connexion</p>
        <p className="mt-1 text-red-600">{message}</p>
      </div>
    </div>
  );
}

// ── Carte DocuSign ────────────────────────────────────────────────────────────

function DocuSignCard({ env }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
      onClick={() => setOpen(o => !o)}
    >
      <div className="p-5 flex items-start gap-4">
        {/* Icône */}
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 truncate leading-snug">{env.sujet}</p>
              <p className="text-xs text-slate-400 mt-1">{env.id.slice(0, 8)}…</p>
            </div>
            <Badge label={env.statut_label} color={env.statut_color} />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
            <span>Créé le {fmt(env.date_creation)}</span>
            {env.date_signature && <span className="text-green-600 font-medium">Signé le {fmt(env.date_signature)}</span>}
            {env.date_expiration && !env.date_signature && <span>Expire le {fmt(env.date_expiration)}</span>}
          </div>

          {/* Signataires résumé */}
          {env.signataires.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              {env.signataires.slice(0, 3).map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-100 rounded-full px-2.5 py-1">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-[10px]">
                    {(s.nom || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-slate-600 max-w-[100px] truncate">{s.nom}</span>
                  {s.statut === 'completed' && <span className="text-green-500">✓</span>}
                </div>
              ))}
              {env.signataires.length > 3 && (
                <span className="text-xs text-slate-400">+{env.signataires.length - 3}</span>
              )}
            </div>
          )}
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-slate-300 flex-shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Détail signataires */}
      {open && env.signataires.length > 0 && (
        <div className="border-t border-slate-50 px-5 py-4 bg-slate-50/50 rounded-b-2xl">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Signataires</p>
          <div className="space-y-2">
            {env.signataires.map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs">
                    {(s.nom || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{s.nom}</p>
                    <p className="text-xs text-slate-400">{s.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge
                    label={s.statut === 'completed' ? 'Signé' : s.statut === 'sent' ? 'En attente' : s.statut}
                    color={s.statut === 'completed' ? 'green' : s.statut === 'declined' ? 'red' : 'amber'}
                  />
                  {s.date && <p className="text-xs text-slate-400 mt-1">{fmt(s.date)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Carte INPI ────────────────────────────────────────────────────────────────

function InpiCard({ dossier }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200 p-5">
      <div className="flex items-start gap-4">
        {/* Icône */}
        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 truncate leading-snug">{dossier.denomination}</p>
              {dossier.siren && (
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{dossier.siren}</p>
              )}
            </div>
            <Badge label={dossier.statut_label} color={dossier.statut_color} />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
            <span className="font-medium text-slate-600">{dossier.type}</span>
            {dossier.date_depot && <span>Déposé le {fmt(dossier.date_depot)}</span>}
            {dossier.date_modif && <span>Modifié le {fmt(dossier.date_modif)}</span>}
          </div>

          {dossier.commentaire && (
            <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {dossier.commentaire}
            </p>
          )}

          {dossier.id && (
            <p className="mt-2 text-xs text-slate-300 font-mono">#{dossier.id}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'from-indigo-500 to-indigo-600',
    green:  'from-green-500 to-green-600',
    amber:  'from-amber-400 to-amber-500',
    orange: 'from-orange-400 to-orange-500',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className={`inline-flex w-10 h-10 rounded-xl bg-gradient-to-br ${colors[color]} items-center justify-center mb-3`}>
        <span className="text-white text-lg font-bold">{value}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm font-medium text-slate-600 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab] = useState('docusign');
  const [dsData, setDsData] = useState(null);
  const [inpiData, setInpiData] = useState(null);
  const [dsLoading, setDsLoading] = useState(false);
  const [inpiLoading, setInpiLoading] = useState(false);
  const [dsError, setDsError] = useState('');
  const [inpiError, setInpiError] = useState('');
  const [search, setSearch] = useState('');
  const [dsFilter, setDsFilter] = useState('tous');
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadDocuSign = useCallback(async () => {
    setDsLoading(true);
    setDsError('');
    try {
      const data = await apiFetch('/api/docusign');
      if (!data.ok) throw new Error(data.error);
      setDsData(data);
      setLastRefresh(new Date());
    } catch (e) {
      setDsError(e.message);
    } finally {
      setDsLoading(false);
    }
  }, []);

  const loadInpi = useCallback(async () => {
    setInpiLoading(true);
    setInpiError('');
    try {
      const data = await apiFetch('/api/inpi');
      if (!data.ok) throw new Error(data.error);
      setInpiData(data);
    } catch (e) {
      setInpiError(e.message);
    } finally {
      setInpiLoading(false);
    }
  }, []);

  useEffect(() => { loadDocuSign(); loadInpi(); }, [loadDocuSign, loadInpi]);

  // Auto-refresh toutes les 5 minutes
  useEffect(() => {
    const id = setInterval(() => { loadDocuSign(); loadInpi(); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadDocuSign, loadInpi]);

  // Filtres DocuSign
  const envelopes = dsData?.envelopes || [];
  const filteredEnvelopes = envelopes.filter(e => {
    const matchSearch = !search ||
      e.sujet.toLowerCase().includes(search.toLowerCase()) ||
      e.signataires.some(s => s.nom?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase()));
    const matchFilter = dsFilter === 'tous' || e.statut === dsFilter;
    return matchSearch && matchFilter;
  });

  // Filtres INPI
  const dossiers = inpiData?.dossiers || [];
  const filteredDossiers = dossiers.filter(d =>
    !search ||
    d.denomination?.toLowerCase().includes(search.toLowerCase()) ||
    d.siren?.includes(search) ||
    d.type?.toLowerCase().includes(search.toLowerCase())
  );

  // Stats DocuSign
  const dsStats = {
    total:    envelopes.length,
    signes:   envelopes.filter(e => e.statut === 'completed').length,
    attente:  envelopes.filter(e => ['sent','delivered'].includes(e.statut)).length,
    probleme: envelopes.filter(e => ['declined','voided','expired'].includes(e.statut)).length,
  };

  // Stats INPI
  const inpiStats = {
    total:       dossiers.length,
    enregistres: dossiers.filter(d => d.statut === 'ENREGISTRE').length,
    encours:     dossiers.filter(d => ['DEPOSE','EN_COURS_DE_TRAITEMENT'].includes(d.statut)).length,
    attention:   dossiers.filter(d => ['COMPLEMENT_DEMANDE','REJETE'].includes(d.statut)).length,
  };

  const DS_FILTERS = [
    { id: 'tous',      label: 'Tous' },
    { id: 'sent',      label: 'Envoyés' },
    { id: 'delivered', label: 'Ouverts' },
    { id: 'completed', label: 'Signés' },
    { id: 'declined',  label: 'Refusés' },
    { id: 'voided',    label: 'Annulés' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-slate-900 leading-none">Formalités</p>
              <p className="text-xs text-slate-400 mt-0.5">DocuSign · INPI</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastRefresh && (
              <p className="text-xs text-slate-400 hidden sm:block">
                Actualisé à {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <button
              onClick={() => { loadDocuSign(); loadInpi(); }}
              disabled={dsLoading || inpiLoading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${(dsLoading || inpiLoading) ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualiser
            </button>
            <button
              onClick={async () => {
                await fetch('/api/logout', { method: 'POST' });
                window.location.href = '/login';
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Enveloppes DocuSign" value={dsStats.total} color="indigo" />
          <StatCard label="Signées" value={dsStats.signes} sub="complétées" color="green" />
          <StatCard label="Dossiers INPI" value={inpiStats.total} color="orange" />
          <StatCard label="Enregistrés INPI" value={inpiStats.enregistres} sub="terminés" color="green" />
        </div>

        {/* Alertes */}
        {(dsStats.probleme > 0 || inpiStats.attention > 0) && (
          <div className="flex flex-wrap gap-3">
            {dsStats.probleme > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <strong>{dsStats.probleme}</strong> enveloppe{dsStats.probleme > 1 ? 's' : ''} refusée{dsStats.probleme > 1 ? 's' : ''} ou annulée{dsStats.probleme > 1 ? 's' : ''}
              </div>
            )}
            {inpiStats.attention > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <strong>{inpiStats.attention}</strong> dossier{inpiStats.attention > 1 ? 's' : ''} INPI nécessite{inpiStats.attention > 1 ? 'nt' : ''} une action
              </div>
            )}
          </div>
        )}

        {/* Onglets */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          {/* Tab bar */}
          <div className="flex items-center gap-1 p-2 border-b border-slate-100">
            <button
              onClick={() => setTab('docusign')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                tab === 'docusign'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              DocuSign
              {dsData && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${tab === 'docusign' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {dsData.total}
                </span>
              )}
            </button>

            <button
              onClick={() => setTab('inpi')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                tab === 'inpi'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              INPI
              {inpiData && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${tab === 'inpi' ? 'bg-orange-400 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {inpiData.total}
                </span>
              )}
            </button>

            {/* Recherche */}
            <div className="ml-auto relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48 bg-slate-50"
              />
            </div>
          </div>

          {/* Contenu DocuSign */}
          {tab === 'docusign' && (
            <div className="p-5 space-y-4">
              {/* Filtres statut */}
              <div className="flex flex-wrap gap-2">
                {DS_FILTERS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setDsFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      dsFilter === f.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                    {f.id !== 'tous' && envelopes.filter(e => e.statut === f.id).length > 0 && (
                      <span className="ml-1.5 opacity-75">{envelopes.filter(e => e.statut === f.id).length}</span>
                    )}
                  </button>
                ))}
              </div>

              {dsError && <ErrorBox message={dsError} />}
              {dsLoading && !dsData && <Spinner />}
              {!dsLoading && !dsError && filteredEnvelopes.length === 0 && (
                <div className="text-center py-16 text-slate-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm">Aucune enveloppe trouvée</p>
                </div>
              )}
              <div className="grid gap-3">
                {filteredEnvelopes.map(env => <DocuSignCard key={env.id} env={env} />)}
              </div>
            </div>
          )}

          {/* Contenu INPI */}
          {tab === 'inpi' && (
            <div className="p-5 space-y-4">
              {inpiError && <ErrorBox message={inpiError} />}
              {inpiLoading && !inpiData && <Spinner />}
              {!inpiLoading && !inpiError && filteredDossiers.length === 0 && (
                <div className="text-center py-16 text-slate-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <p className="text-sm">Aucun dossier INPI trouvé</p>
                </div>
              )}
              <div className="grid gap-3">
                {filteredDossiers.map(d => <InpiCard key={d.id} dossier={d} />)}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

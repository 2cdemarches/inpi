'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { generateAnnonceLegale } from '@/lib/annonce-legale';

const STATUTS_MANUELS = [
  'Acompte reçu',
  'Solde reçu',
  'Documents manquants',
  'En attente de pièces',
  'Pièces reçues',
  'Envoyé pour signature',
  'Signé',
  'Déposé INPI',
  'Immatriculé',
  'Dossier clôturé',
];

const TYPES_SOCIETE = ['SASU', 'SAS', 'EURL', 'SARL', 'SCI', 'Micro-entreprise'];

const DEFAULT_OBJET_SOCIAL = `Régie commerciale, développement commercial, apporteurs d'affaires, call-center, prise de rendez-vous, commissions sur ventes, intermédiations, en France et à l'international.
Ventes et achats en France et à l'international
La participation de la Société, par tous moyens, à toutes entreprises ou sociétés créées ou à créer, pouvant se rattacher à l'objet social, notamment par voie de création de sociétés nouvelles, d'apport, commandite, souscription ou rachat de titres ou droits sociaux, fusion, alliance ou association en participation ou groupement d'intérêt économique ou de location gérance de tous fonds de commerce.
Et plus généralement, toutes opérations industrielles, commerciales et financières, mobilières et immobilières pouvant se rattacher directement ou indirectement à l'objet social et à tous objets similaires ou connexes pouvant favoriser son extension ou son développement.`;

function newForm() {
  return {
    civilite: 'Monsieur', prenom: '', nom: '',
    date_naissance: '', ville_naissance: '', cp_naissance: '',
    nationalite: 'Française', adresse: '',
    nom_pere: '', nom_mere: '',
    denomination: '', type_societe: 'SASU', capital: 100,
    siege_social: '', ville_siege: '', objet_social: DEFAULT_OBJET_SOCIAL,
    adresse: '', adresse_cp: '', adresse_ville: '',
    nb_actions: 100, date_signature: '', ville_signature: '',
    date_premier_exercice: '',
    email: '', telephone: '',
    docusign_envelope_id: '', notes: '',
  };
}
const EMPTY_FORM = newForm();

// ── Badges ────────────────────────────────────────────────────────────────────
const DS_COLORS = {
  completed: 'green', sent: 'blue', delivered: 'blue',
  declined: 'red', voided: 'red', created: 'slate', 'waiting for others': 'amber',
};
const DS_LABELS = {
  completed: 'Signé ✓', sent: 'Envoyé', delivered: 'Reçu',
  declined: 'Refusé', voided: 'Annulé', created: 'Créé', 'waiting for others': 'En attente',
};

function Badge({ label, color = 'slate', dot = false }) {
  const colors = {
    green:  'bg-green-50 text-green-700 border-green-200',
    red:    'bg-red-50 text-red-600 border-red-200',
    amber:  'bg-amber-50 text-amber-700 border-amber-200',
    blue:   'bg-blue-50 text-blue-700 border-blue-200',
    slate:  'bg-slate-50 text-slate-600 border-slate-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  const dotColors = { green: 'bg-green-500', red: 'bg-red-500', amber: 'bg-amber-500', blue: 'bg-blue-500', slate: 'bg-slate-400', purple: 'bg-purple-500', indigo: 'bg-indigo-500', orange: 'bg-orange-500' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${colors[color] || colors.slate}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[color] || dotColors.slate}`} />}
      {label}
    </span>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spin() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin text-slate-300" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}

// ── Composant statut DocuSign par client ─────────────────────────────────────
function DsStatus({ envelopeId }) {
  const cacheKey = `ds_status_${envelopeId}`;
  const [status, setStatus] = useState(() => {
    try { const c = localStorage.getItem(cacheKey); return c ? JSON.parse(c) : null; } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!envelopeId) return;
    setLoading(true);
    fetch(`/api/docusign/envelope?id=${envelopeId}`)
      .then(r => r.json())
      .then(d => {
        if (d.status) {
          setStatus(d.status);
          try { localStorage.setItem(cacheKey, JSON.stringify(d.status)); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [envelopeId]);

  if (!envelopeId) return <Badge label="—" color="slate" />;
  if (loading && !status) return <span className="flex items-center gap-1 text-xs text-slate-300 w-20"><Spin /> DS…</span>;
  if (!status) return <Badge label="—" color="slate" />;
  return <Badge label={DS_LABELS[status] || status} color={DS_COLORS[status] || 'slate'} dot />;
}

// ── Composant statut INPI par client ─────────────────────────────────────────
function InpiStatus({ denomination }) {
  const cacheKey = `inpi_status_${denomination}`;
  const [status, setStatus] = useState(() => {
    try { const c = localStorage.getItem(cacheKey); return c ? JSON.parse(c) : null; } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!denomination) return;
    setLoading(true);
    fetch('/api/inpi-auth')
      .then(r => r.json())
      .then(d => {
        const match = (d.formalites || []).find(f =>
          f.denomination?.toLowerCase() === denomination.toLowerCase()
        );
        if (match) {
          setStatus(match);
          try { localStorage.setItem(cacheKey, JSON.stringify(match)); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [denomination]);

  if (!denomination) return <Badge label="—" color="slate" />;
  if (loading && !status) return <span className="flex items-center gap-1 text-xs text-slate-300 w-20"><Spin /> INPI…</span>;
  if (!status) return <Badge label="—" color="slate" />;
  return <Badge label={status.statut_label} color={status.statut_color} dot />;
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [clients, setClients]       = useState(() => {
    try { const c = localStorage.getItem('clients_cache'); return c ? JSON.parse(c) : []; } catch { return []; }
  });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterType, setFilterType] = useState('tous');
  const [showForm, setShowForm]     = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [selected, setSelected]     = useState(null);
  const [newStatut, setNewStatut]   = useState('');
  const [modeles, setModeles]       = useState([]);
  const [showSaveModele, setShowSaveModele] = useState(false);
  const [nomModele, setNomModele]   = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings]         = useState({ nom_cabinet: '', representant_cabinet: '', adresse_cabinet: '', email_cabinet: '', smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '', smtp_from: '', docusign_integration_key: '', docusign_user_id: '', docusign_account_id: '', docusign_private_key: '', docusign_env: 'production', inpi_login: '', inpi_password: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [signRequests, setSignRequests]     = useState([]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/clients');
    const json = await res.json();
    if (json.ok) {
      setClients(json.clients);
      try { localStorage.setItem('clients_cache', JSON.stringify(json.clients)); } catch {}
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  useEffect(() => {
    fetch('/api/sign').then(r => r.json()).then(d => setSignRequests(d.requests || [])).catch(() => {});
  }, []);

  const loadModeles = useCallback(async () => {
    const res = await fetch('/api/modeles');
    const json = await res.json();
    if (json.ok) setModeles(json.modeles);
  }, []);
  useEffect(() => { loadModeles(); }, [loadModeles]);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(async d => {
      // Générer un bookmarklet_token unique si absent
      if (!d.bookmarklet_token) {
        const tok = crypto.randomUUID().replace(/-/g, '');
        await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookmarklet_token: tok }) });
        d = { ...d, bookmarklet_token: tok };
      }
      setSettings(d);

      // Retour OAuth Gmail
      const p = new URLSearchParams(window.location.search);
      if (p.get('gmail_ok')) {
        setShowSettings(true);
        window.history.replaceState({}, '', '/');
      } else if (p.get('gmail_error')) {
        alert('Erreur Gmail : ' + decodeURIComponent(p.get('gmail_error')));
        window.history.replaceState({}, '', '/');
      }
    }).catch(() => {});
  }, []);

  async function saveSettings() {
    setSavingSettings(true);
    await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    setSavingSettings(false);
    setShowSettings(false);
  }

  function openNew() {
    const today = new Date().toLocaleDateString('fr-FR');
    setEditClient(null);
    setForm({ ...newForm(), date_signature: today });
    setShowForm(true);
  }
  function openEdit(c) { setEditClient(c); setForm({ ...newForm(), ...c }); setShowForm(true); setSelected(null); }

  async function save() {
    setSaving(true);
    const url = editClient ? `/api/clients/${editClient.id}` : '/api/clients';
    const res = await fetch(url, {
      method: editClient ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (json.ok) {
      setShowForm(false);
      if (editClient) {
        setClients(prev => prev.map(c => c.id === json.client.id ? json.client : c));
        if (selected?.id === json.client.id) setSelected(json.client);
      } else {
        setClients(prev => [json.client, ...prev]);
      }
    } else alert('Erreur : ' + json.error);
    setSaving(false);
  }

  async function deleteClient(id) {
    if (!confirm('Supprimer ce client définitivement ?')) return;
    const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Erreur lors de la suppression'); return; }
    if (selected?.id === id) setSelected(null);
    setClients(prev => prev.filter(c => c.id !== id));
  }

  function syncClient(updated) {
    setSelected(updated);
    setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
  }

  async function addStatut(client) {
    if (!newStatut) return;
    const statuts = [...(client.statuts_manuels || []), { label: newStatut, date: new Date().toLocaleDateString('fr-FR') }];
    const res = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statuts_manuels: statuts }),
    });
    const json = await res.json();
    if (json.ok) { syncClient(json.client); setNewStatut(''); }
  }

  async function removeStatut(client, idx) {
    const statuts = (client.statuts_manuels || []).filter((_, i) => i !== idx);
    const res = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statuts_manuels: statuts }),
    });
    const json = await res.json();
    if (json.ok) syncClient(json.client);
  }

  const types = ['tous', ...TYPES_SOCIETE];
  const filtered = clients.filter(c => {
    const matchSearch = !search ||
      c.denomination?.toLowerCase().includes(search.toLowerCase()) ||
      c.nom?.toLowerCase().includes(search.toLowerCase()) ||
      c.prenom?.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'tous' || c.type_societe === filterType;
    return matchSearch && matchType;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-slate-900 leading-none">Formalités</p>
              <p className="text-xs text-slate-400">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a href="/signature" className="px-3 py-2 text-sm text-blue-600 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 font-medium">✍️ Signatures</a>
            <a href="/inpi"      className="px-3 py-2 text-sm text-orange-600 bg-orange-50 border border-orange-100 rounded-xl hover:bg-orange-100 font-medium">🏛️ INPI</a>
            <button onClick={() => setShowSettings(true)} className="px-3 py-2 text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 font-medium">⚙️ Paramètres</button>
            <button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl font-medium">Déconnexion</button>
            <button onClick={openNew}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouveau client
            </button>
            <button onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }}
              className="p-2 text-sm text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)]">
        {/* Liste clients */}
        <div className={`flex flex-col ${selected ? 'w-1/2' : 'w-full'} border-r border-slate-100`}>
          {/* Filtres */}
          <div className="p-4 bg-white border-b border-slate-100 flex gap-2 flex-wrap">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50 flex-1 min-w-40" />
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50">
              {types.map(t => <option key={t} value={t}>{t === 'tous' ? 'Tous les types' : t}</option>)}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loading && <p className="text-center text-slate-400 py-10 text-sm">Chargement…</p>}
            {!loading && filtered.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm">{search ? 'Aucun résultat' : 'Aucun client — cliquez sur "Nouveau client"'}</p>
              </div>
            )}

            {filtered.map(client => (
              <div key={client.id} onClick={() => setSelected(selected?.id === client.id ? null : client)}
                className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-sm ${selected?.id === client.id ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-100'}`}>
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center font-bold text-indigo-600 text-sm flex-shrink-0">
                    {client.denomination?.charAt(0) || '?'}
                  </div>

                  {/* Nom + client */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 leading-tight truncate">{client.denomination}</p>
                    <p className="text-xs text-slate-400 truncate">{client.civilite} {client.prenom} {client.nom}</p>
                  </div>

                  {/* Grille statuts */}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <Badge label={client.type_societe} color="purple" />
                    <InpiStatus denomination={client.denomination} />
                    {(() => {
                      const reqs = signRequests.filter(r => r.client_id === client.id);
                      const signed  = reqs.filter(r => r.status === 'signed');
                      const pending = reqs.filter(r => r.status === 'pending' && new Date(r.expires_at) >= new Date());
                      if (signed.length  > 0) return <Badge label="✅ Signé"    color="green" />;
                      if (pending.length > 0) return <Badge label="⏳ En attente" color="amber" />;
                      return null;
                    })()}
                    {(client.statuts_manuels || []).length > 0
                      ? <Badge label={client.statuts_manuels.at(-1).label} color="orange" dot />
                      : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panneau détail */}
        {selected && (
          <div className="w-1/2 bg-white flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between">
              <div>
                <h2 className="font-bold text-slate-800 text-lg">{selected.denomination}</h2>
                <p className="text-sm text-slate-400">{selected.type_societe} · {selected.capital?.toLocaleString('fr-FR')} € · {selected.ville_siege}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => openEdit(selected)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">Modifier</button>
                <button onClick={() => deleteClient(selected.id)} className="px-3 py-1.5 text-sm border border-red-200 rounded-lg hover:bg-red-50 text-red-500">Supprimer</button>
                <button onClick={() => setSelected(null)} className="p-1.5 text-slate-300 hover:text-slate-500">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Statuts en évidence */}
              <div className="grid grid-cols-2 gap-3">
                <StatusCard icon="🏛️" title="INPI" color="orange">
                  <InpiStatus denomination={selected.denomination} />
                </StatusCard>
                <StatusCard icon="📋" title="Suivi" color="indigo">
                  {(selected.statuts_manuels || []).length > 0
                    ? <Badge label={selected.statuts_manuels.at(-1).label} color="indigo" dot />
                    : <span className="text-xs text-slate-400">—</span>}
                </StatusCard>
              </div>

              {/* Infos président */}
              <Section title="Président / Associé unique">
                <Row label="Identité" value={`${selected.civilite} ${selected.prenom} ${selected.nom}`} />
                <Row label="Né(e) le" value={`${selected.date_naissance} à ${selected.ville_naissance} ${selected.cp_naissance}`} />
                <Row label="Nationalité" value={selected.nationalite} />
                <Row label="Adresse" value={selected.adresse} />
                {selected.nom_pere && <Row label="Père" value={selected.nom_pere} />}
                {selected.nom_mere && <Row label="Mère" value={selected.nom_mere} />}
                {selected.email && <Row label="Email" value={<a href={`mailto:${selected.email}`} className="text-blue-600 hover:underline">{selected.email}</a>} />}
                {selected.telephone && <Row label="Téléphone" value={<a href={`tel:${selected.telephone}`} className="text-blue-600 hover:underline">{selected.telephone}</a>} />}
              </Section>

              {/* Société */}
              <Section title="Société">
                <Row label="Siège social" value={selected.siege_social} />
                <Row label="Capital" value={`${selected.capital?.toLocaleString('fr-FR')} €`} />
                <Row label="Nb actions" value={selected.nb_actions} />
                {selected.objet_social && <Row label="Objet" value={selected.objet_social} />}
                {selected.date_signature && <Row label="Signé le" value={`${selected.date_signature} à ${selected.ville_signature}`} />}
              </Section>

              {/* Documents */}
              <Section title="Documents PDF">
                <div className="space-y-1.5 mb-2">
                  {[
                    { type: 'statuts',       label: 'Statuts' },
                    { type: 'pouvoir',       label: 'Pouvoir' },
                    { type: 'souscripteurs', label: 'Liste souscripteurs' },
                    { type: 'dnc',           label: 'DNC' },
                  ].map(({ type, label }) => (
                    <div key={type} className="flex gap-1.5">
                      <a href={`/api/documents/${selected.id}/${type}`} target="_blank"
                        className="flex-1 flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl hover:bg-red-50 hover:border-red-200 text-sm text-slate-700 hover:text-red-700 transition-colors">
                        <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        {label}
                      </a>
                      <a href={`/api/documents/${selected.id}/${type}?paraphe=1`} target="_blank" title="Télécharger avec paraphes"
                        className="flex items-center gap-1 px-2.5 py-2 border border-violet-200 rounded-xl hover:bg-violet-50 text-xs text-violet-600 hover:text-violet-800 transition-colors font-medium whitespace-nowrap">
                        ✍ Paraphé
                      </a>
                    </div>
                  ))}
                </div>
                <a href={`/api/documents/${selected.id}/zip`}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Tout télécharger (ZIP)
                </a>
                <SendSignatureButton client={selected} />
              </Section>

              {/* Documents signés */}
              <SignedDocsSectionPanel clientId={selected.id} signRequests={signRequests} />

              {/* Annonce légale automatique */}
              <AnnonceLegalePanel client={selected} signRequests={signRequests} onClientUpdate={c => setSelected(c)} />

              {/* Suivi manuel */}
              <Section title="Suivi manuel">
                <div className="space-y-2 mb-3">
                  {(selected.statuts_manuels || []).length === 0 && (
                    <p className="text-xs text-slate-400 italic">Aucun statut ajouté</p>
                  )}
                  {[...(selected.statuts_manuels || [])].reverse().map((s, i, arr) => (
                    <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Badge label={s.label} color="orange" dot />
                        <span className="text-xs text-slate-400">{s.date}</span>
                      </div>
                      <button onClick={() => removeStatut(selected, arr.length - 1 - i)}
                        className="text-slate-300 hover:text-red-400 ml-2">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <select value={newStatut} onChange={e => setNewStatut(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">Choisir un statut…</option>
                    {STATUTS_MANUELS.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <button onClick={() => addStatut(selected)} disabled={!newStatut}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl disabled:opacity-40 hover:bg-indigo-700">
                    Ajouter
                  </button>
                </div>
              </Section>

              {selected.notes && (
                <Section title="Notes">
                  <p className="text-sm text-slate-600 whitespace-pre-line">{selected.notes}</p>
                </Section>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal formulaire */}
      {/* Modal Paramètres cabinet */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Paramètres du cabinet</h2>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">

              {/* Cabinet */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cabinet (pouvoir)</h3>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nom du cabinet mandataire</label>
                  <input value={settings.nom_cabinet || ''} onChange={e => setSettings(s => ({ ...s, nom_cabinet: e.target.value }))}
                    placeholder="ex : MC CONSEIL" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Représentant du cabinet</label>
                  <input value={settings.representant_cabinet || ''} onChange={e => setSettings(s => ({ ...s, representant_cabinet: e.target.value }))}
                    placeholder="ex : Monsieur CELNIK" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Adresse du cabinet</label>
                  <input value={settings.adresse_cabinet || ''} onChange={e => setSettings(s => ({ ...s, adresse_cabinet: e.target.value }))}
                    placeholder="ex : 35 Boulevard de la Muette 95140 Garges Les Gonesse" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>

              {/* Messagerie Gmail */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Messagerie (envoi des emails)</h3>
                {settings.gmail_user && (
                  <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                    <span>✅</span><span>Configuré : <strong>{settings.gmail_user}</strong></span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Adresse Gmail</label>
                  <input type="email" value={settings.gmail_user || ''} onChange={e => setSettings(s => ({ ...s, gmail_user: e.target.value }))}
                    placeholder="contact@gmail.com"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Mot de passe d'application Gmail</label>
                  <input type="password" value={settings.gmail_app_password || ''} onChange={e => setSettings(s => ({ ...s, gmail_app_password: e.target.value }))}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  <p className="text-xs text-slate-400 mt-1">
                    Générez un mot de passe d'application sur{' '}
                    <a href="https://myaccount.google.com/apppasswords" target="_blank" className="underline">myaccount.google.com/apppasswords</a>
                    {' '}(pas votre mot de passe habituel).
                  </p>
                </div>
              </div>

              {/* INPI */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">INPI (Guichet unique)</h3>
                {settings.bookmarklet_token ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
                      <p className="font-bold text-sm">🏛️ Extension Chrome — connexion automatique</p>
                      <p>L'extension se connecte à INPI toutes les 90 min sans aucune action de votre part.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Votre token personnel <span className="text-slate-400">(à copier dans l'extension)</span></label>
                      <div className="flex gap-2">
                        <input readOnly value={settings.bookmarklet_token}
                          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono bg-slate-50 text-slate-700" />
                        <button onClick={() => navigator.clipboard.writeText(settings.bookmarklet_token)}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 whitespace-nowrap">
                          Copier
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">URL de l'app : <span className="font-mono">{typeof window !== 'undefined' ? window.location.origin : ''}</span></p>
                  </div>
                ) : <p className="text-xs text-slate-400">Chargement…</p>}
              </div>

            </div>

            {/* Section Modèles d'objet social */}
            <div className="px-6 py-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Modèles d'objet social</p>
              {modeles.length === 0
                ? <p className="text-xs text-slate-400">Aucun modèle sauvegardé.</p>
                : <div className="space-y-2">
                    {modeles.map(m => (
                      <div key={m.id} className="flex items-start justify-between gap-2 p-2 bg-slate-50 rounded-lg">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700">{m.nom}</p>
                          <p className="text-xs text-slate-400 truncate">{m.objet_social?.slice(0, 80)}…</p>
                        </div>
                        <button onClick={async () => { await fetch(`/api/modeles/${m.id}`, {method:'DELETE'}); await loadModeles(); }}
                          className="flex-shrink-0 text-red-400 hover:text-red-600 text-xs">Supprimer</button>
                      </div>
                    ))}
                  </div>
              }
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Annuler</button>
              <button onClick={saveSettings} disabled={savingSettings} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {savingSettings ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">{editClient ? 'Modifier le client' : 'Nouveau client'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
              <FormSection title="Société">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Dénomination *" span={2}><input value={form.denomination} onChange={e => setForm({...form, denomination: e.target.value})} className={inp} /></Field>
                  <Field label="Type de société"><select value={form.type_societe} onChange={e => setForm({...form, type_societe: e.target.value})} className={inp}>{TYPES_SOCIETE.map(t => <option key={t}>{t}</option>)}</select></Field>
                  <Field label="Capital (€)"><input type="number" value={form.capital} onChange={e => { const v = parseInt(e.target.value)||0; setForm({...form, capital: v, nb_actions: v}); }} className={inp} /></Field>
                  <Field label="Siège social *" span={2}><input value={form.siege_social} onChange={e => {
                    const v = e.target.value;
                    // Extraire la ville : derniers mots après le code postal (5 chiffres)
                    const m = v.match(/\d{5}\s+(.+)$/);
                    const ville = m ? m[1].trim() : '';
                    setForm({...form, siege_social: v, ville_siege: ville || form.ville_siege, ville_signature: form.ville_signature || ville});
                  }} placeholder="Adresse complète" className={inp} /></Field>
                  <Field label="Ville du siège"><input value={form.ville_siege} onChange={e => setForm({...form, ville_siege: e.target.value})} className={inp} /></Field>
                  <Field label="Nombre d'actions"><input type="number" value={form.nb_actions} onChange={e => setForm({...form, nb_actions: parseInt(e.target.value)||0})} className={inp} /></Field>
                  <Field label="Objet social" span={2}>
                    {modeles.length > 0 && (
                      <select className={`${inp} mb-2`} value="" onChange={e => { if (e.target.value) { const m = modeles.find(m => m.id === e.target.value); if (m) setForm({...form, objet_social: m.objet_social}); }}}>
                        <option value="">— Charger un modèle —</option>
                        {modeles.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                      </select>
                    )}
                    <textarea value={form.objet_social} onChange={e => setForm({...form, objet_social: e.target.value})} rows={4} className={inp} placeholder="Objet social de la société…" />
                    <button type="button" onClick={() => { setNomModele(''); setShowSaveModele(true); }}
                      className="mt-1 text-xs text-indigo-600 hover:underline">+ Sauvegarder comme modèle</button>
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Président / Associé unique">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Civilité"><select value={form.civilite} onChange={e => setForm({...form, civilite: e.target.value})} className={inp}><option>Monsieur</option><option>Madame</option></select></Field>
                  <Field label="Prénom(s) *"><input value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})} className={inp} /></Field>
                  <Field label="Nom *"><input value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} className={inp} /></Field>
                  <Field label="Nationalité"><input value={form.nationalite} onChange={e => setForm({...form, nationalite: e.target.value})} className={inp} /></Field>
                  <Field label="Date de naissance *"><input value={form.date_naissance} onChange={e => setForm({...form, date_naissance: e.target.value})} placeholder="JJ/MM/AAAA" className={inp} /></Field>
                  <Field label="Ville de naissance *"><input value={form.ville_naissance} onChange={e => setForm({...form, ville_naissance: e.target.value})} className={inp} /></Field>
                  <Field label="Code postal naissance"><input value={form.cp_naissance} onChange={e => setForm({...form, cp_naissance: e.target.value})} placeholder="92100 ou 99" className={inp} /></Field>
                  <Field label="Adresse personnelle *" span={2}><input value={form.adresse} onChange={e => {
                    const v = e.target.value;
                    const m = v.match(/(\d{5})\s+(.+)$/);
                    setForm({...form, adresse: v, adresse_cp: m ? m[1] : form.adresse_cp, adresse_ville: m ? m[2].trim() : form.adresse_ville});
                  }} placeholder="ex: 10 rue Jean Jaurès 95200 Sarcelles" className={inp} /></Field>
                  <Field label="Père (DNC)"><input value={form.nom_pere} onChange={e => setForm({...form, nom_pere: e.target.value})} placeholder="Prénom NOM" className={inp} /></Field>
                  <Field label="Mère (DNC)"><input value={form.nom_mere} onChange={e => setForm({...form, nom_mere: e.target.value})} placeholder="Prénom NOM" className={inp} /></Field>
                  <Field label="Email"><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="client@email.com" className={inp} /></Field>
                  <Field label="Téléphone"><input type="tel" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} placeholder="06 12 34 56 78" className={inp} /></Field>
                </div>
              </FormSection>

              <FormSection title="Signature & Suivi">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date signature"><input value={form.date_signature} onChange={e => {
                    let v = e.target.value.replace(/\D/g, '').slice(0, 8);
                    if (v.length >= 5) v = v.slice(0,2) + '/' + v.slice(2,4) + '/' + v.slice(4);
                    else if (v.length >= 3) v = v.slice(0,2) + '/' + v.slice(2);
                    setForm({...form, date_signature: v});
                  }} placeholder="JJ/MM/AAAA" maxLength={10} className={inp} /></Field>
                  <Field label="Ville signature"><input value={form.ville_signature} onChange={e => setForm({...form, ville_signature: e.target.value})} placeholder={form.ville_siege || ''} className={inp} /></Field>
                  <Field label="Clôture 1er exercice" span={2}>
                    <input value={form.date_premier_exercice} onChange={e => setForm({...form, date_premier_exercice: e.target.value})}
                      placeholder="ex : 31 décembre 2026" className={inp} />
                    <p className="text-xs text-slate-400 mt-1">Article 16 des statuts — doit être postérieur à la date de signature</p>
                  </Field>
                  <Field label="Notes" span={2}><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className={inp} /></Field>
                </div>
              </FormSection>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Annuler</button>
              <button onClick={save} disabled={saving || !form.denomination || !form.nom || !form.prenom}
                className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Enregistrement…' : editClient ? 'Mettre à jour' : 'Créer'}
              </button>
            </div>
          </div>

          {/* Modal sauvegarde modèle */}
          {showSaveModele && (
            <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
                <h3 className="font-bold text-slate-800">Sauvegarder comme modèle</h3>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Nom du modèle</label>
                  <input value={nomModele} onChange={e => setNomModele(e.target.value)} autoFocus
                    placeholder="ex : Vente de voitures" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <p className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3 line-clamp-3">{form.objet_social || '(objet social vide)'}</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowSaveModele(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Annuler</button>
                  <button onClick={async () => {
                    if (!nomModele.trim()) return;
                    await fetch('/api/modeles', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nom: nomModele.trim(), objet_social: form.objet_social }) });
                    await loadModeles();
                    setShowSaveModele(false);
                  }} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Sauvegarder</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers UI ────────────────────────────────────────────────────────────────
const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50';

function StatusCard({ icon, title, color, children }) {
  const bg = { blue: 'bg-blue-50 border-blue-100', orange: 'bg-orange-50 border-orange-100', indigo: 'bg-indigo-50 border-indigo-100' };
  return (
    <div className={`rounded-xl border p-3 ${bg[color] || 'bg-slate-50 border-slate-100'}`}>
      <p className="text-xs text-slate-500 mb-2 flex items-center gap-1.5"><span>{icon}</span>{title}</p>
      {children}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SignedDocsSectionPanel({ clientId, signRequests = [] }) {
  const requests = signRequests.filter(r => r.client_id === clientId && r.status === 'signed');
  if (requests.length === 0) return null;

  const dl = <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>;

  return (
    <Section title="Documents signés">
      <div className="space-y-3">
        {requests.map(req => (
          <div key={req.id} className="border border-emerald-200 rounded-xl p-3 bg-emerald-50 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="text-emerald-600 font-semibold">✅ Signé</span>
                <span>par <strong>{req.signer_name}</strong></span>
                <span>le {new Date(req.signed_at).toLocaleDateString('fr-FR')}</span>
              </div>
              {/* ZIP tous les docs de cette demande */}
              <a href={`/api/sign/${req.id}/zip`} target="_blank"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors">
                {dl} Tout télécharger (ZIP)
              </a>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(req.documents || []).map(d => (
                <a key={d.type} href={`/api/sign/${req.id}/download?doc=${d.type}`} target="_blank"
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-emerald-200 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                  {dl} {d.label || d.type}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AnnonceLegalePanel({ client, signRequests, onClientUpdate }) {
  const isSigned = signRequests.some(r => r.client_id === client.id && r.status === 'signed');
  const generated = useMemo(() => generateAnnonceLegale(client), [client]);

  const [text, setText]       = useState(client.annonce_legale || generated);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [copied, setCopied]   = useState(false);
  const [publiee, setPubliee] = useState(!!client.annonce_legale_publiee);

  // Regénérer si le client change et qu'il n'y a pas encore de texte sauvegardé
  useEffect(() => {
    if (!client.annonce_legale) setText(generateAnnonceLegale(client));
  }, [client]);

  if (!isSigned) return null;

  async function save(published) {
    setSaving(true);
    const body = { annonce_legale: text, annonce_legale_publiee: published ?? publiee };
    const res  = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await res.json();
    if (d.ok && onClientUpdate) onClientUpdate(d.client);
    if (published !== undefined) setPubliee(published);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Section title="📰 Annonce légale">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">Texte généré automatiquement à partir des données du client. Modifiez si besoin.</p>
          {publiee && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
              ✅ Publiée
            </span>
          )}
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={10}
          className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl p-3 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-700 leading-relaxed"
        />

        <div className="flex flex-wrap gap-2">
          <button onClick={copy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            {copied ? '✓ Copié !' : '📋 Copier le texte'}
          </button>
          <button onClick={() => save(undefined)}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors">
            {saved ? '✓ Sauvegardé' : saving ? '…' : '💾 Enregistrer'}
          </button>
          <button onClick={() => setText(generated)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
            ↺ Regénérer
          </button>
          {!publiee ? (
            <button onClick={() => save(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors ml-auto">
              ✅ Marquer comme publiée
            </button>
          ) : (
            <button onClick={() => save(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors ml-auto">
              ↩ Annuler publication
            </button>
          )}
        </div>
      </div>
    </Section>
  );
}

function SendSignatureButton({ client }) {
  const [open, setOpen]       = useState(false);
  const [email, setEmail]     = useState(client.email || '');
  const [name, setName]       = useState(`${client.prenom || ''} ${client.nom || ''}`.trim());
  const [docs, setDocs]       = useState(['statuts']);
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState(null);

  const ALL_DOCS = [
    { type: 'statuts',       label: 'Statuts' },
    { type: 'pouvoir',       label: 'Pouvoir' },
    { type: 'souscripteurs', label: 'Liste souscripteurs' },
    { type: 'dnc',           label: 'DNC' },
  ];

  function toggle(type) {
    setDocs(d => d.includes(type) ? d.filter(x => x !== type) : [...d, type]);
  }

  async function send() {
    if (!email || docs.length === 0) return;
    setSending(true);
    const res = await fetch('/api/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: client.id, documents: docs, email, emailName: name }),
    }).then(r => r.json());
    setSending(false);
    if (res.ok) setResult(res);
    else alert('Erreur : ' + res.error);
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center justify-center gap-2 w-full px-3 py-2.5 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-colors">
      ✉️ Envoyer pour signature
    </button>
  );

  return (
    <div className="mt-2 border border-emerald-200 rounded-xl p-4 bg-emerald-50 space-y-3">
      {result ? (
        <div className="space-y-2 text-center">
          <div className="text-2xl">✅</div>
          <p className="text-sm font-semibold text-emerald-800">Email envoyé à {email}</p>
          <p className="text-xs text-slate-500 break-all">Lien : <a href={result.signUrl} target="_blank" className="underline">{result.signUrl}</a></p>
          <button onClick={() => { setOpen(false); setResult(null); }} className="text-xs text-slate-500 underline">Fermer</button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-800">Envoyer pour signature</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email du signataire *</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="client@email.com"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nom du signataire</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Prénom NOM"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Documents à inclure</label>
            <div className="flex flex-wrap gap-2">
              {ALL_DOCS.map(d => (
                <button key={d.type} onClick={() => toggle(d.type)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${docs.includes(d.type) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={send} disabled={sending || !email || docs.length === 0}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors">
            {sending ? 'Envoi…' : '✉️ Envoyer le lien de signature'}
          </button>
        </>
      )}
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children, span }) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-slate-400 w-28 flex-shrink-0">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

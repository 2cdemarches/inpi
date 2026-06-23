'use client';
import { useState, useEffect, useCallback } from 'react';

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
  const [settings, setSettings]         = useState({ nom_cabinet: '', representant_cabinet: '', adresse_cabinet: '', docusign_integration_key: '', docusign_user_id: '', docusign_account_id: '', docusign_private_key: '', docusign_env: 'production', inpi_login: '', inpi_password: '' });
  const [savingSettings, setSavingSettings] = useState(false);

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

  const loadModeles = useCallback(async () => {
    const res = await fetch('/api/modeles');
    const json = await res.json();
    if (json.ok) setModeles(json.modeles);
  }, []);
  useEffect(() => { loadModeles(); }, [loadModeles]);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => setSettings(d)).catch(() => {});
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

                  {/* Grille statuts — 4 colonnes fixes alignées */}
                  <div className="flex-shrink-0 grid grid-cols-4 gap-x-2 gap-y-0 items-center" style={{gridTemplateColumns:'repeat(4,minmax(5.5rem,auto))'}}>
                    <div className="flex justify-center"><Badge label={client.type_societe} color="purple" /></div>
                    <div className="flex justify-center"><DsStatus envelopeId={client.docusign_envelope_id} /></div>
                    <div className="flex justify-center"><InpiStatus denomination={client.denomination} /></div>
                    <div className="flex justify-center">
                      {(client.statuts_manuels || []).length > 0
                        ? <Badge label={client.statuts_manuels.at(-1).label} color="orange" dot />
                        : <Badge label="—" color="slate" />}
                    </div>
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
              {/* 3 statuts en évidence */}
              <div className="grid grid-cols-3 gap-3">
                <StatusCard icon="✍️" title="Signature" color="blue">
                  <DsStatus envelopeId={selected.docusign_envelope_id} />
                </StatusCard>
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
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {[
                    { type: 'statuts',       label: 'Statuts' },
                    { type: 'pouvoir',       label: 'Pouvoir' },
                    { type: 'souscripteurs', label: 'Liste souscripteurs' },
                    { type: 'dnc',           label: 'DNC' },
                  ].map(({ type, label }) => (
                    <a key={type} href={`/api/documents/${selected.id}/${type}`} target="_blank"
                      className="flex items-center gap-2 px-3 py-2.5 border border-slate-200 rounded-xl hover:bg-red-50 hover:border-red-200 text-sm text-slate-700 hover:text-red-700 transition-colors">
                      <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      {label}
                    </a>
                  ))}
                </div>
                <a href={`/api/documents/${selected.id}/zip`}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Tout télécharger (ZIP)
                </a>
              </Section>

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

              {/* DocuSign */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">DocuSign</h3>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Integration Key (Client ID)</label>
                  <input value={settings.docusign_integration_key || ''} onChange={e => setSettings(s => ({ ...s, docusign_integration_key: e.target.value }))}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">User ID (API Username)</label>
                  <input value={settings.docusign_user_id || ''} onChange={e => setSettings(s => ({ ...s, docusign_user_id: e.target.value }))}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Account ID</label>
                  <input value={settings.docusign_account_id || ''} onChange={e => setSettings(s => ({ ...s, docusign_account_id: e.target.value }))}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Clé privée RSA</label>
                  <textarea value={settings.docusign_private_key || ''} onChange={e => setSettings(s => ({ ...s, docusign_private_key: e.target.value }))}
                    rows={4} placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Environnement</label>
                  <select value={settings.docusign_env || 'production'} onChange={e => setSettings(s => ({ ...s, docusign_env: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="production">Production</option>
                    <option value="demo">Démo / Sandbox</option>
                  </select>
                </div>
              </div>

              {/* INPI */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">INPI (Guichet unique)</h3>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                  <p><strong>À faire une seule fois :</strong> Connectez-vous sur <a href="https://guichet-unique.inpi.fr" target="_blank" className="underline">guichet-unique.inpi.fr</a>, puis :</p>
                  <p>F12 → Application → Cookies → guichet-unique.inpi.fr</p>
                  <p>Copiez <strong>BEARER</strong> et <strong>REFRESH_TOKEN</strong> ci-dessous. Le renouvellement sera ensuite automatique.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">BEARER token</label>
                  <textarea value={settings.inpi_bearer || ''} onChange={e => setSettings(s => ({ ...s, inpi_bearer: e.target.value }))}
                    rows={3} placeholder="eyJ..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">REFRESH_TOKEN</label>
                  <input value={settings.inpi_refresh_token || ''} onChange={e => setSettings(s => ({ ...s, inpi_refresh_token: e.target.value }))}
                    placeholder="..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
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
                  <Field label="ID Enveloppe DocuSign" span={2}><input value={form.docusign_envelope_id} onChange={e => setForm({...form, docusign_envelope_id: e.target.value})} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={inp} /></Field>
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

'use client';
import { useState, useEffect } from 'react';

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

const EMPTY_FORM = {
  civilite: 'Monsieur',
  prenom: '',
  nom: '',
  date_naissance: '',
  ville_naissance: '',
  cp_naissance: '',
  nationalite: 'Française',
  adresse: '',
  nom_pere: '',
  nom_mere: '',
  denomination: '',
  type_societe: 'SASU',
  capital: 100,
  siege_social: '',
  ville_siege: '',
  objet_social: '',
  nb_actions: 100,
  date_signature: '',
  ville_signature: '',
  docusign_envelope_id: '',
  notes: '',
};

function Badge({ label, color }) {
  const colors = {
    green:  'bg-green-50 text-green-700 border border-green-200',
    red:    'bg-red-50 text-red-600 border border-red-200',
    amber:  'bg-amber-50 text-amber-700 border border-amber-200',
    blue:   'bg-blue-50 text-blue-700 border border-blue-200',
    slate:  'bg-slate-50 text-slate-600 border border-slate-200',
    purple: 'bg-purple-50 text-purple-700 border border-purple-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[color] || colors.slate}`}>
      {label}
    </span>
  );
}

export default function ClientsPage() {
  const [clients, setClients]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [selected, setSelected]   = useState(null); // client detail panel
  const [newStatut, setNewStatut] = useState('');

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    setLoading(true);
    const res = await fetch('/api/clients');
    const json = await res.json();
    if (json.ok) setClients(json.clients);
    setLoading(false);
  }

  function openNew() {
    setEditClient(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(client) {
    setEditClient(client);
    setForm({ ...EMPTY_FORM, ...client });
    setShowForm(true);
    setSelected(null);
  }

  async function save() {
    setSaving(true);
    const url = editClient ? `/api/clients/${editClient.id}` : '/api/clients';
    const method = editClient ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (json.ok) {
      setShowForm(false);
      loadClients();
    } else {
      alert('Erreur : ' + json.error);
    }
    setSaving(false);
  }

  async function deleteClient(id) {
    if (!confirm('Supprimer ce client ?')) return;
    await fetch(`/api/clients/${id}`, { method: 'DELETE' });
    loadClients();
    if (selected?.id === id) setSelected(null);
  }

  async function addStatutManuel(client) {
    if (!newStatut) return;
    const statuts = [...(client.statuts_manuels || []), {
      label: newStatut,
      date: new Date().toLocaleDateString('fr-FR'),
    }];
    const res = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statuts_manuels: statuts }),
    });
    const json = await res.json();
    if (json.ok) {
      setSelected(json.client);
      setNewStatut('');
      loadClients();
    }
  }

  async function removeStatut(client, idx) {
    const statuts = (client.statuts_manuels || []).filter((_, i) => i !== idx);
    const res = await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statuts_manuels: statuts }),
    });
    const json = await res.json();
    if (json.ok) {
      setSelected(json.client);
      loadClients();
    }
  }

  const filtered = clients.filter(c =>
    !search ||
    c.denomination?.toLowerCase().includes(search.toLowerCase()) ||
    c.nom?.toLowerCase().includes(search.toLowerCase()) ||
    c.prenom?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Clients</h1>
          <p className="text-xs text-slate-400">{clients.length} client{clients.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" className="text-sm text-slate-500 hover:text-slate-700">← Tableau de bord</a>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouveau client
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Liste */}
        <div className={`flex flex-col ${selected ? 'w-1/2' : 'w-full'} border-r border-slate-100`}>
          <div className="p-4 bg-white border-b border-slate-100">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un client ou une société…"
              className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loading && <p className="text-center text-slate-400 py-10 text-sm">Chargement…</p>}
            {!loading && filtered.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm">{search ? 'Aucun résultat' : 'Aucun client — créez le premier'}</p>
              </div>
            )}

            {filtered.map(client => (
              <div key={client.id}
                onClick={() => setSelected(selected?.id === client.id ? null : client)}
                className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-sm ${selected?.id === client.id ? 'border-indigo-300 shadow-sm ring-1 ring-indigo-200' : 'border-slate-100'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0 text-indigo-600 font-bold text-sm">
                      {client.denomination?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{client.denomination}</p>
                      <p className="text-xs text-slate-400">{client.civilite} {client.prenom} {client.nom}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge label={client.type_societe} color="purple" />
                    {(client.statuts_manuels || []).slice(-1).map((s, i) => (
                      <Badge key={i} label={s.label} color="blue" />
                    ))}
                  </div>
                </div>
                {client.siege_social && (
                  <p className="text-xs text-slate-400 mt-2 ml-13">{client.siege_social}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Panneau détail */}
        {selected && (
          <div className="w-1/2 flex flex-col bg-white overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-800 text-lg">{selected.denomination}</h2>
                <p className="text-sm text-slate-400">{selected.type_societe} · Capital {selected.capital?.toLocaleString('fr-FR')} €</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(selected)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                  Modifier
                </button>
                <button onClick={() => deleteClient(selected.id)}
                  className="px-3 py-1.5 text-sm border border-red-200 rounded-lg hover:bg-red-50 text-red-500">
                  Supprimer
                </button>
                <button onClick={() => setSelected(null)} className="p-1.5 text-slate-300 hover:text-slate-500">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Infos président */}
              <Section title="Président / Associé unique">
                <Row label="Identité" value={`${selected.civilite} ${selected.prenom} ${selected.nom}`} />
                <Row label="Né(e) le" value={`${selected.date_naissance} à ${selected.ville_naissance} (${selected.cp_naissance})`} />
                <Row label="Nationalité" value={selected.nationalite} />
                <Row label="Adresse" value={selected.adresse} />
                {selected.nom_pere && <Row label="Père" value={selected.nom_pere} />}
                {selected.nom_mere && <Row label="Mère" value={selected.nom_mere} />}
              </Section>

              {/* Infos société */}
              <Section title="Société">
                <Row label="Siège social" value={selected.siege_social} />
                <Row label="Capital" value={`${selected.capital?.toLocaleString('fr-FR')} €`} />
                <Row label="Nb actions" value={selected.nb_actions} />
                {selected.objet_social && <Row label="Objet" value={selected.objet_social} />}
                {selected.date_signature && <Row label="Signé le" value={`${selected.date_signature} à ${selected.ville_signature}`} />}
              </Section>

              {/* Documents */}
              <Section title="Documents">
                <div className="grid grid-cols-2 gap-2">
                  {['statuts', 'pouvoir', 'souscripteurs', 'dnc'].map(type => (
                    <a key={type}
                      href={`/api/documents/${selected.id}/${type}`}
                      className="flex items-center gap-2 px-3 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm text-slate-700 transition-colors">
                      <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {{
                        statuts: 'Statuts',
                        pouvoir: 'Pouvoir',
                        souscripteurs: 'Liste souscripteurs',
                        dnc: 'DNC',
                      }[type]}
                    </a>
                  ))}
                </div>
              </Section>

              {/* Suivi / statuts manuels */}
              <Section title="Suivi">
                <div className="space-y-2 mb-3">
                  {(selected.statuts_manuels || []).length === 0 && (
                    <p className="text-xs text-slate-400">Aucun statut — ajoutez-en un ci-dessous</p>
                  )}
                  {(selected.statuts_manuels || []).map((s, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-sm font-medium text-slate-700">{s.label}</span>
                        <span className="text-xs text-slate-400 ml-2">{s.date}</span>
                      </div>
                      <button onClick={() => removeStatut(selected, i)}
                        className="text-slate-300 hover:text-red-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <select value={newStatut} onChange={e => setNewStatut(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">Choisir un statut…</option>
                    {STATUTS_MANUELS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => addStatutManuel(selected)} disabled={!newStatut}
                    className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg disabled:opacity-40 hover:bg-indigo-700">
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
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">{editClient ? 'Modifier le client' : 'Nouveau client'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
              {/* Société */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Société</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Dénomination *" span={2}>
                    <input value={form.denomination} onChange={e => setForm({...form, denomination: e.target.value})} className={input} />
                  </Field>
                  <Field label="Type de société">
                    <select value={form.type_societe} onChange={e => setForm({...form, type_societe: e.target.value})} className={input}>
                      {TYPES_SOCIETE.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Capital (€)">
                    <input type="number" value={form.capital} onChange={e => setForm({...form, capital: parseInt(e.target.value)})} className={input} />
                  </Field>
                  <Field label="Siège social *" span={2}>
                    <input value={form.siege_social} onChange={e => setForm({...form, siege_social: e.target.value})} placeholder="Adresse complète" className={input} />
                  </Field>
                  <Field label="Ville du siège">
                    <input value={form.ville_siege} onChange={e => setForm({...form, ville_siege: e.target.value})} className={input} />
                  </Field>
                  <Field label="Nombre d'actions">
                    <input type="number" value={form.nb_actions} onChange={e => setForm({...form, nb_actions: parseInt(e.target.value)})} className={input} />
                  </Field>
                  <Field label="Objet social" span={2}>
                    <textarea value={form.objet_social} onChange={e => setForm({...form, objet_social: e.target.value})} rows={3} className={input} />
                  </Field>
                </div>
              </div>

              {/* Président */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Président / Associé unique</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Civilité">
                    <select value={form.civilite} onChange={e => setForm({...form, civilite: e.target.value})} className={input}>
                      <option>Monsieur</option>
                      <option>Madame</option>
                    </select>
                  </Field>
                  <Field label="Prénom(s) *">
                    <input value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})} className={input} />
                  </Field>
                  <Field label="Nom *">
                    <input value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} className={input} />
                  </Field>
                  <Field label="Nationalité">
                    <input value={form.nationalite} onChange={e => setForm({...form, nationalite: e.target.value})} className={input} />
                  </Field>
                  <Field label="Date de naissance *">
                    <input value={form.date_naissance} onChange={e => setForm({...form, date_naissance: e.target.value})} placeholder="JJ/MM/AAAA" className={input} />
                  </Field>
                  <Field label="Ville de naissance *">
                    <input value={form.ville_naissance} onChange={e => setForm({...form, ville_naissance: e.target.value})} className={input} />
                  </Field>
                  <Field label="Code postal naissance">
                    <input value={form.cp_naissance} onChange={e => setForm({...form, cp_naissance: e.target.value})} placeholder="92100 ou 99 (étranger)" className={input} />
                  </Field>
                  <Field label="Adresse personnelle *" span={2}>
                    <input value={form.adresse} onChange={e => setForm({...form, adresse: e.target.value})} placeholder="Adresse complète" className={input} />
                  </Field>
                  <Field label="Nom du père (DNC)">
                    <input value={form.nom_pere} onChange={e => setForm({...form, nom_pere: e.target.value})} placeholder="Prénom NOM" className={input} />
                  </Field>
                  <Field label="Nom de la mère (DNC)">
                    <input value={form.nom_mere} onChange={e => setForm({...form, nom_mere: e.target.value})} placeholder="Prénom NOM ép. ..." className={input} />
                  </Field>
                </div>
              </div>

              {/* Signature */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Signature</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date de signature">
                    <input value={form.date_signature} onChange={e => setForm({...form, date_signature: e.target.value})} placeholder="JJ/MM/AAAA" className={input} />
                  </Field>
                  <Field label="Ville de signature">
                    <input value={form.ville_signature} onChange={e => setForm({...form, ville_signature: e.target.value})} className={input} />
                  </Field>
                </div>
              </div>

              {/* Divers */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Divers</h3>
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Notes">
                    <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className={input} />
                  </Field>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                Annuler
              </button>
              <button onClick={save} disabled={saving || !form.denomination || !form.nom || !form.prenom}
                className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Enregistrement…' : editClient ? 'Mettre à jour' : 'Créer le client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const input = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50';

function Field({ label, children, span }) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
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

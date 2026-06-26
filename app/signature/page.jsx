'use client';
import { useState, useEffect } from 'react';

const STATUS_MAP = {
  pending: { label: 'En attente',  color: 'amber' },
  signed:  { label: 'Signé ✓',    color: 'green' },
  expired: { label: 'Expiré',     color: 'red'   },
};

const COLOR = {
  green: 'bg-green-50 text-green-700 border-green-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red:   'bg-red-50 text-red-600 border-red-200',
  slate: 'bg-slate-50 text-slate-500 border-slate-200',
};
const DOT = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500', slate: 'bg-slate-400' };

function Badge({ status }) {
  const s = STATUS_MAP[status] || { label: status, color: 'slate' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${COLOR[s.color]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOT[s.color]}`} />
      {s.label}
    </span>
  );
}

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtFull(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const DOC_LABELS = {
  statuts:       'Statuts',
  pouvoir:       'Pouvoir',
  souscripteurs: 'Liste souscripteurs',
  dnc:           'DNC',
};

export default function SignaturePage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch('/api/sign')
      .then(r => {
        if (r.status === 401) { window.location.href = '/login'; return null; }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        if (d.error) { setLoading(false); return; }
        setRequests(d.requests || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function copyLink(token) {
    await navigator.clipboard.writeText(`${window.location.origin}/sign/${token}`);
  }

  async function deleteRequest(id) {
    if (!confirm('Supprimer cette demande ?')) return;
    await fetch(`/api/sign?id=${id}`, { method: 'DELETE' });
    setRequests(r => r.filter(x => x.id !== id));
  }

  async function downloadSigned(requestId, docType) {
    window.open(`/api/sign/${requestId}/download?doc=${docType}`, '_blank');
  }

  const filtered = requests.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.clients?.denomination?.toLowerCase().includes(q) || r.signer_name?.toLowerCase().includes(q);
    const status = new Date(r.expires_at) < new Date() && r.status !== 'signed' ? 'expired' : r.status;
    const matchFilter = filter === 'all' || status === filter;
    return matchSearch && matchFilter;
  });

  const counts = {
    all:     requests.length,
    pending: requests.filter(r => r.status === 'pending' && new Date(r.expires_at) >= new Date()).length,
    signed:  requests.filter(r => r.status === 'signed').length,
    expired: requests.filter(r => r.status !== 'signed' && new Date(r.expires_at) < new Date()).length,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-slate-400 hover:text-slate-600 text-sm">← Retour</a>
            <span className="text-slate-300">|</span>
            <h1 className="font-bold text-slate-800 text-lg">✍️ Suivi des signatures</h1>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Compteurs */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { key: 'all',     label: 'Total',      color: 'slate' },
            { key: 'pending', label: 'En attente',  color: 'amber' },
            { key: 'signed',  label: 'Signés',      color: 'green' },
            { key: 'expired', label: 'Expirés',     color: 'red'   },
          ].map(({ key, label, color }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`p-4 rounded-2xl border text-left transition-all ${filter === key ? 'ring-2 ring-offset-1 ring-indigo-400' : ''} ${COLOR[color]}`}>
              <div className="text-2xl font-bold">{counts[key]}</div>
              <div className="text-xs mt-0.5 opacity-80">{label}</div>
            </button>
          ))}
        </div>

        {/* Recherche */}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par société ou signataire…"
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />

        {/* Liste */}
        {loading ? (
          <div className="text-center text-slate-400 py-16">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-slate-400 py-16">Aucune demande de signature</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(req => {
              const isExpired = req.status !== 'signed' && new Date(req.expires_at) < new Date();
              const status    = isExpired ? 'expired' : req.status;
              const open      = expanded === req.id;

              return (
                <div key={req.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  {/* Ligne principale */}
                  <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setExpanded(open ? null : req.id)}>

                    {/* Initiales */}
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                      {req.clients?.denomination?.charAt(0) || '?'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{req.clients?.denomination || 'Client inconnu'}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {req.signer_name || 'Signataire non défini'} · Envoyé le {fmt(req.created_at)}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Documents */}
                      <div className="hidden sm:flex gap-1 flex-wrap justify-end">
                        {(req.documents || []).map(d => (
                          <span key={d.type} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-xs">
                            {DOC_LABELS[d.type] || d.type}
                          </span>
                        ))}
                      </div>

                      <Badge status={status} />

                      {status === 'signed' && (
                        <span className="text-xs text-slate-400">{fmt(req.signed_at)}</span>
                      )}
                      {status === 'pending' && (
                        <span className="text-xs text-slate-400">Expire {fmt(req.expires_at)}</span>
                      )}

                      <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Détail expandable */}
                  {open && (
                    <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 space-y-4">

                      {/* Audit trail */}
                      {(req.audit_trail || []).length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Historique</div>
                          <div className="space-y-1">
                            {req.audit_trail.map((e, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                                <span>
                                  {e.event === 'created' ? `Demande créée par ${e.by}` :
                                   e.event === 'signed'  ? `Signé par ${e.name} (IP: ${e.ip})` : e.event}
                                </span>
                                <span className="ml-auto text-slate-400 whitespace-nowrap">{fmtFull(e.at)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        {status === 'pending' && (
                          <button onClick={() => copyLink(req.token)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                            🔗 Copier le lien
                          </button>
                        )}

                        {status === 'signed' && (req.documents || []).map(d => (
                          <button key={d.type} onClick={() => downloadSigned(req.id, d.type)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                            ⬇ {DOC_LABELS[d.type] || d.type} signé
                          </button>
                        ))}

                        <button onClick={() => deleteRequest(req.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors ml-auto">
                          Supprimer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

const DOC_LABELS = {
  statuts:       'Statuts',
  pouvoir:       'Pouvoir',
  souscripteurs: 'Liste des souscripteurs',
  dnc:           'Déclaration de non-condamnation',
};

export default function SignPage() {
  const { token } = useParams();
  const [request, setRequest] = useState(null);
  const [error, setError]     = useState(null);
  const [step, setStep]       = useState('loading'); // loading | review | sign | done
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [signerName, setSignerName]   = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [drawing, setDrawing]         = useState(false);
  const [hasSig, setHasSig]           = useState(false);

  const canvasRef = useRef(null);
  const lastPos   = useRef(null);

  useEffect(() => {
    fetch(`/api/sign/${token}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setError(d.error); setStep('error'); return; }
        setRequest(d);
        setSignerName(d.signerName || '');
        setSelectedDoc(d.documents?.[0]?.type || null);
        setStep('review');
      })
      .catch(() => { setError('Erreur réseau'); setStep('error'); });
  }, [token]);

  // Canvas drawing
  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches?.[0] || e;
    return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) };
  }

  function startDraw(e) {
    e.preventDefault();
    setDrawing(true);
    lastPos.current = getPos(e, canvasRef.current);
  }

  function draw(e) {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const pos    = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasSig(true);
  }

  function stopDraw(e) { e.preventDefault(); setDrawing(false); lastPos.current = null; }

  function clearSig() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  }

  async function submit() {
    if (!hasSig) { alert('Veuillez signer dans le cadre'); return; }
    if (!signerName.trim()) { alert('Veuillez saisir votre nom complet'); return; }
    setSubmitting(true);
    const sig = canvasRef.current.toDataURL('image/png');
    const res = await fetch(`/api/sign/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signatureDataUrl: sig, signerName: signerName.trim() }),
    }).then(r => r.json());
    setSubmitting(false);
    if (res.ok) setStep('done');
    else alert('Erreur : ' + res.error);
  }

  if (step === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-500">Chargement…</div>
    </div>
  );

  if (step === 'error') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md text-center">
        <div className="text-5xl mb-4">{error === 'expired' ? '⏰' : error === 'already_signed' ? '✅' : '❌'}</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">
          {error === 'expired' ? 'Lien expiré' : error === 'already_signed' ? 'Déjà signé' : 'Lien invalide'}
        </h1>
        <p className="text-slate-500 text-sm">
          {error === 'expired' ? 'Ce lien de signature a expiré. Contactez votre cabinet.' :
           error === 'already_signed' ? 'Ces documents ont déjà été signés.' :
           'Ce lien est invalide ou a expiré. Contactez votre cabinet.'}
        </p>
      </div>
    </div>
  );

  if (step === 'done') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Documents signés !</h1>
        <p className="text-slate-500">Votre cabinet a été notifié. Vous pouvez fermer cette page.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <span className="text-2xl">🏛️</span>
          <div>
            <div className="font-bold text-slate-800">2C Expertise — Signature électronique</div>
            <div className="text-sm text-slate-500">{request?.denomination}</div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Étapes */}
        <div className="flex items-center gap-2 text-sm">
          <span className={`font-semibold ${step === 'review' ? 'text-blue-700' : 'text-slate-400'}`}>1. Relire les documents</span>
          <span className="text-slate-300">→</span>
          <span className={`font-semibold ${step === 'sign' ? 'text-blue-700' : 'text-slate-400'}`}>2. Signer</span>
        </div>

        {step === 'review' && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="font-bold text-slate-800 text-lg mb-1">Documents à signer</h2>
              <p className="text-sm text-slate-500 mb-4">Lisez attentivement chaque document avant de signer.</p>

              {/* Onglets documents */}
              {request?.documents?.length > 1 && (
                <div className="flex gap-2 mb-4 flex-wrap">
                  {request.documents.map(d => (
                    <button key={d.type} onClick={() => setSelectedDoc(d.type)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${selectedDoc === d.type ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {d.label || DOC_LABELS[d.type] || d.type}
                    </button>
                  ))}
                </div>
              )}

              {/* Viewer PDF */}
              {selectedDoc && (
                <div className="border border-slate-200 rounded-xl overflow-hidden" style={{ height: 600 }}>
                  <iframe
                    src={`/api/sign/${token}/pdf?doc=${selectedDoc}`}
                    className="w-full h-full"
                    title={DOC_LABELS[selectedDoc] || selectedDoc}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={() => setStep('sign')}
                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xl transition-colors">
                J'ai lu les documents — Passer à la signature →
              </button>
            </div>
          </>
        )}

        {step === 'sign' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
            <div>
              <h2 className="font-bold text-slate-800 text-lg">Votre signature</h2>
              <p className="text-sm text-slate-500">En signant vous confirmez avoir lu et accepté les documents.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom complet <span className="text-red-500">*</span></label>
              <input value={signerName} onChange={e => setSignerName(e.target.value)}
                placeholder="Prénom NOM"
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-slate-700">Signature <span className="text-red-500">*</span></label>
                <button onClick={clearSig} className="text-xs text-slate-400 hover:text-slate-600 underline">Effacer</button>
              </div>
              <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 select-none touch-none" style={{ cursor: 'crosshair' }}>
                <canvas ref={canvasRef} width={700} height={180} className="w-full rounded-xl"
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                  onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
              </div>
              <p className="text-xs text-slate-400 mt-1">Signez avec votre souris ou votre doigt</p>
            </div>

            <div className="p-4 bg-blue-50 rounded-xl text-xs text-blue-800 space-y-1">
              <p><strong>Valeur légale</strong> — Cette signature électronique est horodatée et votre adresse IP est enregistrée.</p>
              <p>Documents signés : {request?.documents?.map(d => d.label || DOC_LABELS[d.type]).join(', ')}</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('review')} className="px-4 py-2.5 border border-slate-300 text-slate-600 rounded-xl hover:bg-slate-50 font-medium">
                ← Relire
              </button>
              <button onClick={submit} disabled={submitting || !hasSig || !signerName.trim()}
                className="flex-1 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold rounded-xl transition-colors">
                {submitting ? 'Envoi…' : '✍️ Signer et valider'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

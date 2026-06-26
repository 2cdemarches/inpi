// Content script — annonces-legales.fr
// Injecte un panneau flottant pour remplir le formulaire à partir des données client

(async () => {
  if (document.getElementById('__2c_jal_panel')) return;

  const { app_url, user_token } = await chrome.storage.sync.get(['app_url', 'user_token']);
  if (!app_url || !user_token) return;

  // ── Panel flottant ──────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = '__2c_jal_panel';
  panel.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 99999;
    width: 340px; background: white; border: 1.5px solid #6366f1;
    border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px; color: #1e293b; overflow: hidden;
  `;

  panel.innerHTML = `
    <div id="__2c_header" style="background:#6366f1;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;cursor:move">
      <span style="color:white;font-weight:700;font-size:13px">⚡ 2C Expertise — Remplissage auto</span>
      <button id="__2c_close" style="background:none;border:none;color:white;font-size:18px;cursor:pointer;padding:0;line-height:1">×</button>
    </div>
    <div style="padding:14px;space-y:10px">
      <p style="margin:0 0 10px;color:#64748b;font-size:12px">Sélectionnez un client pour remplir le formulaire automatiquement.</p>
      <select id="__2c_client_select" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-size:13px;background:white;color:#1e293b;margin-bottom:10px">
        <option value="">Chargement…</option>
      </select>
      <div id="__2c_preview" style="display:none;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:10px;font-size:11px;line-height:1.6;color:#334155"></div>
      <button id="__2c_fill_btn" disabled style="width:100%;background:#6366f1;color:white;border:none;border-radius:8px;padding:9px;font-size:13px;font-weight:600;cursor:pointer;opacity:0.5;transition:opacity 0.2s">
        ✨ Remplir le formulaire
      </button>
      <div id="__2c_msg" style="margin-top:8px;font-size:11px;text-align:center;color:#64748b"></div>
    </div>
  `;

  document.body.appendChild(panel);

  // ── Fermer ──────────────────────────────────────────────────────────────────
  document.getElementById('__2c_close').onclick = () => panel.remove();

  // ── Drag ────────────────────────────────────────────────────────────────────
  let dragging = false, ox = 0, oy = 0;
  document.getElementById('__2c_header').onmousedown = e => {
    dragging = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop;
  };
  document.onmousemove = e => {
    if (!dragging) return;
    panel.style.left = (e.clientX - ox) + 'px';
    panel.style.top  = (e.clientY - oy) + 'px';
    panel.style.right = 'auto';
  };
  document.onmouseup = () => { dragging = false; };

  // ── Charger les clients ─────────────────────────────────────────────────────
  let clients = [];
  try {
    const res  = await fetch(`${app_url}/api/clients/ext?token=${user_token}`);
    const data = await res.json();
    clients = data.clients || [];
  } catch {
    document.getElementById('__2c_msg').textContent = '❌ Impossible de charger les clients';
    return;
  }

  const sel = document.getElementById('__2c_client_select');
  sel.innerHTML = '<option value="">— Choisir un client —</option>' +
    clients.map(c => `<option value="${c.id}">${c.denomination} (${c.type_societe})</option>`).join('');

  // ── Aperçu ─────────────────────────────────────────────────────────────────
  sel.onchange = () => {
    const client = clients.find(c => c.id === sel.value);
    const preview = document.getElementById('__2c_preview');
    const btn     = document.getElementById('__2c_fill_btn');

    if (!client) {
      preview.style.display = 'none';
      btn.disabled = true; btn.style.opacity = '0.5'; return;
    }

    preview.style.display = 'block';
    preview.innerHTML = [
      `<b>${client.denomination}</b> — ${client.type_societe}`,
      `Capital : ${Number(client.capital || 0).toLocaleString('fr-FR')} €`,
      `Siège : ${client.siege_social || '—'}`,
      `${client.civilite || ''} ${client.prenom || ''} ${client.nom || ''}`.trim(),
    ].filter(Boolean).join('<br>');

    btn.disabled = false; btn.style.opacity = '1';
  };

  // ── Remplissage ─────────────────────────────────────────────────────────────
  document.getElementById('__2c_fill_btn').onclick = async () => {
    const client = clients.find(c => c.id === sel.value);
    if (!client) return;

    const msg = document.getElementById('__2c_msg');
    msg.textContent = '⟳ Remplissage en cours…';

    let filled = 0;

    // Détection intelligente par label + placeholder + name + id
    function findField(...keywords) {
      const kw = keywords.map(k => k.toLowerCase());

      // Chercher via les <label>
      for (const label of document.querySelectorAll('label')) {
        const txt = label.textContent.toLowerCase();
        if (kw.some(k => txt.includes(k))) {
          const forId = label.getAttribute('for');
          if (forId) {
            const el = document.getElementById(forId);
            if (el) return el;
          }
          // Label enveloppant
          const el = label.querySelector('input, textarea, select');
          if (el) return el;
        }
      }

      // Chercher via name / id / placeholder
      for (const el of document.querySelectorAll('input, textarea, select')) {
        const name = (el.name || '').toLowerCase();
        const id   = (el.id   || '').toLowerCase();
        const ph   = (el.placeholder || '').toLowerCase();
        if (kw.some(k => name.includes(k) || id.includes(k) || ph.includes(k))) return el;
      }
      return null;
    }

    function fill(el, value) {
      if (!el || !value) return;
      // Gestion React/Vue : déclencher les événements natifs
      const nativeSetter = Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype, 'value');
      if (nativeSetter) nativeSetter.set.call(el, value);
      el.value = value;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur',   { bubbles: true }));
      filled++;
    }

    function fillTextarea(el, value) {
      if (!el || !value) return;
      el.value = value;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      filled++;
    }

    function fillSelect(el, value) {
      if (!el || !value) return;
      const v = value.toLowerCase();
      const opt = Array.from(el.options).find(o =>
        o.text.toLowerCase().includes(v) || o.value.toLowerCase().includes(v)
      );
      if (opt) { fill(el, opt.value); }
    }

    // ── Société ──
    const typeField = findField('type', 'forme', 'juridique');
    if (typeField?.tagName === 'SELECT') fillSelect(typeField, client.type_societe);

    fill(findField('dénomination', 'denomination', 'raison sociale', 'nom société'), client.denomination);
    fill(findField('capital'), String(client.capital || ''));

    // Siège
    const siegeRaw = client.siege_social || '';
    const matchCP  = siegeRaw.match(/(\d{5})\s+(.+)$/);
    const cpVille  = matchCP ? matchCP[1] : '';
    const villeRaw = client.ville_siege || (matchCP ? matchCP[2] : '');
    const addrLine = siegeRaw.replace(/\s*\d{5}\s+.+$/, '').trim();

    fill(findField('adresse', 'siège', 'siege', 'rue', 'voie'), addrLine || siegeRaw);
    fill(findField('code postal', 'cp', 'codepostal'), cpVille);
    fill(findField('ville', 'commune'), villeRaw);

    // Objet social
    const objetEl = findField('objet', 'activité', 'activite');
    if (objetEl?.tagName === 'TEXTAREA') fillTextarea(objetEl, client.objet_social);
    else fill(objetEl, client.objet_social);

    // Dirigeant
    const civiliteMap = { 'Monsieur': 'M', 'Madame': 'Mme' };
    const civFr  = civiliteMap[client.civilite] || client.civilite || '';
    const civEl  = findField('civilité', 'civilite', 'titre', 'gender');
    if (civEl?.tagName === 'SELECT') fillSelect(civEl, civFr);

    fill(findField('prénom', 'prenom', 'first name'), client.prenom);
    fill(findField('nom', 'lastname', 'last name'), client.nom);
    fill(findField('naissance', 'né le', 'date naissance'), client.date_naissance);
    fill(findField('ville naissance', 'commune naissance', 'lieu naissance'), client.ville_naissance);
    fill(findField('nationalité', 'nationalite'), client.nationalite);
    fill(findField('domicile', 'adresse personnelle', 'adresse dirigeant'), client.adresse);
    fill(findField('email', 'mail', 'courriel'), client.email);
    fill(findField('téléphone', 'telephone', 'phone'), client.telephone);

    msg.textContent = filled > 0
      ? `✅ ${filled} champ${filled > 1 ? 's' : ''} rempli${filled > 1 ? 's' : ''} !`
      : '⚠️ Aucun champ détecté. Essayez sur la bonne étape du formulaire.';

    setTimeout(() => { msg.textContent = ''; }, 4000);
  };
})();

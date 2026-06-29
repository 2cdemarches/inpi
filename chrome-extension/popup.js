async function load() {
  const { app_url, user_token, inpi_login, inpi_password } = await chrome.storage.sync.get([
    'app_url', 'user_token', 'inpi_login', 'inpi_password'
  ]);
  if (app_url)       document.getElementById('app_url').value       = app_url;
  if (user_token)    document.getElementById('user_token').value    = user_token;
  if (inpi_login)    document.getElementById('inpi_login').value    = inpi_login;
  if (inpi_password) document.getElementById('inpi_password').value = inpi_password;

  const { last_status } = await chrome.storage.local.get('last_status');
  renderStatus(last_status);
}

function renderStatus(s) {
  const box = document.getElementById('status');
  if (!s) {
    box.className = 'status-box status-none';
    box.innerHTML = '<div class="status-label">Non configuré</div><div>Renseignez vos paramètres ci-dessous.</div>';
    return;
  }
  if (s.ok) {
    const min = s.expiresInMin;
    const expTxt = min !== undefined
      ? (min <= 10 ? `<span class="badge-ko">Expire dans ${min} min</span>` : `<span class="badge-ok">Expire dans ~${min} min</span>`)
      : '';
    box.className = 'status-box status-ok';
    box.innerHTML = `<div class="status-label">✅ Connecté ${expTxt}</div><div class="status-time">Sync : ${fmt(s.syncedAt || s.time)}</div>`;
  } else {
    box.className = 'status-box status-err';
    box.innerHTML = `<div class="status-label">⚠️ ${s.error || 'Erreur'}</div><div class="status-time">${fmt(s.time)}</div>`;
  }
}

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

document.getElementById('btn-save').addEventListener('click', async () => {
  const vals = {
    app_url:       document.getElementById('app_url').value.trim().replace(/\/$/, ''),
    user_token:    document.getElementById('user_token').value.trim(),
    inpi_login:    document.getElementById('inpi_login').value.trim(),
    inpi_password: document.getElementById('inpi_password').value,
  };
  await chrome.storage.sync.set(vals);
  const btn = document.getElementById('btn-save');
  btn.textContent = '✓ Enregistré';
  setTimeout(() => { btn.textContent = '💾 Enregistrer'; }, 1500);
  chrome.runtime.sendMessage({ action: 'sync' });
});

document.getElementById('btn-sync').addEventListener('click', async () => {
  const btn = document.getElementById('btn-sync');
  btn.textContent = '⟳ Synchronisation…';
  btn.disabled = true;
  chrome.runtime.sendMessage({ action: 'sync' }, async () => {
    await new Promise(r => setTimeout(r, 1000));
    const { last_status } = await chrome.storage.local.get('last_status');
    renderStatus(last_status);
    btn.textContent = '⟳ Synchroniser maintenant';
    btn.disabled = false;
  });
});

document.getElementById('btn-login').addEventListener('click', async () => {
  const btn = document.getElementById('btn-login');
  btn.textContent = '⟳ Connexion en cours…';
  btn.disabled = true;
  chrome.runtime.sendMessage({ action: 'test-login' }, async () => {
    await new Promise(r => setTimeout(r, 8000));
    const { last_status } = await chrome.storage.local.get('last_status');
    renderStatus(last_status);
    btn.textContent = '🔑 Reconnecter à l\'INPI maintenant';
    btn.disabled = false;
  });
});

load();

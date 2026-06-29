async function load() {
  const { app_url, user_token } = await chrome.storage.sync.get(['app_url', 'user_token']);
  if (app_url)    document.getElementById('app_url').value    = app_url;
  if (user_token) document.getElementById('user_token').value = user_token;

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
    box.className = 'status-box status-ok';
    box.innerHTML = `<div class="status-label">✅ Connecté</div><div>Token valide encore ~${s.expiresInMin ?? '?'} min</div><div class="status-time">Sync : ${fmt(s.time)}</div>`;
  } else {
    box.className = 'status-box status-err';
    box.innerHTML = `<div class="status-label">❌ Erreur</div><div>${s.error || 'Inconnue'}</div><div class="status-time">${fmt(s.time)}</div>`;
  }
}

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

document.getElementById('btn-save').addEventListener('click', async () => {
  const app_url    = document.getElementById('app_url').value.trim().replace(/\/$/, '');
  const user_token = document.getElementById('user_token').value.trim();
  await chrome.storage.sync.set({ app_url, user_token });
  chrome.runtime.sendMessage({ action: 'sync' });
  document.getElementById('btn-save').textContent = 'Enregistré ✓';
  setTimeout(() => { document.getElementById('btn-save').textContent = 'Enregistrer'; }, 1500);
});

document.getElementById('btn-sync').addEventListener('click', async () => {
  const btn = document.getElementById('btn-sync');
  btn.textContent = '⟳ Synchronisation…';
  btn.disabled = true;
  chrome.runtime.sendMessage({ action: 'sync' }, async () => {
    await new Promise(r => setTimeout(r, 800));
    const { last_status } = await chrome.storage.local.get('last_status');
    renderStatus(last_status);
    btn.textContent = '⟳ Synchroniser maintenant';
    btn.disabled = false;
  });
});

document.getElementById('btn-inpi').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'open-inpi' });
  window.close();
});

load();

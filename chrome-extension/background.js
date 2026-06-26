// ── Constantes ────────────────────────────────────────────────────────────────
const INPI_URL    = 'https://guichet-unique.inpi.fr';
const COOKIE_NAME = 'BEARER';
const ALARM_NAME  = 'sync-inpi';
const INTERVAL_MIN = 90; // toutes les 90 minutes

// ── Initialisation : créer l'alarme au démarrage ──────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: INTERVAL_MIN });
  syncToken(); // sync immédiat à l'installation
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: INTERVAL_MIN });
  syncToken();
});

// ── Déclenchement de l'alarme ─────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) syncToken();
});

// ── Sync principale ───────────────────────────────────────────────────────────
async function syncToken() {
  const { app_url, user_token } = await chrome.storage.sync.get(['app_url', 'user_token']);

  if (!app_url || !user_token) {
    setBadge('?', '#94a3b8');
    return;
  }

  // Lire le cookie BEARER sur guichet-unique.inpi.fr
  const cookie = await chrome.cookies.get({ url: INPI_URL, name: COOKIE_NAME });

  if (!cookie?.value) {
    setBadge('!', '#ef4444');
    await saveStatus({ ok: false, error: 'Cookie BEARER non trouvé — connectez-vous sur guichet-unique.inpi.fr' });
    return;
  }

  // Envoyer à l'app
  try {
    const res = await fetch(`${app_url}/api/inpi-token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bearer: cookie.value, user_token }),
    });
    const json = await res.json();

    if (json.ok) {
      setBadge('✓', '#22c55e');
      await saveStatus({ ok: true, expiresInMin: json.expiresInMin, syncedAt: new Date().toISOString() });
    } else {
      setBadge('!', '#f59e0b');
      await saveStatus({ ok: false, error: json.error });
    }
  } catch (e) {
    setBadge('!', '#ef4444');
    await saveStatus({ ok: false, error: e.message });
  }
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

async function saveStatus(status) {
  await chrome.storage.local.set({ last_status: { ...status, time: new Date().toISOString() } });
}

// ── Message depuis le popup (sync manuelle) ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'sync') {
    syncToken().then(() => sendResponse({ ok: true }));
    return true;
  }
});

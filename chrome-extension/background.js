// ── Constantes ────────────────────────────────────────────────────────────────
const INPI_URL       = 'https://guichet-unique.inpi.fr';
const INPI_LOGIN_URL = 'https://guichet-unique.inpi.fr/guichet/login';
const COOKIE_NAME    = 'BEARER';
const ALARM_NAME     = 'sync-inpi';
const INTERVAL_MIN   = 20; // vérifier toutes les 20 min pour détecter l'expiration tôt

// ── Initialisation ────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: INTERVAL_MIN });
  syncToken();
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
let lastNotifTime = 0; // éviter de spammer les notifications

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
    await saveStatus({ ok: false, error: 'Session INPI expirée — reconnexion requise' });
    notifyReconnexion();
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

      // Avertir 15 min avant l'expiration
      if (json.expiresInMin !== undefined && json.expiresInMin <= 15) {
        notifyExpireBientot(json.expiresInMin);
      }
    } else {
      setBadge('!', '#f59e0b');
      await saveStatus({ ok: false, error: json.error });
      if (json.error?.includes('expiré') || json.error?.includes('invalide')) {
        notifyReconnexion();
      }
    }
  } catch (e) {
    setBadge('!', '#ef4444');
    await saveStatus({ ok: false, error: e.message });
  }
}

// ── Notification : session expirée ───────────────────────────────────────────
function notifyReconnexion() {
  const now = Date.now();
  if (now - lastNotifTime < 30 * 60 * 1000) return; // max 1 notif / 30 min
  lastNotifTime = now;

  chrome.notifications.create('inpi-expired', {
    type:     'basic',
    iconUrl:  'icons/icon48.png',
    title:    '⚠️ Session INPI expirée',
    message:  'Votre session INPI a expiré. Cliquez pour vous reconnecter.',
    buttons:  [{ title: 'Se reconnecter →' }],
    priority: 2,
  });
}

// ── Notification : expire bientôt ────────────────────────────────────────────
function notifyExpireBientot(min) {
  const now = Date.now();
  if (now - lastNotifTime < 15 * 60 * 1000) return;
  lastNotifTime = now;

  chrome.notifications.create('inpi-soon', {
    type:    'basic',
    iconUrl: 'icons/icon48.png',
    title:   '⏰ Session INPI bientôt expirée',
    message: `Votre session INPI expire dans ${min} minute${min > 1 ? 's' : ''}. Cliquez pour la renouveler.`,
    buttons: [{ title: 'Renouveler →' }],
    priority: 1,
  });
}

// ── Clic sur notification → ouvrir INPI ──────────────────────────────────────
chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
  if ((notifId === 'inpi-expired' || notifId === 'inpi-soon') && btnIdx === 0) {
    chrome.tabs.create({ url: INPI_LOGIN_URL });
    chrome.notifications.clear(notifId);
  }
});

chrome.notifications.onClicked.addListener(notifId => {
  if (notifId === 'inpi-expired' || notifId === 'inpi-soon') {
    chrome.tabs.create({ url: INPI_LOGIN_URL });
    chrome.notifications.clear(notifId);
  }
});

// ── Détection auto reconnexion : quand l'utilisateur visite INPI ──────────────
// Si le cookie réapparaît après une déconnexion, re-syncer immédiatement
chrome.cookies.onChanged.addListener(change => {
  if (
    change.cookie.domain?.includes('guichet-unique.inpi.fr') &&
    change.cookie.name === COOKIE_NAME &&
    !change.removed
  ) {
    // Nouveau token détecté → syncer sans attendre l'alarme
    setTimeout(syncToken, 2000);
  }
});

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

async function saveStatus(status) {
  await chrome.storage.local.set({ last_status: { ...status, time: new Date().toISOString() } });
}

// ── Messages depuis le popup ──────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'sync') {
    syncToken().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.action === 'open-inpi') {
    chrome.tabs.create({ url: INPI_LOGIN_URL });
    sendResponse({ ok: true });
    return true;
  }
});

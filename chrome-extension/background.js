// ── Constantes ────────────────────────────────────────────────────────────────
const INPI_URL       = 'https://guichet-unique.inpi.fr';
const INPI_LOGIN_URL = 'https://guichet-unique.inpi.fr/guichet/login';
const COOKIE_NAME    = 'BEARER';
const ALARM_NAME     = 'sync-inpi';
const INTERVAL_MIN   = 20;

// ── Initialisation ────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: INTERVAL_MIN });
  syncToken();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: INTERVAL_MIN });
  syncToken();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) syncToken();
});

// ── Sync principale ───────────────────────────────────────────────────────────
async function syncToken() {
  const { app_url, user_token } = await chrome.storage.sync.get(['app_url', 'user_token']);
  if (!app_url || !user_token) { setBadge('?', '#94a3b8'); return; }

  const cookie = await chrome.cookies.get({ url: INPI_URL, name: COOKIE_NAME });

  if (!cookie?.value) {
    setBadge('!', '#ef4444');
    await saveStatus({ ok: false, error: 'Session expirée — reconnexion automatique…' });
    await autoLogin();
    return;
  }

  try {
    const res  = await fetch(`${app_url}/api/inpi-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bearer: cookie.value, user_token }),
    });
    const json = await res.json();

    if (json.ok) {
      setBadge('✓', '#22c55e');
      await saveStatus({ ok: true, expiresInMin: json.expiresInMin, syncedAt: new Date().toISOString() });
      // Reconnecter automatiquement 10 min avant l'expiration
      if (json.expiresInMin !== undefined && json.expiresInMin <= 10) {
        await autoLogin();
      }
    } else {
      setBadge('!', '#f59e0b');
      await saveStatus({ ok: false, error: json.error });
      await autoLogin();
    }
  } catch (e) {
    setBadge('!', '#ef4444');
    await saveStatus({ ok: false, error: e.message });
  }
}

// ── Connexion automatique INPI ────────────────────────────────────────────────
let loginInProgress = false;

async function autoLogin() {
  if (loginInProgress) return;

  const { inpi_login, inpi_password } = await chrome.storage.sync.get(['inpi_login', 'inpi_password']);
  if (!inpi_login || !inpi_password) {
    await saveStatus({ ok: false, error: 'Session expirée — renseignez vos identifiants INPI dans l\'extension' });
    setBadge('!', '#ef4444');
    return;
  }

  loginInProgress = true;
  setBadge('…', '#f59e0b');
  await saveStatus({ ok: false, error: 'Reconnexion INPI en cours…' });

  try {
    // Ouvrir un onglet invisible pour se connecter
    const tab = await chrome.tabs.create({ url: INPI_LOGIN_URL, active: false });

    // Attendre que la page soit chargée
    await waitForTabLoad(tab.id);
    await sleep(1500);

    // Injecter le script de connexion
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectLogin,
      args: [inpi_login, inpi_password],
    });

    const result = results?.[0]?.result;

    if (result?.ok) {
      // Attendre que le cookie apparaisse (login en cours)
      await sleep(3000);
      const cookie = await chrome.cookies.get({ url: INPI_URL, name: COOKIE_NAME });
      if (cookie?.value) {
        chrome.tabs.remove(tab.id);
        loginInProgress = false;
        // Re-syncer avec le nouveau token
        await syncToken();
        return;
      }
      // Attendre encore un peu (certains sites sont lents)
      await sleep(3000);
      const cookie2 = await chrome.cookies.get({ url: INPI_URL, name: COOKIE_NAME });
      chrome.tabs.remove(tab.id).catch(() => {});
      loginInProgress = false;
      if (cookie2?.value) {
        await syncToken();
      } else {
        setBadge('!', '#ef4444');
        await saveStatus({ ok: false, error: 'Reconnexion échouée — vérifiez vos identifiants INPI' });
      }
    } else {
      chrome.tabs.remove(tab.id).catch(() => {});
      loginInProgress = false;
      setBadge('!', '#ef4444');
      await saveStatus({ ok: false, error: result?.error || 'Formulaire INPI introuvable' });
    }
  } catch (e) {
    loginInProgress = false;
    setBadge('!', '#ef4444');
    await saveStatus({ ok: false, error: 'Erreur reconnexion : ' + e.message });
  }
}

// ── Script injecté dans l'onglet INPI ────────────────────────────────────────
function injectLogin(login, password) {
  try {
    // Chercher les champs email/password par différents sélecteurs
    const emailField = document.querySelector(
      'input[type="email"], input[name="username"], input[name="email"], input[id*="email"], input[id*="login"], input[placeholder*="mail"]'
    );
    const passField = document.querySelector(
      'input[type="password"]'
    );
    const submitBtn = document.querySelector(
      'button[type="submit"], input[type="submit"], button.btn-primary, button[class*="submit"], button[class*="login"]'
    );

    if (!emailField || !passField) {
      return { ok: false, error: 'Champs introuvables (' + document.title + ')' };
    }

    // Remplir les champs (compatible React/Vue)
    function fillInput(el, value) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (nativeSetter) nativeSetter.set.call(el, value);
      el.value = value;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur',   { bubbles: true }));
    }

    fillInput(emailField, login);
    fillInput(passField,  password);

    // Soumettre
    if (submitBtn) {
      setTimeout(() => submitBtn.click(), 300);
    } else {
      // Fallback : soumettre le formulaire directement
      const form = passField.closest('form');
      if (form) setTimeout(() => form.submit(), 300);
      else return { ok: false, error: 'Bouton de connexion introuvable' };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Détection reconnexion réussie ────────────────────────────────────────────
// Si le cookie apparaît (connexion manuelle ou auto), re-syncer immédiatement
chrome.cookies.onChanged.addListener(change => {
  if (
    change.cookie.domain?.includes('guichet-unique.inpi.fr') &&
    change.cookie.name === COOKIE_NAME &&
    !change.removed &&
    !loginInProgress
  ) {
    setTimeout(syncToken, 1000);
  }
});

// ── Utilitaires ───────────────────────────────────────────────────────────────
function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
    // Timeout 10s
    setTimeout(resolve, 10000);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
  if (msg.action === 'test-login') {
    autoLogin().then(() => sendResponse({ ok: true }));
    return true;
  }
});

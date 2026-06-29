/**
 * Bot de renouvellement automatique du token INPI
 * Se connecte a guichet-unique.inpi.fr avec Playwright (navigateur reel)
 * et envoie le nouveau BEARER a l'application.
 *
 * Usage : node refresh-inpi-token.js
 * Planification : Windows Task Scheduler toutes les 90 minutes
 */

require('dotenv').config({ path: __dirname + '/.env.bot' });
const { chromium } = require('playwright');

const INPI_EMAIL    = process.env.INPI_EMAIL;
const INPI_PASSWORD = process.env.INPI_PASSWORD;
const APP_URL       = process.env.APP_URL       || 'https://inpi-ten.vercel.app';
const USER_TOKEN    = process.env.USER_TOKEN;    // bookmarklet_token depuis Parametres

if (!INPI_EMAIL || !INPI_PASSWORD || !USER_TOKEN) {
  console.error('❌ Variables manquantes dans .env.bot : INPI_EMAIL, INPI_PASSWORD, USER_TOKEN');
  process.exit(1);
}

async function run() {
  console.log('[' + new Date().toLocaleString('fr-FR') + '] Demarrage du renouvellement INPI...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // 1. Aller sur la page de connexion INPI
    console.log('  → Navigation vers procedures.inpi.fr...');
    await page.goto('https://procedures.inpi.fr/?/login', { waitUntil: 'networkidle', timeout: 30000 });

    // 2. Remplir email + password
    await page.fill('input[type="email"], input[name="email"], input[id="email"], input[placeholder*="mail" i]', INPI_EMAIL);
    await page.fill('input[type="password"]', INPI_PASSWORD);

    // 3. Soumettre
    console.log('  → Connexion...');
    await Promise.all([
      page.waitForNavigation({ timeout: 30000 }),
      page.click('button[type="submit"], input[type="submit"]'),
    ]);

    // 4. Attendre la redirection vers guichet-unique.inpi.fr
    console.log('  → Attente redirection GU...');
    await page.waitForURL('*guichet-unique.inpi.fr*', { timeout: 30000 }).catch(async () => {
      // Parfois il faut naviguer manuellement vers GU apres login
      await page.goto('https://guichet-unique.inpi.fr', { waitUntil: 'networkidle', timeout: 30000 });
    });

    // 5. Attendre que le BEARER soit set par le SPA
    await page.waitForTimeout(3000);

    // 6. Extraire les cookies
    const cookies = await context.cookies('https://guichet-unique.inpi.fr');
    const bearer       = cookies.find(c => c.name === 'BEARER')?.value;
    const refreshToken = cookies.find(c => c.name === 'REFRESH_TOKEN')?.value;

    if (!bearer) {
      throw new Error('Cookie BEARER non trouve apres connexion. Verifiez vos identifiants.');
    }

    console.log('  → BEARER obtenu (expire dans ~2h)');

    // 7. Envoyer a l'application
    console.log('  → Envoi a ' + APP_URL + '...');
    const res = await fetch(APP_URL + '/api/inpi-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bearer, refresh_token: refreshToken, user_token: USER_TOKEN }),
    });
    const json = await res.json();

    if (json.ok) {
      console.log('✅ Token mis a jour avec succes ! Valide encore ' + json.expiresInMin + ' minutes.');
    } else {
      throw new Error('API erreur : ' + json.error);
    }

  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();

import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { createClient } from '@supabase/supabase-js';

// ── Récupérer le client ───────────────────────────────────────────────────────
export async function getClient(id) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data, error } = await sb.from('clients').select('*').eq('id', id).single();
  if (error || !data) throw new Error('Client introuvable');
  return data;
}

// ── Vérifier que toutes les variables requises sont remplies ──────────────────
export function validateClient(client, docType) {
  const required = {
    all: ['civilite','prenom','nom','date_naissance','ville_naissance','cp_naissance',
          'nationalite','adresse','denomination','type_societe','capital',
          'siege_social','ville_siege','date_signature','ville_signature'],
    dnc: ['nom_pere','nom_mere'],
  };

  const fields = [...required.all, ...(required[docType] || [])];
  const labels = {
    civilite: 'Civilité', prenom: 'Prénom', nom: 'Nom', date_naissance: 'Date de naissance',
    ville_naissance: 'Ville de naissance', cp_naissance: 'Code postal naissance',
    nationalite: 'Nationalité', adresse: 'Adresse personnelle', denomination: 'Dénomination',
    type_societe: 'Type de société', capital: 'Capital', siege_social: 'Siège social',
    ville_siege: 'Ville du siège', date_signature: 'Date de signature',
    ville_signature: 'Ville de signature', nom_pere: 'Nom du père (DNC)', nom_mere: 'Nom de la mère (DNC)',
  };

  const missing = fields.filter(f => !client[f] && client[f] !== 0);
  if (missing.length) {
    throw new Error(`Champs obligatoires manquants : ${missing.map(f => labels[f] || f).join(', ')}`);
  }
}

// ── Trouver le document source ────────────────────────────────────────────────
export function findSource(typeSociete, docType) {
  const folder = typeSociete.toLowerCase().replace(/\s/g, '_');
  // Chercher d'abord dans originals/ (documents source non modifiés)
  const orig = path.join(process.cwd(), 'templates', folder, 'originals', `${docType}.docx`);
  if (fs.existsSync(orig)) return orig;
  // Fallback sur le dossier direct
  const p = path.join(process.cwd(), 'templates', folder, `${docType}.docx`);
  if (fs.existsSync(p)) return p;
  return null;
}

// ── Remplacements texte par type de document ──────────────────────────────────
function getReplacements(docType, client) {
  const nomPereSansC = client.nom_pere?.replace(/^(Monsieur|Madame|M\.|Mme)\s+/i, '') || '';
  const nomMereSansC = client.nom_mere?.replace(/^(Monsieur|Madame|M\.|Mme)\s+/i, '') || '';

  // Adresse siège source (NA2G) et adresse perso source (NA2G) — identiques dans le modèle
  const SIEGE_SRC   = '135 Avenue de Flandre 75019 Paris';
  const ADRESSE_SRC = '135 Avenue de Flandre 75019 Paris';

  // Pour les statuts, le siège apparaît d'abord dans l'en-tête, puis l'adresse perso dans le corps.
  // On les remplace par le même token temporaire puis on substitue pour éviter les conflits.
  // Simplification : siege_social et adresse sont deux champs distincts du client.
  // Dans le HTML mammoth, la première occurrence est le siège, la deuxième est l'adresse perso.
  // On remplace la chaîne NA2G par __SIEGE__ d'abord, puis __ADRESSE__, puis substitue.

  const common = [
    // Noms
    ['Monsieur Noam Avy Gabriel GALULA', `${client.civilite} ${client.prenom} ${client.nom}`],
    ['Madame Noam Avy Gabriel GALULA',   `${client.civilite} ${client.prenom} ${client.nom}`],
    ['Noam Avy Gabriel GALULA',          `${client.prenom} ${client.nom}`],
    // Dénomination (ordre important : plus long d'abord)
    ['NA2G CONSEIL SOCIETE PAR ACTIONS SIMPLIFIEE UNIPERSONNELLE', `${client.denomination} SOCIETE PAR ACTIONS SIMPLIFIEE UNIPERSONNELLE`],
    ['S.A.S.U NA2G CONSEIL', `S.A.S.U ${client.denomination}`],
    ['S.A.S.U. NA2G CONSEIL', `S.A.S.U. ${client.denomination}`],
    ['SASU NA2G CONSEIL', `SASU ${client.denomination}`],
    ['SAS U NA2G CONSEIL', `SAS U ${client.denomination}`],
    ['NA2G CONSEIL', client.denomination],
    // Siège social — TOUTES les occurrences (on accepte que siege_social et adresse soient
    // indistinguables dans ce modèle ; pour les vrais clients ils peuvent différer)
    [SIEGE_SRC, client.siege_social],
    ['135 avenue de Flandre 75019 Paris', client.siege_social],
    // Autres adresses de modèles alternatifs
    ['33 Rue Jules Massenet 92500 Rueil Malmaison', client.siege_social],
    // Capital
    ['1 0 0 Euros', `${client.capital} Euros`],
    ['1 0 0 euros', `${client.capital} euros`],
    ['1 00 Euros', `${client.capital} Euros`],
    ['1 00 euros', `${client.capital} euros`],
    ['100 Euros', `${client.capital} Euros`],
    ['100 euros', `${client.capital} euros`],
    ['10 0 Euros', `${client.capital} Euros`],
    ['10 0 euros', `${client.capital} euros`],
    // Date naissance
    ['0 2 /0 8 /2002', client.date_naissance],
    ['02 /0 8 /2002', client.date_naissance],
    ['02/08/2002', client.date_naissance],
    // Ville naissance
    ['Boulogne-Billancourt', client.ville_naissance],
    // CP naissance
    ['(92100)', `(${client.cp_naissance})`],
    ['92100', client.cp_naissance],
    // Nationalité
    ['de nationalité Française', `de nationalité ${client.nationalite}`],
    ['De nationalité Française', `de nationalité ${client.nationalite}`],
    ['de nationalit é Française', `de nationalité ${client.nationalite}`],
    ['de nationalité française', `de nationalité ${client.nationalite}`],
    // Date signature
    ['27/01/2025', client.date_signature],
    ['23/12/2024', client.date_signature],
    // Ville signature
    ['Fait à Sarcelles', `Fait à ${client.ville_signature}`],
    ['Fait à Paris', `Fait à ${client.ville_signature}`],
  ];

  // Pour statuts : après les remplacements communs (siège), remplacer l'adresse perso
  // Le siège et l'adresse perso NA2G sont la même chaîne — dans common on remplace toutes
  // les occurrences par siege_social. Pour l'adresse perso on fait un second passage.
  // Si siege_social !== adresse : on re-remplace la valeur siege_social par adresse dans le
  // contexte "demeurant au" (regex pour le contexte).
  const statuts = [
    ...common,
    // Capital en lettres + nb actions
    [`cent (100)`, `${nombreEnLettres(client.capital)} (${client.nb_actions})`],
    [`cent euros`, `${nombreEnLettres(client.capital)}`],
    // Adresse perso (contexte "demeurant au")
    [`demeurant au ${client.siege_social}`, `demeurant au ${client.adresse}`],
    // Objet social (si client a un objet social personnalisé)
    ...(client.objet_social ? [
      ['Régie commerciale, développement commercial, apporteurs d\'affaires, call-center, prise de rendez-vous, commissions sur ventes, intermédiations, en France et à l\'international.\nVentes et achats en France et à l\'international', client.objet_social],
      ['Toute activité de gestion, de développement et de commercialisation de produits et de prestations de services dans le secteur des technologies de l\'information et de la communication', client.objet_social],
    ] : []),
  ];

  const dnc = [
    ...common,
    // Adresse perso dans DNC (contexte "Demeurant :")
    [`Demeurant : ${client.siege_social}`, `Demeurant : ${client.adresse}`],
    [`demeurant : ${client.siege_social}`, `Demeurant : ${client.adresse}`],
    // Noms des parents
    ['Jean Luc GALULA', nomPereSansC],
    ['Sandra COHEN ép. GALULA', nomMereSansC],
    ['Redouane AMRI', nomPereSansC],
    ['Samia Hammad', nomMereSansC],
  ];

  const map = { statuts, pouvoir: common, souscripteurs: common, dnc };
  return map[docType] || common;
}

// ── Générer PDF depuis le document source ─────────────────────────────────────
export async function generatePdf(sourcePath, docType, client) {
  // 1. Convertir DOCX → HTML avec styleMap pour les styles Word personnalisés
  const result = await mammoth.convertToHtml({
    path: sourcePath,
    styleMap: [
      "p[style-name='En-teteSteActe2'] => p.entete2:fresh",
      "p[style-name='En-teteSteActe3'] => p.entete3:fresh",
      "p[style-name='List Paragraph'] => p.list-para:fresh",
      "p[style-name='Title'] => p.doc-title:fresh",
      "p[style-name='EFLtitrenotepv'] => p.efl-titre:fresh",
      "p[style-name='EFLcellule'] => p.efl-cellule:fresh",
      "r[style-name='EFLmotgras'] => strong",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
    ],
    includeDefaultStyleMap: true,
  });
  let html = result.value;

  // 1b. Normaliser les fragments d'adresse coupés entre plusieurs <p> par mammoth
  html = html.replace(/135 Avenue de Flandre\s*<\/p><p[^>]*>\s*/gi, '135 Avenue de Flandre ');
  html = html.replace(/135 Avenue de Flandre 75019\s*\n\s*/gi, '135 Avenue de Flandre 75019 ');
  html = html.replace(/33 Rue Jules Massenet\s*<\/p><p[^>]*>\s*/gi, '33 Rue Jules Massenet ');
  // Supprimer les ancres parasites
  html = html.replace(/<a\s+id="[^"]*"><\/a>/g, '');

  // 2. Remplacements des données client
  const replacements = getReplacements(docType, client);
  for (const [from, to] of replacements) {
    if (!from || !to) continue;
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(esc, 'gi'), to);
  }

  // 3. HTML complet avec CSS fidèle au document Word (Tahoma, centré, justifié)
  const DOC_LABELS = { statuts: 'Statuts', pouvoir: 'Pouvoir', souscripteurs: 'Liste souscripteurs', dnc: 'DNC' };
  const fullHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>${DOC_LABELS[docType] || docType} — ${client.denomination}</title>
<style>
@page { size: A4; margin: 2cm 2.5cm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: Tahoma, Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.2;
  color: #000;
  background: #fff;
  padding: 1.5cm 2.5cm;
}
/* Styles Word personnalisés : en-têtes centrés et gras */
p.entete2 {
  font-family: Tahoma, sans-serif;
  font-weight: bold;
  text-align: center;
  font-size: 11pt;
  margin: 2pt 0;
  line-height: 1.2;
}
p.entete3 {
  font-family: Tahoma, sans-serif;
  font-weight: bold;
  text-align: center;
  font-size: 10pt;
  margin: 2pt 0;
  line-height: 1.2;
}
p.doc-title {
  font-family: Tahoma, sans-serif;
  font-weight: bold;
  text-align: center;
  font-size: 14pt;
  margin: 8pt 0 4pt;
  letter-spacing: 1px;
}
p.efl-titre {
  font-weight: bold;
  text-align: center;
  font-size: 11pt;
  margin: 6pt 0 2pt;
}
p.efl-cellule {
  margin: 0;
  padding: 0;
  font-size: 10pt;
}
/* Paragraphes normaux */
p {
  margin: 4pt 0;
  text-align: justify;
  line-height: 1.3;
}
/* Titres d'articles (contenu en <strong> dans un <p>) */
p > strong:only-child,
p:has(> strong:only-child) {
  font-weight: bold;
}
/* Listes */
ul, ol {
  margin: 4pt 0 4pt 1.2cm;
  padding: 0;
}
li {
  margin: 2pt 0;
  text-align: justify;
  line-height: 1.3;
}
p.list-para {
  margin-left: 1cm;
  text-align: justify;
}
h1 { font-size: 12pt; font-weight: bold; text-align: center; margin: 6pt 0 3pt; }
h2 { font-size: 11pt; font-weight: bold; margin: 5pt 0 2pt; }
/* Tableaux (liste souscripteurs) */
table { width: 100%; border-collapse: collapse; margin: 6pt 0; font-size: 10pt; }
td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; }
th { font-weight: bold; text-align: center; }
strong, b { font-weight: bold; }
em, i { font-style: italic; }
br { display: block; margin: 2pt 0; }
</style></head><body>${html}</body></html>`;

  // 4. Générer le PDF
  return htmlToPdf(fullHtml);
}

// ── Puppeteer + Chromium headless ─────────────────────────────────────────────
export async function htmlToPdf(html) {
  const chromium  = (await import('@sparticuz/chromium-min')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar'
    ),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({ format: 'A4', printBackground: true });
  } finally {
    await browser.close();
  }
}

// ── Conversion nombre → lettres ───────────────────────────────────────────────
function nombreEnLettres(n) {
  const units = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf',
    'dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
  const tens  = ['','dix','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];
  if (n === 0) return 'zéro';
  if (n < 0)   return 'moins ' + nombreEnLettres(-n);
  let r = '';
  if (n >= 1000) { const m2 = Math.floor(n/1000); r += (m2===1?'mille':nombreEnLettres(m2)+' mille')+' '; n%=1000; }
  if (n >= 100)  { const c = Math.floor(n/100);  r += (c===1?'cent':units[c]+' cent')+' '; n%=100; }
  if (n >= 20)   { const t=Math.floor(n/10),u=n%10; r += (t===7||t===9)?tens[t]+'-'+units[10+u]:tens[t]+(u>0?'-'+units[u]:(t===8?'s':'')); }
  else if (n > 0) r += units[n];
  return r.trim() + ' euros';
}

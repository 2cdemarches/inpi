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
  const p = path.join(process.cwd(), 'templates', folder, `${docType}.docx`);
  return fs.existsSync(p) ? p : null;
}

// ── Remplacements texte par type de document ──────────────────────────────────
function getReplacements(docType, client, settings = {}) {
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
    // Placeholders template {variable}
    ['{denomination}',            client.denomination],
    ['{capital}',                 `${client.capital}`],
    ['{nb_actions}',              `${client.nb_actions}`],
    ['{siege_social}',            client.siege_social],
    ['{siege_social_debut}',      client.siege_social],
    ['{adresse}',                 client.adresse],
    ['{adresse_debut}',           client.adresse],
    ['{prenom}',                  client.prenom],
    ['{nom}',                     client.nom],
    ['{nom_complet}',             `${client.civilite} ${client.prenom} ${client.nom}`],
    ['{civilite}',                client.civilite],
    ['{civilite_nom}',            `${client.civilite} ${client.prenom} ${client.nom}`],
    ['{date_naissance}',          client.date_naissance],
    ['{ville_naissance}',         client.ville_naissance],
    ['{cp_naissance}',            client.cp_naissance],
    ['{nationalite}',             client.nationalite],
    ['{nom_pere_sans_civilite}',  nomPereSansC],
    ['{nom_mere_sans_civilite}',  nomMereSansC],
    ['{date_signature}',          client.date_signature],
    ['{ville_signature}',         client.ville_signature],
    ['{objet_social}',            client.objet_social],
    // Ligne "75019 Paris" hardcodée après {siege_social_debut} — gérée en post-process HTML
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

  const cabinet = settings.nom_cabinet || 'MC CONSEIL';
  const representant = settings.representant_cabinet || 'Monsieur CELNIK';
  const adresseCabinet = settings.adresse_cabinet || '35 Boulevard de la Muette 95140 Garges Les Gonesse';

  const pouvoir = [
    ...common,
    ['MC CONSEIL', cabinet],
    ['Monsieur CELNIK', representant],
    ['35 Boulevard de la Muette 95140 Garges Les Gonesse', adresseCabinet],
  ];

  const souscripteurs = [
    ...common,
    // Montants hardcodés dans le tableau (nb_actions et capital)
    [`<td><p>100</p></td>`,         `<td><p>${client.capital}</p></td>`],
    [`souscription de 100 actions`, `souscription de ${client.capital} actions`],
    [`la somme de100 euros`,        `la somme de ${client.capital} euros`],
    [`la somme de 100 euros`,       `la somme de ${client.capital} euros`],
    // Adresse perso (demeurant au)
    [`demeurant au ${client.siege_social}`, `demeurant au ${client.adresse}`],
  ];

  const map = { statuts, pouvoir, souscripteurs, dnc };
  return map[docType] || common;
}

// ── Construire le HTML intermédiaire (commun à generatePdf et debug) ──────────
async function buildHtml(sourcePath, docType, client, settings = {}) {
  // 1. Convertir DOCX → HTML — IMPORTANT: deux arguments séparés (path, options)
  const STYLE_MAP = [
    "p[style-name='En-teteSteActe2'] => p.entete2:fresh",
    "p[style-name='En-teteSteActe3'] => p.entete3:fresh",
    "p[style-name='List Paragraph'] => p.list-para:fresh",
    "p[style-name='Title'] => p.doc-title:fresh",
    "p[style-name='EFLtitrenotepv'] => p.efl-titre:fresh",
    "p[style-name='EFLcellule'] => p.efl-cellule:fresh",
    "r[style-name='EFLmotgras'] => strong",
    "p[style-name='Heading 1'] => h1:fresh",
    "p[style-name='Heading 2'] => h2:fresh",
    "p[style-name='Paragraphedeliste'] => p.para-liste:fresh",
  ];
  const result = await mammoth.convertToHtml(
    { path: sourcePath },
    { styleMap: STYLE_MAP, includeDefaultStyleMap: true }
  );
  let html = result.value;

  // 1b. Normaliser les fragments d'adresse coupés dans les paragraphes NORMAUX uniquement
  // (ne pas toucher aux paragraphes entete3 — le CP/ville doit rester sur une ligne séparée)
  html = html.replace(/135 Avenue de Flandre\s*<\/p><p>\s*/gi, '135 Avenue de Flandre ');
  html = html.replace(/135 Avenue de Flandre 75019\s*\n\s*/gi, '135 Avenue de Flandre 75019 ');
  html = html.replace(/33 Rue Jules Massenet\s*<\/p><p>\s*/gi, '33 Rue Jules Massenet ');
  // Remplacer la ligne "75019 Paris" hardcodée par la ville du siège du client (entete3 ou p)
  html = html.replace(/<p([^>]*)>\s*75019 Paris\s*<\/p>/gi, '');
  // Supprimer les ancres parasites
  html = html.replace(/<a\s+id="[^"]*"><\/a>/g, '');

  // 2. Post-traitement AVANT remplacements (pour matcher sur les valeurs NA2G originales)
  // Page de garde : grand espace avant le bloc société (remplace les ~7 paragraphes vides supprimés par mammoth)
  html = html.replace('<p class="entete2">', '<p class="entete2 cover-top">');
  // Saut de page avant le 2ème bloc société (remplace les ~12 paragraphes vides)
  html = html.replace(/<p class="entete2">NA2G CONSEIL/, '<p class="entete2 page-break">NA2G CONSEIL');
  // STATUTS centré+gras
  html = html.replace(/<p>(<strong>STATUTS<\/strong>)<\/p>/gi, '<p class="statuts-titre">$1</p>');

  // 3. Remplacements des données client
  const replacements = getReplacements(docType, client, settings);
  for (const [from, to] of replacements) {
    if (!from || !to) continue;
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(esc, 'gi'), to);
  }

  // 4. Post-traitement APRÈS remplacements
  html = html.replace(/<p>(?=<strong>TITRE\s)/g, '<p class="titre-section">');
  html = html.replace(/<p>Le soussigné\s*:/g, '<p class="soussigne">Le soussigné :');
  html = html.replace(/<p>Je soussigné/g, '<p class="je-soussigne">Je soussigné');
  // Souscripteurs : déplacer "ETAT DES SOUSCRIPTIONS..." avant le tableau et l'encadrer
  const etatRe = /<p[^>]*>ETAT DES SOUSCRIPTIONS ET DES VERSEMENTS<\/p>/i;
  if (etatRe.test(html)) {
    html = html.replace(etatRe, '');
    html = html.replace('<table>', '<div class="etat-titre"><strong>ETAT DES SOUSCRIPTIONS ET DES VERSEMENTS</strong></div><table>');
  }

  // 4. HTML complet
  const DOC_LABELS = { statuts: 'Statuts', pouvoir: 'Pouvoir', souscripteurs: 'Liste souscripteurs', dnc: 'DNC' };
  return { html, docType, client, DOC_LABELS };
}

// ── Générer PDF ───────────────────────────────────────────────────────────────
export async function generatePdf(sourcePath, docType, client, settings = {}) {
  const { html, DOC_LABELS } = await buildHtml(sourcePath, docType, client, settings);
  return buildFullHtml(html, docType, client, DOC_LABELS);
}

// ── Debug : retourner le HTML intermédiaire (avant PDF) ───────────────────────
export async function generateHtmlDebug(sourcePath, docType, client, settings = {}) {
  const { html, DOC_LABELS } = await buildHtml(sourcePath, docType, client, settings);
  // Retourner le HTML avec les styles mais sans lancer puppeteer
  return buildHtmlString(html, docType, client, DOC_LABELS);
}

function buildHtmlString(html, docType, client, DOC_LABELS) {
  const fullHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>${DOC_LABELS[docType] || docType} — ${client.denomination}</title>
<style>
@page { size: A4; margin: 2.5cm 2.5cm 2cm 2.5cm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: Tahoma, Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.15;
  color: #000;
  background: #fff;
}

/* ── Page de garde ── */
p.statuts-titre {
  text-align: center;
  font-weight: bold;
  font-size: 18pt;
  margin: 0 0 0 0;
}
p.entete2.cover-top { margin-top: 9cm; }
p.entete2.page-break { page-break-before: always; margin-top: 0; font-size: 10.5pt; }
p.entete2.page-break ~ p.entete2,
p.entete2.page-break ~ p.entete3 { font-size: 10.5pt; }

/* ── Bloc société (En-teteSteActe2/3) ── */
p.entete2 {
  font-weight: bold;
  text-align: center;
  font-size: 20pt;
  font-variant: small-caps;
  margin: 0 0 4pt 0;
  line-height: 1.35;
}
p.entete3 {
  font-weight: bold;
  text-align: center;
  font-size: 11pt;
  font-variant: small-caps;
  margin: 0 0 2pt 0;
  line-height: 1.4;
}
/* entete3 dans la page de garde statuts (après cover-top) */
p.entete2.cover-top ~ p.entete3 {
  font-size: 18pt;
  margin: 0 0 4pt 0;
  line-height: 1.35;
}
p.doc-title {
  font-weight: bold;
  text-align: center;
  font-size: 14pt;
  margin: 0 0 6pt 0;
  letter-spacing: 1px;
}
p.efl-titre { font-weight: bold; text-align: center; font-size: 10.5pt; margin: 4pt 0 2pt; }
p.efl-cellule { margin: 0; font-size: 10pt; }
p.para-liste { margin-left: 0.8cm; text-align: justify; line-height: 1.4; margin-bottom: 7pt; }
p.soussigne { margin-top: 30pt; }
p.je-soussigne { margin-top: 56pt; }

/* ── Paragraphes normaux ── */
p {
  margin: 0 0 14pt 0;
  text-align: justify;
  line-height: 1.35;
}

/* ── TITRE I / II / ... ── */
p.titre-section {
  margin-top: 14pt;
  margin-bottom: 2pt;
  line-height: 1.3;
  font-size: 10.5pt;
}
p.titre-section strong {
  font-size: 10.5pt;
  letter-spacing: 0.04em;
  word-spacing: 0.15em;
}
/* Le <br> dans le titre sépare "TITRE I" de "FORME JURIDIQUE..." */
p.titre-section br {
  display: block;
  margin: 0;
}

/* ── Listes ── */
ul, ol {
  margin: 2pt 0 7pt 1.1cm;
  padding: 0;
}
li {
  margin: 0 0 4pt 0;
  text-align: justify;
  line-height: 1.4;
}
p.list-para { margin-left: 1cm; text-align: justify; }

/* ── Souscripteurs : titre encadré ── */
div.etat-titre {
  border: 1px solid #000;
  text-align: center;
  font-weight: bold;
  padding: 5pt 10pt;
  margin: 32pt 0 24pt 0;
  background: #f0f0f0;
}

/* ── Tableaux (liste souscripteurs) ── */
table { width: 100%; border-collapse: collapse; margin: 6pt 0; font-size: 10pt; }
td, th { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
th { font-weight: bold; text-align: center; background: #f0f0f0; }

/* ── Typographie ── */
strong, b { font-weight: bold; }
em, i { font-style: italic; }
h1 { font-size: 11pt; font-weight: bold; margin: 8pt 0 3pt; }
h2 { font-size: 10.5pt; font-weight: bold; margin: 6pt 0 2pt; }
br { content: ""; display: block; margin-top: 3pt; }
</style></head><body>${html}</body></html>`;

  return fullHtml;
}

function buildFullHtml(html, docType, client, DOC_LABELS) {
  return htmlToPdf(buildHtmlString(html, docType, client, DOC_LABELS));
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

import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import mammoth from 'mammoth';
import { createClient } from '@supabase/supabase-js';

// ── Récupérer le client depuis Supabase ───────────────────────────────────────
export async function getClient(id) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data, error } = await sb.from('clients').select('*').eq('id', id).single();
  if (error || !data) throw new Error('Client introuvable');
  return data;
}

// ── Construire les variables du template ──────────────────────────────────────
export function buildVars(client) {
  const nomPereSansC = client.nom_pere?.replace(/^(Monsieur|Madame|M\.|Mme)\s+/i, '') || '';
  const nomMereSansC = client.nom_mere?.replace(/^(Monsieur|Madame|M\.|Mme)\s+/i, '') || '';
  return {
    civilite:               client.civilite,
    prenom:                 client.prenom,
    nom:                    client.nom,
    nom_complet:            `${client.prenom} ${client.nom}`,
    civilite_nom:           `${client.civilite} ${client.prenom} ${client.nom}`,
    date_naissance:         client.date_naissance,
    ville_naissance:        client.ville_naissance,
    cp_naissance:           client.cp_naissance,
    nationalite:            client.nationalite || 'Française',
    adresse:                client.adresse,
    nom_pere:               client.nom_pere || '',
    nom_mere:               client.nom_mere || '',
    nom_pere_sans_civilite: nomPereSansC,
    nom_mere_sans_civilite: nomMereSansC,
    denomination:           client.denomination,
    type_societe:           client.type_societe,
    capital:                client.capital?.toLocaleString('fr-FR') || '',
    capital_lettres:        nombreEnLettres(client.capital || 0),
    siege_social:           client.siege_social,
    ville_siege:            client.ville_siege,
    objet_social:           client.objet_social || '',
    nb_actions:             client.nb_actions?.toString() || '',
    valeur_action:          client.nb_actions > 0 ? ((client.capital || 0) / client.nb_actions).toLocaleString('fr-FR') : '1',
    date_signature:         client.date_signature || '',
    ville_signature:        client.ville_signature || '',
    date_jour:              new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    annee:                  new Date().getFullYear().toString(),
  };
}

// ── Trouver le template ───────────────────────────────────────────────────────
export function findTemplate(typeSociete, docType) {
  const typeFolder = typeSociete.toLowerCase().replace(/\s/g, '_');
  const specific   = path.join(process.cwd(), 'templates', typeFolder, `${docType}.docx`);
  if (fs.existsSync(specific)) return specific;
  return null; // pas de fallback — chaque type doit avoir ses propres templates
}

// ── Générer le DOCX rempli (Buffer) ──────────────────────────────────────────
export function generateDocx(templatePath, vars) {
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(vars);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Convertir le Buffer DOCX en HTML (pour PDF) ───────────────────────────────
export async function docxToHtml(docxBuffer) {
  const result = await mammoth.convertToHtml({ buffer: docxBuffer }, {
    styleMap: [
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
    ],
  });
  return result.value;
}

// ── HTML complet avec CSS pour l'impression ───────────────────────────────────
export function wrapHtml(bodyHtml, title = '') {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Tahoma, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #000;
    background: #fff;
    padding: 2cm 2.5cm;
    max-width: 21cm;
    margin: 0 auto;
  }
  h1 { font-size: 14pt; font-weight: bold; text-align: center; margin: 1em 0; }
  h2 { font-size: 12pt; font-weight: bold; margin: 0.8em 0; }
  p  { margin: 0.4em 0; text-align: justify; }
  table { width: 100%; border-collapse: collapse; margin: 0.5em 0; }
  td, th { border: 1px solid #000; padding: 4px 8px; vertical-align: top; }
  strong, b { font-weight: bold; }
  em, i { font-style: italic; }
  @page { size: A4; margin: 2cm 2.5cm; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

// ── Générer PDF depuis HTML via Puppeteer + Chromium ─────────────────────────
export async function htmlToPdf(html) {
  const chromium = (await import('@sparticuz/chromium-min')).default;
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
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '2cm', bottom: '2cm', left: '2.5cm', right: '2.5cm' } });
    return pdf;
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
  if (n >= 1000) { const m = Math.floor(n/1000); r += (m===1?'mille':nombreEnLettres(m)+' mille')+' '; n%=1000; }
  if (n >= 100)  { const c = Math.floor(n/100);  r += (c===1?'cent':units[c]+' cent')+' '; n%=100; }
  if (n >= 20)   {
    const t=Math.floor(n/10), u=n%10;
    r += (t===7||t===9) ? tens[t]+'-'+units[10+u] : tens[t]+(u>0?'-'+units[u]:(t===8?'s':''));
  } else if (n>0) r += units[n];
  return r.trim() + ' euros';
}

import mammoth from 'mammoth';
import fs from 'fs';

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

const CSS = `
@page { size: A4; margin: 2.5cm 2.5cm 2cm 2.5cm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Tahoma, Arial, sans-serif; font-size: 10.5pt; line-height: 1.15; color: #000; background: #fff; }

p.statuts-titre { text-align: center; font-weight: bold; font-size: 18pt; margin: 0; }
p.entete2.cover-top { margin-top: 9cm; }
p.entete2.page-break { page-break-before: always; margin-top: 0; font-size: 10.5pt; }
p.entete2.page-break ~ p.entete2, p.entete2.page-break ~ p.entete3 { font-size: 10.5pt; }
p.entete2 { font-weight: bold; text-align: center; font-size: 20pt; font-variant: small-caps; margin: 0 0 4pt 0; line-height: 1.35; }
p.entete3 { font-weight: bold; text-align: center; font-size: 18pt; font-variant: small-caps; margin: 0 0 4pt 0; line-height: 1.35; }
p.doc-title { font-weight: bold; text-align: center; font-size: 14pt; margin: 0 0 6pt 0; letter-spacing: 1px; }
p.efl-titre { font-weight: bold; text-align: center; font-size: 10.5pt; margin: 4pt 0 2pt; }
p.efl-cellule { margin: 0; font-size: 10pt; }
p.para-liste { margin-left: 0.8cm; text-align: justify; line-height: 1.4; margin-bottom: 7pt; }
p.soussigne { margin-top: 30pt; }

p { margin: 0 0 8pt 0; text-align: justify; line-height: 1.35; }
p.titre-section { margin-top: 14pt; margin-bottom: 2pt; line-height: 1.3; font-size: 10.5pt; }
p.titre-section strong { font-size: 10.5pt; letter-spacing: 0.04em; word-spacing: 0.15em; }
p.titre-section br { display: block; margin: 0; }
ul, ol { margin: 2pt 0 7pt 1.1cm; padding: 0; }
li { margin: 0 0 4pt 0; text-align: justify; line-height: 1.4; }
p.list-para { margin-left: 1cm; text-align: justify; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0; font-size: 10pt; }
td, th { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
th { font-weight: bold; text-align: center; background: #f0f0f0; }
strong, b { font-weight: bold; }
em, i { font-style: italic; }
h1 { font-size: 11pt; font-weight: bold; margin: 8pt 0 3pt; }
h2 { font-size: 10.5pt; font-weight: bold; margin: 6pt 0 2pt; }
br { content: ""; display: block; margin-top: 3pt; }
`;

for (const [name, file] of [
  ['statuts', './templates/sasu/originals/statuts.docx'],
  ['pouvoir', './templates/sasu/originals/pouvoir.docx'],
  ['souscripteurs', './templates/sasu/originals/souscripteurs.docx'],
  ['dnc', './templates/sasu/originals/dnc.docx'],
]) {
  const r = await mammoth.convertToHtml(
    { path: file },
    { styleMap: STYLE_MAP, includeDefaultStyleMap: true }
  );
  let html = r.value;
  html = html.replace(/<a\s+id="[^"]*"><\/a>/g, '');
  html = html.replace(/135 Avenue de Flandre\s*<\/p><p>\s*/gi, '135 Avenue de Flandre ');
  html = html.replace(/135 Avenue de Flandre 75019\s*\n\s*/gi, '135 Avenue de Flandre 75019 ');
  // Page de garde
  html = html.replace('<p class="entete2">', '<p class="entete2 cover-top">');
  html = html.replace(/<p class="entete2">NA2G CONSEIL/, '<p class="entete2 page-break">NA2G CONSEIL');
  html = html.replace(/<p>(<strong>STATUTS<\/strong>)<\/p>/gi, '<p class="statuts-titre">$1</p>');
  // Titres de section
  html = html.replace(/<p>(?=<strong>TITRE\s)/g, '<p class="titre-section">');
  html = html.replace(/<p>Le soussigné\s*:/g, '<p class="soussigne">Le soussigné :');
  const full = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>${html}</body></html>`;
  fs.writeFileSync(`C:/Users/conta/Desktop/preview2-${name}.html`, full);
  console.log(`✅ preview2-${name}.html`);
}

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
];

const CSS = `
@page { size: A4; margin: 2cm 2.5cm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Tahoma, Arial, sans-serif; font-size: 11pt; line-height: 1.2; color: #000; background: #fff; padding: 1.5cm 2.5cm; }
p.entete2 { font-weight: bold; text-align: center; font-size: 11pt; margin: 2pt 0; }
p.entete3 { font-weight: bold; text-align: center; font-size: 10pt; margin: 2pt 0; }
p.doc-title { font-weight: bold; text-align: center; font-size: 14pt; margin: 8pt 0 4pt; letter-spacing: 1px; }
p.efl-titre { font-weight: bold; text-align: center; font-size: 11pt; margin: 6pt 0 2pt; }
p.efl-cellule { margin: 0; font-size: 10pt; }
p { margin: 4pt 0; text-align: justify; line-height: 1.3; }
ul, ol { margin: 4pt 0 4pt 1.2cm; } li { margin: 2pt 0; text-align: justify; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0; font-size: 10pt; }
td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; }
th { font-weight: bold; text-align: center; }
strong { font-weight: bold; } em { font-style: italic; }
`;

for (const [name, file] of [
  ['statuts', './templates/sasu/originals/statuts.docx'],
  ['pouvoir', './templates/sasu/originals/pouvoir.docx'],
  ['souscripteurs', './templates/sasu/originals/souscripteurs.docx'],
  ['dnc', './templates/sasu/originals/dnc.docx'],
]) {
  const r = await mammoth.convertToHtml({ path: file, styleMap: STYLE_MAP, includeDefaultStyleMap: true });
  let html = r.value;
  html = html.replace(/<a\s+id="[^"]*"><\/a>/g, '');
  html = html.replace(/135 Avenue de Flandre\s*<\/p><p[^>]*>\s*/gi, '135 Avenue de Flandre ');
  html = html.replace(/135 Avenue de Flandre 75019\s*\n\s*/gi, '135 Avenue de Flandre 75019 ');
  const full = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>${html}</body></html>`;
  fs.writeFileSync(`C:/Users/conta/Desktop/preview-${name}.html`, full);
  console.log(`✅ preview-${name}.html`);
}

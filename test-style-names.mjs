import AdmZip from 'adm-zip';

const zip = new AdmZip('./templates/sasu/originals/statuts.docx');
const xml = zip.readAsText('word/styles.xml');

// Trouver toutes les définitions de style avec leur ID et leur nom
const styleRe = /<w:style[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g;
let m;
while ((m = styleRe.exec(xml)) !== null) {
  const id = m[1];
  const body = m[2];
  const name = body.match(/<w:name w:val="([^"]+)"/)?.[1] || '???';
  if (id.includes('tete') || id.includes('Tete') || id.includes('ete') || name.includes('tete') || name.includes('Ste') || name.includes('Acte')) {
    console.log(`styleId="${id}" → name="${name}"`);
  }
}
// Aussi chercher 'Normal'
const normalRe = /<w:style[^>]*w:styleId="Normal"[^>]*>([\s\S]*?)<\/w:style>/;
const nm = normalRe.exec(xml);
if (nm) {
  const name = nm[1].match(/<w:name w:val="([^"]+)"/)?.[1];
  console.log(`styleId="Normal" → name="${name}"`);
}

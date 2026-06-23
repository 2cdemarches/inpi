import AdmZip from 'adm-zip';

// Lire les styles du document
const zip = new AdmZip('./templates/sasu/originals/statuts.docx');
const stylesXml = zip.readAsText('word/styles.xml');
const docXml    = zip.readAsText('word/document.xml');

// Extraire les styles personnalisés
const styleRe = /<w:style[^>]+w:styleId="(En-tete[^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g;
let m;
while ((m = styleRe.exec(stylesXml)) !== null) {
  console.log(`\n=== Style: ${m[1]} ===`);
  // Taille
  const sz  = m[2].match(/<w:sz w:val="(\d+)"/);
  const szCs = m[2].match(/<w:szCs w:val="(\d+)"/);
  const bold = m[2].includes('<w:b/>') || m[2].includes('<w:b ');
  const jc   = m[2].match(/<w:jc w:val="([^"]+)"/);
  const font = m[2].match(/<w:rFonts[^>]+>/);
  console.log('  Taille:', sz?.[1], '/ Bold:', bold, '/ Align:', jc?.[1]);
  if (font) console.log('  Font:', font[0]);
  // Spacing
  const space = m[2].match(/<w:spacing[^>]+>/);
  if (space) console.log('  Spacing:', space[0]);
}

// Aussi vérifier la police par défaut
const defFont = stylesXml.match(/<w:rFonts[^>]+w:asciiTheme="([^"]+)"/);
console.log('\nPolice thème par défaut:', defFont?.[1]);

// Taille par défaut
const defSz = stylesXml.match(/<w:sz w:val="(\d+)"/);
console.log('Taille par défaut:', defSz?.[1], '→', defSz ? parseInt(defSz[1])/2 + 'pt' : 'inconnu');

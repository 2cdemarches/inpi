import AdmZip from 'adm-zip';
import mammoth from 'mammoth';

for (const [name, file] of [
  ['pouvoir', './templates/sasu/originals/pouvoir.docx'],
  ['dnc',     './templates/sasu/originals/dnc.docx'],
  ['souscripteurs', './templates/sasu/originals/souscripteurs.docx'],
]) {
  const r = await mammoth.convertToHtml({ path: file });
  console.log(`\n=== ${name} messages ===`);
  r.messages.forEach(m => console.log(' ', m.message));
  // Afficher début du HTML
  console.log('HTML début:', r.value.substring(0, 300).replace(/\s+/g, ' '));
}

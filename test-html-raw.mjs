import mammoth from 'mammoth';

const r = await mammoth.convertToHtml({ path: './templates/sasu/originals/statuts.docx' });
const html = r.value;

// Trouver toutes les positions de "Avenue"
let i = 0;
while (true) {
  const pos = html.indexOf('Avenue', i);
  if (pos < 0) break;
  // Afficher 200 chars autour
  console.log(`[pos ${pos}]`, JSON.stringify(html.substring(pos-80, pos+80)));
  i = pos + 1;
}

import mammoth from 'mammoth';

const files = {
  statuts: './templates/sasu/originals/statuts.docx',
  dnc:     './templates/sasu/originals/dnc.docx',
};

for (const [name, f] of Object.entries(files)) {
  const r = await mammoth.convertToHtml({ path: f });
  const text = r.value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  console.log(`\n=== ${name} ===`);
  const keys = ['NA2G', 'GALULA', 'Noam', 'Avenue de Flandre', '02/08/2002', '92100', 'Jean Luc', 'Sandra'];
  keys.forEach(k => {
    const i = text.indexOf(k);
    if (i >= 0) console.log(`  "${k}" → ...${text.substring(i-15, i+50)}...`);
  });
}

import mammoth from 'mammoth';

const r = await mammoth.convertToHtml(
  { path: './templates/sasu/originals/pouvoir.docx' },
  { includeDefaultStyleMap: true }
);
console.log(r.value.substring(0, 3000));

import AdmZip from 'adm-zip';

const zip = new AdmZip('./templates/sasu/originals/statuts.docx');
const xml = zip.readAsText('word/document.xml');

const paraRe = /<w:p[ >]([\s\S]*?)<\/w:p>/g;
let m, i = 0;
while ((m = paraRe.exec(xml)) !== null) {
  const para = m[1];
  const style = para.match(/<w:pStyle w:val="([^"]+)"/)?.[1] || 'Normal';
  const texts = [...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x=>x[1]);
  const text = texts.join('').substring(0, 70);
  if (i < 35) console.log(`[${i}] "${style}" → "${text}"`);
  i++;
}

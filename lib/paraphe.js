import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import { join } from 'path';

let _fontCache = null;
function loadHandwritingFont() {
  if (_fontCache) return _fontCache;
  _fontCache = readFileSync(join(process.cwd(), 'public/fonts/DancingScript.ttf'));
  return _fontCache;
}

export async function addParaphes(pdfBuffer, client) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  pdfDoc.registerFontkit(fontkit);

  // Police manuscrite pour les paraphes et le nom
  const fontBytes    = loadHandwritingFont();
  const font         = await pdfDoc.embedFont(fontBytes);
  // Police standard pour les éléments techniques (numéro de page)
  const fontStd      = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pages = pdfDoc.getPages();
  const total = pages.length;

  // Initiales cursives
  const initiales = [
    (client.prenom || '').trim().charAt(0).toUpperCase(),
    (client.nom   || '').trim().charAt(0).toUpperCase(),
  ].filter(Boolean).join('') || '??';

  const nomComplet = `${client.civilite || ''} ${client.prenom || ''} ${client.nom || ''}`.trim();

  for (let i = 0; i < total; i++) {
    const page             = pages[i];
    const { width, height } = page.getSize();
    const isLast           = i === total - 1;
    const pageNum          = `${i + 1}/${total}`;

    if (!isLast) {
      // ── Paraphe manuscrit bas-gauche ─────────────────────────────────────
      const fontSize = 16; // plus grand en manuscrit pour rester lisible
      const boxW     = 64;
      const boxH     = 26;
      const x        = 28;
      const y        = 18;

      page.drawRectangle({
        x, y,
        width:  boxW,
        height: boxH,
        borderColor: rgb(0.2, 0.2, 0.2),
        borderWidth: 0.6,
        color:  rgb(1, 1, 1),
        opacity: 0.85,
      });

      const textW = font.widthOfTextAtSize(initiales, fontSize);
      page.drawText(initiales, {
        x:    x + (boxW - textW) / 2,
        y:    y + (boxH - fontSize) / 2 + 2,
        size: fontSize,
        font,
        color: rgb(0.05, 0.1, 0.55), // bleu encre
      });

      // Numéro de page (petite police standard)
      const numW = fontStd.widthOfTextAtSize(pageNum, 7);
      page.drawText(pageNum, {
        x:    width - numW - 28,
        y:    24,
        size: 7,
        font: fontStd,
        color: rgb(0.5, 0.5, 0.5),
      });

    } else {
      // ── Cadre signature dernière page ────────────────────────────────────
      const boxW = 220;
      const boxH = 70;
      const x    = width - boxW - 40;
      const y    = 50;

      page.drawRectangle({
        x, y,
        width:  boxW,
        height: boxH,
        borderColor: rgb(0.2, 0.2, 0.2),
        borderWidth: 0.8,
        color:  rgb(0.97, 0.97, 1),
        opacity: 0.9,
      });

      // Libellé "Signature" en petite police standard
      page.drawText('Signature', {
        x:    x + 8,
        y:    y + boxH - 14,
        size: 8,
        font: fontStd,
        color: rgb(0.4, 0.4, 0.4),
      });

      // Nom complet en police manuscrite sous le cadre
      const nameSize = 11;
      const nameW    = font.widthOfTextAtSize(nomComplet, nameSize);
      page.drawText(nomComplet, {
        x:    x + (boxW - nameW) / 2,
        y:    y - 16,
        size: nameSize,
        font,
        color: rgb(0.1, 0.1, 0.5),
      });

      // Numéro de page
      const numW = fontStd.widthOfTextAtSize(pageNum, 7);
      page.drawText(pageNum, {
        x:    width - numW - 28,
        y:    24,
        size: 7,
        font: fontStd,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  }

  const outBytes = await pdfDoc.save();
  return Buffer.from(outBytes);
}

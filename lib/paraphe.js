import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Ajoute les paraphes (initiales) en bas de chaque page sauf la dernière.
 * Sur la dernière page, ajoute uniquement un cadre "Signature".
 *
 * @param {Buffer} pdfBuffer  - PDF original
 * @param {object} client     - { prenom, nom, civilite }
 * @returns {Buffer}          - PDF paraphé
 */
export async function addParaphes(pdfBuffer, client) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages  = pdfDoc.getPages();
  const total  = pages.length;

  // Initiales : première lettre prénom + première lettre nom
  const initiales = [
    (client.prenom || '').trim().charAt(0).toUpperCase(),
    (client.nom   || '').trim().charAt(0).toUpperCase(),
  ].filter(Boolean).join('') || '??';

  const nomComplet = `${client.civilite || ''} ${client.prenom || ''} ${client.nom || ''}`.trim();

  for (let i = 0; i < total; i++) {
    const page        = pages[i];
    const { width, height } = page.getSize();
    const isLast      = i === total - 1;
    const pageNum     = `${i + 1}/${total}`;

    if (!isLast) {
      // ── Paraphe bas-gauche ────────────────────────────────────────────────
      const parapheText = `${initiales}`;
      const fontSize    = 11;
      const boxW        = 60;
      const boxH        = 22;
      const x           = 28;
      const y           = 20;

      // Rectangle bordure
      page.drawRectangle({
        x, y,
        width:  boxW,
        height: boxH,
        borderColor: rgb(0.2, 0.2, 0.2),
        borderWidth: 0.8,
        color:  rgb(1, 1, 1),
        opacity: 0.85,
      });

      // Initiales centrées dans le rectangle
      const textW = font.widthOfTextAtSize(parapheText, fontSize);
      page.drawText(parapheText, {
        x: x + (boxW - textW) / 2,
        y: y + (boxH - fontSize) / 2 + 1,
        size:  fontSize,
        font,
        color: rgb(0.1, 0.1, 0.6),
      });

      // Numéro de page bas-droite
      const numW = font.widthOfTextAtSize(pageNum, 7);
      page.drawText(pageNum, {
        x: width - numW - 28,
        y: 24,
        size:  7,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });

    } else {
      // ── Cadre signature sur la dernière page ──────────────────────────────
      const boxW  = 220;
      const boxH  = 70;
      const x     = width - boxW - 40;
      const y     = 50;

      page.drawRectangle({
        x, y,
        width:  boxW,
        height: boxH,
        borderColor: rgb(0.2, 0.2, 0.2),
        borderWidth: 0.8,
        color:  rgb(0.97, 0.97, 1),
        opacity: 0.9,
      });

      page.drawText('Signature', {
        x: x + 8,
        y: y + boxH - 14,
        size:  8,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });

      // Nom sous le cadre
      const nameSize = 8;
      const nameW    = font.widthOfTextAtSize(nomComplet, nameSize);
      page.drawText(nomComplet, {
        x: x + (boxW - nameW) / 2,
        y: y - 13,
        size:  nameSize,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });

      // Numéro de page bas-droite
      const numW = font.widthOfTextAtSize(pageNum, 7);
      page.drawText(pageNum, {
        x: width - numW - 28,
        y: 24,
        size:  7,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  }

  const outBytes = await pdfDoc.save();
  return Buffer.from(outBytes);
}

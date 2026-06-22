import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getClient, buildVars, findTemplate, generateDocx, docxToHtml, wrapHtml, htmlToPdf } from '@/lib/generate-doc';

export const maxDuration = 60;

const DOCS = [
  { type: 'statuts',       label: 'Statuts' },
  { type: 'pouvoir',       label: 'Pouvoir' },
  { type: 'souscripteurs', label: 'Liste_souscripteurs' },
  { type: 'dnc',           label: 'DNC' },
];

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const client = await getClient(id);
    const vars   = buildVars(client);
    const nom    = client.denomination.replace(/[^a-zA-Z0-9]/g, '_');
    const zip    = new JSZip();
    const errors = [];

    await Promise.all(DOCS.map(async ({ type, label }) => {
      const templatePath = findTemplate(client.type_societe, type);
      if (!templatePath) { errors.push(`${label} : template manquant pour ${client.type_societe}`); return; }
      try {
        const docxBuf  = generateDocx(templatePath, vars);
        const html     = await docxToHtml(docxBuf);
        const fullHtml = wrapHtml(html, `${label} — ${client.denomination}`);
        const pdfBuf   = await htmlToPdf(fullHtml);
        zip.file(`${label}_${nom}.pdf`, pdfBuf);
      } catch (e) {
        errors.push(`${label} : ${e.message}`);
      }
    }));

    if (errors.length && zip.files && Object.keys(zip.files).length === 0) {
      return NextResponse.json({ error: errors.join('\n') }, { status: 500 });
    }

    if (errors.length) {
      zip.file('_erreurs.txt', errors.join('\n'));
    }

    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    return new NextResponse(zipBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Documents_${nom}.zip"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getClient, buildVars, findTemplate, generateDocx, docxToHtml, wrapHtml, htmlToPdf } from '@/lib/generate-doc';

export const maxDuration = 60;

const DOC_LABELS = { statuts: 'Statuts', pouvoir: 'Pouvoir', souscripteurs: 'Liste_souscripteurs', dnc: 'DNC' };

export async function GET(request, { params }) {
  const { id, type } = await params;

  try {
    const client      = await getClient(id);
    const templatePath = findTemplate(client.type_societe, type);

    if (!templatePath) {
      return NextResponse.json(
        { error: `Pas encore de template "${type}" pour ${client.type_societe}. Envoyez les modèles pour ce type de société.` },
        { status: 404 }
      );
    }

    const vars     = buildVars(client);
    const docxBuf  = generateDocx(templatePath, vars);
    const html     = await docxToHtml(docxBuf);
    const fullHtml = wrapHtml(html, `${DOC_LABELS[type] || type} — ${client.denomination}`);
    const pdfBuf   = await htmlToPdf(fullHtml);

    const filename = `${DOC_LABELS[type] || type}_${client.denomination.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    return new NextResponse(pdfBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

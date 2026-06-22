import { NextResponse } from 'next/server';
import { getClient, validateClient, findSource, generatePdf } from '@/lib/generate-doc';

export const maxDuration = 60;

const DOC_LABELS = { statuts: 'Statuts', pouvoir: 'Pouvoir', souscripteurs: 'Liste_souscripteurs', dnc: 'DNC' };

export async function GET(request, { params }) {
  const { id, type } = await params;

  try {
    const client = await getClient(id);

    // Vérifier que tous les champs requis sont remplis
    validateClient(client, type);

    const sourcePath = findSource(client.type_societe, type);
    if (!sourcePath) {
      return NextResponse.json(
        { error: `Pas encore de modèle "${type}" pour ${client.type_societe}. Envoyez les modèles pour ce type de société.` },
        { status: 404 }
      );
    }

    const pdfBuf = await generatePdf(sourcePath, type, client);
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

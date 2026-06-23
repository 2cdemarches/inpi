import { NextResponse } from 'next/server';
import { getClient, validateClient, findSource, generatePdf } from '@/lib/generate-doc';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';

export const maxDuration = 60;

const DOC_LABELS = { statuts: 'Statuts', pouvoir: 'Pouvoir', souscripteurs: 'Liste_souscripteurs', dnc: 'DNC' };

export async function GET(request, { params }) {
  const { id, type } = await params;
  try {
    const user = await requireUser();
    const sb = await createSupabaseServer();

    const { data: clientRow } = await sb.from('clients').select('*').eq('id', id).eq('user_id', user.id).single();
    if (!clientRow) return NextResponse.json({ error: 'Client introuvable' }, { status: 404 });

    validateClient(clientRow, type);
    const sourcePath = findSource(clientRow.type_societe, type);
    if (!sourcePath) return NextResponse.json({ error: `Pas encore de modèle "${type}" pour ${clientRow.type_societe}.` }, { status: 404 });

    const { data: settings } = await sb.from('settings').select('*').eq('user_id', user.id).single();
    const debug = new URL(request.url).searchParams.get('debug') === '1';
    if (debug) {
      const { generateHtmlDebug } = await import('@/lib/generate-doc');
      const htmlDebug = await generateHtmlDebug(sourcePath, type, clientRow, settings || {});
      return new NextResponse(htmlDebug, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const pdfBuf = await generatePdf(sourcePath, type, clientRow, settings || {});
    const filename = `${DOC_LABELS[type] || type}_${clientRow.denomination.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    return new NextResponse(pdfBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === 'Non authentifié' ? 401 : 500 });
  }
}

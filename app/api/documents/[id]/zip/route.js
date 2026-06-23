import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { validateClient, findSource, generatePdf } from '@/lib/generate-doc';
import { createSupabaseServer, requireUser } from '@/lib/supabase-server';

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
    const user = await requireUser();
    const sb = await createSupabaseServer();

    const { data: client } = await sb.from('clients').select('*').eq('id', id).eq('user_id', user.id).single();
    if (!client) return NextResponse.json({ error: 'Client introuvable' }, { status: 404 });

    validateClient(client, 'dnc');
    const { data: settings } = await sb.from('settings').select('*').eq('user_id', user.id).single();

    const nom    = client.denomination.replace(/[^a-zA-Z0-9]/g, '_');
    const zip    = new JSZip();
    const errors = [];

    await Promise.all(DOCS.map(async ({ type, label }) => {
      const sourcePath = findSource(client.type_societe, type);
      if (!sourcePath) { errors.push(`${label} : modèle manquant pour ${client.type_societe}`); return; }
      try {
        const pdfBuf = await generatePdf(sourcePath, type, client, settings || {});
        zip.file(`${label}_${nom}.pdf`, pdfBuf);
      } catch (e) {
        errors.push(`${label} : ${e.message}`);
      }
    }));

    if (errors.length && Object.keys(zip.files).length === 0) {
      return NextResponse.json({ error: errors.join('\n') }, { status: 500 });
    }
    if (errors.length) zip.file('_erreurs.txt', errors.join('\n'));

    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return new NextResponse(zipBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Documents_${nom}.zip"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === 'Non authentifié' ? 401 : 500 });
  }
}

import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getClient, validateClient, findSource, generatePdf } from '@/lib/generate-doc';
import { createClient } from '@supabase/supabase-js';

async function getSettings() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data } = await sb.from('settings').select('*').eq('id', 1).single();
  return data || {};
}

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

    // Vérifier les champs communs (dnc nécessite nom_pere/nom_mere en plus)
    validateClient(client, 'dnc');

    const nom    = client.denomination.replace(/[^a-zA-Z0-9]/g, '_');
    const zip    = new JSZip();
    const errors = [];

    const settings = await getSettings();

    await Promise.all(DOCS.map(async ({ type, label }) => {
      const sourcePath = findSource(client.type_societe, type);
      if (!sourcePath) { errors.push(`${label} : modèle manquant pour ${client.type_societe}`); return; }
      try {
        const pdfBuf = await generatePdf(sourcePath, type, client, settings);
        zip.file(`${label}_${nom}.pdf`, pdfBuf);
      } catch (e) {
        errors.push(`${label} : ${e.message}`);
      }
    }));

    if (errors.length && Object.keys(zip.files).length === 0) {
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

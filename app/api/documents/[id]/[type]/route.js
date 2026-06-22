import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

export async function GET(request, { params }) {
  const { id, type } = await params;

  const { data: client, error } = await supabase.from('clients').select('*').eq('id', id).single();
  if (error || !client) return NextResponse.json({ error: 'Client introuvable' }, { status: 404 });

  // Chemin vers le template DOCX — fallback vers sasu si le type n'a pas encore son dossier
  const typeFolder = client.type_societe.toLowerCase().replace(/\s/g, '_');
  const templateFile = path.join(process.cwd(), 'templates', typeFolder, `${type}.docx`);
  const fallbackFile = path.join(process.cwd(), 'templates', 'sasu', `${type}.docx`);
  const filePath = fs.existsSync(templateFile) ? templateFile : (fs.existsSync(fallbackFile) ? fallbackFile : null);

  if (!filePath) {
    return NextResponse.json(
      { error: `Template "${type}.docx" introuvable pour ${client.type_societe}. Déposez le fichier dans templates/${typeFolder}/${type}.docx` },
      { status: 404 }
    );
  }

  // Variables disponibles dans les templates
  const nomPereSansC = client.nom_pere?.replace(/^(Monsieur|Madame|M\.|Mme)\s+/i, '') || '';
  const nomMereSansC = client.nom_mere?.replace(/^(Monsieur|Madame|M\.|Mme)\s+/i, '') || '';

  const vars = {
    // Civilité
    civilite:          client.civilite,
    prenom:            client.prenom,
    nom:               client.nom,
    nom_complet:       `${client.prenom} ${client.nom}`,
    civilite_nom:      `${client.civilite} ${client.prenom} ${client.nom}`,
    date_naissance:    client.date_naissance,
    ville_naissance:   client.ville_naissance,
    cp_naissance:      client.cp_naissance,
    nationalite:       client.nationalite || 'Française',
    adresse:           client.adresse,
    nom_pere:          client.nom_pere || '',
    nom_mere:          client.nom_mere || '',
    nom_pere_sans_civilite: nomPereSansC,
    nom_mere_sans_civilite: nomMereSansC,

    // Société
    denomination:      client.denomination,
    type_societe:      client.type_societe,
    capital:           client.capital?.toLocaleString('fr-FR') || '',
    capital_lettres:   nombreEnLettres(client.capital || 0),
    siege_social:      client.siege_social,
    ville_siege:       client.ville_siege,
    objet_social:      client.objet_social || '',
    nb_actions:        client.nb_actions?.toString() || '',
    valeur_action:     client.nb_actions > 0 ? ((client.capital || 0) / client.nb_actions).toLocaleString('fr-FR') : '1',

    // Signature
    date_signature:    client.date_signature || '',
    ville_signature:   client.ville_signature || '',

    // Date du jour
    date_jour:         new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    annee:             new Date().getFullYear().toString(),
  };

  try {
    const content = fs.readFileSync(filePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render(vars);
    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    const labels = { statuts: 'Statuts', pouvoir: 'Pouvoir', souscripteurs: 'Liste_souscripteurs', dnc: 'DNC' };
    const filename = `${labels[type] || type}_${client.denomination.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: 'Erreur génération : ' + e.message }, { status: 500 });
  }
}

// Conversion nombre → lettres (simplifié, suffisant pour capitaux courants)
function nombreEnLettres(n) {
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

  if (n === 0) return 'zéro';
  if (n < 0) return 'moins ' + nombreEnLettres(-n);

  let result = '';
  if (n >= 1000) {
    const m = Math.floor(n / 1000);
    result += (m === 1 ? 'mille' : nombreEnLettres(m) + ' mille') + ' ';
    n %= 1000;
  }
  if (n >= 100) {
    const c = Math.floor(n / 100);
    result += (c === 1 ? 'cent' : units[c] + ' cent') + ' ';
    n %= 100;
  }
  if (n >= 20) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (t === 7 || t === 9) {
      result += tens[t] + '-' + units[10 + u];
    } else {
      result += tens[t] + (u > 0 ? '-' + units[u] : (t === 8 ? 's' : ''));
    }
  } else if (n > 0) {
    result += units[n];
  }
  return result.trim() + ' euros';
}

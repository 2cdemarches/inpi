const FORMES = {
  SASU: 'Société par Actions Simplifiée Unipersonnelle',
  SAS:  'Société par Actions Simplifiée',
  SARL: 'Société à Responsabilité Limitée',
  EURL: 'Entreprise Unipersonnelle à Responsabilité Limitée',
  SCI:  'Société Civile Immobilière',
  SA:   'Société Anonyme',
};

const GERANT_TITRE = {
  SASU: 'Président',
  SAS:  'Président',
  SARL: 'Gérant',
  EURL: 'Gérant',
  SCI:  'Gérant',
  SA:   'Directeur Général',
};

export function generateAnnonceLegale(client) {
  const forme  = FORMES[client.type_societe]  || client.type_societe || 'Société';
  const titre  = GERANT_TITRE[client.type_societe] || 'Gérant';
  const isUni  = ['SASU', 'EURL'].includes(client.type_societe);

  const siege  = client.siege_social || '';
  const ville  = client.ville_siege  || extraireVille(siege);

  const capital = Number(client.capital || 0).toLocaleString('fr-FR');
  const nbActions = client.nb_actions || client.capital || 0;

  // Objet social : première ligne seulement pour l'annonce
  const objetRaw = (client.objet_social || '').split('\n').map(s => s.trim()).filter(Boolean);
  const objet = objetRaw.join('. ');

  const nomGerant = `${client.civilite || ''} ${client.prenom || ''} ${client.nom || ''}`.trim();
  const neLe      = client.date_naissance ? `né${client.civilite === 'Madame' ? 'e' : ''} le ${client.date_naissance}` : '';
  const aVille    = client.ville_naissance ? `à ${client.ville_naissance}${client.cp_naissance ? ` (${client.cp_naissance})` : ''}` : '';
  const nationalite = client.nationalite ? `, de nationalité ${client.nationalite}` : '';
  const demeurant = client.adresse ? `, demeurant ${client.adresse}` : '';

  const dateActe  = client.date_signature ? `le ${client.date_signature}` : 'récemment';
  const villeActe = client.ville_signature || ville || '';

  let texte = '';

  texte += `Aux termes d'un acte sous seing privé en date du ${dateActe}`;
  if (villeActe) texte += ` à ${villeActe}`;
  texte += `, il a été constitué une société présentant les caractéristiques suivantes :\n\n`;

  texte += `Forme : ${forme}\n`;
  texte += `Dénomination sociale : ${client.denomination || ''}\n`;
  texte += `Siège social : ${siege}\n`;

  if (objet) {
    texte += `Objet social : ${objet}\n`;
  }

  texte += `Durée : 99 ans à compter de son immatriculation au Registre du Commerce et des Sociétés\n`;
  texte += `Capital social : ${capital} euros`;

  if (client.type_societe === 'SASU' || client.type_societe === 'SAS') {
    texte += ` divisé en ${nbActions} action${nbActions > 1 ? 's' : ''} de 1 euro chacune`;
  }
  texte += '\n';

  texte += `${titre} : ${nomGerant}`;
  if (neLe) texte += `, ${neLe}`;
  if (aVille) texte += ` ${aVille}`;
  texte += nationalite;
  texte += demeurant;
  texte += '\n';

  texte += `Immatriculation : au Registre du Commerce et des Sociétés de ${ville || '[ville RCS]'}\n`;

  return texte.trim();
}

function extraireVille(adresse) {
  if (!adresse) return '';
  const m = adresse.match(/\d{5}\s+(.+)$/);
  return m ? m[1].trim() : '';
}

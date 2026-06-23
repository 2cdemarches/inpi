import { generatePdf } from './lib/generate-doc.js';
import fs from 'fs';

const client = {
  civilite: 'Monsieur', prenom: 'Jean', nom: 'DUPONT',
  date_naissance: '15/03/1985', ville_naissance: 'Lyon', cp_naissance: '69001',
  nationalite: 'Française',
  adresse: '12 Rue de la Paix 75001 Paris',
  denomination: 'TEST SOCIETE', type_societe: 'SASU',
  capital: 500, siege_social: '12 Rue de la Paix 75001 Paris',
  ville_siege: 'Paris', date_signature: '22/06/2026', ville_signature: 'Paris',
  nb_actions: 500,
  nom_pere: 'Monsieur Pierre DUPONT', nom_mere: 'Madame Marie MARTIN',
  objet_social: null,
};

try {
  const pdf = await generatePdf('./templates/sasu/originals/statuts.docx', 'statuts', client);
  fs.writeFileSync('C:/Users/conta/Desktop/test-statuts.pdf', pdf);
  console.log('✅ PDF généré → test-statuts.pdf sur le bureau');
} catch (e) {
  console.error('❌', e.message);
}

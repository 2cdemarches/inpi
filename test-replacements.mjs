import mammoth from 'mammoth';

const client = {
  civilite: 'Monsieur', prenom: 'Jean', nom: 'DUPONT',
  date_naissance: '15/03/1985', ville_naissance: 'Lyon', cp_naissance: '69001',
  nationalite: 'Française',
  adresse: '12 Rue de la Paix 75001 Paris',
  denomination: 'TEST SOCIETE', type_societe: 'SASU',
  capital: 500, siege_social: '88 Boulevard Voltaire 75011 Paris',
  ville_siege: 'Paris', date_signature: '22/06/2026', ville_signature: 'Lyon',
  nb_actions: 500, nom_pere: 'Pierre DUPONT', nom_mere: 'Marie MARTIN', objet_social: null,
};

// Importer getReplacements en reconstruisant la logique ici
const r = await mammoth.convertToHtml({ path: './templates/sasu/originals/statuts.docx' });
let html = r.value;

const reps = [
  ['Monsieur Noam Avy Gabriel GALULA', `${client.civilite} ${client.prenom} ${client.nom}`],
  ['Noam Avy Gabriel GALULA', `${client.prenom} ${client.nom}`],
  ['NA2G CONSEIL SOCIETE PAR ACTIONS SIMPLIFIEE UNIPERSONNELLE', `${client.denomination} SOCIETE PAR ACTIONS SIMPLIFIEE UNIPERSONNELLE`],
  ['S.A.S.U NA2G CONSEIL', `S.A.S.U ${client.denomination}`],
  ['NA2G CONSEIL', client.denomination],
  ['135 Avenue de Flandre 75019 Paris', client.siege_social],
  ['100 Euros', `${client.capital} Euros`],
  ['02/08/2002', client.date_naissance],
  ['Boulogne-Billancourt', client.ville_naissance],
  ['(92100)', `(${client.cp_naissance})`],
  ['92100', client.cp_naissance],
  ['de nationalité Française', `de nationalité ${client.nationalite}`],
  ['27/01/2025', client.date_signature],
  ['Fait à Paris', `Fait à ${client.ville_signature}`],
  // Adresse perso après remplacement du siège
  [`demeurant au ${client.siege_social}`, `demeurant au ${client.adresse}`],
];

for (const [from, to] of reps) {
  if (!from || !to) continue;
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  html = html.replace(new RegExp(esc, 'gi'), to);
}

const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// Vérifier
const bad = ['NA2G','GALULA','Noam','02/08/2002','Avenue de Flandre','Boulogne','92100','27/01'];
bad.forEach(k => {
  const i = text.indexOf(k);
  if (i >= 0) console.log(`⚠️ RESTE "${k}": ...${text.substring(i-20, i+50)}...`);
});

// Vérifier les valeurs insérées
['TEST SOCIETE','Jean DUPONT','Lyon','69001','88 Boulevard Voltaire','12 Rue de la Paix','22/06/2026'].forEach(k => {
  const i = text.indexOf(k);
  if (i >= 0) console.log(`✅ "${k}" présent`);
  else console.log(`❌ "${k}" ABSENT`);
});

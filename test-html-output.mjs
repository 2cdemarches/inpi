import mammoth from 'mammoth';
import fs from 'fs';

// Tester avec style map complet
const result = await mammoth.convertToHtml({
  path: './templates/sasu/originals/statuts.docx',
  styleMap: [
    "p[style-name='Heading 1'] => h1:fresh",
    "p[style-name='Heading 2'] => h2:fresh",
    "p[style-name='Heading 3'] => h3:fresh",
    "p[style-name='Title'] => h1.title:fresh",
    "p[style-name='Subtitle'] => p.subtitle:fresh",
  ],
  includeDefaultStyleMap: true,
});

fs.writeFileSync('C:/Users/conta/Desktop/test-statuts.html', result.value);
console.log('✅ HTML écrit sur le bureau : test-statuts.html');
console.log('Messages mammoth:', result.messages.slice(0,5).map(m => m.message));

// Aussi check statuts HTML brut pour voir les balises utilisées
const unique = [...new Set(result.value.match(/<\w+/g))];
console.log('Balises utilisées:', unique.join(', '));

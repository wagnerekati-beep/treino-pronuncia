const fs = require('fs');
const t = JSON.parse(fs.readFileSync('terms.json', 'utf8'));
const cats = ['cargo', 'consultoria', 'processos', 'ia'];
const problems = [];
const ids = new Set();
for (const x of t) {
  const p = [];
  if (!x.id || ids.has(x.id)) p.push('id');
  ids.add(x.id);
  if (!x.term || !x.speak) p.push('term/speak');
  if (!Array.isArray(x.syllables) || x.syllables.length === 0) p.push('syllables');
  if (typeof x.stress !== 'number' || x.stress < 0 || x.stress >= x.syllables.length) p.push('stress');
  if (!x.error || !x.enPhrase || !x.ptSentence || !x.note) p.push('textos');
  if (!cats.includes(x.category)) p.push('category');
  const temMaiuscula = x.syllables.some(s => s === s.toUpperCase() && /[A-Z]/.test(s));
  if (!temMaiuscula) p.push('nenhuma silaba em MAIUSCULA');
  const tonicaMaiuscula = x.syllables[x.stress] === x.syllables[x.stress].toUpperCase();
  if (!tonicaMaiuscula) p.push('stress aponta para silaba minuscula: ' + x.syllables[x.stress]);
  if (p.length) problems.push(x.id + ' -> ' + p.join(', '));
}
const porCat = {};
t.forEach(x => porCat[x.category] = (porCat[x.category] || 0) + 1);
console.log('Total de termos:', t.length);
console.log('Por categoria:', JSON.stringify(porCat));
console.log('IDs unicos:', ids.size);
console.log('Problemas:', problems.length ? problems : 'nenhum');
console.log('');
console.log('--- 36 termos, tonica destacada ---');
t.forEach((x, i) => {
  const s = x.syllables.map(y => (y === y.toUpperCase() && /[A-Z]/.test(y)) ? '[' + y + ']' : y).join('-');
  console.log(String(i + 1).padStart(2) + '. ' + (x.sigla ? x.sigla + ' = ' : '') + x.term.padEnd(30) + ' ' + s.padEnd(40) + ' erro: ' + x.error);
});

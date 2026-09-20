/* Empacota o app inteiro num único HTML, para abrir pelo Claude no celular.
   O app do GitHub Pages continua sendo os arquivos soltos: isto aqui é só uma cópia
   de conveniência. Rode com: node build-artifact.js */
const fs = require('fs');
const path = require('path');

const raiz = __dirname;
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');

const html = ler('index.html');
const css = ler('styles.css');
const js = ler('app.js');
const termos = JSON.parse(ler('terms.json'));

const corpo = html.match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/\s*<script src="app\.js"><\/script>\s*/, '\n');

// Aviso específico da versão que roda dentro do Claude, antes do campo Versão.
const avisoClaude = `
  <div class="campo">
    <label>Esta é a versão para o Claude</label>
    <p class="ajuda" style="margin:0">Abre pelo app do Claude, sem instalar nada. O que muda em relação à versão instalada no celular: aqui não dá para instalar na tela inicial nem usar offline, e a gravação só funciona se o Claude liberar o microfone. Ouvir, Devagar, a sílaba tônica e a repetição espaçada funcionam igual. O progresso desta versão é separado do progresso da versão instalada.</p>
  </div>
`;

const corpoFinal = corpo.replace(
  /(\s*)<div class="campo">\s*<label>Versão<\/label>/,
  `$1${avisoClaude.trim()}$1<div class="campo">\n    <label>Versão</label>`
);

const saida = `<title>Treino de Pronúncia</title>
<style>
${css}
</style>
${corpoFinal}
<script>
window.__SEM_SW__ = true;
window.__TERMOS__ = ${JSON.stringify(termos)};
</script>
<script>
${js}
</script>
`;

const destino = path.join(raiz, 'build');
if (!fs.existsSync(destino)) fs.mkdirSync(destino);
const arquivo = path.join(destino, 'claude-mobile.html');
fs.writeFileSync(arquivo, saida, 'utf8');

console.log('gerado: ' + arquivo);
console.log('tamanho: ' + (Buffer.byteLength(saida, 'utf8') / 1024).toFixed(1) + ' KB');
console.log('termos embutidos: ' + termos.length);
console.log('aviso do Claude inserido: ' + (corpoFinal !== corpo));

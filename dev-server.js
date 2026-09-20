// Servidor estático só para testar no computador. O app em si não precisa dele:
// no GitHub Pages os arquivos são servidos direto. Rode com: node dev-server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5173;
const ROOT = __dirname;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const alvo = path.join(ROOT, path.normalize(rel).replace(/^([.][.][/\\])+/, ''));
  if (!alvo.startsWith(ROOT)) {
    res.writeHead(403).end('403');
    return;
  }
  fs.readFile(alvo, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(alvo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    }).end(buf);
  });
}).listen(PORT, () => {
  console.log('Treino de Pronúncia rodando em http://localhost:' + PORT);
});

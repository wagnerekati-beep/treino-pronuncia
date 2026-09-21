/* Service worker: casca do app + terms.json em cache, estratégia cache-first.
   Troque a VERSAO para publicar uma atualização sem precisar desinstalar o app. */
var VERSAO = 'pronuncia-v2';
var ARQUIVOS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './terms.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(VERSAO).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.filter(function (n) { return n !== VERSAO; }).map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  ev.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (achou) {
      if (achou) return achou;
      return fetch(req).then(function (resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var copia = resp.clone();
          caches.open(VERSAO).then(function (c) { c.put(req, copia); });
        }
        return resp;
      }).catch(function () {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});

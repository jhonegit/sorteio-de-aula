/* Guarda o app no aparelho para abrir sem internet.
   Ao mudar qualquer arquivo, troque o número do CACHE (v1 -> v2 -> v3...). */

var CACHE = 'sorteio-v1';

var ARQUIVOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ARQUIVOS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys()
      .then(function (chaves) {
        return Promise.all(chaves.map(function (k) {
          if (k !== CACHE) return caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evento) {
  if (evento.request.method !== 'GET') return;
  if (new URL(evento.request.url).origin !== self.location.origin) return;

  // entrega na hora o que está guardado e, em segundo plano,
  // busca a versão nova para a próxima vez que o app abrir
  evento.respondWith(
    caches.match(evento.request).then(function (guardado) {
      var rede = fetch(evento.request).then(function (resposta) {
        if (resposta && resposta.status === 200 && resposta.type === 'basic') {
          var copia = resposta.clone();
          caches.open(CACHE).then(function (c) { c.put(evento.request, copia); });
        }
        return resposta;
      }).catch(function () {
        return guardado || caches.match('./index.html');
      });
      return guardado || rede;
    })
  );
});

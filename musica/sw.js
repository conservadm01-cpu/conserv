// Service worker: guarda o app inteiro no aparelho para funcionar sem
// internet. Estratégia: cache primeiro, rede como reserva.

const CACHE = 'msa-v1';
const ARQUIVOS = [
  './', './index.html', './manifest.webmanifest', './css/estilo.css',
  './icones/icone.svg', './icones/icone-192.png', './icones/icone-512.png',
  './js/app.js', './js/aleatorio.js', './js/armazenamento.js', './js/audio.js',
  './js/certificado.js', './js/download.js', './js/jogos.js', './js/musica.js', './js/notacao.js',
  './js/quiz.js', './js/conteudo/fases.js', './js/conteudo/geradores.js',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(
    caches.match(evento.request).then((guardado) => guardado || fetch(evento.request).then((resposta) => {
      if (resposta.ok && new URL(evento.request.url).origin === location.origin) {
        const copia = resposta.clone();
        caches.open(CACHE).then((cache) => cache.put(evento.request, copia));
      }
      return resposta;
    }).catch(() => caches.match('./index.html'))),
  );
});

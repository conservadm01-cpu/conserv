// Service worker: guarda o app inteiro no aparelho para funcionar sem
// internet. Estratégia: cache primeiro, rede como reserva.

const CACHE = 'msa-v5';
const ARQUIVOS = [
  './', './index.html', './manifest.webmanifest', './css/estilo.css',
  './icones/icone.svg', './icones/icone-192.png', './icones/icone-512.png',
  './js/app.js', './js/aleatorio.js', './js/armazenamento.js', './js/audio.js',
  './js/certificado.js', './js/download.js', './js/jogos.js', './js/musica.js', './js/notacao.js',
  './js/quiz.js', './js/senha.js', './js/ficha.js', './js/plataforma.js',
  './js/conteudo/apoio.js', './js/conteudo/fases.js', './js/conteudo/fases-instrumento.js',
  './js/conteudo/geradores.js', './js/conteudo/instrumentos.js', './js/conteudo/trilhas.js',
  './js/dados/deposito.js', './js/dados/esquema.js', './js/dados/ids.js',
  './js/dados/compatibilidade.js', './js/dados/permissoes.js', './js/dados/semente.js',
  './js/dados/migracao.js', './js/dados/repositorios.js',
  './js/servicos/catalogo.js', './js/servicos/eventos.js', './js/servicos/progresso.js',
  './js/servicos/desempenho.js', './js/servicos/gamificacao.js', './js/servicos/auditoria.js',
  './js/servicos/avaliacoes.js', './js/servicos/certificados.js', './js/servicos/estudo.js',
  './js/servicos/recomendacao.js', './js/servicos/alertas.js', './js/servicos/relatorios.js',
  './js/servicos/importacao.js',
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

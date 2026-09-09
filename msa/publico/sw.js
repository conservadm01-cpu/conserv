// Trabalhador de serviço: o app funcionando sem internet.
//
// A promessa da tela de entrada é "tudo fica guardado só neste aparelho, sem
// servidor e sem internet". Hospedado, isso só é verdade se a própria página
// ficar guardada — senão o aluno abre o app no ônibus e vê a tela de erro do
// navegador. É só para isso que este arquivo existe.
//
// A estratégia é REDE PRIMEIRO para a página. Cache primeiro seria mais rápido
// e traria um problema pior que a lentidão: uma correção publicada hoje só
// chegaria ao aluno quando o cache dele vencesse — e ninguém saberia dizer
// quando. Com rede primeiro, quem está on-line sempre recebe a versão de agora,
// e o cache só entra quando a rede falha.

const CACHE = 'msa-v1';
const CASCA = ['./', './index.html', './manifest.webmanifest', './icone.svg', './icone-mascara.svg'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CASCA))
      // Um arquivo que não entrou no cache não pode impedir a instalação: o
      // app continua funcionando pela rede, que é o caminho normal.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Guarda uma cópia da resposta, quando ela vale a pena ser guardada.
async function guardar(pedido, resposta) {
  if (!resposta || !resposta.ok || resposta.type === 'opaque') return resposta;
  const cache = await caches.open(CACHE);
  await cache.put(pedido, resposta.clone());
  return resposta;
}

async function redePrimeiro(pedido) {
  try {
    return await guardar(pedido, await fetch(pedido));
  } catch (erro) {
    // Sem rede: devolve o que estiver guardado. Para uma navegação, a página
    // inteira serve — o app é uma só, e as rotas vivem depois do "#".
    return (await caches.match(pedido))
      || (await caches.match('./index.html'))
      || Response.error();
  }
}

async function cachePrimeiro(pedido) {
  const guardada = await caches.match(pedido);
  if (guardada) return guardada;
  try {
    return await guardar(pedido, await fetch(pedido));
  } catch (erro) {
    return Response.error();
  }
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  const ehPagina = pedido.mode === 'navigate'
    || (pedido.headers.get('accept') || '').includes('text/html');
  evento.respondWith(ehPagina ? redePrimeiro(pedido) : cachePrimeiro(pedido));
});

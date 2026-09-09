// Servidor local, para ver o app como a Vercel vai servi-lo.
//
// Serve a pasta `publico/` com os mesmos cabeçalhos do `vercel.json` — CSP
// inclusive. Se algo quebrar por causa de um cabeçalho, quebra aqui, na sua
// máquina, e não depois do deploy.
//
//   npm start            → http://localhost:4321
//   PORT=8080 npm start

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(AQUI, 'publico');
const PORTA = Number(process.env.PORT || 4321);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

const config = JSON.parse(fs.readFileSync(path.join(AQUI, '..', 'vercel.json'), 'utf8'));
const paraTodos = (config.headers || []).find((h) => h.source === '/(.*)');
const CABECALHOS = Object.fromEntries((paraTodos ? paraTodos.headers : [])
  // O HSTS só faz sentido em https: mandá-lo por http trancaria o localhost
  // do navegador da pessoa, e ela levaria um tempo até descobrir por quê.
  .filter((h) => h.key !== 'Strict-Transport-Security')
  .map((h) => [h.key, h.value]));

http.createServer((req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const pedido = path.join(PUBLICO, caminho === '/' ? 'index.html' : caminho);
  const existe = pedido.startsWith(PUBLICO) && fs.existsSync(pedido) && fs.statSync(pedido).isFile();
  // O que não existe cai na página — o app é uma só, e as rotas vivem depois
  // do "#". É o mesmo `rewrites` do vercel.json.
  const arquivo = existe ? pedido : path.join(PUBLICO, 'index.html');
  res.writeHead(200, { ...CABECALHOS, 'content-type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
  res.end(fs.readFileSync(arquivo));
}).listen(PORTA, () => {
  console.log(`Estudo Musical — MSA em http://localhost:${PORTA}`);
  console.log('Instrutor: admin / ccb123');
});

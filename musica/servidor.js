#!/usr/bin/env node
// Servidor estático mínimo, só com o que vem no Node, para abrir o app no
// computador ou no celular da mesma rede:  node musica/servidor.js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const RAIZ = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORTA = Number(process.env.PORTA || process.env.PORT || 4173);

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

const servidor = createServer(async (requisicao, resposta) => {
  const caminho = decodeURIComponent(new URL(requisicao.url, 'http://local').pathname);
  const arquivo = join(RAIZ, normalize(caminho === '/' ? '/index.html' : caminho));
  if (!arquivo.startsWith(RAIZ)) {
    resposta.writeHead(403).end('Fora da pasta do aplicativo.');
    return;
  }
  try {
    const conteudo = await readFile(arquivo);
    resposta.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream' });
    resposta.end(conteudo);
  } catch {
    resposta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Arquivo não encontrado.');
  }
});

servidor.listen(PORTA, () => {
  const enderecos = Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Estudo Musical no ar em http://localhost:${PORTA}`);
  enderecos.forEach((endereco) => console.log(`No celular da mesma rede: http://${endereco}:${PORTA}`));
});

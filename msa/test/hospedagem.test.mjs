// A hospedagem: o que a Vercel serve, com que cabeçalhos, e o app abrindo sem
// internet. O servidor dos testes usa os mesmos cabeçalhos do vercel.json.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirApp, CABECALHOS } from './apoio.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..', '..');
const PUBLICO = path.join(AQUI, '..', 'publico');

let app;
before(async () => { app = await abrirApp(); });
after(async () => { await app.fechar(); });

test('o vercel.json aponta para a pasta pública e não roda build nenhum', () => {
  const config = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
  assert.equal(config.outputDirectory, 'msa/publico');
  // O package.json da raiz tem um script de build do ERP: se a Vercel o
  // executasse, o deploy do app de estudo quebraria por um motivo que não é dele.
  assert.equal(config.buildCommand, '');
  assert.equal(config.installCommand, '');
  assert.equal(config.framework, null);
});

test('a pasta pública tem só o que deve ser servido', () => {
  const arquivos = fs.readdirSync(PUBLICO).sort();
  assert.deepEqual(arquivos, [
    'icone-mascara.svg', 'icone.svg', 'index.html', 'manifest.webmanifest', 'sw.js',
  ]);
});

test('o .vercelignore mantém os testes e o ERP fora do deploy', () => {
  const ignorados = fs.readFileSync(path.join(RAIZ, '.vercelignore'), 'utf8');
  for (const alvo of ['msa/test', 'msa/node_modules', 'server', 'web', 'musica', '.env']) {
    assert.ok(new RegExp(`^${alvo.replace('.', '\\.')}$`, 'm').test(ignorados), `faltou ignorar ${alvo}`);
  }
});

test('a página vem com a política de segurança e sem sniffing de tipo', () => {
  assert.match(CABECALHOS['Content-Security-Policy'], /default-src 'self'/);
  assert.match(CABECALHOS['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(CABECALHOS['Content-Security-Policy'], /object-src 'none'/);
  assert.equal(CABECALHOS['X-Content-Type-Options'], 'nosniff');
  assert.equal(CABECALHOS['Referrer-Policy'], 'no-referrer');
});

test('o app não busca nada fora do próprio endereço', async () => {
  const forasteiros = [];
  app.pagina.on('request', (r) => {
    if (!r.url().startsWith(app.endereco) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) {
      forasteiros.push(r.url());
    }
  });
  await app.reiniciar();
  await app.entrar('admin', 'ccb123');
  await app.ir('#/instrutor/relatorios');
  assert.deepEqual(forasteiros, [], 'a promessa é "sem internet": nada pode sair daqui');
});

test('o manifesto descreve o app e aponta para ícones que existem', async () => {
  const manifesto = JSON.parse(fs.readFileSync(path.join(PUBLICO, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifesto.lang, 'pt-BR');
  assert.equal(manifesto.display, 'standalone');
  assert.equal(manifesto.start_url, './');
  assert.ok(manifesto.icons.length >= 2);
  for (const icone of manifesto.icons) {
    assert.ok(fs.existsSync(path.join(PUBLICO, icone.src)), `ícone ausente: ${icone.src}`);
  }
  assert.ok(manifesto.icons.some((i) => i.purpose === 'maskable'), 'falta o ícone recortável do Android');
});

test('a página pede o manifesto e o ícone quando está hospedada', async () => {
  await app.reiniciar();
  await app.pagina.waitForTimeout(300);
  assert.ok(app.pedidos.includes('/manifest.webmanifest'), 'o manifesto não foi pedido');
  assert.ok(app.pedidos.includes('/icone.svg'), 'o ícone não foi pedido');
});

test('o trabalhador de serviço assume, e o app abre sem internet', async () => {
  await app.reiniciar();
  const registrou = await app.pagina.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return Boolean(r && r.active);
  });
  assert.equal(registrou, true, 'o trabalhador de serviço não ficou ativo');

  // Guarda a casca e, aí sim, tira a internet do meio.
  await app.pagina.reload();
  await app.pagina.waitForSelector('#usuario');
  await app.pagina.context().setOffline(true);
  try {
    await app.pagina.reload();
    await app.pagina.waitForSelector('#usuario', { timeout: 10000 });
    assert.match(await app.texto(), /Usuário/, 'sem internet, o app tem de abrir do cache');
    // E continua sendo um app: dá para entrar e estudar offline.
    await app.entrar('admin', 'ccb123');
    assert.equal(await app.rota(), '#/instrutor');
  } finally {
    await app.pagina.context().setOffline(false);
  }
});

test('o trabalhador de serviço busca a rede antes do cache', () => {
  const sw = fs.readFileSync(path.join(PUBLICO, 'sw.js'), 'utf8');
  // Rede primeiro para a página é o que faz uma correção publicada hoje chegar
  // ao aluno hoje. Se um dia isto virar cache primeiro, que seja de propósito.
  assert.match(sw, /ehPagina \? redePrimeiro\(pedido\) : cachePrimeiro\(pedido\)/);
  assert.match(sw, /caches\.keys\(\)/, 'o cache antigo precisa ser apagado ao trocar de versão');
});

test('nada disso derrubou o aplicativo', () => {
  assert.deepEqual(app.erros, []);
});

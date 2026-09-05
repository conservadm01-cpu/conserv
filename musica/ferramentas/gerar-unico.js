#!/usr/bin/env node
// Junta o app inteiro (HTML + CSS + módulos) num único arquivo .html, que
// abre direto no navegador, roda sem servidor e pode ser mandado por
// mensagem para o aluno.  Uso:  node musica/ferramentas/gerar-unico.js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = join(APP, 'dist');

// Ordem de dependência dos módulos (o app não tem ciclos).
const MODULOS = [
  'js/aleatorio.js', 'js/musica.js', 'js/notacao.js', 'js/audio.js', 'js/download.js',
  'js/conteudo/fases.js', 'js/conteudo/geradores.js', 'js/armazenamento.js',
  'js/quiz.js', 'js/certificado.js', 'js/jogos.js', 'js/app.js',
];

const chaveDoModulo = (caminho) => caminho.replace(/^js\//, '').replace(/\.js$/, '');

function resolverImport(origem, alvo) {
  const base = dirname(join('js', origem.replace(/^js\//, '')));
  return chaveDoModulo(join(base, alvo).replace(/\\/g, '/'));
}

// Reescreve um módulo ES em uma função que devolve os seus exports.
function empacotar(caminho, fonte) {
  const exportados = [];
  let corpo = fonte;

  corpo = corpo.replace(/^import\s*\*\s*as\s+([\p{L}\p{N}_$]+)\s+from\s+['"]([^'"]+)['"];?$/gmu,
    (_, nome, alvo) => `const ${nome} = __modulos['${resolverImport(caminho, alvo)}'];`);
  corpo = corpo.replace(/^import\s*\{([^}]+)\}\s*from\s+['"]([^'"]+)['"];?$/gm,
    (_, nomes, alvo) => `const {${nomes.replace(/\s+as\s+/g, ': ')}} = __modulos['${resolverImport(caminho, alvo)}'];`);

  corpo = corpo.replace(/^export\s+((?:async\s+)?(?:const|let|function|class))\s+([\p{L}\p{N}_$]+)/gmu, (_, tipo, nome) => {
    exportados.push(nome);
    return `${tipo} ${nome}`;
  });
  corpo = corpo.replace(/^export\s*\{([^}]+)\};?$/gm, (_, lista) => {
    lista.split(',').forEach((item) => exportados.push(item.trim().split(/\s+as\s+/).pop().trim()));
    return '';
  });

  if (/^export /m.test(corpo)) throw new Error(`Sobrou um export não tratado em ${caminho}`);

  return `__modulos['${chaveDoModulo(caminho)}'] = (function () {\n${corpo}\nreturn { ${exportados.join(', ')} };\n})();`;
}

const semServiceWorker = (fonte) => fonte.replace(/\/\/ \[inicio-service-worker\][\s\S]*?\/\/ \[fim-service-worker\]/, '');

async function construir() {
  const css = await readFile(join(APP, 'css/estilo.css'), 'utf8');
  const partes = [];
  for (const caminho of MODULOS) {
    const fonte = semServiceWorker(await readFile(join(APP, caminho), 'utf8'));
    partes.push(empacotar(caminho, fonte));
  }
  const script = `const __modulos = {};\n${partes.join('\n\n')}`;

  const miolo = `<title>Estudo Musical — MSA</title>
<style>
${css}
</style>
<main id="tela"><p class="aviso">Carregando…</p></main>
<div id="area-impressao" aria-hidden="true"></div>
<script>
${script}
<\/script>`;

  const completo = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#2f9e6b">
${miolo}
</head>
</html>`;

  await mkdir(SAIDA, { recursive: true });
  await writeFile(join(SAIDA, 'msa-app.html'), completo);
  await writeFile(join(SAIDA, 'msa-miolo.html'), miolo);
  console.log(`Arquivo único: ${join(SAIDA, 'msa-app.html')} (${Math.round(completo.length / 1024)} KB)`);
  console.log(`Miolo sem <html>/<head>: ${join(SAIDA, 'msa-miolo.html')}`);
}

construir().catch((erro) => { console.error(erro); process.exit(1); });

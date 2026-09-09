// Todo módulo novo precisa ser registrado em dois lugares: no empacotador do
// arquivo único e na lista do service worker. Esquecer disso não quebra nada
// no servidor de desenvolvimento — quebra só o arquivo único e o modo offline,
// que é onde ninguém olha. Já aconteceu uma vez (js/plataforma.js ficou de
// fora e o arquivo único parou de abrir). Este teste é o alarme.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

function modulosNoDisco(pasta = 'js') {
  const encontrados = [];
  for (const nome of readdirSync(join(APP, pasta))) {
    const relativo = `${pasta}/${nome}`;
    if (statSync(join(APP, relativo)).isDirectory()) encontrados.push(...modulosNoDisco(relativo));
    else if (nome.endsWith('.js')) encontrados.push(relativo);
  }
  return encontrados;
}

const modulos = modulosNoDisco();

test('todo módulo está registrado no empacotador do arquivo único', () => {
  const fonte = readFileSync(join(APP, 'ferramentas/gerar-unico.js'), 'utf8');
  const faltando = modulos.filter((m) => !fonte.includes(`'${m}'`));
  assert.deepEqual(faltando, [], 'módulos fora do empacotador quebram o arquivo único');
});

test('todo módulo está na lista do service worker', () => {
  const fonte = readFileSync(join(APP, 'sw.js'), 'utf8');
  const faltando = modulos.filter((m) => !fonte.includes(`'./${m}'`));
  assert.deepEqual(faltando, [], 'módulos fora do service worker quebram o modo offline');
});

test('o empacotador lista os módulos na ordem de dependência', () => {
  const fonte = readFileSync(join(APP, 'ferramentas/gerar-unico.js'), 'utf8');
  const lista = [...fonte.matchAll(/'(js\/[^']+\.js)'/g)].map((m) => m[1]);
  const posicao = new Map(lista.map((m, i) => [m, i]));

  for (const modulo of lista) {
    const codigo = readFileSync(join(APP, modulo), 'utf8');
    const importados = [...codigo.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const alvo of importados) {
      if (!alvo.startsWith('.')) continue;
      const resolvido = join(dirname(modulo), alvo).replace(/\\/g, '/');
      if (!posicao.has(resolvido)) continue;
      assert.ok(posicao.get(resolvido) < posicao.get(modulo),
        `${modulo} usa ${resolvido}, que precisa vir antes dele na lista`);
    }
  }
});

// O banco de perguntas. Não há questão escrita à mão: cada uma nasce de um
// gerador, com variantes. Este teste passa por TODAS as variantes de TODAS as
// fases e confere que cada pergunta gerada é uma pergunta válida — porque uma
// alternativa repetida ou uma resposta certa fora da lista só apareceria para
// o aluno, no meio da avaliação, se ninguém olhasse antes.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp } from './apoio.mjs';

let app;
before(async () => { app = await abrirApp(); });
after(async () => { await app.fechar(); });

// Roda os geradores de um instrumento e devolve o que estiver errado.
const auditar = (app, instrumento, sementes) => app.pagina.evaluate(([inst, quantas]) => {
  const { universoDaFase } = __modulos['conteudo/geradores'];
  const { criarAleatorio } = __modulos['aleatorio'];
  const { trilhasDoAluno } = __modulos['conteudo/trilhas'];
  const problemas = [];
  let geradas = 0;

  for (const fase of trilhasDoAluno(inst).todas) {
    const contexto = fase.contexto || null;
    const universo = universoDaFase(fase.id, contexto);
    if (!universo.length) { problemas.push(`fase ${fase.id} sem nenhuma pergunta possível`); continue; }
    for (const item of universo) {
      for (let s = 1; s <= quantas; s++) {
        const onde = `${inst} · fase ${fase.id} · ${item.assinatura}`;
        let q;
        try { q = item.gerador.montar(item.variante, criarAleatorio(s * 7919 + item.assinatura.length), contexto); }
        catch (erro) { problemas.push(`${onde}: estourou — ${erro.message}`); continue; }
        geradas++;
        if (!q || !q.enunciado) { problemas.push(`${onde}: sem enunciado`); continue; }
        if (!Array.isArray(q.alternativas) || q.alternativas.length < 2) { problemas.push(`${onde}: alternativas de menos`); continue; }
        if (!q.alternativas.includes(q.correta)) problemas.push(`${onde}: a resposta certa não está entre as alternativas`);
        if (new Set(q.alternativas).size !== q.alternativas.length) problemas.push(`${onde}: alternativa repetida`);
        if (!q.explicacao) problemas.push(`${onde}: sem explicação`);
        if (!q.referencia) problemas.push(`${onde}: sem referência ao método`);
        const tudo = `${q.enunciado}|${q.alternativas.join('|')}|${q.explicacao}`;
        if (/undefined|NaN|\[object/.test(tudo)) problemas.push(`${onde}: buraco no texto — ${q.enunciado}`);
      }
    }
  }
  return { geradas, problemas: problemas.slice(0, 20), total: problemas.length };
}, [instrumento, sementes]);

test('todas as perguntas da trilha de teoria e do instrumento são válidas', async () => {
  const { geradas, problemas, total } = await auditar(app, 'viola', 3);
  assert.ok(geradas > 4000, `esperava milhares de perguntas, vieram ${geradas}`);
  assert.deepEqual(problemas, [], `${total} problemas no banco de perguntas`);
});

test('a trilha do instrumento é válida para todos os instrumentos do catálogo', async () => {
  const instrumentos = await app.pagina.evaluate(() =>
    __modulos['conteudo/instrumentos'].INSTRUMENTOS.map((i) => i.id));
  assert.ok(instrumentos.length >= 20);
  for (const instrumento of instrumentos) {
    const { problemas, total } = await auditar(app, instrumento, 1);
    assert.deepEqual(problemas, [], `${total} problemas em ${instrumento}`);
  }
});

test('toda fase do MSA tem pergunta, e nenhuma ficou órfã', async () => {
  const vazias = await app.pagina.evaluate(() => {
    const { totalDeVariantes } = __modulos['conteudo/geradores'];
    return __modulos['dados/repositorios'].fasesDoMetodo('msa')
      .map((f) => ({ fase: f.ordem, titulo: f.titulo, variantes: totalDeVariantes(f.id) }))
      .filter((f) => f.variantes === 0);
  });
  assert.deepEqual(vazias, [], 'toda fase do livro precisa ter perguntas');
});

test('cada bloco tem perguntas inéditas de sobra para mais de uma avaliação', async () => {
  // A unidade avaliada é o BLOCO: a prova sorteia das fases dele juntas, e é
  // por bloco que a folga de perguntas inéditas precisa existir.
  const magros = await app.pagina.evaluate(() => {
    const { totalDeVariantes } = __modulos['conteudo/geradores'];
    return __modulos['servicos/blocos'].blocosDoMetodo('msa')
      .map((b) => ({
        id: b.id,
        variantes: b.faseIds.reduce((soma, faseId) => soma + totalDeVariantes(faseId), 0),
      }))
      .filter((b) => b.variantes < 40);
  });
  assert.deepEqual(magros, []);
});

test('as fases do método do instrumento também têm perguntas de sobra', async () => {
  const magras = await app.pagina.evaluate(() => {
    const { totalDeVariantes } = __modulos['conteudo/geradores'];
    return __modulos['conteudo/trilhas'].trilhasDoAluno('viola').todas
      .filter((f) => /^inst/.test(f.id))
      .map((f) => ({ id: f.id, variantes: totalDeVariantes(f.id, f.contexto || null) }))
      .filter((f) => f.variantes < 30);
  });
  assert.deepEqual(magras, []);
});

test('a correção conta acertos e aplica a nota mínima', async () => {
  const conta = await app.pagina.evaluate(() => {
    const { montarProva, corrigir, NOTA_MINIMA } = __modulos['quiz'];
    const prova = montarProva('1', [], { semente: 12345 });
    const certas = prova.questoes.map((q) => q.correta);
    const tudoCerto = corrigir(prova, certas);
    const tudoErrado = corrigir(prova, prova.questoes.map(() => 'nada disso'));
    const seteDeDez = corrigir(prova, certas.map((c, i) => (i < 7 ? c : 'nada disso')));
    const seisDeDez = corrigir(prova, certas.map((c, i) => (i < 6 ? c : 'nada disso')));
    return { NOTA_MINIMA, tudoCerto, tudoErrado, seteDeDez, seisDeDez };
  });
  assert.equal(conta.NOTA_MINIMA, 70);
  assert.equal(conta.tudoCerto.nota, 100);
  assert.equal(conta.tudoCerto.aprovado, true);
  assert.equal(conta.tudoErrado.nota, 0);
  assert.equal(conta.tudoErrado.aprovado, false);
  assert.equal(conta.seteDeDez.aprovado, true);
  assert.equal(conta.seisDeDez.aprovado, false);
});

test('a mesma semente devolve exatamente a mesma prova', async () => {
  const iguais = await app.pagina.evaluate(() => {
    const { montarProva } = __modulos['quiz'];
    const a = montarProva('4', [], { semente: 777 }).questoes.map((q) => q.enunciado);
    const b = montarProva('4', [], { semente: 777 }).questoes.map((q) => q.enunciado);
    const c = montarProva('4', [], { semente: 778 }).questoes.map((q) => q.enunciado);
    return { mesma: JSON.stringify(a) === JSON.stringify(b), outra: JSON.stringify(a) === JSON.stringify(c) };
  });
  assert.equal(iguais.mesma, true);
  assert.equal(iguais.outra, false, 'sementes diferentes deveriam dar provas diferentes');
});

test('nada disso derrubou o aplicativo', () => {
  assert.deepEqual(app.erros, []);
});

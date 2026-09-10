// Os blocos: o MSA avalia a cada três fases.
//
// A separação que estes testes protegem: a FASE é a unidade de estudo — dela
// são as lições e os jogos —, e o BLOCO é a unidade de avaliação — dele são a
// prova, a nota, a liberação do que vem depois e o selo.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp, autocadastrar } from './apoio.mjs';

let app;
before(async () => { app = await abrirApp(); });
after(async () => { await app.fechar(); });
beforeEach(async () => { await app.reiniciar(); });

/** Faz a prova do bloco pelos mesmos serviços que a tela usa. */
const avaliar = (app, alunoId, blocoId, acertar) => app.pagina.evaluate(([alvo, id, quantasCertas]) => {
  const B = __modulos['servicos/blocos'];
  const bloco = B.blocoPorId(id);
  const prova = B.montar(bloco, { alunoId: alvo });
  const respostas = prova.questoes.map((q, i) => (i < quantasCertas ? q.correta : 'resposta errada'));
  const resultado = B.corrigir(prova, respostas, bloco);
  B.registrarTentativa({ alunoId: alvo, bloco, prova, resultado });
  if (resultado.aprovado) {
    __modulos['servicos/certificados'].emitir({
      alunoId: alvo, fase: B.comoFase(bloco), nota: resultado.nota,
      acertos: resultado.acertos, total: resultado.total,
    });
  }
  return resultado;
}, [alunoId, blocoId, acertar]);

test('o MSA tem 16 fases do livro, repartidas em 6 blocos de três', async () => {
  const r = await app.pagina.evaluate(() => {
    const R = __modulos['dados/repositorios'];
    return {
      fases: R.fasesDoMetodo('msa').map((f) => ({ ordem: f.ordem, titulo: f.titulo, paginas: f.paginas })),
      blocos: __modulos['servicos/blocos'].blocosDoMetodo('msa').map((b) => ({ id: b.id, fases: b.faseIds })),
    };
  });
  assert.equal(r.fases.length, 16);
  assert.equal(r.fases[0].titulo, 'Música, som e escrita');
  assert.equal(r.fases[0].paginas, '9 a 16');
  assert.equal(r.fases[15].titulo, 'Frases e interpretação musical');
  assert.equal(r.fases[15].paginas, '136 a 157');

  assert.deepEqual(r.blocos, [
    { id: 'b1', fases: ['1', '2', '3'] },
    { id: 'b2', fases: ['4', '5', '6'] },
    { id: 'b3', fases: ['7', '8', '9'] },
    { id: 'b4', fases: ['10', '11', '12'] },
    { id: 'b5', fases: ['13', '14', '15'] },
    // 16 não é múltiplo de 3: o último bloco fica com a fase que sobra.
    { id: 'b6', fases: ['16'] },
  ]);
});

test('cada fase está em exatamente um bloco, e a avaliação é do bloco', async () => {
  const r = await app.pagina.evaluate(() => {
    const R = __modulos['dados/repositorios'];
    const B = __modulos['servicos/blocos'];
    return {
      semBloco: R.fasesDoMetodo('msa').filter((f) => !B.blocoDaFase(f.id)).map((f) => f.ordem),
      avaliacoesDeFaseNoMsa: R.avaliacoes.listar((a) => a.faseId && R.fasesDoMetodo('msa').some((f) => f.id === a.faseId)).length,
      avaliacoesDeBloco: R.avaliacoes.listar((a) => Boolean(a.blocoId)).length,
      problemas: R.problemasDeEstrutura(),
    };
  });
  assert.deepEqual(r.semBloco, []);
  assert.equal(r.avaliacoesDeFaseNoMsa, 0, 'no MSA não existe avaliação por fase');
  assert.equal(r.avaliacoesDeBloco, 6, 'uma avaliação por bloco');
  assert.deepEqual(r.problemas, []);
});

test('a prova do bloco sorteia das fases dele juntas', async () => {
  const id = await autocadastrar(app);
  const origem = await app.pagina.evaluate((alvo) => {
    const B = __modulos['servicos/blocos'];
    const bloco = B.blocoPorId('b1');
    const prova = B.montar(bloco, { alunoId: alvo });
    // O gerador de cada questão diz de que fase ela veio.
    const fases = new Set(prova.questoes.map((q) => String(q.geradorId).split('.')[0]));
    return { questoes: prova.questoes.length, fases: [...fases].sort(), blocoId: prova.blocoId };
  }, id);
  assert.equal(origem.questoes, 10);
  assert.equal(origem.blocoId, 'b1');
  assert.ok(origem.fases.length >= 2, `esperava perguntas de mais de uma fase, vieram de ${origem.fases}`);
});

test('as três fases do bloco 1 nascem abertas; as do bloco 2, não', async () => {
  await autocadastrar(app);
  await app.ir('#/');
  for (const fase of ['1', '2', '3']) {
    const classes = await app.pagina.$eval(`a[href="#/fase/${fase}"]`, (e) => e.className);
    assert.doesNotMatch(classes, /trancada/, `a fase ${fase} é do bloco 1 e deveria estar aberta`);
  }
  // A fase trancada não abre: o cartão dela leva ao bloco, onde está escrito
  // o que falta para abri-la.
  for (const fase of ['4', '7', '16']) {
    assert.equal(await app.pagina.$(`a[href="#/fase/${fase}"]`), null,
      `a fase ${fase} não é do bloco 1 e não deveria abrir`);
  }
  for (const bloco of ['b2', 'b3', 'b6']) {
    assert.ok(await app.pagina.$(`a[href="#/bloco/${bloco}"]`), `o cartão trancado deveria levar ao ${bloco}`);
  }
});

test('reprovar no bloco não conclui fase nenhuma nem abre o seguinte', async () => {
  const id = await autocadastrar(app);
  const resultado = await avaliar(app, id, 'b1', 5);   // 50%
  assert.equal(resultado.aprovado, false);

  const depois = await app.pagina.evaluate((alvo) => ({
    b1: __modulos['servicos/blocos'].blocoAprovado(alvo, 'b1'),
    b2liberado: __modulos['servicos/blocos'].blocoLiberado(alvo, __modulos['servicos/blocos'].blocoPorId('b2')),
    fase1: __modulos['armazenamento'].faseAprovada('1', alvo),
    selos: __modulos['dados/repositorios'].certificadosDoAluno(alvo).length,
  }), id);
  assert.deepEqual(depois, { b1: false, b2liberado: false, fase1: false, selos: 0 });
});

test('aprovar o bloco conclui as três fases de uma vez e abre o seguinte', async () => {
  const id = await autocadastrar(app);
  const resultado = await avaliar(app, id, 'b1', 10);
  assert.equal(resultado.nota, 100);
  assert.equal(resultado.aprovado, true);

  const depois = await app.pagina.evaluate((alvo) => {
    const banco = __modulos['armazenamento'];
    const B = __modulos['servicos/blocos'];
    return {
      fases: ['1', '2', '3', '4'].map((f) => banco.faseAprovada(f, alvo)),
      b2liberado: B.blocoLiberado(alvo, B.blocoPorId('b2')),
      b3liberado: B.blocoLiberado(alvo, B.blocoPorId('b3')),
    };
  }, id);
  assert.deepEqual(depois.fases, [true, true, true, false], 'só as três fases do bloco');
  assert.equal(depois.b2liberado, true);
  assert.equal(depois.b3liberado, false, 'o bloco 3 espera o bloco 2');
});

test('o selo é um por bloco, e o rótulo diz o intervalo de fases', async () => {
  const id = await autocadastrar(app);
  await avaliar(app, id, 'b1', 10);
  const selos = await app.pagina.evaluate((alvo) =>
    __modulos['dados/repositorios'].certificadosDoAluno(alvo)
      .map((c) => ({ faseId: c.faseId, rotulo: c.rotulo, nota: c.nota })), id);
  assert.equal(selos.length, 1, 'uma prova, um selo — e não três');
  assert.equal(selos[0].faseId, 'b1');
  assert.equal(selos[0].rotulo, 'Fases 1 a 3');

  await app.ir('#/selo/b1');
  const selo = await app.texto();
  assert.match(selo, /SELO DE FASES CONCLUÍDAS/i);
  assert.match(selo, /Fases 1 a 3/);
  assert.match(selo, /Ana Teste/);
  assert.doesNotMatch(selo, /certificado/i, 'a palavra "certificado" não aparece para o aluno');
});

test('a mesma pergunta não volta a cair no mesmo bloco', async () => {
  const id = await autocadastrar(app);
  const vistas = await app.pagina.evaluate((alvo) => {
    const B = __modulos['servicos/blocos'];
    const bloco = B.blocoPorId('b1');
    const todas = [];
    for (let rodada = 0; rodada < 5; rodada++) {
      const prova = B.montar(bloco, { alunoId: alvo });
      todas.push(...prova.questoes.map((q) => q.assinatura));
      B.registrarUsadasDoBloco(alvo, bloco.id, prova.questoes.map((q) => q.assinatura));
    }
    return todas;
  }, id);
  assert.equal(vistas.length, 50);
  assert.equal(new Set(vistas).size, 50, 'houve pergunta repetida dentro do bloco');
});

test('a tela da fase aponta para a avaliação do bloco, e não oferece prova própria', async () => {
  await autocadastrar(app);
  await app.ir('#/fase/2');
  const tela = await app.texto();
  assert.match(tela, /avalia a cada três fases/i);
  assert.match(tela, /fases 1 a 3/i);
  assert.equal(await app.pagina.$('[data-acao="iniciar-prova"]'), null, 'a fase não tem prova própria');
  assert.ok(await app.pagina.$('a[href="#/bloco/b1"]'), 'a fase precisa apontar para o bloco');
});

test('a tela do bloco mostra as fases, o que falta e a avaliação', async () => {
  await autocadastrar(app);
  await app.ir('#/bloco/b1');
  const tela = await app.texto();
  assert.match(tela, /Fases 1 a 3/);
  assert.match(tela, /Música, som e escrita/);
  assert.match(tela, /Figuras, compasso e pulsação/);
  assert.match(tela, /Endecagrama e solfejo/);
  assert.match(tela, /Aprovação a partir de/);
  assert.ok(await app.pagina.$('[data-acao="iniciar-prova-bloco"]'));
});

test('o bloco trancado não abre a avaliação nem pelo botão', async () => {
  await autocadastrar(app);
  await app.ir('#/bloco/b3');
  assert.match(await app.texto(), /ainda está.*trancado/is);
  assert.equal(await app.pagina.$('[data-acao="iniciar-prova-bloco"]'), null);

  const recusa = await app.pagina.evaluate(() => {
    const B = __modulos['servicos/blocos'];
    const aluno = __modulos['armazenamento'].alunoAtual();
    return B.blocoLiberado(aluno.id, B.blocoPorId('b3'));
  });
  assert.equal(recusa, false);
});

test('a prova do bloco vai até o fim pela tela, e o resultado grava', async () => {
  const id = await autocadastrar(app);
  await app.ir('#/bloco/b1');
  await app.pagina.click('[data-acao="iniciar-prova-bloco"]');
  await app.pagina.waitForTimeout(250);
  assert.match(await app.texto(), /Questão 1 de 10/);

  for (let i = 0; i < 10; i++) {
    const alternativas = await app.pagina.$$('.alternativa:not([disabled])');
    await alternativas[0].click();
    await app.pagina.waitForTimeout(60);
    await (await app.pagina.$('[data-acao="proxima"]')).click();
    await app.pagina.waitForTimeout(120);
  }
  assert.match(await app.texto(), /de 10 questões certas/);

  const guardado = await app.pagina.evaluate((alvo) =>
    __modulos['dados/repositorios'].resultadosDoAluno(alvo, 'b1'), id);
  assert.equal(guardado.length, 1);
  assert.equal(guardado[0].faseId, 'b1');
});

test('o método do instrumento continua avaliando fase a fase', async () => {
  await autocadastrar(app);
  const r = await app.pagina.evaluate(() => {
    const B = __modulos['servicos/blocos'];
    return {
      blocos: B.blocosDoMetodo('instrumento').length,
      avaliaPorBloco: B.avaliaPorBloco('instrumento'),
      temAvaliacaoDeFase: Boolean(__modulos['dados/repositorios'].avaliacaoDaFase('inst1')),
    };
  });
  assert.deepEqual(r, { blocos: 0, avaliaPorBloco: false, temAvaliacaoDeFase: true });

  await app.ir('#/fase/inst1');
  assert.ok(await app.pagina.$('[data-acao="iniciar-prova"]'), 'a fase do instrumento tem prova própria');
});

test('a tela inicial agrupa as fases do MSA sob a faixa de cada bloco', async () => {
  await autocadastrar(app);
  await app.ir('#/');

  const faixas = await app.pagina.$$eval('.faixa-bloco', (ns) => ns.map((n) => ({
    destino: n.getAttribute('href'),
    texto: n.textContent.replace(/\s+/g, ' ').trim(),
  })));
  assert.equal(faixas.length, 6, 'seis blocos, seis faixas');
  assert.deepEqual(faixas.map((f) => f.destino),
    ['#/bloco/b1', '#/bloco/b2', '#/bloco/b3', '#/bloco/b4', '#/bloco/b5', '#/bloco/b6']);
  assert.match(faixas[0].texto, /Fases 1 a 3/);
  assert.match(faixas[1].texto, /trancado/, 'o bloco que ainda não abriu diz isso na faixa');

  // Cada faixa traz a sua lista: 3, 3, 3, 3, 3 e 1 — as dezesseis fases do
  // livro. A trilha do instrumento não tem blocos e continua numa lista só.
  const listas = await app.pagina.$$eval('.lista-fases',
    (ns) => ns.map((n) => n.querySelectorAll('.cartao-fase').length));
  assert.deepEqual(listas.slice(0, 6), [3, 3, 3, 3, 3, 1]);
});

test('nada disso derrubou o aplicativo', () => {
  assert.deepEqual(app.erros, []);
});

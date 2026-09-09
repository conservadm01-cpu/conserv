// O caminho do aluno: lição, jogo, avaliação, certificado — e o que fica
// guardado depois de cada passo.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp, MASTER, autocadastrar } from './apoio.mjs';

let app;
before(async () => { app = await abrirApp(); });
after(async () => { await app.fechar(); });
beforeEach(async () => { await app.reiniciar(); });

test('o aluno recém-cadastrado começa na fase 1, com as demais trancadas', async () => {
  await autocadastrar(app);
  const trancadas = await app.pagina.$$eval('.cartao-fase.trancada', (e) => e.length);
  const abertas = await app.pagina.$$eval('.cartao-fase:not(.trancada)', (e) => e.length);
  assert.equal(abertas, 2, 'a primeira fase de cada trilha nasce aberta');
  assert.ok(trancadas > 0, 'as demais ficam trancadas');
});

test('abrir uma lição a marca como lida e alimenta o histórico', async () => {
  const id = await autocadastrar(app);
  await app.ir('#/fase/1/licao/0');
  assert.match(await app.texto(), /Lição 1 de 3/);
  const lidas = await app.pagina.evaluate((alvo) =>
    __modulos['armazenamento'].faseDoAluno('1', alvo).licoesLidas, id);
  assert.deepEqual(lidas, [0]);
  await app.ir('#/historico');
  assert.match(await app.texto(), /Som, ruído e música/);
});

test('todas as lições e todos os jogos de todas as fases desenham', async () => {
  await autocadastrar(app);
  await app.pagina.evaluate(() => __modulos['armazenamento'].ativarModoTeste());
  const fases = await app.pagina.evaluate(() =>
    __modulos['conteudo/trilhas'].trilhasDoAluno('viola').todas
      .map((f) => ({ id: f.id, licoes: f.licoes.length, jogos: f.jogos.length })));
  assert.equal(fases.length, 14);

  for (const fase of fases) {
    for (let i = 0; i < fase.licoes; i++) {
      await app.ir(`#/fase/${fase.id}/licao/${i}`);
      const texto = await app.texto();
      assert.ok(texto.length > 200, `lição ${fase.id}/${i} saiu vazia`);
      assert.doesNotMatch(texto, /undefined|\[object Object\]/, `lição ${fase.id}/${i} com buraco no texto`);
    }
    for (let j = 0; j < fase.jogos; j++) {
      await app.ir(`#/fase/${fase.id}/jogo/${j}`);
      await app.pagina.waitForTimeout(250);
      const montou = await app.pagina.$$eval('#palco-jogo *', (e) => e.length);
      assert.ok(montou > 0, `jogo ${fase.id}/${j} não montou`);
    }
  }
  assert.deepEqual(app.erros, []);
});

test('a avaliação responde, corrige e registra a tentativa', async () => {
  const id = await autocadastrar(app);
  await app.ir('#/fase/1');
  await app.pagina.click('[data-acao="iniciar-prova"]');
  await app.pagina.waitForTimeout(250);
  assert.match(await app.texto(), /Questão 1 de 10/);

  for (let i = 0; i < 10; i++) {
    const alternativas = await app.pagina.$$('.alternativa:not([disabled])');
    assert.ok(alternativas.length >= 2, `a questão ${i + 1} precisa de alternativas`);
    await alternativas[0].click();
    await app.pagina.waitForTimeout(80);
    // Respondida, a certa fica marcada e a explicação aparece — sempre.
    assert.equal(await app.pagina.$$eval('.alternativa.certa', (e) => e.length), 1);
    assert.equal(await app.pagina.$$eval('.retorno[hidden]', (e) => e.length), 0);
    await (await app.pagina.$('[data-acao="proxima"]')).click();
    await app.pagina.waitForTimeout(150);
  }

  const resultado = await app.texto();
  assert.match(resultado, /Resultado/);
  assert.match(resultado, /de 10 questões certas/);

  const guardado = await app.pagina.evaluate((alvo) =>
    __modulos['dados/repositorios'].resultadosDoAluno(alvo), id);
  assert.equal(guardado.length, 1);
  assert.equal(guardado[0].total, 10);
  assert.equal(guardado[0].faseId, '1');
});

test('a mesma pergunta não cai duas vezes para o mesmo aluno', async () => {
  const id = await autocadastrar(app);
  const assinaturas = await app.pagina.evaluate((alvo) => {
    const banco = __modulos['armazenamento'];
    const { montar } = __modulos['servicos/avaliacoes'];
    const fase = __modulos['conteudo/trilhas'].faseporId('1', 'viola');
    const vistas = [];
    for (let rodada = 0; rodada < 5; rodada++) {
      const prova = montar(fase, banco.usadasDaFase('1', alvo));
      const desta = prova.questoes.map((q) => q.assinatura);
      vistas.push(...desta);
      banco.registrarUsadas('1', desta, alvo);
    }
    return vistas;
  }, id);
  assert.equal(assinaturas.length, 50);
  assert.equal(new Set(assinaturas).size, 50, 'houve pergunta repetida');
});

test('abrir a avaliação por link direto desenha a primeira questão', async () => {
  await autocadastrar(app);
  await app.ir('#/fase/1/prova');
  await app.pagina.waitForTimeout(250);
  const texto = await app.texto();
  assert.doesNotMatch(texto, /Preparando a avaliação/);
  assert.match(texto, /Questão 1 de 10/);
});

test('recarregar a página no meio da avaliação não trava a tela', async () => {
  await autocadastrar(app);
  await app.ir('#/fase/1');
  await app.pagina.click('[data-acao="iniciar-prova"]');
  await app.pagina.waitForTimeout(250);
  await app.pagina.reload();
  await app.pagina.waitForTimeout(500);
  const texto = await app.texto();
  assert.doesNotMatch(texto, /Preparando a avaliação/);
  assert.match(texto, /Questão 1 de 10/);
});

test('aprovar uma fase emite certificado, abre a próxima e conta no painel', async () => {
  const id = await autocadastrar(app);
  // A aprovação é registrada pelos mesmos serviços que a tela de resultado usa.
  await app.pagina.evaluate((alvo) => {
    const fase = __modulos['conteudo/trilhas'].faseporId('1', 'viola');
    const { montar, corrigir, registrarTentativa } = __modulos['servicos/avaliacoes'];
    const prova = montar(fase, []);
    const respostas = prova.questoes.map((q) => q.correta);
    const resultado = corrigir(prova, respostas, fase);
    registrarTentativa({ alunoId: alvo, fase, prova, resultado, duracaoSegundos: 60 });
    __modulos['servicos/certificados'].emitir({
      alunoId: alvo, fase, nota: resultado.nota, acertos: resultado.acertos, total: resultado.total,
    });
  }, id);

  await app.ir('#/certificados');
  const certificados = await app.texto();
  assert.doesNotMatch(certificados, /ainda não tem certificados/);

  await app.ir('#/certificado/1');
  const certificado = await app.texto();
  assert.match(certificado, /Ana Teste/);
  assert.match(certificado, /Código de verificação/);

  await app.ir('#/');
  assert.match(await app.texto(), /1 de 14 fases concluídas/);
  const classes = await app.pagina.$eval('a[href="#/fase/2"]', (e) => e.className);
  assert.doesNotMatch(classes, /trancada/, 'a fase 2 deveria ter aberto');

  await app.sair();
  await app.entrarComoMaster();
  const painel = await app.texto();
  assert.match(painel, /Painel do master/);
  assert.match(painel, /1\nfases vencidas/);
  assert.match(painel, /1\ncertificados/);
});

test('desempenho, conquistas, histórico e ajustes desenham do zero', async () => {
  await autocadastrar(app);
  for (const rota of ['#/desempenho', '#/conquistas', '#/historico', '#/certificados', '#/sobre']) {
    await app.ir(rota);
    assert.ok((await app.texto()).length > 40, `${rota} saiu vazia`);
  }
  await app.ir('#/fase/1/licao/0');
  await app.ir('#/conquistas');
  assert.match(await app.texto(), /Primeira lição/);
});

test('nada disso derrubou o aplicativo', () => {
  assert.deepEqual(app.erros, []);
});

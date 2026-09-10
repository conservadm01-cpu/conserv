// Métodos: cadastrar pela tela, anexar o PDF, escrever fases e lições, e
// editar ou excluir o que já está cadastrado.
//
// O aplicativo NÃO lê o PDF. Transformar um livro em fases, lições e questões
// é trabalho de quem conhece o método: o app roda no aparelho, sem servidor,
// e inventar esse conteúdo seria produzir método que ninguém escreveu. O que
// ele faz é guardar o PDF para o aluno ler e deixar o instrutor dizer, fase a
// fase, em que página está cada assunto.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirApp, MASTER, autocadastrar } from './apoio.mjs';

let app;
let pdf;
before(async () => {
  app = await abrirApp();
  pdf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'msa-')), 'trompete.pdf');
  fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
});
after(async () => { await app.fechar(); });
beforeEach(async () => { await app.reiniciar(); });

/** Cria um método pela tela e devolve o id. */
async function criarMetodo(app, nome = 'Método de trompete') {
  await app.ir('#/instrutor/metodos/novo');
  await app.pagina.fill('#metodo-nome', nome);
  await app.pagina.fill('#metodo-descricao', 'Embocadura, respiração e as primeiras notas.');
  await app.pagina.fill('#metodo-fonte', 'Editora Exemplo, 3ª edição, 2019');
  await app.pagina.click('[data-acao="criar-metodo"]');
  await app.pagina.waitForTimeout(250);
  return (await app.rota()).replace('#/instrutor/metodo/', '');
}

test('a lista traz os métodos cadastrados, com um caminho para editar', async () => {
  await app.entrarComoMaster();
  await app.ir('#/instrutor/metodos');
  const tela = await app.texto();
  assert.match(tela, /Teoria — MSA/);
  assert.match(tela, /Método do instrumento/);
  assert.match(tela, /vem com o aplicativo/);
  assert.ok(await app.pagina.$('a[href="#/instrutor/metodos/novo"]'), 'falta o caminho para cadastrar');
});

test('cadastrar um método pela tela, sem arquivo nenhum', async () => {
  await app.entrarComoMaster();
  const id = await criarMetodo(app);
  const metodo = await app.pagina.evaluate((x) => __modulos['servicos/metodos'].metodoPorId(x), id);
  assert.equal(metodo.nome, 'Método de trompete');
  assert.equal(metodo.fonte, 'Editora Exemplo, 3ª edição, 2019');
  assert.equal(metodo.universal, true);
  // Todo método precisa de uma versão publicada: é ela que congela o conteúdo.
  const versoes = await app.pagina.evaluate((x) => __modulos['dados/repositorios'].versoesDoMetodo(x), id);
  assert.equal(versoes.length, 1);
  assert.equal(versoes[0].situacao, 'publicada');
  assert.deepEqual(await app.pagina.evaluate(() => __modulos['dados/repositorios'].problemasDeEstrutura()), []);
});

test('método sem nome não é criado', async () => {
  await app.entrarComoMaster();
  await app.ir('#/instrutor/metodos/novo');
  await app.pagina.click('[data-acao="criar-metodo"]');
  await app.pagina.waitForTimeout(200);
  assert.match(await app.texto(), /precisa de um nome/i);
});

test('o PDF do método é anexado, e não vai para o localStorage', async () => {
  await app.entrarComoMaster();
  const id = await criarMetodo(app);
  await app.pagina.setInputFiles('#arquivo-pdf-metodo', pdf);
  await app.pagina.waitForTimeout(500);

  assert.match(await app.texto(), /anexado ao método/i);
  const materiais = await app.pagina.evaluate((x) => __modulos['servicos/metodos'].metodoPorId(x).materiais, id);
  assert.equal(materiais.length, 1);
  assert.equal(materiais[0].nome, 'trompete.pdf');
  assert.deepEqual(await app.pagina.evaluate(() => __modulos['arquivos'].identificadores()), [materiais[0].id]);
  const bruto = await app.pagina.evaluate(() => localStorage.getItem('msa.escola.v2'));
  assert.doesNotMatch(bruto, /%PDF/);
});

test('só PDF entra como método', async () => {
  await app.entrarComoMaster();
  const id = await criarMetodo(app);
  const recusa = await app.pagina.evaluate(async (x) => {
    const falso = new File(['nada'], 'metodo.docx', { type: 'application/msword' });
    try { await __modulos['servicos/metodos'].anexarMaterial(x, falso); return null; }
    catch (erro) { return erro.message; }
  }, id);
  assert.match(recusa, /precisa ser um arquivo PDF/);
});

test('as fases entram pela tela, numeradas e encadeadas', async () => {
  await app.entrarComoMaster();
  const id = await criarMetodo(app);
  for (const [titulo, paginas] of [['Os primeiros sons', '9 a 18'], ['Escalas', '19 a 30'], ['Repertório', '31 a 44']]) {
    await app.pagina.fill('#fase-titulo', titulo);
    await app.pagina.fill('#fase-paginas', paginas);
    await app.pagina.click('[data-acao="criar-fase"]');
    await app.pagina.waitForTimeout(200);
  }
  const fases = await app.pagina.evaluate((x) => __modulos['dados/repositorios'].fasesDoMetodo(x), id);
  assert.deepEqual(fases.map((f) => f.ordem), [1, 2, 3]);
  assert.deepEqual(fases.map((f) => f.titulo), ['Os primeiros sons', 'Escalas', 'Repertório']);
  // A corrente: cada fase aponta para a anterior, e é o que tranca a seguinte.
  assert.equal(fases[0].anteriorId, null);
  assert.equal(fases[1].anteriorId, fases[0].id);
  assert.equal(fases[2].anteriorId, fases[1].id);
  // E cada fase nasce com uma avaliação, ainda sem questões.
  for (const fase of fases) {
    const avaliacao = await app.pagina.evaluate((f) => __modulos['dados/repositorios'].avaliacaoDaFase(f), fase.id);
    assert.ok(avaliacao, `a fase ${fase.titulo} devia ter avaliação`);
  }
});

test('remover uma fase do meio costura a corrente e renumera', async () => {
  await app.entrarComoMaster();
  const id = await criarMetodo(app);
  const fases = await app.pagina.evaluate((x) => {
    const m = __modulos['servicos/metodos'];
    return ['Uma', 'Duas', 'Três'].map((t) => m.criarFase(x, { titulo: t }));
  }, id);

  await app.pagina.evaluate((f) => __modulos['servicos/metodos'].removerFase(f), fases[1].id);
  const depois = await app.pagina.evaluate((x) => __modulos['dados/repositorios'].fasesDoMetodo(x), id);
  assert.deepEqual(depois.map((f) => f.titulo), ['Uma', 'Três']);
  assert.deepEqual(depois.map((f) => f.ordem), [1, 2], 'sem buraco na numeração');
  assert.equal(depois[1].anteriorId, depois[0].id, 'a fase seguinte não pode ficar trancada atrás de uma fase que sumiu');
  assert.deepEqual(await app.pagina.evaluate(() => __modulos['dados/repositorios'].problemasDeEstrutura()), []);
});

test('as lições entram com título, página e texto', async () => {
  await app.entrarComoMaster();
  const id = await criarMetodo(app);
  const faseId = await app.pagina.evaluate((x) =>
    __modulos['servicos/metodos'].criarFase(x, { titulo: 'Os primeiros sons', paginas: '9 a 18' }).id, id);

  await app.ir(`#/instrutor/fase/${faseId}`);
  await app.pagina.fill('#licao-titulo', 'Como segurar o instrumento');
  await app.pagina.fill('#licao-pagina', '12');
  await app.pagina.fill('#licao-corpo', 'Primeiro parágrafo.\n\nSegundo parágrafo.');
  await app.pagina.click('[data-acao="criar-licao"]');
  await app.pagina.waitForTimeout(250);

  const licoes = await app.pagina.evaluate((f) => __modulos['dados/repositorios'].licoesDaFase(f), faseId);
  assert.equal(licoes.length, 1);
  assert.equal(licoes[0].titulo, 'Como segurar o instrumento');
  assert.equal(licoes[0].pagina, '12');
  assert.match(licoes[0].corpo, /Segundo parágrafo/);
});

test('o texto da lição entra como parágrafo, nunca como HTML solto', async () => {
  await app.entrarComoMaster();
  const id = await criarMetodo(app);
  const faseId = await app.pagina.evaluate((x) => {
    const m = __modulos['servicos/metodos'];
    const fase = m.criarFase(x, { titulo: 'Fase' });
    m.criarLicao(fase.id, { titulo: 'Lição', corpo: '<img src=x onerror="alert(1)">' });
    return fase.id;
  }, id);
  const corpo = await app.pagina.evaluate((f) => {
    const fase = __modulos['dados/repositorios'].fases.buscar(f);
    const montada = __modulos['servicos/catalogo'].montarFase(fase, { metodo: null, versao: null });
    return montada.licoes[0].corpo();
  }, faseId);
  assert.doesNotMatch(corpo, /<img/);
  assert.match(corpo, /&lt;img/);
});

test('o aluno matriculado abre o PDF do método e lê a lição', async () => {
  await app.entrarComoMaster();
  const id = await criarMetodo(app);
  await app.pagina.setInputFiles('#arquivo-pdf-metodo', pdf);
  await app.pagina.waitForTimeout(500);
  await app.pagina.evaluate((x) => {
    const m = __modulos['servicos/metodos'];
    const fase = m.criarFase(x, { titulo: 'Os primeiros sons', paginas: '9 a 18' });
    m.criarLicao(fase.id, { titulo: 'Como segurar o instrumento', pagina: '12', corpo: 'Apoie o peso no polegar.' });
  }, id);
  await app.sair();

  await autocadastrar(app);
  const tela = await app.texto();
  assert.match(tela, /Meu método/i);
  assert.match(tela, /trompete\.pdf/);
  assert.match(tela, /Método de trompete/);

  // E a lição abre, com o texto que o instrutor escreveu.
  const faseId = await app.pagina.evaluate((x) => __modulos['dados/repositorios'].fasesDoMetodo(x)[0].id, id);
  await app.ir(`#/fase/${faseId}/licao/0`);
  assert.match(await app.texto(), /Apoie o peso no polegar/);
});

test('fase sem questão avisa, em vez de abrir uma avaliação vazia', async () => {
  await app.entrarComoMaster();
  const id = await criarMetodo(app);
  await app.pagina.evaluate((x) => __modulos['servicos/metodos'].criarFase(x, { titulo: 'Os primeiros sons' }), id);
  await app.sair();
  await autocadastrar(app);

  const faseId = await app.pagina.evaluate((x) => __modulos['dados/repositorios'].fasesDoMetodo(x)[0].id, id);
  await app.ir(`#/fase/${faseId}`);
  const tela = await app.texto();
  assert.match(tela, /ainda não tem questões/);
  assert.equal(await app.pagina.$('[data-acao="iniciar-prova"]'), null, 'não pode oferecer a avaliação');

  // E nem por link direto: uma prova de zero questões daria "0 de 0".
  await app.ir(`#/fase/${faseId}/prova`);
  await app.pagina.waitForTimeout(250);
  assert.match(await app.texto(), /ainda não tem questões/);
  assert.doesNotMatch(await app.texto(), /NaN/);
});

test('editar o método muda o que o aluno vê', async () => {
  await app.entrarComoMaster();
  const id = await criarMetodo(app);
  await app.pagina.fill('#metodo-nome', 'Método de trompete — 1ª parte');
  await app.pagina.click('[data-acao="salvar-metodo"]');
  await app.pagina.waitForTimeout(250);
  assert.match(await app.texto(), /Método salvo/);
  assert.equal(await app.pagina.evaluate((x) => __modulos['servicos/metodos'].metodoPorId(x).nome, id),
    'Método de trompete — 1ª parte');
});

test('remover o método leva as fases, as lições e o PDF', async () => {
  await app.entrarComoMaster();
  const id = await criarMetodo(app);
  await app.pagina.setInputFiles('#arquivo-pdf-metodo', pdf);
  await app.pagina.waitForTimeout(500);
  const faseId = await app.pagina.evaluate((x) => {
    const m = __modulos['servicos/metodos'];
    const fase = m.criarFase(x, { titulo: 'Fase' });
    m.criarLicao(fase.id, { titulo: 'Lição' });
    return fase.id;
  }, id);

  await app.pagina.evaluate((x) => __modulos['servicos/metodos'].removerMetodo(x), id);
  await app.pagina.waitForTimeout(400);

  const R = (fn, arg) => app.pagina.evaluate(fn, arg);
  assert.equal(await R((x) => Boolean(__modulos['servicos/metodos'].metodoPorId(x)), id), false);
  assert.equal(await R((f) => __modulos['dados/repositorios'].licoesDaFase(f).length, faseId), 0);
  assert.equal(await R((f) => Boolean(__modulos['dados/repositorios'].avaliacaoDaFase(f)), faseId), false);
  assert.deepEqual(await R(() => __modulos['arquivos'].identificadores()), []);
  assert.deepEqual(await R(() => __modulos['dados/repositorios'].problemasDeEstrutura()), []);
});

test('um método com aluno matriculado não é removido', async () => {
  await app.entrarComoMaster();
  const id = await criarMetodo(app);
  await app.pagina.evaluate(() => __modulos['armazenamento'].criarUsuario({
    nome: 'Ana Teste', comum: 'C', instrumento: 'viola', email: 'a@a.com', whatsapp: '11912345678',
    encarregadoLocal: 'A', encarregadoRegional: 'B', anciao: 'C', senha: 'ana123',
  }));
  const recusa = await app.pagina.evaluate(async (x) => {
    try { await __modulos['servicos/metodos'].removerMetodo(x); return null; }
    catch (erro) { return erro.message; }
  }, id);
  assert.match(recusa, /matriculad/);
});

test('o método que vem com o aplicativo não é removido nem tem fase editada', async () => {
  await app.entrarComoMaster();
  const recusas = await app.pagina.evaluate(async () => {
    const m = __modulos['servicos/metodos'];
    const resultado = {};
    try { await m.removerMetodo('msa'); resultado.remover = null; }
    catch (e) { resultado.remover = e.message; }
    try { m.criarFase('msa', { titulo: 'Nova' }); resultado.fase = null; }
    catch (e) { resultado.fase = e.message; }
    try { m.criarLicao('1', { titulo: 'Nova' }); resultado.licao = null; }
    catch (e) { resultado.licao = e.message; }
    return resultado;
  });
  assert.match(recusas.remover, /vem com o aplicativo/);
  assert.match(recusas.fase, /vêm com o aplicativo|vem com o aplicativo/);
  assert.match(recusas.licao, /vêm com o aplicativo/);

  // Mas o nome, a descrição, a fonte e o PDF, sim: é o método impresso do MSA.
  await app.ir('#/instrutor/metodo/msa');
  assert.match(await app.texto(), /vem com o aplicativo/);
  assert.ok(await app.pagina.$('[data-acao="escolher-pdf-metodo"]'), 'o PDF do MSA pode ser anexado');
  assert.equal(await app.pagina.$('[data-acao="remover-metodo"]'), null);
});

test('matricular os alunos alcança quem já estava cadastrado', async () => {
  await app.entrarComoMaster();
  await app.pagina.evaluate(() => __modulos['armazenamento'].criarUsuario({
    nome: 'Ana Teste', comum: 'C', instrumento: 'viola', email: 'a@a.com', whatsapp: '11912345678',
    encarregadoLocal: 'A', encarregadoRegional: 'B', anciao: 'C', senha: 'ana123',
  }));
  const id = await criarMetodo(app);
  assert.equal(await app.pagina.evaluate((x) => __modulos['servicos/metodos'].alunosNoMetodo(x), id), 0);

  await app.pagina.click('[data-acao="matricular-no-metodo"]');
  await app.pagina.waitForTimeout(250);
  assert.match(await app.texto(), /1 aluno matriculado/);
  assert.equal(await app.pagina.evaluate((x) => __modulos['servicos/metodos'].alunosNoMetodo(x), id), 1);

  // De novo não duplica.
  await app.pagina.click('[data-acao="matricular-no-metodo"]');
  await app.pagina.waitForTimeout(250);
  assert.match(await app.texto(), /já estão nele/);
  assert.equal(await app.pagina.evaluate((x) => __modulos['servicos/metodos'].alunosNoMetodo(x), id), 1);
});

test('o aluno não cadastra método nenhum', async () => {
  await autocadastrar(app);
  await app.ir('#/instrutor/metodos');
  assert.equal(await app.rota(), '#/');
  for (const permissao of ['metodo.cadastrar', 'metodo.editar', 'fase.cadastrar', 'fase.editar']) {
    assert.equal(await app.pagina.evaluate((p) => __modulos['armazenamento'].podeNaSessao(p), permissao), false);
  }
});

test('nada disso derrubou o aplicativo', () => {
  assert.deepEqual(app.erros, []);
});

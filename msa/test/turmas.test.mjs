// Turmas: o grupo, o método em PDF e o critério de aprovação.
//
// O critério é a parte que importa. Ele não é um bilhete que alguém escreve
// sobre o aluno: é conferido contra o que já está gravado. Estes testes olham
// justamente isso — mexeu no critério, a situação de todo mundo muda junto.

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
  // Um PDF mínimo, mas um PDF de verdade: o app recusa qualquer outro tipo.
  pdf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'msa-')), 'metodo.pdf');
  fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
});
after(async () => { await app.fechar(); });
beforeEach(async () => { await app.reiniciar(); });

/** Cria uma turma e matricula um aluno recém-cadastrado. */
async function turmaComAluno(app, criterio = {}) {
  await app.entrarComoMaster();
  return app.pagina.evaluate((c) => {
    const banco = __modulos['armazenamento'];
    const turmas = __modulos['servicos/turmas'];
    const aluno = banco.criarUsuario({
      nome: 'Ana Teste', comum: 'Central', instrumento: 'viola', email: 'ana@exemplo.com',
      whatsapp: '11912345678', encarregadoLocal: 'A', encarregadoRegional: 'B', anciao: 'C', senha: 'ana123',
    });
    const turma = turmas.criarTurma({ nome: 'Teoria 2026', metodoId: 'msa', criterio: c });
    turmas.matricular(turma.id, aluno.id);
    return { turmaId: turma.id, alunoId: aluno.id };
  }, criterio);
}

/** Aprova o aluno numa fase com a nota pedida, pelo mesmo serviço que a tela usa. */
const aprovarFase = (app, alunoId, faseId, nota) => app.pagina.evaluate(([alvo, fase, valor]) => {
  const R = __modulos['dados/repositorios'];
  const linha = R.progressoDoAluno(alvo, fase);
  linha.melhorNota = valor;
  linha.aprovadoEm = new Date().toISOString();
  linha.licoesLidas = R.licoesDaFase(fase).map((_, i) => i);
  R.progressos.salvar(linha);
}, [alunoId, faseId, nota]);

test('a turma tem um link no painel, e a lista começa vazia', async () => {
  await app.entrarComoMaster();
  assert.match(await app.texto(), /Turmas/i);
  await app.ir('#/instrutor/turmas');
  assert.match(await app.texto(), /Nenhuma turma criada ainda/i);
});

test('criar uma turma pelo formulário, com o critério', async () => {
  await app.entrarComoMaster();
  await app.ir('#/instrutor/turmas/nova');
  await app.pagina.fill('#turma-nome', 'Teoria — quinta-feira');
  await app.pagina.fill('#turma-comum', 'Central');
  await app.pagina.fill('#turma-responsavel', 'Irmão José');
  await app.pagina.fill('#criterio-nota', '80');
  await app.pagina.fill('#criterio-fases', '3');
  await app.pagina.fill('#criterio-media', '85');
  await app.pagina.click('[data-acao="criar-turma"]');
  await app.pagina.waitForTimeout(250);

  assert.match(await app.rota(), /^#\/instrutor\/turma\//);
  const turma = await app.pagina.evaluate(() => __modulos['servicos/turmas'].turmas()[0]);
  assert.equal(turma.nome, 'Teoria — quinta-feira');
  assert.equal(turma.metodoId, 'msa');
  assert.deepEqual(turma.criterio, {
    notaMinima: 80, fasesParaConcluir: 3, licoesObrigatorias: true, mediaMinima: 85,
  });
  assert.deepEqual(await app.pagina.evaluate(() => __modulos['dados/repositorios'].problemasDeEstrutura()), []);
});

test('turma sem nome não é criada', async () => {
  await app.entrarComoMaster();
  await app.ir('#/instrutor/turmas/nova');
  await app.pagina.click('[data-acao="criar-turma"]');
  await app.pagina.waitForTimeout(200);
  assert.match(await app.texto(), /precisa de um nome/i);
  assert.equal(await app.pagina.evaluate(() => __modulos['servicos/turmas'].turmas().length), 0);
});

test('a nota mínima da turma passa a valer para as fases do método', async () => {
  const { alunoId } = await turmaComAluno(app, { notaMinima: 85 });
  const minima = await app.pagina.evaluate((alvo) => {
    const fase = __modulos['conteudo/trilhas'].faseporId('1', 'viola');
    return __modulos['servicos/progresso'].notaMinimaDaFase(fase, alvo);
  }, alunoId);
  assert.equal(minima, 85, 'a turma manda mais que o padrão do aplicativo');

  // E a correção da prova usa essa nota: 80% não aprova numa turma que pede 85.
  const correcao = await app.pagina.evaluate((alvo) => {
    const fase = __modulos['conteudo/trilhas'].faseporId('1', 'viola');
    const { montar, corrigir } = __modulos['servicos/avaliacoes'];
    const prova = montar(fase, []);
    const oitenta = prova.questoes.map((q, i) => (i < 8 ? q.correta : 'errado'));
    return corrigir(prova, oitenta, fase, alvo);
  }, alunoId);
  assert.equal(correcao.nota, 80);
  assert.equal(correcao.notaMinima, 85);
  assert.equal(correcao.aprovado, false);
});

test('sem turma, a nota mínima continua sendo a do aplicativo', async () => {
  await autocadastrar(app);
  const minima = await app.pagina.evaluate(() => {
    const fase = __modulos['conteudo/trilhas'].faseporId('1', 'viola');
    const aluno = __modulos['armazenamento'].alunoAtual();
    return __modulos['servicos/progresso'].notaMinimaDaFase(fase, aluno.id);
  });
  assert.equal(minima, 70);
});

test('o critério é conferido contra o que está gravado, item por item', async () => {
  const { turmaId, alunoId } = await turmaComAluno(app, {
    notaMinima: 80, fasesParaConcluir: 2, licoesObrigatorias: true, mediaMinima: 90,
  });

  const situacao = () => app.pagina.evaluate(([t, a]) => {
    const turmas = __modulos['servicos/turmas'];
    return turmas.situacaoNaTurma(turmas.turmaPorId(t), a);
  }, [turmaId, alunoId]);

  let agora = await situacao();
  assert.equal(agora.aprovado, false);
  assert.equal(agora.concluidas, 0);
  assert.equal(agora.exigidas, 2);
  assert.deepEqual(agora.itens.map((i) => i.cumpre), [false, false, false]);

  // Uma fase com 95%: falta a segunda.
  await aprovarFase(app, alunoId, '1', 95);
  agora = await situacao();
  assert.equal(agora.concluidas, 1);
  assert.equal(agora.aprovado, false);

  // A segunda com 70% não conta: a turma pede 80 em cada avaliação.
  await aprovarFase(app, alunoId, '2', 70);
  agora = await situacao();
  assert.equal(agora.concluidas, 1, 'fase abaixo da nota mínima não entra na conta');
  assert.equal(agora.aprovado, false);

  // Refeita com 85: as duas fases entram, mas a média (90) fica em 90.
  await aprovarFase(app, alunoId, '2', 85);
  agora = await situacao();
  assert.equal(agora.concluidas, 2);
  assert.equal(agora.media, 90);
  assert.equal(agora.aprovado, true, '95 e 85 dão média 90, que é o pedido');
});

test('mexer no critério muda a situação de todo mundo junto', async () => {
  const { turmaId, alunoId } = await turmaComAluno(app, { notaMinima: 70, fasesParaConcluir: 1 });
  await aprovarFase(app, alunoId, '1', 75);

  const aprovadoCom = (criterio) => app.pagina.evaluate(([t, a, c]) => {
    const turmas = __modulos['servicos/turmas'];
    turmas.definirCriterio(t, c);
    return turmas.situacaoNaTurma(turmas.turmaPorId(t), a).aprovado;
  }, [turmaId, alunoId, criterio]);

  assert.equal(await aprovadoCom({ notaMinima: 70 }), true);
  assert.equal(await aprovadoCom({ notaMinima: 80 }), false, 'subiu a régua, o aluno deixa de cumprir');
  assert.equal(await aprovadoCom({ notaMinima: 70 }), true, 'e volta a cumprir quando ela desce');
});

test('as lições podem ser dispensadas do critério', async () => {
  const { turmaId, alunoId } = await turmaComAluno(app, {
    notaMinima: 70, fasesParaConcluir: 1, licoesObrigatorias: true,
  });
  // Fase aprovada, mas nenhuma lição aberta.
  await app.pagina.evaluate((a) => {
    const R = __modulos['dados/repositorios'];
    const linha = R.progressoDoAluno(a, '1');
    linha.melhorNota = 90;
    linha.aprovadoEm = new Date().toISOString();
    linha.licoesLidas = [];
    R.progressos.salvar(linha);
  }, alunoId);

  const aprovadoCom = (criterio) => app.pagina.evaluate(([t, a, c]) => {
    const turmas = __modulos['servicos/turmas'];
    turmas.definirCriterio(t, c);
    return turmas.situacaoNaTurma(turmas.turmaPorId(t), a).aprovado;
  }, [turmaId, alunoId, criterio]);

  assert.equal(await aprovadoCom({ licoesObrigatorias: true }), false);
  assert.equal(await aprovadoCom({ licoesObrigatorias: false }), true);
});

// ------------------------------------------------------------------ material

test('o método em PDF é anexado, e não vai para o localStorage', async () => {
  const { turmaId } = await turmaComAluno(app);
  await app.ir(`#/instrutor/turma/${turmaId}`);
  await app.pagina.setInputFiles('#arquivo-material', pdf);
  await app.pagina.waitForTimeout(500);

  assert.match(await app.texto(), /anexado/i);
  const materiais = await app.pagina.evaluate((t) => __modulos['servicos/turmas'].turmaPorId(t).materiais, turmaId);
  assert.equal(materiais.length, 1);
  assert.equal(materiais[0].nome, 'metodo.pdf');
  assert.equal(materiais[0].tipo, 'application/pdf');
  assert.ok(materiais[0].tamanho > 0);

  // Os bytes ficam no guardador de arquivos, não no depósito do cadastro.
  const guardados = await app.pagina.evaluate(() => __modulos['arquivos'].identificadores());
  assert.deepEqual(guardados, [materiais[0].id]);
  const bruto = await app.pagina.evaluate(() => localStorage.getItem('msa.escola.v2'));
  assert.doesNotMatch(bruto, /%PDF/, 'o PDF não pode entrar no localStorage');
});

test('só PDF entra como material', async () => {
  const { turmaId } = await turmaComAluno(app);
  const recusa = await app.pagina.evaluate(async (t) => {
    const falso = new File(['nada disso'], 'planilha.csv', { type: 'text/csv' });
    try { await __modulos['servicos/turmas'].anexarMaterial(t, falso); return null; }
    catch (erro) { return erro.message; }
  }, turmaId);
  assert.match(recusa, /precisa ser um arquivo PDF/);
});

test('o limite é 65 MB, e vale para a turma e para o método', async () => {
  const { turmaId } = await turmaComAluno(app);
  const limites = await app.pagina.evaluate(() => ({
    guardador: __modulos['arquivos'].TAMANHO_MAXIMO,
    turma: __modulos['servicos/turmas'].MATERIAL_MAXIMO,
    metodo: __modulos['servicos/metodos'].MATERIAL_MAXIMO,
  }));
  assert.equal(limites.guardador, 65 * 1024 * 1024);
  assert.equal(limites.turma, limites.guardador, 'o limite mora num lugar só');
  assert.equal(limites.metodo, limites.guardador);

  // A tela diz o mesmo número que a regra usa.
  await app.ir(`#/instrutor/turma/${turmaId}`);
  assert.match(await app.texto(), /até 65 MB por arquivo/);

  // Um arquivo maior é recusado, dizendo o tamanho e o limite.
  const recusa = await app.pagina.evaluate(async (t) => {
    const gigante = new File([new Uint8Array(1)], 'grande.pdf', { type: 'application/pdf' });
    Object.defineProperty(gigante, 'size', { value: 70 * 1024 * 1024 });
    try { await __modulos['servicos/turmas'].anexarMaterial(t, gigante); return null; }
    catch (erro) { return erro.message; }
  }, turmaId);
  assert.match(recusa, /70 MB/);
  assert.match(recusa, /limite é 65 MB/);
});

test('um PDF de vários MB é guardado inteiro e volta inteiro', async () => {
  const { turmaId } = await turmaComAluno(app);
  // 12 MB: passa longe do que o localStorage aguentaria, e é o ponto de guardar
  // os bytes no IndexedDB.
  const conferido = await app.pagina.evaluate(async (t) => {
    const bytes = new Uint8Array(12 * 1024 * 1024);
    bytes.set(new TextEncoder().encode('%PDF-1.4\n'), 0);
    bytes[bytes.length - 1] = 42;
    const arquivo = new File([bytes], 'metodo-grande.pdf', { type: 'application/pdf' });
    const ficha = await __modulos['servicos/turmas'].anexarMaterial(t, arquivo);
    const devolta = await __modulos['arquivos'].ler(ficha.id);
    const lidos = new Uint8Array(await devolta.arrayBuffer());
    return { tamanho: ficha.tamanho, guardado: lidos.length, ultimo: lidos[lidos.length - 1] };
  }, turmaId);
  assert.equal(conferido.tamanho, 12 * 1024 * 1024);
  assert.equal(conferido.guardado, 12 * 1024 * 1024);
  assert.equal(conferido.ultimo, 42, 'o último byte precisa voltar igual');

  const bruto = await app.pagina.evaluate(() => localStorage.getItem('msa.escola.v2'));
  assert.ok(bruto.length < 200 * 1024, 'o depósito do cadastro não pode crescer com o PDF');
});

test('remover o material leva os bytes junto', async () => {
  const { turmaId } = await turmaComAluno(app);
  await app.ir(`#/instrutor/turma/${turmaId}`);
  await app.pagina.setInputFiles('#arquivo-material', pdf);
  await app.pagina.waitForTimeout(500);
  await app.pagina.click('[data-acao="remover-material"]');
  await app.pagina.waitForTimeout(400);

  assert.equal(await app.pagina.evaluate((t) => __modulos['servicos/turmas'].turmaPorId(t).materiais.length, turmaId), 0);
  assert.deepEqual(await app.pagina.evaluate(() => __modulos['arquivos'].identificadores()), []);
});

test('remover a turma leva o material junto', async () => {
  const { turmaId } = await turmaComAluno(app);
  await app.ir(`#/instrutor/turma/${turmaId}`);
  await app.pagina.setInputFiles('#arquivo-material', pdf);
  await app.pagina.waitForTimeout(500);
  await app.pagina.evaluate((t) => __modulos['servicos/turmas'].removerTurma(t), turmaId);
  await app.pagina.waitForTimeout(400);

  assert.equal(await app.pagina.evaluate(() => __modulos['servicos/turmas'].turmas().length), 0);
  assert.deepEqual(await app.pagina.evaluate(() => __modulos['arquivos'].identificadores()), []);
});

// ------------------------------------------------------------- o aluno vê

test('o aluno vê a turma, o que se pede dele e o método para abrir', async () => {
  const { turmaId } = await turmaComAluno(app, { notaMinima: 80, fasesParaConcluir: 2 });
  await app.ir(`#/instrutor/turma/${turmaId}`);
  await app.pagina.setInputFiles('#arquivo-material', pdf);
  await app.pagina.waitForTimeout(500);

  await app.sair();
  await app.entrar('Ana Teste', 'ana123');
  const tela = await app.texto();
  assert.match(tela, /Minha turma/i);
  assert.match(tela, /Teoria 2026/);
  assert.match(tela, /2 fases concluídas com 80% ou mais/);
  assert.match(tela, /metodo\.pdf/);
});

test('quem não é da equipe não cria nem edita turma', async () => {
  await autocadastrar(app);
  await app.ir('#/instrutor/turmas');
  assert.equal(await app.rota(), '#/', 'o aluno não alcança a área da equipe');
  for (const permissao of ['turma.criar', 'turma.editar', 'turma.material', 'turma.remover']) {
    assert.equal(await app.pagina.evaluate((p) => __modulos['armazenamento'].podeNaSessao(p), permissao), false);
  }
});

test('encarregado e ministério veem a turma, e não mexem nela', async () => {
  await app.entrarComoMaster();
  await app.pagina.evaluate(() => {
    const banco = __modulos['armazenamento'];
    banco.aprovarSolicitacao(banco.pedirAcesso({
      nome: 'Carlos Encarregado', papelPretendido: 'ENCARREGADO', comum: 'Central', senha: 'carlos1',
    }).id);
    __modulos['servicos/turmas'].criarTurma({ nome: 'Teoria 2026', metodoId: 'msa' });
  });
  await app.sair();
  await app.entrar('Carlos Encarregado', 'carlos1');

  assert.match(await app.texto(), /Turmas/i);
  await app.ir('#/instrutor/turmas');
  assert.match(await app.texto(), /Teoria 2026/);
  assert.equal(await app.pagina.$('a[href="#/instrutor/turmas/nova"]'), null, 'não oferece criar');
  assert.equal(await app.pagina.evaluate(() => __modulos['armazenamento'].podeNaSessao('turma.criar')), false);
});

test('a turma encerrada para de mandar na nota mínima', async () => {
  const { turmaId, alunoId } = await turmaComAluno(app, { notaMinima: 90 });
  const minima = () => app.pagina.evaluate((alvo) => {
    const fase = __modulos['conteudo/trilhas'].faseporId('1', 'viola');
    return __modulos['servicos/progresso'].notaMinimaDaFase(fase, alvo);
  }, alunoId);
  assert.equal(await minima(), 90);
  await app.pagina.evaluate((t) => __modulos['servicos/turmas'].encerrarTurma(t), turmaId);
  assert.equal(await minima(), 70, 'turma encerrada não decide mais nada');
});

test('nada disso derrubou o aplicativo', () => {
  assert.deepEqual(app.erros, []);
});

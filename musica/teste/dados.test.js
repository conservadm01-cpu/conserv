// Testes da arquitetura de dados do V2: entidades, validações, repositórios,
// perfis de acesso e a regra de que um método pode ter qualquer número de
// fases.
import test from 'node:test';
import assert from 'node:assert/strict';

const { criarDepositoEmMemoria } = await import('../js/dados/deposito.js');
const esquema = await import('../js/dados/esquema.js');
const R = await import('../js/dados/repositorios.js');
const permissoes = await import('../js/dados/permissoes.js');
const semente = await import('../js/dados/semente.js');

const recomecar = () => R.usarDeposito(criarDepositoEmMemoria());

test('o esquema descreve as catorze entidades', () => {
  assert.equal(esquema.NOMES_DAS_ENTIDADES.length, 14);
  for (const nome of ['instrumentos', 'metodos', 'fases', 'licoes', 'exercicios', 'jogos',
    'avaliacoes', 'questoes', 'alunos', 'usuarios', 'progressos', 'resultados',
    'certificados', 'configuracoes']) {
    assert.ok(esquema.ENTIDADES[nome], `falta a entidade ${nome}`);
  }
});

test('a semente traz o conteúdo que já existia, sem inventar nada', () => {
  const catalogo = semente.semear();
  assert.equal(catalogo.metodos.length, 2);
  assert.equal(catalogo.fases.filter((f) => f.metodoId === 'msa').length, 10);
  assert.equal(catalogo.fases.filter((f) => f.metodoId === 'instrumento').length, 4);
  assert.ok(catalogo.instrumentos.length >= 20);
  // Questões e exercícios ficam vazios de propósito: as perguntas são geradas
  // na hora e não há banco fixo nas fontes.
  assert.deepEqual(catalogo.questoes, []);
  assert.deepEqual(catalogo.exercicios, []);
  assert.equal(esquema.validarEstado(catalogo).length, 0);
});

test('as fases guardam os mesmos identificadores de sempre', () => {
  recomecar();
  assert.deepEqual(R.fasesDoMetodo('msa').map((f) => f.id), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  assert.deepEqual(R.fasesDoMetodo('instrumento').map((f) => f.id), ['inst1', 'inst2', 'inst3', 'inst4']);
});

// ------------------------------------------------------------------ validações

test('cada validação do cadastro aponta o que falta', () => {
  assert.match(esquema.validarAlunos([{ id: 'a', nome: 'Ana Lima' }], [])[0].mensagem, /sem instrumento/);
  assert.match(esquema.validarMetodos([{ id: 'm', nome: 'M', instrumentoIds: [] }], [])[0].mensagem, /sem instrumento/);
  assert.match(esquema.validarFases([{ id: 'f', titulo: 'T' }], [])[0].mensagem, /sem método/);
  assert.match(esquema.validarLicoes([{ id: 'l' }], [])[0].mensagem, /sem fase/);
  assert.match(esquema.validarExercicios([{ id: 'e' }], [])[0].mensagem, /sem lição/);
  assert.match(esquema.validarAvaliacoes([{ id: 'av' }], [])[0].mensagem, /sem fase/);
  assert.match(esquema.validarQuestoes([{ id: 'q' }], [])[0].mensagem, /sem avaliação/);
});

test('duplicidade de instrumento, de método e de fase é recusada', () => {
  const doisInstrumentos = [{ id: 'x', nome: 'Flauta' }, { id: 'y', nome: 'flauta' }];
  assert.match(esquema.validarInstrumentos(doisInstrumentos)[0].mensagem, /Duplicidade de instrumentos/);

  const doisMetodos = [{ id: 'a', nome: 'M', universal: true }, { id: 'b', nome: 'm', universal: true }];
  assert.match(esquema.validarMetodos(doisMetodos, [])[0].mensagem, /Duplicidade de métodos/);

  const duasFases = [{ id: 'f1', metodoId: 'm', ordem: 1, titulo: 'A' }, { id: 'f2', metodoId: 'm', ordem: 1, titulo: 'B' }];
  assert.match(esquema.validarFases(duasFases, [])[0].mensagem, /Duplicidade de fases/);
});

test('o que quebra a estrutura é recusado; o que está incompleto fica pendente', () => {
  recomecar();
  assert.throws(() => R.alunos.criar({ nome: '' }), /sem nome/);

  const incompleto = R.alunos.criar({ nome: 'Aluno Sem Instrumento' });
  assert.ok(R.alunos.buscar(incompleto.id), 'o aluno incompleto entra no cadastro');
  assert.equal(R.problemasDeEstrutura().length, 0);
  assert.match(R.pendenciasDoCadastro()[0].mensagem, /sem instrumento/);
});

test('o instrumento digitado reencontra o instrumento cadastrado', () => {
  recomecar();
  const aluno = R.alunos.criar({ nome: 'Ana Lima', instrumento: 'violino' });
  assert.equal(aluno.instrumentoId, 'violino', 'o cadastro guarda o vínculo, não só o nome digitado');
  assert.equal(R.pendenciasDoCadastro().length, 0);

  const outro = R.alunos.atualizar(aluno.id, { instrumento: 'Trompete', instrumentoId: '' });
  assert.equal(outro.instrumentoId, 'trompete', 'o nome do instrumento também serve, sem diferenciar maiúsculas');
});

test('senha em texto puro não entra no cadastro de acesso', () => {
  recomecar();
  const acesso = R.usuarios.criar({ login: 'ana', papel: 'ALUNO', alunoId: 'a1', senha: 'segredo' });
  assert.equal(acesso.senha, undefined, 'a senha em texto é descartada na entrada');
  assert.match(esquema.validarUsuarios([{ id: 'u', login: 'x', papel: 'ALUNO', alunoId: 'a', senha: '123' }], [])[0].mensagem,
    /texto puro/);
});

// -------------------------------------------------------------------- perfis

test('cada perfil tem as suas permissões', () => {
  assert.ok(permissoes.pode('ADMIN', 'dados.apagar'));
  assert.ok(!permissoes.pode('PROFESSOR', 'dados.apagar'));
  assert.ok(permissoes.pode('PROFESSOR', 'aluno.cadastrar'));
  assert.ok(!permissoes.pode('ALUNO', 'ver.painel'));
  assert.ok(permissoes.pode('ALUNO', 'estudar'));
});

test('quem cadastra quem', () => {
  assert.deepEqual(permissoes.papeisQuePodeConceder('ALUNO'), []);
  assert.deepEqual(permissoes.papeisQuePodeConceder('PROFESSOR'), ['ALUNO']);
  assert.equal(permissoes.motivoDaRecusa('ADMIN', 'PROFESSOR'), null);
  assert.match(permissoes.motivoDaRecusa('PROFESSOR', 'ADMIN'), /não pode cadastrar/);
  assert.match(permissoes.motivoDaRecusa('ADMIN', 'REITOR'), /desconhecido/);
});

test('a senha de fábrica é reconhecida conferindo o resumo, não por um campo', () => {
  const acesso = { ativo: true, exigeSenha: true, ...permissoes.guardarSenha(permissoes.SENHA_INICIAL, 'admin') };
  assert.ok(permissoes.senhaEhInicial(acesso));
  assert.equal(acesso.senha, undefined);
  assert.equal(acesso.senhaPadrao, undefined, 'não existe campo dizendo que a senha é a de fábrica');

  const trocado = { ...acesso, ...permissoes.guardarSenha('outraSenha', 'admin') };
  assert.equal(permissoes.senhaEhInicial(trocado), false);
  assert.ok(permissoes.autenticar(trocado, 'outraSenha'));
  assert.equal(permissoes.autenticar(trocado, permissoes.SENHA_INICIAL), null);
});

// ------------------------------------------------- método de qualquer tamanho

for (const quantidade of [10, 16, 20]) {
  test(`um método com ${quantidade} fases entra sem mexer no código`, () => {
    recomecar();
    const metodoId = `metodo-${quantidade}`;
    R.metodos.criar({ id: metodoId, nome: `Método de ${quantidade} fases`, instrumentoIds: ['violino'], ordem: 9 });

    for (let i = 1; i <= quantidade; i++) {
      R.fases.criar({
        id: `${metodoId}-f${i}`, metodoId, ordem: i, titulo: `Fase ${i}`,
        anteriorId: i > 1 ? `${metodoId}-f${i - 1}` : null,
      });
    }

    const fases = R.fasesDoMetodo(metodoId);
    assert.equal(fases.length, quantidade);
    assert.deepEqual(fases.map((f) => f.ordem), Array.from({ length: quantidade }, (_, i) => i + 1));
    assert.equal(fases[0].anteriorId, null);
    assert.equal(fases[quantidade - 1].anteriorId, `${metodoId}-f${quantidade - 1}`);
    assert.ok(R.metodosDoInstrumento('violino').some((m) => m.id === metodoId));
    assert.equal(R.problemasDeEstrutura().length, 0);
  });
}

test('um instrumento novo entra e ganha os métodos que servem a ele', () => {
  recomecar();
  const antes = R.instrumentos.contar();
  R.instrumentos.criar({ id: 'cavaquinho', nome: 'Cavaquinho de teste', familia: 'cordas' });
  assert.equal(R.instrumentos.contar(), antes + 1);

  const metodos = R.metodosDoInstrumento('cavaquinho').map((m) => m.id);
  assert.ok(metodos.includes('msa'), 'a teoria vale para todo instrumento');
  assert.ok(!metodos.includes('instrumento'), 'o método do instrumento só serve a quem está na lista dele');

  R.metodos.atualizar('instrumento', {
    instrumentoIds: [...R.metodos.buscar('instrumento').instrumentoIds, 'cavaquinho'],
  });
  assert.ok(R.metodosDoInstrumento('cavaquinho').map((m) => m.id).includes('instrumento'));
});

// ----------------------------------------------------------- progresso e prova

test('o progresso é gravado por aluno e por fase, sem se misturar', () => {
  recomecar();
  const ana = R.alunos.criar({ nome: 'Ana Lima', instrumentoId: 'violino' });
  const bia = R.alunos.criar({ nome: 'Bia Souza', instrumentoId: 'flauta' });

  const p = R.progressoDoAluno(ana.id, '1');
  p.licoesLidas.push(0, 1);
  p.melhorNota = 90;
  p.aprovadoEm = '2026-03-01T00:00:00.000Z';
  R.progressos.salvar(p);

  assert.equal(R.progressoDeTodasAsFases(ana.id).length, 1);
  assert.deepEqual(R.progressoDoAluno(bia.id, '1').licoesLidas, [], 'a fase do colega vem limpa');
  assert.equal(R.progressoDoAluno(ana.id, '1').melhorNota, 90);

  // Só olhar a fase não grava nada: abrir as trilhas não pode encher o
  // depósito de linhas em branco.
  assert.equal(R.progressoDeTodasAsFases(bia.id).length, 0);
  R.progressos.salvar({ ...R.progressoDoAluno(bia.id, '1'), licoesLidas: [0] });
  assert.equal(R.progressoDeTodasAsFases(bia.id).length, 1, 'gravou quando houve o que gravar');
});

test('a avaliação de cada fase traz a quantidade de questões e a nota mínima', () => {
  recomecar();
  const avaliacao = R.avaliacaoDaFase('1');
  assert.equal(avaliacao.id, 'av-1');
  assert.equal(avaliacao.quantidadeDeQuestoes, 10);
  assert.equal(avaliacao.notaMinima, 70);
  assert.equal(R.questoesDaAvaliacao(avaliacao.id).length, 0, 'as questões são geradas na hora');
});

test('o depósito é trocável: o mesmo código roda em memória e no aparelho', () => {
  const memoria = criarDepositoEmMemoria();
  R.usarDeposito(memoria);
  R.alunos.criar({ nome: 'Carlos Dias', instrumentoId: 'trompete' });
  assert.equal(memoria.ler().alunos.length, 1, 'o que foi criado está no depósito');

  R.usarDeposito(criarDepositoEmMemoria());
  assert.equal(R.alunos.contar(), 0, 'outro depósito, outro conjunto de dados');

  R.usarDeposito(memoria);
  assert.equal(R.alunos.contar(), 1, 'voltando ao depósito anterior, os dados estão lá');
});

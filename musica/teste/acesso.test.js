// Testes do cadastro, das senhas e da separação do progresso entre alunos.
import test from 'node:test';
import assert from 'node:assert/strict';

// O app guarda tudo no localStorage do navegador; aqui simulamos um.
const memoria = new Map();
globalThis.localStorage = {
  getItem: (chave) => (memoria.has(chave) ? memoria.get(chave) : null),
  setItem: (chave, valor) => memoria.set(chave, String(valor)),
  removeItem: (chave) => memoria.delete(chave),
};

const { sha256, criarHash, conferirSenha, validarSenha } = await import('../js/senha.js');
const banco = await import('../js/armazenamento.js');

test('SHA-256 confere com os vetores conhecidos', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('a'.repeat(200)).length, 64);
});

test('a senha nunca é guardada em texto e o sal muda o resumo', () => {
  const hash = criarHash('CCB123', 'admin');
  assert.notEqual(hash, 'CCB123');
  assert.notEqual(hash, criarHash('CCB123', 'outro-sal'));
  assert.ok(conferirSenha('CCB123', 'admin', hash));
  assert.ok(!conferirSenha('ccb123', 'admin', hash));
  assert.ok(!conferirSenha('', 'admin', hash));
});

test('senha curta é recusada', () => {
  assert.ok(validarSenha('123'));
  assert.ok(validarSenha('  '));
  assert.equal(validarSenha('CCB123'), null);
});

test('o instrutor entra com o usuário e a senha de fábrica', () => {
  assert.equal(banco.usuarioDoAdmin(), 'RENATO');
  assert.ok(banco.senhaDoAdminEhPadrao());
  assert.equal(banco.entrarComoAdmin('RENATO', 'errada'), false);
  assert.equal(banco.entrarComoAdmin('OUTRO', 'CCB123'), false);
  assert.equal(banco.entrarComoAdmin('renato', 'CCB123'), true, 'o usuário não diferencia maiúsculas');
  assert.ok(banco.ehAdmin());
});

test('trocar a senha do instrutor invalida a antiga', () => {
  banco.trocarSenhaAdmin('outraSenha');
  assert.equal(banco.senhaDoAdminEhPadrao(), false);
  assert.equal(banco.entrarComoAdmin('RENATO', 'CCB123'), false);
  assert.equal(banco.entrarComoAdmin('RENATO', 'outraSenha'), true);
});

test('cada aluno tem o seu acesso, com ou sem senha', () => {
  const comSenha = banco.criarUsuario({ nome: 'Maria Souza', instrumento: 'clarinete', exigeSenha: true, senha: '4321' });
  const semSenha = banco.criarUsuario({ nome: 'José Lima', instrumento: 'trompete' });

  assert.equal(comSenha.exigeSenha, true);
  assert.equal(comSenha.senhaHash.length, 64);
  assert.equal(semSenha.exigeSenha, false);
  assert.equal(semSenha.senhaHash, null);

  assert.equal(banco.entrarComoAluno(comSenha.id, '0000'), false);
  assert.equal(banco.entrarComoAluno(comSenha.id, '4321'), true);
  assert.equal(banco.alunoAtual().nome, 'Maria Souza');
  assert.equal(banco.entrarComoAluno(semSenha.id), true);
  assert.equal(banco.entrarComoAluno('nao-existe', ''), false);
});

test('nome de aluno não se repete', () => {
  assert.throws(() => banco.criarUsuario({ nome: 'maria souza' }), /Já existe/);
  assert.throws(() => banco.criarUsuario({ nome: '   ' }), /obrigatório/);
});

test('o progresso de um aluno não vaza para o outro', () => {
  const [maria, jose] = banco.usuarios();
  const outro = maria.nome === 'José Lima' ? maria : jose;
  const primeira = maria.nome === 'José Lima' ? jose : maria;

  banco.entrarComoAluno(primeira.id, '4321');
  banco.marcarLicaoLida('1', 0);
  banco.registrarTentativa('1', { data: new Date().toISOString(), acertos: 9, total: 10, nota: 90, aprovado: true });
  banco.registrarUsadas('1', ['a#1', 'a#2']);

  assert.equal(banco.faseAprovada('1'), true);
  assert.deepEqual(banco.usadasDaFase('1'), ['a#1', 'a#2']);

  banco.entrarComoAluno(outro.id);
  assert.equal(banco.faseAprovada('1'), false, 'a fase do colega não pode vir aprovada');
  assert.deepEqual(banco.usadasDaFase('1'), [], 'o histórico de perguntas é de cada aluno');
  assert.equal(banco.resumoDoAluno(primeira.id).aprovadas, 1);
  assert.equal(banco.resumoDoAluno(outro.id).aprovadas, 0);
});

test('a trava de fase respeita a trilha de cada uma', () => {
  assert.equal(banco.faseLiberada({ numero: 1, anteriorId: null }), true);
  assert.equal(banco.faseLiberada({ numero: 2, anteriorId: '1' }), false);
  assert.equal(banco.faseLiberada({ numero: 1, anteriorId: null, trilha: 'instrumento' }), true);
});

test('editar o aluno muda senha e instrumento', () => {
  const alvo = banco.usuarios().find((u) => u.nome === 'José Lima');
  banco.atualizarUsuario(alvo.id, { instrumento: 'tuba', exigeSenha: true, senha: 'senha9' });
  assert.equal(banco.entrarComoAluno(alvo.id, 'errada'), false);
  assert.equal(banco.entrarComoAluno(alvo.id, 'senha9'), true);
  assert.equal(banco.usuarioPorId(alvo.id).instrumento, 'tuba');

  banco.atualizarUsuario(alvo.id, { exigeSenha: false });
  assert.equal(banco.entrarComoAluno(alvo.id), true, 'sem exigência de senha, entra direto');
});

test('remover aluno leva junto o progresso dele', () => {
  const alvo = banco.usuarios().find((u) => u.nome === 'Maria Souza');
  banco.removerUsuario(alvo.id);
  assert.equal(banco.usuarioPorId(alvo.id), null);
  assert.equal(banco.usuarios().some((u) => u.nome === 'Maria Souza'), false);
  assert.equal(banco.resumoDoAluno(alvo.id).aprovadas, 0);
});

test('exportar e importar preservam o cadastro', () => {
  const copia = banco.exportar();
  const antes = banco.usuarios().length;
  banco.apagarTudo();
  assert.equal(banco.usuarios().length, 0);
  banco.importar(copia);
  assert.equal(banco.usuarios().length, antes);
  assert.throws(() => banco.importar('{"algo":1}'), /inválido/);
});

test('quem já usava a versão sem cadastro vira aluno na migração', async () => {
  memoria.clear();
  memoria.set('msa.progresso.v1', JSON.stringify({
    versao: 1, aluno: { nome: 'Aluno Antigo', criadoEm: '2026-01-01T00:00:00.000Z' },
    fases: { 1: { licoesLidas: [0, 1], jogos: {}, tentativas: [], aprovadoEm: '2026-01-02T00:00:00.000Z', melhorNota: 80 } },
    usadas: { 1: ['x#1'] }, certificados: [{ fase: 1, nota: 80 }], xp: 120,
  }));
  const modulo = await import(`../js/armazenamento.js?migracao=${Date.now()}`);
  const migrado = modulo.usuarios().find((u) => u.nome === 'Aluno Antigo');
  assert.ok(migrado, 'o aluno antigo precisa aparecer no cadastro');
  assert.equal(modulo.resumoDoAluno(migrado.id).aprovadas, 1);
  assert.equal(modulo.progresso(migrado.id).xp, 120);
  assert.equal(modulo.certificados(migrado.id)[0].faseId, '1');
});

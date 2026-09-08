// Testes da ficha do aluno: o que é pedido no primeiro acesso, o que o app
// aceita e o que ele cobra depois.
import test from 'node:test';
import assert from 'node:assert/strict';

const memoria = new Map();
globalThis.localStorage = {
  getItem: (c) => (memoria.has(c) ? memoria.get(c) : null),
  setItem: (c, v) => memoria.set(c, String(v)),
  removeItem: (c) => memoria.delete(c),
};

const ficha = await import('../js/ficha.js');
const banco = await import('../js/armazenamento.js');

const COMPLETA = {
  nome: 'Ana Paula Ribeiro', comum: 'Jardim Aeroporto', instrumento: 'flauta',
  encarregadoLocal: 'Irmão Paulo', encarregadoRegional: 'Irmão Antônio', anciao: 'Irmão Benedito',
  email: 'ana.paula@exemplo.com', whatsapp: '(11) 98765-4321',
};

test('a ficha pede tudo o que o instrutor precisa', () => {
  assert.deepEqual(ficha.CAMPOS_DA_FICHA.map((c) => c.id),
    ['nome', 'comum', 'instrumento', 'encarregadoLocal', 'encarregadoRegional', 'anciao', 'email', 'whatsapp']);
  assert.ok(ficha.CAMPOS_DA_FICHA.every((c) => c.obrigatorio));
  assert.deepEqual(ficha.CAMPOS_DO_MINISTERIO, ['encarregadoLocal', 'encarregadoRegional', 'anciao']);
});

test('ficha completa passa; ficha vazia reprova campo a campo', () => {
  assert.deepEqual(ficha.validarFicha(COMPLETA), {});
  const erros = ficha.validarFicha({});
  assert.equal(Object.keys(erros).length, 8);
  assert.equal(erros.nome, 'Informe o nome completo.');
  assert.equal(erros.comum, 'Informe a comum-congregação.');
  assert.equal(erros.anciao, 'Informe o ancião da localidade.');
});

test('e-mail, WhatsApp e nome completo são conferidos', () => {
  assert.ok(ficha.validarFicha({ ...COMPLETA, email: 'sem-arroba' }).email);
  assert.ok(ficha.validarFicha({ ...COMPLETA, email: 'a@b' }).email, 'domínio sem ponto não passa');
  assert.ok(!ficha.validarFicha({ ...COMPLETA, email: 'a.b@c.com.br' }).email);
  assert.ok(ficha.validarFicha({ ...COMPLETA, whatsapp: '119' }).whatsapp);
  assert.ok(ficha.validarFicha({ ...COMPLETA, whatsapp: '119876543210000' }).whatsapp);
  assert.ok(!ficha.validarFicha({ ...COMPLETA, whatsapp: '1133334444' }).whatsapp, 'fixo com DDD vale');
  assert.ok(ficha.validarFicha({ ...COMPLETA, nome: 'Ana' }).nome, 'sem sobrenome não passa');
});

test('os nomes do ministério podem ficar para depois', () => {
  const semMinisterio = { ...COMPLETA, encarregadoLocal: '', encarregadoRegional: '', anciao: '' };
  assert.deepEqual(ficha.validarFicha(semMinisterio, { ministerioPendente: true }), {});
  assert.equal(Object.keys(ficha.validarFicha(semMinisterio)).length, 3);
  assert.equal(ficha.fichaMinimaCompleta(semMinisterio), true, 'o aluno pode estudar');
  assert.equal(ficha.fichaCompleta(semMinisterio), false, 'mas a ficha segue cobrada');
  assert.deepEqual(ficha.camposFaltando(semMinisterio), ['encarregadoLocal', 'encarregadoRegional', 'anciao']);
});

test('sem os dados essenciais o estudo não é liberado', () => {
  for (const campo of ficha.CAMPOS_ESSENCIAIS) {
    assert.equal(ficha.fichaMinimaCompleta({ ...COMPLETA, [campo]: '' }), false, `${campo} deveria travar a entrada`);
  }
});

test('o WhatsApp é formatado enquanto se digita', () => {
  assert.equal(ficha.formatarWhatsapp('11987654321'), '(11) 98765-4321');
  assert.equal(ficha.formatarWhatsapp('1133334444'), '(11) 3333-4444');
  assert.equal(ficha.formatarWhatsapp('(11) 9'), '(11) 9');
  assert.equal(ficha.formatarWhatsapp('11'), '11');
  assert.equal(ficha.formatarWhatsapp('abc11987654321xyz'), '(11) 98765-4321');
  assert.equal(ficha.apenasDigitos('(11) 98765-4321'), '11987654321');
});

test('o cadastro guarda a ficha inteira e a senha só em resumo', () => {
  const aluno = banco.criarUsuario({ ...COMPLETA, exigeSenha: true, senha: 'CCB2026' });
  for (const [campo, esperado] of Object.entries(COMPLETA)) {
    assert.equal(aluno[campo], esperado, `${campo} não foi guardado`);
  }
  assert.equal(aluno.exigeSenha, true);
  assert.equal(aluno.senhaHash.length, 64);
  assert.ok(!JSON.stringify(aluno).includes('CCB2026'), 'a senha não pode aparecer em texto');
  assert.equal(banco.fichaDoAlunoCompleta(aluno.id), true);
  assert.equal(banco.fichaDoAlunoLiberada(aluno.id), true);
});

test('quem é cadastrado sem os nomes do ministério estuda e continua cobrado', () => {
  const aluno = banco.criarUsuario({
    nome: 'Carlos Alberto Nunes', comum: 'Vila Nova', instrumento: 'trombone',
    email: 'carlos@exemplo.com', whatsapp: '(11) 95555-4444',
  });
  assert.equal(banco.fichaDoAlunoLiberada(aluno.id), true);
  assert.equal(banco.fichaDoAlunoCompleta(aluno.id), false);
  assert.deepEqual(banco.fichaDoAlunoFaltando(aluno.id), ['encarregadoLocal', 'encarregadoRegional', 'anciao']);

  banco.atualizarUsuario(aluno.id, { encarregadoLocal: 'Irmão José', encarregadoRegional: 'Irmão Mário', anciao: 'Irmão Sebastião' });
  assert.equal(banco.fichaDoAlunoCompleta(aluno.id), true);
  assert.equal(banco.usuarioPorId(aluno.id).comum, 'Vila Nova', 'o resto da ficha não pode se perder');
});

test('quem vem da versão sem ficha é levado a completá-la', () => {
  const antigo = banco.criarUsuario({ nome: 'Aluno Antigo' });
  assert.equal(banco.fichaDoAlunoLiberada(antigo.id), false);
  assert.deepEqual(banco.fichaDoAlunoFaltando(antigo.id), ficha.CAMPOS_DA_FICHA.map((c) => c.id).filter((c) => c !== 'nome'));
});

test('a linha da planilha sai com a ficha do aluno', () => {
  const aluno = banco.usuarios().find((u) => u.nome === 'Ana Paula Ribeiro');
  const linha = ficha.linhaDaFicha(aluno, 'Flauta transversal');
  assert.equal(linha.comum, 'Jardim Aeroporto');
  assert.equal(linha.instrumento, 'Flauta transversal');
  assert.equal(linha.anciao, 'Irmão Benedito');
  assert.equal(linha.whatsapp, '(11) 98765-4321');
});

// Responsáveis, instrutores e localidades: as regras, sem banco.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { EscopoDoUsuario, Papel } from '../src/lib/autorizacao.ts';
import type { UsuarioParaEdicao } from '../src/lib/cadastro.ts';
import {
  atuaCom, atuacoesSemRepetir, avisoDeResponsavelObrigatorio,
  motivoDaRecusaDeLocalidade, motivoDaRecusaDePerfilDeInstrutor,
  motivoDaRecusaDeResponsavel, motivoDaRecusaDeVinculoDeResponsavel,
  nomeDoTipoDeLocalidade, quemRecebeAvisos, TIPOS_DE_LOCALIDADE,
} from '../src/lib/pessoas.ts';

const escopo = (papeis: Papel[], extras: Partial<EscopoDoUsuario> = {}): EscopoDoUsuario => ({
  usuarioId: 'quem-edita',
  papeis,
  comunsDiretas: [],
  regioes: [],
  comunsVisiveis: [],
  ehAdministracao: papeis.some((p) => p === 'SUPERADMIN' || p === 'ADMIN_PEDAGOGICO'),
  comumDoAluno: null,
  ...extras,
});

const aluno = (extras: Partial<UsuarioParaEdicao> = {}): UsuarioParaEdicao => ({
  id: 'aluno-1',
  ehAdministracao: false,
  papeis: ['ALUNO'],
  comuns: ['c1'],
  regioes: [],
  ...extras,
} as UsuarioParaEdicao);

// ------------------------------------------------------------ responsáveis

test('o responsável precisa de nome completo e contato conferível', () => {
  assert.match(motivoDaRecusaDeResponsavel({ nomeCompleto: '' })!, /Informe o nome/);
  assert.match(motivoDaRecusaDeResponsavel({ nomeCompleto: 'Maria' })!, /nome completo/);
  assert.equal(motivoDaRecusaDeResponsavel({ nomeCompleto: 'Maria Silva' }), null);

  assert.match(motivoDaRecusaDeResponsavel({ nomeCompleto: 'Maria Silva', email: 'sem-arroba' })!, /E-mail/);
  assert.equal(motivoDaRecusaDeResponsavel({ nomeCompleto: 'Maria Silva', email: 'm@x.com.br' }), null);

  assert.match(motivoDaRecusaDeResponsavel({ nomeCompleto: 'Maria Silva', telefone: '999' })!, /DDD/);
  assert.equal(motivoDaRecusaDeResponsavel({ nomeCompleto: 'Maria Silva', telefone: '(11) 91234-5678' }), null);

  assert.match(motivoDaRecusaDeResponsavel({ nomeCompleto: 'Maria Silva', documento: '123' })!, /CPF/);
  assert.equal(motivoDaRecusaDeResponsavel({ nomeCompleto: 'Maria Silva', documento: '123.456.789-00' }), null);

  assert.match(motivoDaRecusaDeResponsavel({ nomeCompleto: 'Maria Silva', estado: 'São Paulo' })!, /duas letras/);
});

test('mexer nos responsáveis de um aluno exige poder editar o aluno', () => {
  const instrutorDaComum = escopo(['INSTRUTOR'], { comunsDiretas: ['c1'], comunsVisiveis: ['c1'] });
  const instrutorDeOutra = escopo(['INSTRUTOR'], { comunsDiretas: ['c9'], comunsVisiveis: ['c9'] });

  assert.equal(motivoDaRecusaDeVinculoDeResponsavel(instrutorDaComum, aluno()), null);
  assert.ok(motivoDaRecusaDeVinculoDeResponsavel(instrutorDeOutra, aluno()),
    'instrutor de outra comum não mexe no responsável deste aluno');

  const soAluno = escopo(['ALUNO'], { comumDoAluno: 'c1' });
  assert.ok(motivoDaRecusaDeVinculoDeResponsavel(soAluno, aluno({ id: 'outro' })),
    'um aluno não mexe no responsável de outro');
  assert.equal(motivoDaRecusaDeVinculoDeResponsavel(soAluno, aluno({ id: 'quem-edita' })), null,
    'mas mexe no seu próprio');
});

test('aluno menor sem responsável pedagógico gera aviso, não recusa', () => {
  const hoje = new Date('2026-09-09T00:00:00Z');
  const menor = new Date('2015-01-01T00:00:00Z');
  const maior = new Date('1990-01-01T00:00:00Z');

  assert.match(avisoDeResponsavelObrigatorio(menor, [], hoje)!, /menor de idade/);
  assert.equal(avisoDeResponsavelObrigatorio(menor, [{ pedagogico: true }], hoje), null);
  assert.match(avisoDeResponsavelObrigatorio(menor, [{ pedagogico: false }], hoje)!, /menor de idade/,
    'responsável só financeiro não supre o pedagógico');
  assert.equal(avisoDeResponsavelObrigatorio(maior, [], hoje), null, 'maior de idade não precisa');
  assert.equal(avisoDeResponsavelObrigatorio(null, [], hoje), null, 'sem data de nascimento não se conclui nada');
});

test('só recebe aviso quem foi marcado para receber', () => {
  const vinculos = [
    { nome: 'mãe', recebeAvisos: true },
    { nome: 'pai', recebeAvisos: false },
  ];
  assert.deepEqual(quemRecebeAvisos(vinculos).map((v) => v.nome), ['mãe']);
});

// -------------------------------------------------------------- instrutores

test('instrutor sem atuação declarada atende todos os instrumentos', () => {
  assert.equal(atuaCom([], { instrumentoId: 'violino' }), true);
  assert.equal(atuaCom([{ instrumentoId: 'violino' }], { instrumentoId: 'violino' }), true);
  assert.equal(atuaCom([{ instrumentoId: 'violino' }], { instrumentoId: 'flauta' }), false);
  assert.equal(atuaCom([{ instrumentoId: 'violino', metodoId: 'm1' }], { instrumentoId: 'violino', metodoId: 'm2' }), false);
  assert.equal(atuaCom([{ instrumentoId: 'violino' }], { instrumentoId: 'violino', metodoId: 'm2' }), true,
    'atuação sem método vale para qualquer método daquele instrumento');
});

test('atuação repetida não duplica', () => {
  const lista = atuacoesSemRepetir([
    { instrumentoId: 'violino', metodoId: null },
    { instrumentoId: 'violino', metodoId: null },
    { instrumentoId: 'flauta', metodoId: null },
  ]);
  assert.equal(lista.length, 2);
});

test('cada um edita a própria ficha de instrutor', () => {
  const instrutor = escopo(['INSTRUTOR'], { comunsDiretas: ['c1'], comunsVisiveis: ['c1'] });
  assert.equal(motivoDaRecusaDePerfilDeInstrutor(instrutor, aluno({ id: 'quem-edita' })), null);
  assert.ok(motivoDaRecusaDePerfilDeInstrutor(instrutor, aluno({
    id: 'outro-instrutor', papeis: ['INSTRUTOR'], comuns: ['c9'],
  })), 'não edita a ficha de instrutor de outra comum');
});

// -------------------------------------------------------------- localidades

test('a localidade tem tipo, e o tipo tem nome legível', () => {
  assert.ok(TIPOS_DE_LOCALIDADE.length >= 5);
  assert.equal(nomeDoTipoDeLocalidade('ESCOLA_DE_MUSICA'), 'Escola de música');
  assert.equal(nomeDoTipoDeLocalidade('COMUM'), 'Comum-congregação');
  assert.equal(nomeDoTipoDeLocalidade('DESCONHECIDO'), 'DESCONHECIDO', 'tipo que não conheço sai como veio');
});

test('a localidade precisa de nome, cidade e estado', () => {
  assert.match(motivoDaRecusaDeLocalidade({ nome: '', cidade: 'São Paulo', estado: 'SP' })!, /nome/);
  assert.match(motivoDaRecusaDeLocalidade({ nome: 'Centro', cidade: '', estado: 'SP' })!, /cidade/);
  assert.match(motivoDaRecusaDeLocalidade({ nome: 'Centro', cidade: 'São Paulo', estado: 'São Paulo' })!, /duas letras/);
  assert.match(motivoDaRecusaDeLocalidade({ nome: 'Centro', cidade: 'SP', estado: 'SP', cep: '123' })!, /8 dígitos/);
  assert.equal(motivoDaRecusaDeLocalidade({ nome: 'Centro', cidade: 'São Paulo', estado: 'SP', cep: '01000-000' }), null);
});

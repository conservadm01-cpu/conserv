// Cadastro fechado: quem pode criar quem, e onde.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { EscopoDoUsuario, Papel } from '../src/lib/autorizacao.ts';
import { destinoInicial } from '../src/lib/autorizacao.ts';
import {
  escoposQuePodeUsar, motivoDaRecusa, normalizarLogin, papeisQuePodeConceder,
  podeCadastrar, senhaProvisoria, PAPEIS_QUE_CONCEDE,
} from '../src/lib/cadastro.ts';

const escopo = (papeis: Papel[], extras: Partial<EscopoDoUsuario> = {}): EscopoDoUsuario => ({
  usuarioId: 'quem-cadastra',
  papeis,
  comunsDiretas: [],
  regioes: [],
  comunsVisiveis: [],
  ehAdministracao: papeis.some((p) => p === 'SUPERADMIN' || p === 'ADMIN_PEDAGOGICO'),
  comumDoAluno: null,
  ...extras,
});

test('aluno não cadastra ninguém', () => {
  const aluno = escopo(['ALUNO'], { comumDoAluno: 'c1' });
  assert.equal(podeCadastrar(aluno), false);
  assert.deepEqual(papeisQuePodeConceder(aluno), []);
  assert.match(
    motivoDaRecusa(aluno, { papel: 'ALUNO', escopo: 'COMUM', comumId: 'c1' })!,
    /não cadastra outras pessoas/,
  );
});

test('nenhum papel de campo concede administração', () => {
  for (const papel of ['ENCARREGADO_REGIONAL', 'ENCARREGADO_LOCAL', 'ANCIAO', 'INSTRUTOR'] as Papel[]) {
    const concede = PAPEIS_QUE_CONCEDE[papel];
    assert.ok(!concede.includes('SUPERADMIN'), `${papel} não pode conceder SUPERADMIN`);
    assert.ok(!concede.includes('ADMIN_PEDAGOGICO'), `${papel} não pode conceder ADMIN_PEDAGOGICO`);
  }
});

test('um papel nunca concede acima de si', () => {
  const ordem: Papel[] = [
    'ALUNO', 'INSTRUTOR', 'ANCIAO', 'ENCARREGADO_LOCAL', 'ENCARREGADO_REGIONAL',
    'ADMIN_PEDAGOGICO', 'SUPERADMIN',
  ];
  const altura = (p: Papel) => ordem.indexOf(p);
  for (const [papel, concedidos] of Object.entries(PAPEIS_QUE_CONCEDE) as [Papel, Papel[]][]) {
    for (const concedido of concedidos) {
      assert.ok(altura(concedido) <= altura(papel),
        `${papel} não pode conceder ${concedido}, que está acima dele`);
    }
  }
});

test('instrutor cadastra aluno, e só na comum que acompanha', () => {
  const instrutor = escopo(['INSTRUTOR'], { comunsDiretas: ['c1'], comunsVisiveis: ['c1'] });
  assert.deepEqual(papeisQuePodeConceder(instrutor), ['ALUNO']);
  assert.equal(motivoDaRecusa(instrutor, { papel: 'ALUNO', escopo: 'COMUM', comumId: 'c1' }), null);

  assert.match(
    motivoDaRecusa(instrutor, { papel: 'ALUNO', escopo: 'COMUM', comumId: 'c2' })!,
    /não está sob a sua responsabilidade/,
  );
  assert.match(
    motivoDaRecusa(instrutor, { papel: 'INSTRUTOR', escopo: 'COMUM', comumId: 'c1' })!,
    /não concede o papel de instrutor/,
  );
});

test('quem não é administração só cadastra dentro de uma comum', () => {
  const local = escopo(['ENCARREGADO_LOCAL'], { comunsVisiveis: ['c1'] });
  assert.deepEqual(escoposQuePodeUsar(local), ['COMUM']);
  assert.match(
    motivoDaRecusa(local, { papel: 'INSTRUTOR', escopo: 'GLOBAL' })!,
    /dentro de uma comum/,
  );
  assert.match(
    motivoDaRecusa(local, { papel: 'INSTRUTOR', escopo: 'COMUM', comumId: null })!,
    /Escolha a comum/,
  );
});

test('encarregado regional alcança a região, não a de fora', () => {
  const regional = escopo(['ENCARREGADO_REGIONAL'], { regioes: ['r1'], comunsVisiveis: ['c1', 'c2'] });
  assert.equal(motivoDaRecusa(regional, { papel: 'ENCARREGADO_LOCAL', escopo: 'COMUM', comumId: 'c2' }), null);
  assert.match(
    motivoDaRecusa(regional, { papel: 'ENCARREGADO_LOCAL', escopo: 'COMUM', comumId: 'c9' })!,
    /não está sob a sua responsabilidade/,
  );
});

test('a administração cadastra em qualquer abrangência', () => {
  const admin = escopo(['SUPERADMIN']);
  assert.deepEqual(escoposQuePodeUsar(admin).sort(), ['COMUM', 'GLOBAL', 'REGIAO']);
  assert.equal(motivoDaRecusa(admin, { papel: 'ADMIN_PEDAGOGICO', escopo: 'GLOBAL' }), null);
  assert.equal(motivoDaRecusa(admin, { papel: 'ALUNO', escopo: 'COMUM', comumId: 'qualquer' }), null);
});

test('só o superadministrador cria outro superadministrador', () => {
  assert.equal(motivoDaRecusa(escopo(['SUPERADMIN']), { papel: 'SUPERADMIN', escopo: 'GLOBAL' }), null);
  assert.match(
    motivoDaRecusa(escopo(['ADMIN_PEDAGOGICO']), { papel: 'SUPERADMIN', escopo: 'GLOBAL' })!,
    /não concede o papel de superadministrador/,
  );
});

test('o nome de acesso é normalizado igual em todo lugar', () => {
  assert.equal(normalizarLogin('RENATO MONTEIRO'), 'renato monteiro');
  assert.equal(normalizarLogin('  Renato   Monteiro '), 'renato monteiro');
  assert.equal(normalizarLogin(''), null);
  assert.equal(normalizarLogin('   '), null);
  assert.equal(normalizarLogin(null), null);
});

test('a senha provisória é legível e não se repete', () => {
  const senhas = new Set(Array.from({ length: 200 }, () => senhaProvisoria()));
  assert.ok(senhas.size > 190, 'praticamente todas distintas');
  for (const senha of senhas) assert.match(senha, /^[a-z]{4}-[a-z]{4}-\d{4}$/);
});

test('cada perfil cai no seu lugar depois de entrar', () => {
  assert.equal(destinoInicial(escopo(['ALUNO'])), '/aluno');
  assert.equal(destinoInicial(escopo(['INSTRUTOR'])), '/painel');
  assert.equal(destinoInicial(escopo(['SUPERADMIN'])), '/painel');
  // Quem estuda E acompanha vai para o painel: lá tem o caminho para os dois.
  assert.equal(destinoInicial(escopo(['ALUNO', 'INSTRUTOR'])), '/painel');
});

// Cadastro fechado: quem pode criar quem, e onde.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { EscopoDoUsuario, Papel } from '../src/lib/autorizacao.ts';
import { destinoInicial, ehAcompanhante } from '../src/lib/autorizacao.ts';
import {
  escoposQuePodeUsar, motivoDaRecusa, motivoDaRecusaDeEdicao, motivoDaRecusaDeRevogacao,
  motivoDaRecusaDeSituacao, normalizarLogin, papeisQuePodeConceder, podeCadastrar,
  senhaProvisoria, PAPEIS_QUE_CONCEDE, type UsuarioParaEdicao,
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

test('o seletor oferece o menor privilégio primeiro', () => {
  // O primeiro da lista vira o padrão do seletor na tela: conceder
  // superadministrador tem de ser escolha deliberada, nunca o que já vem posto.
  const admin = escopo(['SUPERADMIN']);
  assert.equal(papeisQuePodeConceder(admin)[0], 'ALUNO');
  assert.equal(papeisQuePodeConceder(admin).at(-1), 'SUPERADMIN');

  const regional = escopo(['ENCARREGADO_REGIONAL']);
  assert.deepEqual(papeisQuePodeConceder(regional),
    ['ALUNO', 'INSTRUTOR', 'ANCIAO', 'ENCARREGADO_LOCAL']);
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

test('a área de acompanhamento é de quem acompanha alguém', () => {
  // Regressão: as telas de painel abriam para aluno. Os dados vinham vazios
  // pela RLS, mas tela de acompanhamento aberta e vazia não é resposta.
  assert.equal(ehAcompanhante(escopo(['ALUNO'])), false);
  for (const papel of ['INSTRUTOR', 'ANCIAO', 'ENCARREGADO_LOCAL', 'ENCARREGADO_REGIONAL',
    'ADMIN_PEDAGOGICO', 'SUPERADMIN'] as Papel[]) {
    assert.equal(ehAcompanhante(escopo([papel])), true, `${papel} acompanha alguém`);
  }
  // Quem estuda E acompanha continua entrando: basta um papel além de aluno.
  assert.equal(ehAcompanhante(escopo(['ALUNO', 'INSTRUTOR'])), true);
});

test('cada perfil cai no seu lugar depois de entrar', () => {
  assert.equal(destinoInicial(escopo(['ALUNO'])), '/aluno');
  assert.equal(destinoInicial(escopo(['INSTRUTOR'])), '/painel');
  assert.equal(destinoInicial(escopo(['SUPERADMIN'])), '/painel');
  // Quem estuda E acompanha vai para o painel: lá tem o caminho para os dois.
  assert.equal(destinoInicial(escopo(['ALUNO', 'INSTRUTOR'])), '/painel');
});

// ------------------------------------------------------------ edição

const alvo = (papeis: Papel[], comuns: (string | null)[] = ['c1'], id = 'alvo'): UsuarioParaEdicao => ({
  id,
  papeis,
  comuns,
  ehAdministracao: papeis.some((p) => p === 'SUPERADMIN' || p === 'ADMIN_PEDAGOGICO'),
});

test('qualquer um edita os próprios dados', () => {
  const aluno = escopo(['ALUNO'], { usuarioId: 'eu' });
  assert.equal(motivoDaRecusaDeEdicao(aluno, alvo(['ALUNO'], ['c1'], 'eu')), null);
});

test('aluno não administra ninguém além de si', () => {
  const aluno = escopo(['ALUNO'], { usuarioId: 'eu' });
  assert.match(
    motivoDaRecusaDeEdicao(aluno, alvo(['ALUNO'], ['c1'], 'outro'))!,
    /não administra outras pessoas/,
  );
});

test('instrutor edita aluno da sua comum, e não o de outra', () => {
  const instrutor = escopo(['INSTRUTOR'], { usuarioId: 'i1', comunsVisiveis: ['c1'] });
  assert.equal(motivoDaRecusaDeEdicao(instrutor, alvo(['ALUNO'], ['c1'])), null);
  assert.match(
    motivoDaRecusaDeEdicao(instrutor, alvo(['ALUNO'], ['c2']))!,
    /não está sob a sua responsabilidade/,
  );
});

test('quem não é administração não toca em quem é', () => {
  const local = escopo(['ENCARREGADO_LOCAL'], { usuarioId: 'e1', comunsVisiveis: ['c1'] });
  assert.match(
    motivoDaRecusaDeEdicao(local, alvo(['ADMIN_PEDAGOGICO'], ['c1']))!,
    /só é alterado pela administração/,
  );
  assert.match(
    motivoDaRecusaDeEdicao(local, alvo(['SUPERADMIN'], ['c1']))!,
    /só é alterado pela administração/,
  );
});

test('não se edita quem não se poderia ter cadastrado', () => {
  const instrutor = escopo(['INSTRUTOR'], { usuarioId: 'i1', comunsVisiveis: ['c1'] });
  // Instrutor concede apenas ALUNO; outro instrutor está fora do seu alcance.
  assert.match(
    motivoDaRecusaDeEdicao(instrutor, alvo(['INSTRUTOR'], ['c1']))!,
    /não administra instrutor/,
  );
});

test('ninguém se tranca fora do sistema', () => {
  const admin = escopo(['SUPERADMIN'], { usuarioId: 'a1' });
  const euMesmo = alvo(['SUPERADMIN'], [null], 'a1');
  assert.equal(motivoDaRecusaDeSituacao(admin, euMesmo, 'ATIVO'), null);
  assert.match(
    motivoDaRecusaDeSituacao(admin, euMesmo, 'INATIVO')!,
    /não pode inativar nem bloquear o seu próprio acesso/,
  );
  assert.match(
    motivoDaRecusaDeSituacao(admin, euMesmo, 'BLOQUEADO')!,
    /seu próprio acesso/,
  );
});

test('o último superadministrador não perde o vínculo', () => {
  const admin = escopo(['SUPERADMIN'], { usuarioId: 'a1' });
  const outro = alvo(['SUPERADMIN'], [null], 'a2');
  assert.match(
    motivoDaRecusaDeRevogacao(admin, outro, 'SUPERADMIN', 1)!,
    /último superadministrador ativo/,
  );
  assert.equal(motivoDaRecusaDeRevogacao(admin, outro, 'SUPERADMIN', 2), null);
});

test('ninguém retira o próprio vínculo de superadministrador', () => {
  const admin = escopo(['SUPERADMIN'], { usuarioId: 'a1' });
  assert.match(
    motivoDaRecusaDeRevogacao(admin, alvo(['SUPERADMIN'], [null], 'a1'), 'SUPERADMIN', 5)!,
    /seu próprio vínculo/,
  );
});

test('só se retira papel que se poderia conceder', () => {
  const local = escopo(['ENCARREGADO_LOCAL'], { usuarioId: 'e1', comunsVisiveis: ['c1'] });
  assert.equal(motivoDaRecusaDeRevogacao(local, alvo(['ALUNO'], ['c1']), 'ALUNO', 3), null);
  assert.match(
    motivoDaRecusaDeRevogacao(local, alvo(['ALUNO'], ['c1']), 'ENCARREGADO_REGIONAL', 3)!,
    /não retira o papel de encarregado regional/,
  );
});

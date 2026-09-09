// Permissões de aplicação: catálogo em código, concessão em dado.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { EscopoDoUsuario, Papel } from '../src/lib/autorizacao.ts';
import {
  PADRAO_POR_PAPEL, PAPEIS_EDITAVEIS, PERMISSOES, escopoPode,
  motivoDaRecusaDeConcessao, permissaoPorChave, permissoesConcediveis,
  permissoesDoEscopo, podeFazer,
} from '../src/lib/permissoes.ts';

const escopo = (papeis: Papel[], extras: Partial<EscopoDoUsuario> = {}): EscopoDoUsuario => ({
  usuarioId: 'u1', papeis, comunsDiretas: [], regioes: [], comunsVisiveis: [],
  ehAdministracao: papeis.some((p) => p === 'SUPERADMIN' || p === 'ADMIN_PEDAGOGICO'),
  comumDoAluno: null, ...extras,
});

test('o catálogo não tem chave repetida e toda permissão tem grupo e nome', () => {
  const chaves = PERMISSOES.map((p) => p.chave);
  assert.equal(new Set(chaves).size, chaves.length, 'chave repetida faria duas linhas disputarem a mesma concessão');
  for (const permissao of PERMISSOES) {
    assert.ok(permissao.grupo, `${permissao.chave} sem grupo`);
    assert.ok(permissao.nome, `${permissao.chave} sem nome`);
    assert.ok(permissao.descricao, `${permissao.chave} sem descrição — a tela mostraria só a chave`);
  }
});

test('a concessão de fábrica só cita permissões que existem', () => {
  const chaves = new Set(PERMISSOES.map((p) => p.chave));
  for (const [papel, lista] of Object.entries(PADRAO_POR_PAPEL)) {
    for (const chave of lista) {
      assert.ok(chaves.has(chave), `${papel} recebe "${chave}", que não está no catálogo`);
    }
  }
});

test('o aluno não recebe permissão de acompanhamento', () => {
  assert.deepEqual(PADRAO_POR_PAPEL.ALUNO, [], 'a lista vazia é a resposta certa, não um esquecimento');
  assert.equal(podeFazer(escopo(['ALUNO']), 'painel.ver'), false);
  assert.match(motivoDaRecusaDeConcessao('ALUNO', 'painel.ver')!, /não recebe permissões de acompanhamento/);
  assert.deepEqual(permissoesConcediveis('ALUNO'), []);
});

test('nenhum papel de campo recebe permissão de administração de fábrica', () => {
  const soAdmin = PERMISSOES.filter((p) => p.soAdministracao).map((p) => p.chave);
  for (const papel of ['ENCARREGADO_REGIONAL', 'ENCARREGADO_LOCAL', 'ANCIAO', 'INSTRUTOR'] as Papel[]) {
    for (const chave of soAdmin) {
      assert.ok(!PADRAO_POR_PAPEL[papel].includes(chave), `${papel} não pode nascer com ${chave}`);
    }
  }
});

test('não se oferece conceder o que o banco recusaria', () => {
  // A tela mostraria o botão e a gravação falharia: erro sem explicação, que
  // é pior do que não oferecer.
  assert.match(motivoDaRecusaDeConcessao('INSTRUTOR', 'metodo.publicar')!, /só é exercida pela administração/);
  assert.equal(motivoDaRecusaDeConcessao('INSTRUTOR', 'aula.registrar'), null);
  assert.ok(!permissoesConcediveis('INSTRUTOR').some((p) => p.soAdministracao));
});

test('a lista do superadministrador não é editável', () => {
  assert.match(motivoDaRecusaDeConcessao('SUPERADMIN', 'aula.registrar')!, /trancaria todo mundo para fora/);
  assert.ok(!PAPEIS_EDITAVEIS.includes('SUPERADMIN'));
  assert.ok(!PAPEIS_EDITAVEIS.includes('ALUNO'));
});

test('permissão desconhecida é recusada, não ignorada', () => {
  assert.match(motivoDaRecusaDeConcessao('INSTRUTOR', 'inventada.agora')!, /desconhecida/);
  assert.equal(permissaoPorChave('inventada.agora'), null);
});

test('quem tem dois papéis soma as duas listas', () => {
  const duplo = escopo(['INSTRUTOR', 'ANCIAO']);
  assert.ok(podeFazer(duplo, 'aula.registrar'), 'vem do instrutor');
  assert.ok(podeFazer(duplo, 'responsavel.gerir'), 'vem dos dois');
  const reunidas = permissoesDoEscopo(duplo);
  assert.ok(reunidas.includes('aula.registrar') && reunidas.includes('pessoa.cadastrar'));
  assert.ok(!reunidas.includes('metodo.publicar'));
});

test('a administração passa por tudo', () => {
  const admin = escopo(['ADMIN_PEDAGOGICO']);
  for (const permissao of PERMISSOES) assert.ok(podeFazer(admin, permissao.chave));
  assert.equal(permissoesDoEscopo(admin).length, PERMISSOES.length);
});

test('a concessão do banco manda; sem ela, vale a de fábrica', () => {
  const instrutor = escopo(['INSTRUTOR']);

  // Banco ainda não semeado: cai na concessão de fábrica. Sem essa queda, um
  // banco recém-migrado trancaria todo mundo para fora.
  assert.ok(escopoPode(instrutor, 'aula.registrar'));

  // Banco semeado e a administração retirou a permissão.
  const semAula = { ...instrutor, permissoes: ['painel.ver', 'aluno.ver'] };
  assert.equal(escopoPode(semAula, 'aula.registrar'), false, 'o dado manda sobre o padrão do código');
  assert.ok(escopoPode(semAula, 'painel.ver'));

  // E a administração continua passando, mesmo com a lista curta.
  const admin = { ...escopo(['ADMIN_PEDAGOGICO']), permissoes: ['painel.ver'] };
  assert.ok(escopoPode(admin, 'metodo.publicar'));
});

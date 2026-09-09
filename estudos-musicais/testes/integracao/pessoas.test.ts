/**
 * Responsáveis e fichas de instrutor, com banco de verdade e RLS ligada.
 *
 * O que estes testes cobram: o telefone da mãe de um aluno do Jardim
 * Aeroporto não aparece para o instrutor do Centro. Dado de contato de
 * família é exatamente o tipo de informação que não pode vazar entre
 * localidades, e a única prova que vale é tentar atravessar e falhar.
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';

const urlApp = process.env.DATABASE_URL_TESTES_APP;
const urlDono = process.env.DATABASE_URL_TESTES;
if (!urlApp || !urlDono) throw new Error('Defina DATABASE_URL_TESTES e DATABASE_URL_TESTES_APP.');
process.env.DATABASE_URL = urlApp;

const { comoUsuario } = await import('../../src/lib/banco.ts');

const dono = new Client({ connectionString: urlDono });
const pessoas: Record<string, string> = {};
let responsavelDaMaria = '';

before(async () => {
  await dono.connect();
  for (const linha of (await dono.query('SELECT id, email FROM usuarios')).rows) pessoas[linha.email] = linha.id;

  // A mãe de Maria, do Jardim Aeroporto. Criada pelo dono do schema, por fora
  // das políticas — o que se quer testar é a LEITURA por outras pessoas.
  const criada = await dono.query(
    `INSERT INTO responsaveis (id, "nomeCompleto", telefone, email, ativo, "criadoEm", "atualizadoEm")
     VALUES ('resp_teste_maria', 'Marta Aparecida Souza', '11912345678', 'marta@exemplo.org', true, now(), now())
     ON CONFLICT (id) DO UPDATE SET "nomeCompleto" = EXCLUDED."nomeCompleto"
     RETURNING id`,
  );
  responsavelDaMaria = criada.rows[0].id;
  await dono.query(
    `INSERT INTO responsaveis_do_aluno (id, "alunoId", "responsavelId", parentesco, pedagogico, financeiro, "recebeAvisos", "criadoEm")
     VALUES ('rda_teste_maria', $1, $2, 'mãe', true, true, true, now())
     ON CONFLICT ("alunoId", "responsavelId") DO NOTHING`,
    [pessoas['maria.aluna@exemplo.org'], responsavelDaMaria],
  );
});

after(async () => {
  await dono.query('DELETE FROM responsaveis_do_aluno WHERE id = $1', ['rda_teste_maria']);
  await dono.query('DELETE FROM responsaveis WHERE id = $1', ['resp_teste_maria']);
  await dono.end();
});

const comoQuem = (email: string) => pessoas[email];

test('a própria aluna enxerga quem responde por ela', async () => {
  const lista = await comoUsuario(comoQuem('maria.aluna@exemplo.org'), (tx) =>
    tx.responsavelDoAluno.findMany({ include: { responsavel: true } }));
  assert.equal(lista.length, 1);
  assert.equal(lista[0].responsavel.nomeCompleto, 'Marta Aparecida Souza');
  assert.equal(lista[0].parentesco, 'mãe');
});

test('o instrutor da comum da aluna enxerga o responsável dela', async () => {
  const lista = await comoUsuario(comoQuem('paulo.instrutor@exemplo.org'), (tx) =>
    tx.responsavel.findMany({ where: { id: responsavelDaMaria } }));
  assert.equal(lista.length, 1, 'quem acompanha a aluna precisa do contato da família');
});

test('o instrutor de OUTRA comum não enxerga o responsável', async () => {
  const lista = await comoUsuario(comoQuem('marcos.instrutor@exemplo.org'), (tx) =>
    tx.responsavel.findMany({ where: { id: responsavelDaMaria } }));
  assert.deepEqual(lista, [], 'contato de família não atravessa a localidade');

  const vinculos = await comoUsuario(comoQuem('marcos.instrutor@exemplo.org'), (tx) =>
    tx.responsavelDoAluno.findMany({ where: { responsavelId: responsavelDaMaria } }));
  assert.deepEqual(vinculos, [], 'nem o vínculo, que revelaria de quem ele é');
});

test('um aluno não enxerga o responsável de outro aluno', async () => {
  const lista = await comoUsuario(comoQuem('lucas.aluno@exemplo.org'), (tx) =>
    tx.responsavel.findMany({ where: { id: responsavelDaMaria } }));
  assert.deepEqual(lista, []);
});

test('a administração enxerga, porque responde pelo sistema inteiro', async () => {
  const lista = await comoUsuario(comoQuem('renato@exemplo.org'), (tx) =>
    tx.responsavel.findMany({ where: { id: responsavelDaMaria } }));
  assert.equal(lista.length, 1);
});

test('o instrutor de outra comum não consegue GRAVAR responsável para a aluna', async () => {
  await assert.rejects(
    () => comoUsuario(comoQuem('marcos.instrutor@exemplo.org'), (tx) =>
      tx.responsavelDoAluno.create({
        data: {
          alunoId: pessoas['maria.aluna@exemplo.org'],
          responsavelId: responsavelDaMaria,
          parentesco: 'tentativa indevida',
        },
      })),
    'gravar responsável para aluno de outra comum precisa falhar no banco',
  );
});

test('quem cadastra um responsável consegue lê-lo de volta — e mais ninguém', async () => {
  // O Prisma grava com RETURNING: sem poder ler a linha recém-criada, o
  // INSERT falha. A primeira tentativa de resolver isso foi abrir tudo o que
  // fosse "criado no último minuto", o que vazava responsável novo para
  // qualquer pessoa com permissão de cadastrar, em qualquer localidade.
  // Agora o critério é a autoria, e este teste guarda os dois lados.
  const paulo = comoQuem('paulo.instrutor@exemplo.org');
  const criado = await comoUsuario(paulo, (tx) =>
    tx.responsavel.create({
      data: { nomeCompleto: 'Jorge Alves Pereira', telefone: '11988887777', criadoPorId: paulo },
    }));
  assert.equal(criado.nomeCompleto, 'Jorge Alves Pereira');

  const paraOAutor = await comoUsuario(paulo, (tx) =>
    tx.responsavel.findMany({ where: { id: criado.id } }));
  assert.equal(paraOAutor.length, 1, 'quem cadastrou lê o que cadastrou');

  const paraOutro = await comoUsuario(comoQuem('marcos.instrutor@exemplo.org'), (tx) =>
    tx.responsavel.findMany({ where: { id: criado.id } }));
  assert.deepEqual(paraOutro, [], 'ninguém mais o enxerga só por ser recente');

  await dono.query('DELETE FROM responsaveis WHERE id = $1', [criado.id]);
});

test('não dá para cadastrar responsável no nome de outra pessoa', async () => {
  await assert.rejects(
    () => comoUsuario(comoQuem('paulo.instrutor@exemplo.org'), (tx) =>
      tx.responsavel.create({
        data: {
          nomeCompleto: 'Autor Forjado Silva',
          criadoPorId: comoQuem('marcos.instrutor@exemplo.org'),
        },
      })),
    'o autor gravado tem de ser quem está gravando',
  );
});

test('a ficha de instrutor foi criada para quem já tinha o vínculo', async () => {
  const fichas = await comoUsuario(comoQuem('renato@exemplo.org'), (tx) =>
    tx.perfilInstrutor.findMany({ include: { usuario: { select: { email: true } } } }));
  const emails = fichas.map((f) => f.usuario.email).sort();
  assert.ok(emails.includes('marcos.instrutor@exemplo.org'),
    'a migração precisa dar ficha a quem já era instrutor');
  assert.ok(emails.includes('paulo.instrutor@exemplo.org'));
});

test('o instrutor edita a própria ficha e não a do colega', async () => {
  const minha = await comoUsuario(comoQuem('marcos.instrutor@exemplo.org'), (tx) =>
    tx.perfilInstrutor.update({
      where: { usuarioId: pessoas['marcos.instrutor@exemplo.org'] },
      data: { formacao: 'Formação declarada por ele mesmo' },
    }));
  assert.equal(minha.formacao, 'Formação declarada por ele mesmo');

  await assert.rejects(
    () => comoUsuario(comoQuem('marcos.instrutor@exemplo.org'), (tx) =>
      tx.perfilInstrutor.update({
        where: { usuarioId: pessoas['paulo.instrutor@exemplo.org'] },
        data: { formacao: 'alteração indevida' },
      })),
    'ninguém edita a ficha de instrutor de outra comum',
  );
});

test('a matrícula guarda instrutor e localidade, herdados da ficha do aluno', async () => {
  const jornadas = await comoUsuario(comoQuem('renato@exemplo.org'), (tx) =>
    tx.jornadaDoAluno.findMany({ select: { comumId: true, instrutorId: true, status: true } }));
  assert.ok(jornadas.length > 0);
  assert.ok(jornadas.every((j) => j.comumId), 'a migração precisa ter preenchido a localidade');
  assert.ok(jornadas.some((j) => j.instrutorId), 'e o instrutor de quem já o tinha na ficha');
});

test('o instrutor da matrícula a enxerga mesmo sem acompanhar a comum do aluno', async () => {
  // O caso real: instrutor de instrumento que atende aluno de outra
  // localidade. Sem isto ele não veria o próprio aluno.
  const alunoDeOutraComum = pessoas['pedro.aluno@exemplo.org'];   // Vila Nova
  const marcos = comoQuem('marcos.instrutor@exemplo.org');        // Centro

  const antes = await comoUsuario(marcos, (tx) =>
    tx.jornadaDoAluno.findMany({ where: { alunoId: alunoDeOutraComum } }));

  await dono.query('UPDATE jornadas_do_aluno SET "instrutorId" = $1 WHERE "alunoId" = $2', [marcos, alunoDeOutraComum]);
  const depois = await comoUsuario(marcos, (tx) =>
    tx.jornadaDoAluno.findMany({ where: { alunoId: alunoDeOutraComum } }));
  await dono.query('UPDATE jornadas_do_aluno SET "instrutorId" = NULL WHERE "alunoId" = $1', [alunoDeOutraComum]);

  assert.equal(antes.length, 0, 'antes de ser o instrutor dele, não via');
  assert.ok(depois.length > 0, 'sendo o instrutor da matrícula, vê');
});

test('a localidade nasce com tipo, e o tipo é dado', async () => {
  const comuns = await comoUsuario(comoQuem('renato@exemplo.org'), (tx) =>
    tx.comum.findMany({ select: { nome: true, tipo: true } }));
  assert.ok(comuns.length > 0);
  assert.ok(comuns.every((c) => typeof c.tipo === 'string'));
  assert.ok(comuns.some((c) => c.tipo === 'COMUM'), 'o que já existia continua sendo comum');
});

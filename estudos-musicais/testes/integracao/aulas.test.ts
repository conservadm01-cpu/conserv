/**
 * Aulas e frequência com banco de verdade.
 *
 * O que se cobra aqui: um instrutor não registra aula para aluno que não é
 * dele, e a aula de um aluno não aparece para o colega. Frequência é dado
 * sensível — quem faltou, quando e por quê — e circula só entre quem
 * acompanha aquele aluno.
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';

const urlApp = process.env.DATABASE_URL_TESTES_APP;
const urlDono = process.env.DATABASE_URL_TESTES;
if (!urlApp || !urlDono) throw new Error('Defina DATABASE_URL_TESTES e DATABASE_URL_TESTES_APP.');
process.env.DATABASE_URL = urlApp;

const { comoUsuario } = await import('../../src/lib/banco.ts');
const { resumoDeFrequencia } = await import('../../src/lib/aulas.ts');

const dono = new Client({ connectionString: urlDono });
const pessoas: Record<string, string> = {};
let jornadaDaMaria = '';
const criadas: string[] = [];

before(async () => {
  await dono.connect();
  for (const linha of (await dono.query('SELECT id, email FROM usuarios')).rows) pessoas[linha.email] = linha.id;

  // Paulo é o instrutor do Jardim Aeroporto, onde Maria estuda.
  await dono.query(
    'UPDATE jornadas_do_aluno SET "instrutorId" = $1 WHERE "alunoId" = $2',
    [pessoas['paulo.instrutor@exemplo.org'], pessoas['maria.aluna@exemplo.org']],
  );
  const jornada = await dono.query(
    'SELECT id FROM jornadas_do_aluno WHERE "alunoId" = $1 LIMIT 1',
    [pessoas['maria.aluna@exemplo.org']],
  );
  jornadaDaMaria = jornada.rows[0].id;
});

after(async () => {
  if (criadas.length) await dono.query('DELETE FROM aulas WHERE id = ANY($1)', [criadas]);
  await dono.end();
});

const quem = (email: string) => pessoas[email];

test('o instrutor registra a aula do seu aluno e a lê de volta', async () => {
  const paulo = quem('paulo.instrutor@exemplo.org');
  const aula = await comoUsuario(paulo, (tx) =>
    tx.aula.create({
      data: {
        jornadaId: jornadaDaMaria,
        instrutorId: paulo,
        registradoPorId: paulo,
        data: new Date('2026-09-01'),
        horaInicio: '19:30',
        horaFim: '20:30',
        conteudo: 'Escala de Sol maior, duas oitavas.',
        proximaAtividade: 'Estudar a lição 4 e trazer o método.',
      },
    }));
  criadas.push(aula.id);
  assert.equal(aula.conteudo, 'Escala de Sol maior, duas oitavas.');

  const presenca = await comoUsuario(paulo, (tx) =>
    tx.presenca.create({
      data: { aulaId: aula.id, alunoId: quem('maria.aluna@exemplo.org'), jornadaId: jornadaDaMaria, tipo: 'PRESENTE' },
    }));
  assert.equal(presenca.tipo, 'PRESENTE');
});

test('a aluna vê a própria aula e o que ficou combinado', async () => {
  const minhas = await comoUsuario(quem('maria.aluna@exemplo.org'), (tx) =>
    tx.aula.findMany({ where: { jornadaId: jornadaDaMaria } }));
  assert.ok(minhas.length > 0);
  assert.match(minhas[0].proximaAtividade!, /lição 4/);
});

test('o instrutor de outra comum não vê a aula nem a presença', async () => {
  const marcos = quem('marcos.instrutor@exemplo.org');
  const aulas = await comoUsuario(marcos, (tx) => tx.aula.findMany({ where: { jornadaId: jornadaDaMaria } }));
  assert.deepEqual(aulas, [], 'aula de aluno de outra localidade não aparece');

  const presencas = await comoUsuario(marcos, (tx) =>
    tx.presenca.findMany({ where: { alunoId: quem('maria.aluna@exemplo.org') } }));
  assert.deepEqual(presencas, [], 'quem faltou quando é dado de quem acompanha');
});

test('um aluno não vê a aula do colega', async () => {
  const aulas = await comoUsuario(quem('joao.aluno@exemplo.org'), (tx) =>
    tx.aula.findMany({ where: { jornadaId: jornadaDaMaria } }));
  assert.deepEqual(aulas, []);
});

test('o instrutor de outra comum não consegue registrar aula para esta matrícula', async () => {
  const marcos = quem('marcos.instrutor@exemplo.org');
  await assert.rejects(
    () => comoUsuario(marcos, (tx) =>
      tx.aula.create({
        data: {
          jornadaId: jornadaDaMaria, instrutorId: marcos, registradoPorId: marcos,
          data: new Date('2026-09-02'), conteudo: 'aula indevida',
        },
      })),
    'registrar aula para aluno que não é seu precisa falhar no banco',
  );
});

test('não dá para registrar aula no nome de outra pessoa', async () => {
  const paulo = quem('paulo.instrutor@exemplo.org');
  await assert.rejects(
    () => comoUsuario(paulo, (tx) =>
      tx.aula.create({
        data: {
          jornadaId: jornadaDaMaria, instrutorId: paulo,
          registradoPorId: quem('marcos.instrutor@exemplo.org'),
          data: new Date('2026-09-03'),
        },
      })),
    'quem registra é quem está gravando',
  );
});

test('o banco recusa aula que não é de turma nem de matrícula', async () => {
  const paulo = quem('paulo.instrutor@exemplo.org');
  await assert.rejects(
    () => dono.query(
      `INSERT INTO aulas (id, "instrutorId", "registradoPorId", data, situacao, "criadoEm", "atualizadoEm")
       VALUES ('aula_orfa', $1, $1, '2026-09-04', 'REALIZADA', now(), now())`,
      [paulo],
    ),
    'aula órfã não apareceria em relatório nenhum: some sem erro',
  );
});

test('a frequência sai da contagem das presenças gravadas', async () => {
  const paulo = quem('paulo.instrutor@exemplo.org');
  const maria = quem('maria.aluna@exemplo.org');

  for (const [dia, tipo] of [['2026-09-08', 'FALTA'], ['2026-09-15', 'PRESENTE']] as const) {
    const aula = await comoUsuario(paulo, (tx) =>
      tx.aula.create({
        data: { jornadaId: jornadaDaMaria, instrutorId: paulo, registradoPorId: paulo, data: new Date(dia) },
      }));
    criadas.push(aula.id);
    await comoUsuario(paulo, (tx) =>
      tx.presenca.create({ data: { aulaId: aula.id, alunoId: maria, jornadaId: jornadaDaMaria, tipo } }));
  }

  const presencas = await comoUsuario(paulo, (tx) =>
    tx.presenca.findMany({ where: { alunoId: maria }, include: { aula: { select: { data: true, situacao: true } } } }));

  const resumo = resumoDeFrequencia(presencas.map((p) => ({
    tipo: p.tipo, aula: p.aula ? { data: p.aula.data, situacao: p.aula.situacao } : null,
  })));
  assert.equal(resumo.aulas, 3);
  assert.equal(resumo.presencas, 2);
  assert.equal(resumo.faltas, 1);
  assert.equal(resumo.percentual, 67);
});

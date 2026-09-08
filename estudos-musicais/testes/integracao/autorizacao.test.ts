/**
 * Testes de autorização com banco de verdade.
 *
 * Cada caso tenta ATRAVESSAR o escopo: ler aluno de outra comum, de outra
 * região, promover a si mesmo, avaliar quem não é seu. A checagem acontece em
 * duas cercas independentes — a biblioteca da aplicação e o RLS do banco — e
 * os testes batem nas duas.
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';

const urlApp = process.env.DATABASE_URL_TESTES_APP;
const urlDono = process.env.DATABASE_URL_TESTES;
if (!urlApp || !urlDono) throw new Error('Defina DATABASE_URL_TESTES e DATABASE_URL_TESTES_APP.');
process.env.DATABASE_URL = urlApp;

const { escopoDoUsuario, podeVerAluno, filtroDeComuns, temPapel } = await import('../../src/lib/autorizacao.ts');
const { prisma } = await import('../../src/lib/banco.ts');

const dono = new Client({ connectionString: urlDono });
const app = new Client({ connectionString: urlApp });

/** Roda uma consulta como determinado usuário, exatamente como o servidor faz. */
async function comoUsuario<T = Record<string, unknown>>(usuarioId: string | null, sql: string, valores: unknown[] = []) {
  await app.query('BEGIN');
  try {
    await app.query('SELECT set_config($1, $2, true)', ['app.usuario_id', usuarioId ?? '']);
    const resultado = await app.query(sql, valores as never[]);
    return resultado.rows as T[];
  } finally {
    await app.query('ROLLBACK');
  }
}

const pessoas: Record<string, string> = {};
const comuns: Record<string, string> = {};

before(async () => {
  await dono.connect();
  await app.connect();
  const usuarios = await dono.query('SELECT id, email FROM usuarios');
  for (const linha of usuarios.rows) pessoas[linha.email] = linha.id;
  const listaComuns = await dono.query('SELECT id, codigo FROM comuns');
  for (const linha of listaComuns.rows) comuns[linha.codigo] = linha.id;
});

after(async () => {
  await dono.end();
  await app.end();
  await prisma.$disconnect();
});

// ------------------------------------------------------------- sem sessão

test('sem usuário autenticado o banco não devolve pessoa nem comum', async () => {
  assert.equal((await comoUsuario(null, 'SELECT * FROM perfis_aluno')).length, 0);
  assert.equal((await comoUsuario(null, 'SELECT * FROM comuns')).length, 0);
  assert.equal((await comoUsuario(null, 'SELECT * FROM usuarios')).length, 0);
});

test('sem usuário autenticado só a lição publicada aparece', async () => {
  const licoes = await comoUsuario<{ statusPublicacao: string }>(null, 'SELECT "statusPublicacao" FROM licoes');
  assert.ok(licoes.length > 0, 'a vitrine pública precisa mostrar alguma coisa');
  assert.ok(licoes.every((l) => l.statusPublicacao === 'PUBLICADO'));
});

// -------------------------------------------------------------- instrutor

test('instrutor enxerga os alunos da sua comum e nenhum de fora', async () => {
  const instrutor = pessoas['paulo.instrutor@exemplo.org'];
  const perfis = await comoUsuario<{ comumId: string }>(instrutor, 'SELECT "comumId" FROM perfis_aluno');
  assert.ok(perfis.length > 0);
  assert.ok(perfis.every((p) => p.comumId === comuns['COM-01']),
    'a consulta SEM filtro já vem limitada pela comum do vínculo');
});

test('trocar o id na consulta não abre o aluno de outra região', async () => {
  const instrutor = pessoas['paulo.instrutor@exemplo.org'];
  const alunoDeOutraRegiao = pessoas['lucas.aluno@exemplo.org'];
  const linhas = await comoUsuario(instrutor, 'SELECT * FROM perfis_aluno WHERE "usuarioId" = $1', [alunoDeOutraRegiao]);
  assert.equal(linhas.length, 0);

  const escopo = await escopoDoUsuario(instrutor);
  assert.equal(await podeVerAluno(escopo, alunoDeOutraRegiao), false);
  assert.equal(await podeVerAluno(escopo, pessoas['maria.aluna@exemplo.org']), true);
});

test('instrutor não lê progresso nem tempo de aluno de fora do seu escopo', async () => {
  const instrutor = pessoas['marcos.instrutor@exemplo.org']; // comum Centro, região Sul
  const alunoDoNorte = pessoas['maria.aluna@exemplo.org'];
  assert.equal((await comoUsuario(instrutor, 'SELECT * FROM progresso_licoes WHERE "alunoId" = $1', [alunoDoNorte])).length, 0);
  assert.equal((await comoUsuario(instrutor, 'SELECT * FROM tempos_diarios WHERE "usuarioId" = $1', [alunoDoNorte])).length, 0);
  assert.equal((await comoUsuario(instrutor, 'SELECT * FROM certificados WHERE "alunoId" = $1', [alunoDoNorte])).length, 0);
});

// ------------------------------------------------- encarregados e escopo

test('encarregado local fica na sua comum, mesmo dentro da própria região', async () => {
  const local = pessoas['jose.local@exemplo.org'];
  const visiveis = await comoUsuario<{ codigo: string }>(local, 'SELECT codigo FROM comuns');
  assert.deepEqual(visiveis.map((c) => c.codigo).sort(), ['COM-01'],
    'vínculo de comum não alcança a comum vizinha da mesma região');

  const escopo = await escopoDoUsuario(local);
  assert.equal(await podeVerAluno(escopo, pessoas['pedro.aluno@exemplo.org']), false, 'Vila Nova é outra comum');
});

test('encarregado regional enxerga as comuns da sua região e só delas', async () => {
  const regional = pessoas['antonio.regional@exemplo.org'];
  const visiveis = await comoUsuario<{ codigo: string }>(regional, 'SELECT codigo FROM comuns');
  assert.deepEqual(visiveis.map((c) => c.codigo).sort(), ['COM-01', 'COM-02']);

  const escopo = await escopoDoUsuario(regional);
  assert.equal(escopo.comunsVisiveis.length, 2);
  assert.equal(await podeVerAluno(escopo, pessoas['pedro.aluno@exemplo.org']), true, 'Vila Nova é da sua região');
  assert.equal(await podeVerAluno(escopo, pessoas['lucas.aluno@exemplo.org']), false, 'Curitiba não é da sua região');
});

test('ancião tem o mesmo limite territorial do seu vínculo', async () => {
  const escopo = await escopoDoUsuario(pessoas['benedito.anciao@exemplo.org']);
  assert.ok(temPapel(escopo, 'ANCIAO'));
  assert.equal(escopo.ehAdministracao, false, 'acompanhar não é administrar');
  assert.deepEqual(escopo.comunsVisiveis, [comuns['COM-01']]);
});

// ------------------------------------------------------------------ aluno

test('aluno vê a si mesmo e mais ninguém', async () => {
  const maria = pessoas['maria.aluna@exemplo.org'];
  const perfis = await comoUsuario<{ usuarioId: string }>(maria, 'SELECT "usuarioId" FROM perfis_aluno');
  assert.deepEqual(perfis.map((p) => p.usuarioId), [maria]);

  const escopo = await escopoDoUsuario(maria);
  assert.equal(await podeVerAluno(escopo, pessoas['joao.aluno@exemplo.org']), false,
    'colega da mesma comum também não é visível para o aluno');
});

test('aluno não consegue se promover a instrutor', async () => {
  const maria = pessoas['maria.aluna@exemplo.org'];
  await assert.rejects(
    () => comoUsuario(maria,
      `INSERT INTO vinculos (id, "usuarioId", papel, escopo, "comumId", ativo, "concedidoEm")
       VALUES ('teste-promocao', $1, 'INSTRUTOR', 'COMUM', $2, true, now())`,
      [maria, comuns['COM-01']]),
    /row-level security|violates/i,
  );
});

test('aluno não concede medalha nem certificado a si mesmo', async () => {
  const maria = pessoas['maria.aluna@exemplo.org'];
  const material = (await dono.query('SELECT id FROM materiais LIMIT 1')).rows[0].id;
  await assert.rejects(
    () => comoUsuario(maria,
      `INSERT INTO medalhas (id, "alunoId", "materialId", codigo, "concedidaEm")
       VALUES ('teste-medalha', $1, $2, 'TESTE-1', now())`, [maria, material]),
    /row-level security|violates/i,
  );
  await assert.rejects(
    () => comoUsuario(maria,
      `INSERT INTO certificados (id, "alunoId", trilha, fases, codigo, "emitidoEm")
       VALUES ('teste-certificado', $1, 'MSA', '[]'::jsonb, 'TESTE-2', now())`, [maria]),
    /row-level security|violates/i,
  );
});

test('aluno não altera o conteúdo do método', async () => {
  const maria = pessoas['maria.aluna@exemplo.org'];
  const alteradas = await comoUsuario(maria,
    `UPDATE licoes SET titulo = 'alterado pelo aluno' WHERE "statusPublicacao" = 'PUBLICADO' RETURNING id`);
  assert.equal(alteradas.length, 0, 'a política de escrita não deixa o aluno mexer no material');
});

// ------------------------------------------------------------ administração

test('administração pedagógica enxerga as quatro comuns', async () => {
  const escopo = await escopoDoUsuario(pessoas['ana.pedagogica@exemplo.org']);
  assert.equal(escopo.ehAdministracao, true);
  assert.equal(filtroDeComuns(escopo), undefined, 'sem filtro territorial, por ser escopo global');
  const visiveis = await comoUsuario(pessoas['ana.pedagogica@exemplo.org'], 'SELECT id FROM comuns');
  assert.equal(visiveis.length, 4);
});

test('quem não é administração nunca consulta sem filtro territorial', async () => {
  for (const email of ['paulo.instrutor@exemplo.org', 'jose.local@exemplo.org', 'antonio.regional@exemplo.org', 'maria.aluna@exemplo.org']) {
    const escopo = await escopoDoUsuario(pessoas[email]);
    const filtro = filtroDeComuns(escopo);
    assert.ok(filtro && Array.isArray(filtro.in), `${email} precisa de filtro explícito de comuns`);
  }
});

test('o papel da aplicação não ignora RLS', async () => {
  const linha = await app.query(
    'SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user');
  assert.equal(linha.rows[0].rolbypassrls, false);
  assert.equal(linha.rows[0].rolsuper, false);
});

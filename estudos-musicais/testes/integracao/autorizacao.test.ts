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

/** Várias instruções na MESMA transação, como o servidor faz num cadastro. */
async function comoUsuarioEmSequencia(usuarioId: string, passos: [string, unknown[]][]) {
  await app.query('BEGIN');
  try {
    await app.query('SELECT set_config($1, $2, true)', ['app.usuario_id', usuarioId]);
    const saidas = [];
    for (const [sql, valores] of passos) saidas.push(await app.query(sql, valores as never[]));
    return saidas;
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
  const metodo = (await dono.query('SELECT id FROM metodos LIMIT 1')).rows[0].id;
  await assert.rejects(
    () => comoUsuario(maria,
      `INSERT INTO medalhas (id, "alunoId", "metodoId", codigo, "concedidaEm")
       VALUES ('teste-medalha', $1, $2, 'TESTE-1', now())`, [maria, metodo]),
    /row-level security|violates/i,
  );
  await assert.rejects(
    () => comoUsuario(maria,
      `INSERT INTO certificados (id, "alunoId", trilha, fases, codigo, "emitidoEm")
       VALUES ('teste-certificado', $1, 'trilha de teste', '[]'::jsonb, 'TESTE-2', now())`, [maria]),
    /row-level security|violates/i,
  );
});

test('aluno não altera o conteúdo do método', async () => {
  const maria = pessoas['maria.aluna@exemplo.org'];
  const alteradas = await comoUsuario(maria,
    `UPDATE licoes SET titulo = 'alterado pelo aluno' WHERE "statusPublicacao" = 'PUBLICADO' RETURNING id`);
  assert.equal(alteradas.length, 0, 'a política de escrita não deixa o aluno mexer no material');
});

// ------------------------------------------------------- cadastro fechado

test('aluno não cria conta para ninguém', async () => {
  const maria = pessoas['maria.aluna@exemplo.org'];
  await assert.rejects(
    () => comoUsuario(maria,
      `INSERT INTO usuarios (id, "nomeCompleto", email, "senhaHash", status, "criadoPorId", "atualizadoEm")
       VALUES ('teste-conta', 'Conta Inventada', 'inventada@exemplo.org', 'x', 'ATIVO', $1, now())`,
      [maria]),
    /row-level security|violates/i,
    'sem esta recusa existiria autocadastro por dentro',
  );
});

test('quem cadastra não pode se esconder: o responsável tem de ser ele mesmo', async () => {
  const paulo = pessoas['paulo.instrutor@exemplo.org'];
  const outro = pessoas['jose.local@exemplo.org'];
  await assert.rejects(
    () => comoUsuario(paulo,
      `INSERT INTO usuarios (id, "nomeCompleto", email, "senhaHash", status, "criadoPorId", "atualizadoEm")
       VALUES ('teste-responsavel', 'Fulano', 'fulano@exemplo.org', 'x', 'ATIVO', $1, now())`,
      [outro]),
    /row-level security|violates/i,
  );
});

test('instrutor cadastra aluno na sua comum, e o banco aceita', async () => {
  const paulo = pessoas['paulo.instrutor@exemplo.org'];
  // Duas instruções na mesma transação, como a tela de cadastro faz.
  const saidas = await comoUsuarioEmSequencia(paulo, [
    // Com RETURNING, como o Prisma faz — é ele que exige que a linha recém
    // criada passe também pela política de LEITURA.
    [`INSERT INTO usuarios (id, "nomeCompleto", email, "senhaHash", status, "criadoPorId", "deveTrocarSenha", "atualizadoEm")
      VALUES ('teste-aluno-ok', 'Aluno de Teste', 'aluno.teste@exemplo.org', 'x', 'ATIVO', $1, true, now())
      RETURNING id`, [paulo]],
    [`INSERT INTO vinculos (id, "usuarioId", papel, escopo, "comumId", ativo, "concedidoEm", "concedidoPorId")
      VALUES ('teste-vinculo-ok', 'teste-aluno-ok', 'ALUNO', 'COMUM', $2, true, now(), $1)
      RETURNING id`, [paulo, comuns['COM-01']]],
  ]);
  assert.equal(saidas[0].rows.length, 1, 'a conta é criada E devolvida a quem a criou');
  assert.equal(saidas[1].rows.length, 1, 'o vínculo de aluno na própria comum é concedido');
});

test('instrutor não concede papel de administração', async () => {
  const paulo = pessoas['paulo.instrutor@exemplo.org'];
  await assert.rejects(
    () => comoUsuarioEmSequencia(paulo, [
      [`INSERT INTO usuarios (id, "nomeCompleto", email, "senhaHash", status, "criadoPorId", "atualizadoEm")
        VALUES ('teste-admin', 'Admin Inventado', 'admin.inventado@exemplo.org', 'x', 'ATIVO', $1, now())`, [paulo]],
      [`INSERT INTO vinculos (id, "usuarioId", papel, escopo, ativo, "concedidoEm", "concedidoPorId")
        VALUES ('teste-vinculo-admin', 'teste-admin', 'SUPERADMIN', 'GLOBAL', true, now(), $1)`, [paulo]],
    ]),
    /row-level security|violates/i,
    'administrador só é criado por administrador',
  );
});

test('instrutor não cadastra em comum de outra região', async () => {
  const paulo = pessoas['paulo.instrutor@exemplo.org']; // Jardim Aeroporto, região Norte
  await assert.rejects(
    () => comoUsuarioEmSequencia(paulo, [
      [`INSERT INTO usuarios (id, "nomeCompleto", email, "senhaHash", status, "criadoPorId", "atualizadoEm")
        VALUES ('teste-fora', 'Aluno de Fora', 'fora@exemplo.org', 'x', 'ATIVO', $1, now())`, [paulo]],
      [`INSERT INTO vinculos (id, "usuarioId", papel, escopo, "comumId", ativo, "concedidoEm", "concedidoPorId")
        VALUES ('teste-vinculo-fora', 'teste-fora', 'ALUNO', 'COMUM', $2, true, now(), $1)`, [paulo, comuns['COM-03']]],
    ]),
    /row-level security|violates/i,
  );
});

test('a entrada aceita nome de acesso além do e-mail', async () => {
  const linhas = await dono.query(
    `SELECT * FROM app.credenciais_para_login($1)`, ['  Maria.Aluna@Exemplo.ORG ']);
  assert.equal(linhas.rows.length, 1, 'e-mail com espaço e caixa trocada precisa casar');

  await dono.query(`UPDATE usuarios SET "login" = app.normalizar_login('Maria Souza') WHERE email = $1`,
    ['maria.aluna@exemplo.org']);
  const porNome = await dono.query(`SELECT * FROM app.credenciais_para_login($1)`, ['MARIA  SOUZA']);
  assert.equal(porNome.rows.length, 1, 'nome em caixa alta e com espaço a mais precisa casar');
  await dono.query(`UPDATE usuarios SET "login" = NULL WHERE email = $1`, ['maria.aluna@exemplo.org']);
});

test('gravar e ler de volta funciona para quem não é administração', async () => {
  // Regressão: `INSERT ... RETURNING` — que o Prisma usa em toda gravação —
  // exige que a linha nova passe também pela política de LEITURA. Enquanto a
  // política de escrita foi mais larga que a de leitura, cadastrar e auditar
  // quebravam para todo mundo que não fosse administração.
  const paulo = pessoas['paulo.instrutor@exemplo.org'];
  const auditoria = await comoUsuario(paulo,
    `INSERT INTO auditorias (id, "usuarioId", acao, entidade, "criadoEm")
     VALUES ('teste-auditoria', $1, 'TESTE', 'usuarios', now()) RETURNING id`, [paulo]);
  assert.equal(auditoria.length, 1, 'quem registra a auditoria precisa poder lê-la de volta');
});

// --------------------------------------------------- edição de usuários

test('instrutor altera o cadastro do aluno da sua comum', async () => {
  const paulo = pessoas['paulo.instrutor@exemplo.org'];
  const maria = pessoas['maria.aluna@exemplo.org']; // mesma comum
  const linhas = await comoUsuario(paulo,
    `UPDATE usuarios SET telefone = '(11) 90000-0000' WHERE id = $1 RETURNING id`, [maria]);
  assert.equal(linhas.length, 1);
});

test('instrutor não altera o cadastro de aluno de outra região', async () => {
  const paulo = pessoas['paulo.instrutor@exemplo.org'];
  const lucas = pessoas['lucas.aluno@exemplo.org']; // Curitiba
  const linhas = await comoUsuario(paulo,
    `UPDATE usuarios SET telefone = '(11) 90000-0000' WHERE id = $1 RETURNING id`, [lucas]);
  assert.equal(linhas.length, 0, 'a política não deixa a linha nem ser encontrada para escrita');
});

test('quem não é administração não altera o cadastro da administração', async () => {
  const local = pessoas['jose.local@exemplo.org'];
  const ana = pessoas['ana.pedagogica@exemplo.org'];
  const linhas = await comoUsuario(local,
    `UPDATE usuarios SET "nomeCompleto" = 'Nome Trocado' WHERE id = $1 RETURNING id`, [ana]);
  assert.equal(linhas.length, 0);
});

test('aluno não altera o cadastro de ninguém, nem do colega', async () => {
  const maria = pessoas['maria.aluna@exemplo.org'];
  const joao = pessoas['joao.aluno@exemplo.org'];
  assert.equal((await comoUsuario(maria,
    `UPDATE usuarios SET "nomeCompleto" = 'Trocado' WHERE id = $1 RETURNING id`, [joao])).length, 0);
  // Mas altera o seu próprio, que é o caso da troca de senha.
  assert.equal((await comoUsuario(maria,
    `UPDATE usuarios SET telefone = '(11) 98888-7777' WHERE id = $1 RETURNING id`, [maria])).length, 1);
});

test('aluno não se promove alterando o próprio vínculo', async () => {
  const maria = pessoas['maria.aluna@exemplo.org'];
  const linhas = await comoUsuario(maria,
    `UPDATE vinculos SET papel = 'INSTRUTOR' WHERE "usuarioId" = $1 RETURNING id`, [maria]);
  assert.equal(linhas.length, 0);
});

test('instrutor revoga vínculo de aluno da sua comum, e não o de fora', async () => {
  const paulo = pessoas['paulo.instrutor@exemplo.org'];
  const maria = pessoas['maria.aluna@exemplo.org'];
  const lucas = pessoas['lucas.aluno@exemplo.org'];
  assert.equal((await comoUsuario(paulo,
    `UPDATE vinculos SET ativo = false, "revogadoEm" = now()
     WHERE "usuarioId" = $1 AND papel = 'ALUNO' RETURNING id`, [maria])).length, 1);
  assert.equal((await comoUsuario(paulo,
    `UPDATE vinculos SET ativo = false, "revogadoEm" = now()
     WHERE "usuarioId" = $1 AND papel = 'ALUNO' RETURNING id`, [lucas])).length, 0);
});

test('a função de escopo enxerga os vínculos do alvo, não os de quem pergunta', async () => {
  const paulo = pessoas['paulo.instrutor@exemplo.org'];
  const maria = pessoas['maria.aluna@exemplo.org'];
  const ana = pessoas['ana.pedagogica@exemplo.org'];
  const [dela] = await comoUsuario<{ pode: boolean }>(paulo,
    'SELECT app.pode_editar_usuario($1) AS pode', [maria]);
  const [daAdmin] = await comoUsuario<{ pode: boolean }>(paulo,
    'SELECT app.pode_editar_usuario($1) AS pode', [ana]);
  assert.equal(dela.pode, true);
  assert.equal(daAdmin.pode, false);
});

test('matricular alguém exige enxergar essa pessoa', async () => {
  // Regressão: a política conferia só a TURMA, então quem acompanha a comum
  // dela podia matricular qualquer pessoa do sistema — inclusive aluno de
  // outra região.
  const paulo = pessoas['paulo.instrutor@exemplo.org'];
  const lucas = pessoas['lucas.aluno@exemplo.org']; // Curitiba, fora do escopo
  const maria = pessoas['maria.aluna@exemplo.org']; // mesma comum de Paulo
  const [turma] = (await dono.query(
    `SELECT t.id FROM turmas t JOIN comuns c ON c.id = t."comumId"
     WHERE c.codigo = 'COM-01' AND t."instrumentoId" IS NULL LIMIT 1`)).rows;

  await assert.rejects(
    () => comoUsuario(paulo,
      `INSERT INTO matriculas_em_turma (id, "turmaId", "alunoId", "entradaEm")
       VALUES ('teste-matricula-fora', $1, $2, now())`, [turma.id, lucas]),
    /row-level security|violates/i,
  );

  const legitima = await comoUsuarioEmSequencia(paulo, [
    [`DELETE FROM matriculas_em_turma WHERE "turmaId" = $1 AND "alunoId" = $2`, [turma.id, maria]],
    [`INSERT INTO matriculas_em_turma (id, "turmaId", "alunoId", "entradaEm")
      VALUES ('teste-matricula-ok', $1, $2, now()) RETURNING id`, [turma.id, maria]],
  ]);
  assert.equal(legitima[1].rows.length, 1, 'a matrícula da própria comum passa, com RETURNING');
});

// ------------------------------------------------------------------ turmas

test('turma e matrícula são legíveis sem que as políticas entrem em recursão', async () => {
  // Regressão: `turmas_leitura` consultava matriculas_em_turma e a política de
  // escrita das matrículas, declarada FOR ALL, consultava turmas — o SELECT ia
  // de uma à outra sem fim. Ver 20260908191000_corrige_recursao_de_turmas.
  for (const email of ['paulo.instrutor@exemplo.org', 'maria.aluna@exemplo.org', 'ana.pedagogica@exemplo.org']) {
    await comoUsuario(pessoas[email], 'SELECT id FROM turmas');
    await comoUsuario(pessoas[email], 'SELECT id FROM matriculas_em_turma');
  }
});

test('o aluno vê a sua turma e nenhuma outra', async () => {
  const maria = pessoas['maria.aluna@exemplo.org'];
  const turmas = await comoUsuario<{ id: string }>(maria, 'SELECT id FROM turmas');
  const matriculas = await comoUsuario<{ alunoId: string }>(maria, 'SELECT "alunoId" FROM matriculas_em_turma');
  assert.ok(turmas.length >= 1, 'a turma em que está matriculada precisa aparecer');
  assert.ok(matriculas.every((m) => m.alunoId === maria), 'nenhuma matrícula de colega');
});

test('instrutor não matricula aluno em turma de outra comum', async () => {
  const marcos = pessoas['marcos.instrutor@exemplo.org']; // comum Centro
  const turmaDoNorte = (await dono.query(
    `SELECT t.id FROM turmas t JOIN comuns c ON c.id = t."comumId" WHERE c.codigo = 'COM-01' LIMIT 1`)).rows[0].id;
  await assert.rejects(
    () => comoUsuario(marcos,
      `INSERT INTO matriculas_em_turma (id, "turmaId", "alunoId", "entradaEm")
       VALUES ('teste-matricula', $1, $2, now())`,
      [turmaDoNorte, pessoas['maria.aluna@exemplo.org']]),
    /row-level security|violates/i,
  );
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

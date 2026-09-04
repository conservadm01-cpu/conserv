import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conserv-acessos-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');

const { getDb, migrate } = await import('../src/db/index.js');
const {
  criarAcesso, redefinirSenha, trocarSenha, registrarEntrada, registrar,
  logDeSenhas, resumoAcessos, situacaoAcessos, sugerirEmail, contexto,
  MINIMO_SENHA, MINIMO_PROVISORIA,
} = await import('../src/services/acessos.js');

const db = migrate(getDb());
const admin = { id: 1, nome: 'Administrador' };
const pedidoFalso = {
  headers: { 'x-forwarded-for': '200.1.2.3, 10.0.0.1', 'user-agent': 'Chrome/1.0' },
  socket: { remoteAddress: '10.0.0.9' },
};

const usuarioPorEmail = (email) => db.prepare(`SELECT * FROM usuarios WHERE email = ?`).get(email);

/* ------------------------------------------------------------ e-mail ----- */

test('o e-mail sugerido junta o primeiro e o último nome, sem acento nem preposição', () => {
  assert.equal(sugerirEmail('Renato Monteiro'), 'renato.monteiro@conserv.com.br');
  assert.equal(sugerirEmail('Maria da Silva Souza'), 'maria.souza@conserv.com.br');
  assert.equal(sugerirEmail('José Antônio de Assunção'), 'jose.assuncao@conserv.com.br');
  assert.equal(sugerirEmail('Ana'), 'ana@conserv.com.br');
  assert.equal(sugerirEmail('  '), null);
});

test('o contexto pega o primeiro IP da cadeia e corta o agente', () => {
  const c = contexto(pedidoFalso);
  assert.equal(c.origem, '200.1.2.3');
  assert.equal(c.agente, 'Chrome/1.0');
  assert.deepEqual(contexto(null), { origem: null, agente: null });
  const longo = contexto({ headers: { 'user-agent': 'x'.repeat(400) }, socket: {} });
  assert.equal(longo.agente.length, 180);
});

/* ------------------------------------------------------ criação e log ---- */

test('criar acesso grava criação e senha provisória — e nunca a senha', async () => {
  const criado = await criarAcesso(
    { nome: 'Renato Monteiro', email: 'renato.monteiro@conserv.com.br', senha: '123',
      perfil: 'GESTOR', nivel_acesso: 'gerencial' },
    { autor: admin, req: pedidoFalso }
  );

  assert.equal(criado.senha_provisoria, 1);
  assert.equal(criado.email, 'renato.monteiro@conserv.com.br');
  assert.equal('senha_hash' in criado, false, 'o retorno não pode trazer o hash');

  const eventos = logDeSenhas({ usuario_id: criado.id });
  assert.deepEqual(eventos.map((e) => e.evento).sort(), ['CRIACAO', 'PROVISORIA']);
  assert.equal(eventos[0].autor_nome, 'Administrador');
  assert.equal(eventos[0].origem, '200.1.2.3');

  // Nenhuma coluna do log pode conter a senha, nem o hash.
  const bruto = JSON.stringify(eventos);
  assert.equal(bruto.includes('123'), false, 'a senha não pode aparecer no log');
  assert.equal(bruto.includes('$2'), false, 'o hash não pode aparecer no log');

  // Mas a senha realmente vale para entrar.
  assert.ok(await bcrypt.compare('123', usuarioPorEmail(criado.email).senha_hash));
});

test('a senha provisória pode ser curta; a que a pessoa escolhe, não', async () => {
  await assert.rejects(
    () => criarAcesso({ nome: 'Curta', email: 'curta@conserv.com.br', senha: '12' }, {}),
    new RegExp(`ao menos ${MINIMO_PROVISORIA}`)
  );
  await assert.rejects(
    () => criarAcesso({ nome: 'Definitiva', email: 'def@conserv.com.br', senha: '12345', provisoria: false }, {}),
    new RegExp(`ao menos ${MINIMO_SENHA}`)
  );
});

test('e-mail repetido, e-mail torto e colaborador já com acesso são recusados', async () => {
  await assert.rejects(
    () => criarAcesso({ nome: 'Outro', email: 'RENATO.MONTEIRO@conserv.com.br', senha: '123' }, {}),
    /já é usado/i
  );
  await assert.rejects(
    () => criarAcesso({ nome: 'Torto', email: 'sem-arroba', senha: '123' }, {}),
    /e-mail válido/i
  );

  const colaborador = db.prepare(`INSERT INTO colaboradores (nome) VALUES ('Costureira Ana')`)
    .run().lastInsertRowid;
  await criarAcesso(
    { nome: 'Costureira Ana', email: 'ana.costura@conserv.com.br', senha: '123', colaborador_id: colaborador },
    { autor: admin }
  );
  await assert.rejects(
    () => criarAcesso(
      { nome: 'Ana de novo', email: 'ana2@conserv.com.br', senha: '123', colaborador_id: colaborador }, {}
    ),
    /já tem acesso/i
  );
});

/* ------------------------------------------------------- primeiro acesso - */

test('a troca no primeiro acesso derruba a provisória e vira PRIMEIRO_ACESSO no log', async () => {
  const u = usuarioPorEmail('renato.monteiro@conserv.com.br');
  assert.equal(u.senha_provisoria, 1);
  assert.equal(u.senha_alterada_em, null);

  const r = await trocarSenha(u.id, { senha_atual: '123', senha_nova: 'conserv2026' }, { req: pedidoFalso });
  assert.equal(r.ok, true);

  const depois = usuarioPorEmail(u.email);
  assert.equal(depois.senha_provisoria, 0);
  assert.ok(depois.senha_alterada_em);
  assert.ok(await bcrypt.compare('conserv2026', depois.senha_hash));

  const eventos = logDeSenhas({ usuario_id: u.id });
  assert.equal(eventos[0].evento, 'PRIMEIRO_ACESSO');

  // A segunda troca já é troca comum.
  await trocarSenha(u.id, { senha_atual: 'conserv2026', senha_nova: 'outrasenha' }, {});
  assert.equal(logDeSenhas({ usuario_id: u.id })[0].evento, 'TROCA');
});

test('trocar recusa senha atual errada, senha curta e senha repetida', async () => {
  const u = usuarioPorEmail('renato.monteiro@conserv.com.br');

  const errada = await trocarSenha(u.id, { senha_atual: 'chutando', senha_nova: 'seilaqual' }, {});
  assert.equal(errada.ok, false);
  assert.equal(errada.motivo, 'senha_atual');
  // E a tentativa fica registrada.
  assert.equal(logDeSenhas({ usuario_id: u.id })[0].evento, 'FALHA');

  await assert.rejects(
    () => trocarSenha(u.id, { senha_atual: 'outrasenha', senha_nova: 'abc' }, {}),
    new RegExp(`ao menos ${MINIMO_SENHA}`)
  );
  await assert.rejects(
    () => trocarSenha(u.id, { senha_atual: 'outrasenha', senha_nova: 'outrasenha' }, {}),
    /diferente da atual/i
  );
});

test('redefinição pelo administrador volta a exigir troca na entrada', async () => {
  const u = usuarioPorEmail('renato.monteiro@conserv.com.br');
  await redefinirSenha(u.id, '999', { autor: admin, req: pedidoFalso });

  const depois = usuarioPorEmail(u.email);
  assert.equal(depois.senha_provisoria, 1);
  assert.ok(await bcrypt.compare('999', depois.senha_hash));

  const evento = logDeSenhas({ usuario_id: u.id })[0];
  assert.equal(evento.evento, 'RESET');
  assert.equal(evento.autor_nome, 'Administrador');
  assert.match(evento.detalhe, /troca exigida/i);

  // Quem redefine pode abrir mão da provisória, mas aí vale o tamanho cheio.
  await assert.rejects(
    () => redefinirSenha(u.id, '999', { autor: admin, provisoria: false }),
    new RegExp(`ao menos ${MINIMO_SENHA}`)
  );
});

/* ------------------------------------------------------------- trilha ---- */

test('o log filtra por pessoa, evento e período, e a trilha sobrevive ao cadastro', () => {
  const u = usuarioPorEmail('ana.costura@conserv.com.br');
  registrar({ usuario: u, evento: 'FALHA', req: pedidoFalso, detalhe: 'senha incorreta' });
  registrarEntrada(u, pedidoFalso);

  assert.equal(logDeSenhas({ usuario_id: u.id, evento: 'FALHA' }).length, 1);
  assert.equal(logDeSenhas({ usuario_id: u.id, evento: 'LOGIN' }).length, 1);
  assert.equal(logDeSenhas({ de: '2000-01-01' }).length > 0, true);
  assert.equal(logDeSenhas({ ate: '2000-01-01' }).length, 0);
  assert.equal(logDeSenhas({ limite: 2 }).length, 2);

  // O nome fica congelado na linha: apagar o usuário não apaga a trilha.
  db.prepare(`DELETE FROM usuarios WHERE id = ?`).run(u.id);
  const orfaos = logDeSenhas({}).filter((l) => l.usuario_nome === 'Costureira Ana');
  assert.ok(orfaos.length >= 2, 'os eventos continuam, mesmo sem o cadastro');
  assert.equal(orfaos[0].usuario_id, null);
});

test('o resumo conta falhas recentes, provisórias e quem nunca entrou', async () => {
  const r = resumoAcessos();
  assert.ok(r.falhas_24h >= 1);
  assert.ok(r.provisorias >= 1);
  assert.ok(r.por_evento.some((e) => e.evento === 'RESET'));

  const situacao = situacaoAcessos();
  const renato = situacao.find((u) => u.email === 'renato.monteiro@conserv.com.br');
  assert.equal(renato.senha_provisoria, 1);
  assert.equal(renato.ultimo_acesso, null, 'ainda não entrou de fato');
  assert.equal('senha_hash' in renato, false);
});

/* --------------------------------------------------------------- HTTP ---- */

test('pela API: login registra entrada e recusa, e o hash nunca sai', async () => {
  const { criarApp } = await import('../src/index.js');
  const app = criarApp();

  db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, perfil, nivel_acesso)
              VALUES ('Chefe', 'chefe@conserv.com.br', ?, 'ADMIN', 'total')`)
    .run(bcrypt.hashSync('chefe123', 4));

  const servidor = app.listen(0);
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  const entrar = (email, senha) =>
    fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    });

  try {
    // Senha errada e e-mail inexistente dizem a mesma coisa para quem tenta.
    const ruim = await entrar('chefe@conserv.com.br', 'errada');
    const inexistente = await entrar('ninguem@conserv.com.br', 'errada');
    assert.equal(ruim.status, 401);
    assert.equal(inexistente.status, 401);
    assert.deepEqual(await ruim.json(), await inexistente.json());
    // Mas o log sabe a diferença.
    assert.match(logDeSenhas({ limite: 2 }).map((l) => l.detalhe).join('|'), /não cadastrado/);
    assert.match(logDeSenhas({ limite: 2 }).map((l) => l.detalhe).join('|'), /senha incorreta/);

    const ok = await entrar('chefe@conserv.com.br', 'chefe123');
    assert.equal(ok.status, 200);
    const sessao = await ok.json();
    assert.equal(sessao.usuario.senha_provisoria, 0);
    assert.ok(sessao.token);
    const headers = { Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' };

    // Acesso inativo é barrado e registrado como bloqueio.
    const inativo = usuarioPorEmail('renato.monteiro@conserv.com.br');
    db.prepare(`UPDATE usuarios SET ativo = 0 WHERE id = ?`).run(inativo.id);
    assert.equal((await entrar(inativo.email, '999')).status, 401);
    assert.equal(logDeSenhas({ usuario_id: inativo.id })[0].evento, 'BLOQUEIO');
    db.prepare(`UPDATE usuarios SET ativo = 1 WHERE id = ?`).run(inativo.id);

    // Nenhuma rota de usuário devolve o hash.
    for (const rota of ['/usuarios', '/usuarios/situacao', `/usuarios/${inativo.id}`,
                        '/usuarios/log-senhas', '/usuarios/log-senhas/resumo']) {
      const r = await fetch(`${base}${rota}`, { headers });
      const corpo = await r.text();
      assert.equal(r.status, 200, `${rota} devolveu ${r.status}: ${corpo}`);
      assert.equal(corpo.includes('senha_hash'), false, `${rota} vazou o hash`);
      assert.equal(corpo.includes('$2b$'), false, `${rota} vazou o hash`);
    }

    // Criar acesso pela API, entrar com a provisória e ser obrigado a trocar.
    const novo = await fetch(`${base}/usuarios/novo`, {
      method: 'POST', headers,
      body: JSON.stringify({ nome: 'Fulano Teste', email: 'fulano@conserv.com.br', senha: '123' }),
    });
    assert.equal(novo.status, 201);
    const criado = await novo.json();
    assert.equal(criado.senha_provisoria, 1);

    const primeira = await (await entrar('fulano@conserv.com.br', '123')).json();
    assert.equal(primeira.usuario.senha_provisoria, 1, 'a tela precisa saber que tem de trocar');

    const trocou = await fetch(`${base}/auth/senha`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${primeira.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha_atual: '123', senha_nova: 'minhasenha1' }),
    });
    assert.equal(trocou.status, 200);

    const depois = await (await entrar('fulano@conserv.com.br', 'minhasenha1')).json();
    assert.equal(depois.usuario.senha_provisoria, 0);
    assert.equal(logDeSenhas({ usuario_id: criado.id })[1].evento, 'PRIMEIRO_ACESSO');

    // E o e-mail sugerido vem pronto para a tela.
    const sugerido = await (await fetch(`${base}/usuarios/sugerir-email?nome=Renato Monteiro`, { headers })).json();
    assert.equal(sugerido.email, 'renato.monteiro@conserv.com.br');
  } finally {
    servidor.close();
  }
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

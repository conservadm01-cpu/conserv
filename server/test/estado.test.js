import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csvsist-estado-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');

const { getDb, migrate } = await import('../src/db/index.js');
const { lerEstado, gravarEstado, abrirSessao, emInstalacao, hashSenha } =
  await import('../src/services/estado.js');

const db = migrate(getDb());

/** Colaborador com senha no mesmo formato que o app grava. */
const comSenha = (nome, usuario, senha, extra = {}) => {
  const salt = 'sal' + nome.length;
  return {
    id: `c-${usuario}`, nome, usuario, perfil: 'Administrador',
    senhaSalt: salt, senhaHash: hashSenha(senha, salt), ...extra,
  };
};

const base = (colaboradores = []) => ({ colaboradores, materiais: [], seq: {} });

test('base nova abre vazia, na versão zero', () => {
  const estado = lerEstado(db);
  assert.equal(estado.versao, 0);
  assert.deepEqual(estado.documento.colaboradores, []);
  assert.equal(emInstalacao(estado.documento), true, 'sem ninguém cadastrado, é instalação');
});

test('gravar avança a versão e devolve o documento inteiro', () => {
  const { versao } = gravarEstado({ documento: base([comSenha('Ana', 'ana', 'ana12345')]), versao: 0 }, db);
  assert.equal(versao, 1);

  const estado = lerEstado(db);
  assert.equal(estado.versao, 1);
  assert.equal(estado.documento.colaboradores[0].nome, 'Ana');
  assert.equal(emInstalacao(estado.documento), false, 'com gente cadastrada, a instalação fechou');
});

test('gravação com versão velha é recusada, e o trabalho do outro fica de pé', () => {
  const inicial = lerEstado(db).versao;
  gravarEstado({ documento: base([comSenha('Ana', 'ana', 'ana12345'), { id: 'x', nome: 'Bruno' }]), versao: inicial }, db);

  assert.throws(
    () => gravarEstado({ documento: base([comSenha('Ana', 'ana', 'ana12345')]), versao: inicial }, db),
    (erro) => {
      assert.equal(erro.status, 409);
      assert.equal(erro.details.versao_atual, inicial + 1);
      return true;
    }
  );
  assert.equal(lerEstado(db).documento.colaboradores.length, 2, 'a gravação recusada não apagou nada');
});

test('documento que não é objeto é recusado', () => {
  const versao = lerEstado(db).versao;
  assert.throws(() => gravarEstado({ documento: [1, 2], versao }, db), /precisa ser um objeto/);
  assert.throws(() => gravarEstado({ documento: null, versao }, db), /precisa ser um objeto/);
});

test('a sessão confere a senha no servidor e devolve a base junto', () => {
  const versao = lerEstado(db).versao;
  gravarEstado({ documento: base([comSenha('Ana Paula', 'ana', 'ana12345')]), versao }, db);

  const sessao = abrirSessao({ usuario: 'ana', senha: 'ana12345' }, db);
  assert.equal(sessao.usuario.nome, 'Ana Paula');
  assert.ok(sessao.token.length > 20);
  assert.equal(sessao.documento.colaboradores.length, 1);
  assert.equal(sessao.versao, lerEstado(db).versao);
});

test('usuário desconhecido e senha errada recebem a mesma recusa', () => {
  const erroSenha = (() => { try { abrirSessao({ usuario: 'ana', senha: 'errada' }, db); } catch (e) { return e; } })();
  const erroUsuario = (() => { try { abrirSessao({ usuario: 'ninguem', senha: 'errada' }, db); } catch (e) { return e; } })();
  assert.equal(erroSenha.status, 401);
  assert.equal(erroUsuario.status, 401);
  assert.equal(erroSenha.message, erroUsuario.message, 'a mensagem não entrega qual metade falhou');
});

test('quem entra pelo nome ou pelo e-mail encontra o mesmo cadastro', () => {
  const versao = lerEstado(db).versao;
  gravarEstado(
    { documento: base([comSenha('Carlos Dias', 'carlos', 'carlos123', { email: 'carlos@conserv.com.br' })]), versao },
    db
  );
  for (const usuario of ['carlos', 'Carlos Dias', 'CARLOS@CONSERV.COM.BR']) {
    assert.equal(abrirSessao({ usuario, senha: 'carlos123' }, db).usuario.nome, 'Carlos Dias');
  }
});

test('colaborador inativo não entra', () => {
  const versao = lerEstado(db).versao;
  gravarEstado(
    { documento: base([comSenha('Dora', 'dora', 'dora12345', { status: 'Inativo' })]), versao },
    db
  );
  assert.throws(() => abrirSessao({ usuario: 'dora', senha: 'dora12345' }, db), /incorretos/);
});

test('pela API: sem token a base não sai, e com token grava com versão', async () => {
  const { criarApp } = await import('../src/index.js');
  const app = criarApp();
  const servidor = app.listen(0);
  const base2 = `http://127.0.0.1:${servidor.address().port}/api/app`;

  const versao = lerEstado(db).versao;
  gravarEstado({ documento: base([comSenha('Eva', 'eva', 'eva12345')]), versao }, db);

  try {
    const semToken = await fetch(`${base2}/estado`);
    assert.equal(semToken.status, 401, 'base com gente cadastrada exige sessão');

    const entrada = await fetch(`${base2}/sessao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'eva', senha: 'eva12345' }),
    });
    assert.equal(entrada.status, 200);
    const { token, versao: lida } = await entrada.json();

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const leitura = await (await fetch(`${base2}/estado`, { headers })).json();
    assert.equal(leitura.versao, lida);
    assert.equal(leitura.instalacao, false);

    const gravacao = await fetch(`${base2}/estado`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ documento: { ...leitura.documento, materiais: [{ id: 'm1', nome: 'MALHA PV' }] }, versao: lida }),
    });
    assert.equal(gravacao.status, 200);
    assert.equal((await gravacao.json()).versao, lida + 1);
    assert.equal(lerEstado(db).documento.materiais[0].nome, 'MALHA PV');

    // A mesma versão de novo: o servidor recusa em vez de passar por cima.
    const repetida = await fetch(`${base2}/estado`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ documento: leitura.documento, versao: lida }),
    });
    assert.equal(repetida.status, 409);
    assert.equal(lerEstado(db).documento.materiais.length, 1, 'a base seguiu com o que foi gravado antes');
  } finally {
    servidor.close();
  }
});

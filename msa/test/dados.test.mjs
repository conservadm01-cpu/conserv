// Os dados do aparelho: cadastro, cópia de segurança e a subida de versão de
// quem já usava o aplicativo antes desta mudança.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp, autocadastrar } from './apoio.mjs';

let app;
before(async () => { app = await abrirApp(); });
after(async () => { await app.fechar(); });
beforeEach(async () => { await app.reiniciar(); });

test('o cadastro nasce válido e sem pendências de estrutura', async () => {
  await autocadastrar(app);
  const problemas = await app.pagina.evaluate(() => __modulos['dados/repositorios'].problemasDeEstrutura());
  assert.deepEqual(problemas, []);
});

test('a cópia de segurança vai e volta inteira', async () => {
  await autocadastrar(app);
  const volta = await app.pagina.evaluate(() => {
    const banco = __modulos['armazenamento'];
    const copia = banco.exportar();
    banco.apagarTudo();
    const vazio = banco.usuarios().length;
    banco.importar(copia);
    return {
      vazio,
      alunos: banco.usuarios().map((a) => a.nome),
      acessos: banco.dados.usuarios.listar().map((u) => ({ login: u.login, tem: Boolean(u.senhaHash) })),
      problemas: banco.dados.problemasDeEstrutura(),
    };
  });
  assert.equal(volta.vazio, 0);
  assert.deepEqual(volta.alunos, ['Ana Teste']);
  assert.deepEqual(volta.problemas, []);
  assert.ok(volta.acessos.every((a) => a.tem), 'todo acesso volta com senha');
});

test('depois de importar, a senha de antes continua valendo', async () => {
  await autocadastrar(app);
  await app.pagina.evaluate(() => {
    const banco = __modulos['armazenamento'];
    const copia = banco.exportar();
    banco.apagarTudo();
    banco.importar(copia);
  });
  await app.ir('#/sair');
  await app.pagina.reload();
  await app.pagina.waitForSelector('#usuario');
  await app.entrar('Ana Teste', 'ana123');
  assert.equal((await app.sessao()).tipo, 'aluno');
});

test('remover um aluno leva junto o progresso, os certificados e o acesso', async () => {
  const id = await autocadastrar(app);
  await app.ir('#/fase/1/licao/0');
  const sobrou = await app.pagina.evaluate((alvo) => {
    const banco = __modulos['armazenamento'];
    banco.removerUsuario(alvo);
    const R = banco.dados;
    return {
      alunos: R.alunos.listar().length,
      acessos: R.usuarios.listar().filter((u) => u.alunoId === alvo).length,
      progresso: R.progressoDeTodasAsFases(alvo).length,
      certificados: R.certificadosDoAluno(alvo).length,
      matriculas: R.matriculasDoAluno(alvo).length,
      problemas: R.problemasDeEstrutura(),
    };
  }, id);
  assert.deepEqual(sobrou, { alunos: 0, acessos: 0, progresso: 0, certificados: 0, matriculas: 0, problemas: [] });
});

test('dois alunos com o mesmo nome não entram — o nome é o usuário', async () => {
  await autocadastrar(app);
  const erro = await app.pagina.evaluate(() => {
    try {
      __modulos['armazenamento'].criarUsuario({ nome: 'ana teste', comum: 'X', senha: 'outra1' });
      return null;
    } catch (e) { return e.message; }
  });
  assert.match(erro, /Já existe um aluno com esse nome/);
});

test('aparelho da versão anterior: o acesso de fábrica antigo vira admin / ccb123', async () => {
  await autocadastrar(app, { nome: 'Bruno Antigo', senha: 'bruno1' });
  // Envelhece o que está guardado: instrutor RENATO/CCB123 e aluno sem senha,
  // que era como o aplicativo gravava antes.
  await app.pagina.evaluate(() => {
    const { criarHash } = __modulos['senha'];
    const estado = JSON.parse(localStorage.getItem('msa.escola.v2'));
    for (const acesso of estado.usuarios) {
      if (acesso.papel === 'ADMIN') {
        acesso.login = 'RENATO';
        acesso.sal = 'admin';
        acesso.senhaHash = criarHash('CCB123', 'admin');
      } else {
        acesso.exigeSenha = false;
        acesso.senhaHash = null;
      }
    }
    estado.sessao = null;
    localStorage.setItem('msa.escola.v2', JSON.stringify(estado));
    window.location.hash = '#/';
  });
  await app.pagina.reload();
  await app.pagina.waitForSelector('#usuario');

  const acessos = await app.pagina.evaluate(() =>
    __modulos['dados/repositorios'].usuarios.listar().map((u) => ({ login: u.login, exige: u.exigeSenha, tem: Boolean(u.senhaHash) })));
  assert.ok(acessos.every((a) => a.exige && a.tem), 'todo acesso antigo ganhou senha');
  assert.ok(acessos.some((a) => a.login === 'admin'), 'o instrutor antigo passou a ser admin');

  await app.entrar('RENATO', 'CCB123');
  assert.equal(await app.sessao(), null, 'o acesso de fábrica antigo não entra mais');

  await app.entrar('admin', 'ccb123');
  assert.equal(await app.rota(), '#/instrutor');

  // O aluno que entrava sem senha agora entra com a de fábrica — e é avisado.
  await app.sair();
  await app.entrar('Bruno Antigo', 'ccb123');
  assert.equal((await app.sessao()).tipo, 'aluno');
  assert.match(await app.texto(), /senha ainda é a de fábrica/);
});

test('quem já tinha trocado a senha do instrutor não é mexido na subida', async () => {
  await app.entrar('admin', 'ccb123');
  await app.ir('#/senha');
  await app.pagina.fill('#senha-atual', 'ccb123');
  await app.pagina.fill('#senha', 'minhasenha');
  await app.pagina.fill('#senha2', 'minhasenha');
  await app.pagina.click('[data-acao="trocar-minha-senha"]');
  await app.pagina.waitForTimeout(200);
  await app.sair();
  // O usuário antigo, com a senha que a pessoa escolheu: não é mais o de fábrica.
  await app.pagina.evaluate(() => {
    const estado = JSON.parse(localStorage.getItem('msa.escola.v2'));
    estado.usuarios.find((u) => u.papel === 'ADMIN').login = 'RENATO';
    estado.sessao = null;
    localStorage.setItem('msa.escola.v2', JSON.stringify(estado));
    window.location.hash = '#/';
  });
  await app.pagina.reload();
  await app.pagina.waitForSelector('#usuario');
  await app.entrar('RENATO', 'minhasenha');
  assert.equal(await app.rota(), '#/instrutor', 'o usuário e a senha escolhidos continuam valendo');
});

test('o instrutor cadastra um aluno, e o aluno entra com o que foi definido', async () => {
  await app.entrar('admin', 'ccb123');
  await app.ir('#/instrutor/novo');
  await app.pagina.fill('#campo-nome', 'Carlos Aluno');
  await app.pagina.fill('#campo-comum', 'Central');
  await app.pagina.selectOption('#campo-instrumento', 'violino');
  await app.pagina.check('#ministerio-pendente');
  await app.pagina.fill('#campo-email', 'carlos@exemplo.com');
  await app.pagina.fill('#campo-whatsapp', '11933334444');
  await app.pagina.fill('#senha', 'carlos1');
  await app.pagina.click('[data-acao="criar-aluno-admin"]');
  await app.pagina.waitForTimeout(200);
  assert.match(await app.texto(), /Carlos Aluno cadastrado/);

  await app.sair();
  await app.entrar('carlos aluno', 'carlos1');
  assert.equal((await app.sessao()).tipo, 'aluno');
  assert.doesNotMatch(await app.texto(), /senha ainda é a de fábrica/);
});

test('o instrutor troca a senha de um aluno pela ficha dele', async () => {
  const id = await autocadastrar(app);
  await app.sair();
  await app.entrar('admin', 'ccb123');
  await app.ir(`#/instrutor/aluno/${id}`);
  await app.pagina.fill('#senha', 'trocada');
  await app.pagina.click('[data-acao="salvar-aluno"]');
  await app.pagina.waitForTimeout(200);
  await app.sair();
  await app.entrar('Ana Teste', 'ana123');
  assert.equal(await app.sessao(), null, 'a senha antiga não vale mais');
  await app.entrar('Ana Teste', 'trocada');
  assert.equal((await app.sessao()).tipo, 'aluno');
});

test('mudar o nome do aluno muda o usuário com que ele entra', async () => {
  const id = await autocadastrar(app);
  await app.sair();
  await app.entrar('admin', 'ccb123');
  await app.ir(`#/instrutor/aluno/${id}`);
  await app.pagina.fill('#campo-nome', 'Ana Maria Teste');
  await app.pagina.click('[data-acao="salvar-aluno"]');
  await app.pagina.waitForTimeout(200);
  await app.sair();
  await app.entrar('Ana Maria Teste', 'ana123');
  assert.equal((await app.sessao()).tipo, 'aluno');
});

test('o painel e os relatórios do instrutor desenham', async () => {
  await autocadastrar(app);
  await app.sair();
  await app.entrar('admin', 'ccb123');
  for (const rota of ['#/instrutor', '#/instrutor/relatorios', '#/instrutor/metodos', '#/instrutor/novo']) {
    await app.ir(rota);
    assert.ok((await app.texto()).length > 80, `${rota} saiu vazia`);
  }
});

test('nada disso derrubou o aplicativo', () => {
  assert.deepEqual(app.erros, []);
});

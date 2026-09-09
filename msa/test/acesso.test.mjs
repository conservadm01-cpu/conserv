// A portaria: usuário e senha, e o que cada perfil pode alcançar.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp, autocadastrar } from './apoio.mjs';

let app;
before(async () => { app = await abrirApp(); });
after(async () => { await app.fechar(); });

// Cada teste começa num aparelho zerado: nada do teste anterior sobra.
beforeEach(async () => { await app.reiniciar(); });

test('a primeira tela pede usuário e senha, e não lista ninguém', async () => {
  const texto = await app.texto();
  assert.match(texto, /Usuário/);
  assert.match(texto, /Senha/);
  assert.equal(await app.pagina.$$eval('.cartao-aluno', (e) => e.length), 0);
});

test('o administrador de fábrica é admin / ccb123', async () => {
  await app.entrar('admin', 'ccb123');
  assert.equal(await app.rota(), '#/instrutor');
  assert.deepEqual(await app.sessao(), { tipo: 'admin' });
  assert.match(await app.texto(), /Painel do instrutor/);
});

test('o login não diferencia maiúsculas nem espaços sobrando', async () => {
  await app.entrar('  ADMIN ', 'ccb123');
  assert.equal(await app.rota(), '#/instrutor');
});

test('a senha diferencia maiúsculas', async () => {
  await app.entrar('admin', 'CCB123');
  assert.equal(await app.sessao(), null);
});

test('usuário que não existe e senha errada dão a mesma resposta', async () => {
  await app.entrar('admin', 'chute');
  const comSenhaErrada = await app.texto();
  await app.entrar('ninguem-por-aqui', 'chute');
  const semUsuario = await app.texto();
  assert.match(comSenhaErrada, /Usuário ou senha incorretos/);
  assert.equal(comSenhaErrada, semUsuario);
  assert.equal(await app.sessao(), null);
});

test('o aluno entra com o nome completo dele e a senha que escolheu', async () => {
  await autocadastrar(app);
  await app.sair();
  await app.entrar('ana teste', 'ana123');
  const sessao = await app.sessao();
  assert.equal(sessao.tipo, 'aluno');
  assert.match(await app.texto(), /Bom estudo/);
});

test('a senha do aluno é conferida: a errada não entra', async () => {
  await autocadastrar(app);
  await app.sair();
  await app.entrar('Ana Teste', 'outra');
  assert.equal(await app.sessao(), null);
});

test('sem sessão, qualquer rota cai na tela de acesso', async () => {
  for (const rota of ['#/', '#/fase/1', '#/desempenho', '#/certificados', '#/instrutor', '#/senha']) {
    await app.ir(rota);
    assert.match(await app.texto(), /Usuário/, `rota ${rota} deveria pedir acesso`);
  }
});

test('o aluno não alcança o painel do instrutor', async () => {
  await autocadastrar(app);
  await app.ir('#/instrutor');
  assert.equal(await app.rota(), '#/');
  assert.match(await app.texto(), /Esta área é do instrutor/);
  assert.equal((await app.sessao()).tipo, 'aluno');
});

test('o aluno não abre o modo de demonstração', async () => {
  await autocadastrar(app);
  await app.ir('#/teste');
  assert.match(await app.texto(), /modo de demonstração é do instrutor/);
  assert.equal(await app.pagina.evaluate(() => __modulos['armazenamento'].emModoTeste()), false);
});

test('a tecla Enter entra, sem precisar do botão', async () => {
  await app.ir('#/');
  await app.pagina.fill('#usuario', 'admin');
  await app.pagina.fill('#senha', 'ccb123');
  await app.pagina.press('#senha', 'Enter');
  await app.pagina.waitForTimeout(250);
  assert.equal(await app.rota(), '#/instrutor');
});

test('senha errada não apaga o usuário já digitado', async () => {
  await app.entrar('Ana Teste', 'chute');
  assert.equal(await app.pagina.inputValue('#usuario'), 'Ana Teste');
  assert.equal(await app.pagina.inputValue('#senha'), '');
});

test('sair fecha a sessão, limpa o campo e volta para a portaria', async () => {
  await autocadastrar(app);
  await app.sair();
  assert.equal(await app.sessao(), null);
  assert.match(await app.texto(), /Usuário/);
  assert.equal(await app.pagina.inputValue('#usuario'), '', 'o nome de quem saiu não fica na tela');
});

test('quem entra com a senha de fábrica é avisado e consegue trocá-la', async () => {
  await app.entrar('admin', 'ccb123');
  assert.match(await app.texto(), /senha ainda é a de fábrica/);

  await app.ir('#/senha');
  await app.pagina.fill('#senha-atual', 'errada');
  await app.pagina.fill('#senha', 'outrasenha');
  await app.pagina.fill('#senha2', 'outrasenha');
  await app.pagina.click('[data-acao="trocar-minha-senha"]');
  await app.pagina.waitForTimeout(150);
  assert.match(await app.texto(), /senha atual não confere/i);

  await app.pagina.fill('#senha-atual', 'ccb123');
  await app.pagina.fill('#senha', 'outrasenha');
  await app.pagina.fill('#senha2', 'outrasenha');
  await app.pagina.click('[data-acao="trocar-minha-senha"]');
  await app.pagina.waitForTimeout(200);
  assert.match(await app.texto(), /Senha alterada/);

  await app.sair();
  await app.entrar('admin', 'ccb123');
  assert.equal(await app.sessao(), null, 'a senha antiga não pode mais entrar');
  await app.entrar('admin', 'outrasenha');
  assert.equal(await app.rota(), '#/instrutor');
  assert.doesNotMatch(await app.texto(), /senha ainda é a de fábrica/);
});

test('a nova senha passa pela regra mínima e pela confirmação', async () => {
  await app.entrar('admin', 'ccb123');
  await app.ir('#/senha');
  await app.pagina.fill('#senha-atual', 'ccb123');
  await app.pagina.fill('#senha', 'ab');
  await app.pagina.fill('#senha2', 'ab');
  await app.pagina.click('[data-acao="trocar-minha-senha"]');
  await app.pagina.waitForTimeout(150);
  assert.match(await app.texto(), /pelo menos 4 caracteres/);

  await app.pagina.fill('#senha-atual', 'ccb123');
  await app.pagina.fill('#senha', 'senhaboa');
  await app.pagina.fill('#senha2', 'senhaoutra');
  await app.pagina.click('[data-acao="trocar-minha-senha"]');
  await app.pagina.waitForTimeout(150);
  assert.match(await app.texto(), /não conferem/);
});

test('a senha nunca é guardada em texto — só o resumo com sal', async () => {
  await autocadastrar(app);
  const bruto = await app.pagina.evaluate(() => localStorage.getItem('msa.escola.v2'));
  assert.doesNotMatch(bruto, /ana123/);
  assert.doesNotMatch(bruto, /ccb123/);
  const acessos = await app.pagina.evaluate(() => __modulos['dados/repositorios'].usuarios.listar());
  for (const acesso of acessos) {
    assert.equal(acesso.senha, undefined);
    assert.equal(acesso.exigeSenha, true, `${acesso.login} deveria exigir senha`);
    assert.ok(acesso.senhaHash, `${acesso.login} deveria ter resumo de senha`);
  }
});

test('cadastrar sem senha não é possível', async () => {
  await app.ir('#/cadastrar');
  await app.pagina.fill('#campo-nome', 'Sem Senha');
  await app.pagina.fill('#campo-comum', 'Central');
  await app.pagina.selectOption('#campo-instrumento', 'viola');
  await app.pagina.fill('#campo-email', 'x@x.com');
  await app.pagina.fill('#campo-whatsapp', '11911111111');
  await app.pagina.check('#ministerio-pendente');
  await app.pagina.click('[data-acao="criar-aluno"]');
  await app.pagina.waitForTimeout(150);
  assert.match(await app.texto(), /pelo menos 4 caracteres/);
  assert.equal(await app.pagina.evaluate(() => __modulos['dados/repositorios'].alunos.listar().length), 0);
});

test('um aluno não pode se chamar como um acesso que já existe', async () => {
  // O nome do aluno é o usuário com que ele entra: se dois acessos tivessem o
  // mesmo login, a portaria não saberia quem está entrando.
  const erro = await app.pagina.evaluate(() => {
    const banco = __modulos['armazenamento'];
    banco.prepararAcessos();
    banco.dados.usuarios.atualizar('admin', { login: 'Instrutor da Casa' });
    try {
      banco.criarUsuario({ nome: 'instrutor da casa', comum: 'Central', instrumento: 'viola', senha: 'qualquer' });
      return null;
    } catch (e) { return e.message; }
  });
  assert.match(erro, /já é o usuário de um acesso/);
});

test('com o autocadastro desligado, ninguém se cadastra sozinho', async () => {
  await app.entrar('admin', 'ccb123');
  await app.pagina.uncheck('#autocadastro');
  await app.pagina.waitForTimeout(150);
  await app.sair();
  assert.doesNotMatch(await app.texto(), /Ainda não tenho cadastro/);
  await app.ir('#/cadastrar');
  assert.match(await app.texto(), /desligou o autocadastro/);
  assert.equal(await app.pagina.$('[data-acao="criar-aluno"]'), null);
});

test('o instrutor abre o app como o aluno mesmo sem saber a senha dele', async () => {
  const id = await autocadastrar(app);
  await app.sair();
  await app.entrar('admin', 'ccb123');
  await app.ir(`#/instrutor/aluno/${id}`);
  await app.pagina.click('[data-acao="entrar-como"]');
  await app.pagina.waitForTimeout(250);
  assert.deepEqual(await app.sessao(), { tipo: 'aluno', id });
  assert.match(await app.texto(), /vendo o aplicativo como este aluno/);
});

test('abrir como aluno é do instrutor: sem sessão de instrutor, recusa', async () => {
  const id = await autocadastrar(app);
  const recusa = await app.pagina.evaluate((alvo) => {
    try { __modulos['armazenamento'].abrirComoAluno(alvo); return null; }
    catch (erro) { return erro.message; }
  }, id);
  assert.match(recusa, /Só o instrutor/);
});

test('nada disso derrubou o aplicativo', () => {
  assert.deepEqual(app.erros, []);
});

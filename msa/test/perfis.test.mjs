// Os perfis e a liberação de acesso.
//
// A regra da casa: quem se apresenta como instrutor, encarregado ou ministério
// alcança a turma inteira, e por isso não entra sozinho — o master libera.
// Aluno entra na hora, porque o que ele alcança é o próprio estudo.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { abrirApp, MASTER, autocadastrar } from './apoio.mjs';

let app;
before(async () => { app = await abrirApp(); });
after(async () => { await app.fechar(); });
beforeEach(async () => { await app.reiniciar(); });

// Preenche o pedido de acesso e envia.
async function pedirAcesso(app, { nome, perfil, senha = 'senha123' }) {
  const { pagina } = app;
  await app.ir('#/cadastrar');
  await pagina.check(`input[name="perfil"][value="${perfil}"]`);
  await pagina.waitForTimeout(120);
  await pagina.fill('#campo-nome', nome);
  await pagina.fill('#campo-comum', 'Central');
  await pagina.fill('#campo-email', 'pedido@exemplo.com');
  await pagina.fill('#campo-whatsapp', '11955556666');
  await pagina.fill('#senha', senha);
  await pagina.fill('#senha2', senha);
  await pagina.click('[data-acao="pedir-acesso"]');
  await pagina.waitForTimeout(200);
}

test('o primeiro acesso pergunta quem é a pessoa', async () => {
  await app.ir('#/cadastrar');
  const perfis = await app.pagina.$$eval('input[name="perfil"]', (es) => es.map((e) => e.value));
  assert.deepEqual(perfis, ['ALUNO', 'INSTRUTOR', 'ENCARREGADO', 'MINISTERIO']);
  assert.equal(await app.pagina.isChecked('input[name="perfil"][value="ALUNO"]'), true, 'aluno é o padrão');
  assert.ok(await app.pagina.$('[data-acao="criar-aluno"]'), 'aluno se cadastra e começa');
});

test('o aluno continua entrando na hora', async () => {
  await autocadastrar(app);
  assert.equal((await app.sessao()).tipo, 'aluno');
  assert.equal(await app.pagina.evaluate(() => __modulos['armazenamento'].solicitacoesPendentes().length), 0);
});

for (const [perfil, nome] of [['INSTRUTOR', 'Instrutor'], ['ENCARREGADO', 'Encarregado'], ['MINISTERIO', 'Ministério']]) {
  test(`quem se apresenta como ${nome.toLowerCase()} não entra sozinho`, async () => {
    await pedirAcesso(app, { nome: `Pessoa ${nome}`, perfil });
    assert.match(await app.texto(), /Pedido enviado/);
    assert.equal(await app.sessao(), null, 'o pedido não abre sessão');

    const pedidos = await app.pagina.evaluate(() => __modulos['armazenamento'].solicitacoesPendentes());
    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0].papelPretendido, perfil);
    assert.equal(pedidos[0].situacao, 'pendente');

    // Nenhum acesso foi criado: a pessoa não existe na portaria ainda.
    const acessos = await app.pagina.evaluate(() =>
      __modulos['dados/repositorios'].usuarios.listar().map((u) => u.login));
    assert.deepEqual(acessos, [MASTER.usuario]);
  });
}

test('quem pediu e ainda não foi liberado ouve isso, e não "senha incorreta"', async () => {
  await pedirAcesso(app, { nome: 'Paulo Instrutor', perfil: 'INSTRUTOR' });
  await app.entrar('Paulo Instrutor', 'senha123');
  assert.equal(await app.sessao(), null);
  assert.match(await app.texto(), /esperando a liberação/);
});

test('mas só quem prova a senha do pedido: um chute recebe a resposta de sempre', async () => {
  await pedirAcesso(app, { nome: 'Paulo Instrutor', perfil: 'INSTRUTOR' });
  await app.entrar('Paulo Instrutor', 'chute');
  assert.match(await app.texto(), /Usuário ou senha incorretos/);
  assert.doesNotMatch(await app.texto(), /esperando a liberação/);
});

test('o master libera, e a senha escolhida no pedido é a que vale', async () => {
  await pedirAcesso(app, { nome: 'Paulo Instrutor', perfil: 'INSTRUTOR', senha: 'paulo123' });
  await app.entrarComoMaster();
  assert.match(await app.texto(), /Pedidos de acesso · 1/i);
  assert.match(await app.texto(), /Paulo Instrutor/);

  await app.pagina.click('[data-acao="aprovar-pedido"]');
  await app.pagina.waitForTimeout(250);
  assert.match(await app.texto(), /Paulo Instrutor liberado como instrutor/);
  assert.match(await app.texto(), /Nenhum pedido esperando/i);

  await app.sair();
  await app.entrar('paulo instrutor', 'paulo123');
  assert.equal(await app.rota(), '#/instrutor');
  assert.equal(await app.pagina.evaluate(() => __modulos['armazenamento'].papelDaSessao()), 'INSTRUTOR');
});

test('o master recusa, e a pessoa vê o motivo ao tentar entrar', async () => {
  await pedirAcesso(app, { nome: 'Joana Pedinte', perfil: 'ENCARREGADO' });
  await app.entrarComoMaster();
  await app.pagina.evaluate(() => {
    window.prompt = () => 'Não reconhecemos este nome na comum.';
  });
  await app.pagina.click('[data-acao="recusar-pedido"]');
  await app.pagina.waitForTimeout(250);
  assert.match(await app.texto(), /Pedido recusado/);

  await app.sair();
  await app.entrar('Joana Pedinte', 'senha123');
  assert.equal(await app.sessao(), null);
  assert.match(await app.texto(), /não foi aprovado/);
  assert.match(await app.texto(), /Não reconhecemos este nome na comum/);
});

test('ninguém além do master libera acesso', async () => {
  await pedirAcesso(app, { nome: 'Paulo Instrutor', perfil: 'INSTRUTOR', senha: 'paulo123' });
  await app.entrarComoMaster();
  await app.pagina.click('[data-acao="aprovar-pedido"]');
  await app.pagina.waitForTimeout(200);
  await app.sair();
  await pedirAcesso(app, { nome: 'Outro Pedinte', perfil: 'INSTRUTOR' });

  // O instrutor liberado entra e não vê pedido nenhum — nem consegue decidir.
  await app.entrar('Paulo Instrutor', 'paulo123');
  assert.equal(await app.rota(), '#/instrutor');
  assert.doesNotMatch(await app.texto(), /Pedidos de acesso/i);
  const recusa = await app.pagina.evaluate(() => {
    const pendente = __modulos['dados/repositorios'].solicitacoesPendentes()[0];
    try { __modulos['armazenamento'].aprovarSolicitacao(pendente.id); return null; }
    catch (erro) { return erro.message; }
  });
  assert.match(recusa, /Só o master libera acesso/);
});

test('quem já entrou não volta para a tela de primeiro acesso', async () => {
  await app.entrarComoMaster();
  await app.ir('#/cadastrar');
  assert.equal(await app.rota(), '#/instrutor');
  await app.sair();
  await autocadastrar(app);
  await app.ir('#/cadastrar');
  assert.equal(await app.rota(), '#/');
});

test('dois pedidos no mesmo nome não se acumulam', async () => {
  await pedirAcesso(app, { nome: 'Paulo Instrutor', perfil: 'INSTRUTOR' });
  const erro = await app.pagina.evaluate(() => {
    try {
      __modulos['armazenamento'].pedirAcesso({
        nome: 'paulo instrutor', papelPretendido: 'INSTRUTOR', senha: 'outra1',
      });
      return null;
    } catch (e) { return e.message; }
  });
  assert.match(erro, /Já há um pedido de acesso neste nome/);
});

test('não se pede acesso com o nome de quem já entra aqui', async () => {
  const erro = await app.pagina.evaluate((usuario) => {
    try {
      __modulos['armazenamento'].pedirAcesso({ nome: usuario, papelPretendido: 'INSTRUTOR', senha: 'outra1' });
      return null;
    } catch (e) { return e.message; }
  }, MASTER.usuario);
  assert.match(erro, /já é o usuário de um acesso/);
});

test('a senha do pedido também é guardada só em resumo', async () => {
  await pedirAcesso(app, { nome: 'Paulo Instrutor', perfil: 'INSTRUTOR', senha: 'segredo123' });
  const bruto = await app.pagina.evaluate(() => localStorage.getItem('msa.escola.v2'));
  assert.doesNotMatch(bruto, /segredo123/);
  const pedido = await app.pagina.evaluate(() => __modulos['armazenamento'].solicitacoesPendentes()[0]);
  assert.equal(pedido.senha, undefined);
  assert.ok(pedido.senhaHash);
  assert.deepEqual(await app.pagina.evaluate(() => __modulos['dados/repositorios'].problemasDeEstrutura()), []);
});

// ------------------------------------------------------- o que cada um vê

test('o encarregado vê a turma e os relatórios, e não mexe em cadastro', async () => {
  await autocadastrar(app);
  await app.sair();
  await app.entrarComoMaster();
  await app.pagina.evaluate(() => {
    const banco = __modulos['armazenamento'];
    const pedido = banco.pedirAcesso({
      nome: 'Carlos Encarregado', papelPretendido: 'ENCARREGADO', comum: 'Central', senha: 'carlos1',
    });
    banco.aprovarSolicitacao(pedido.id);
  });
  await app.sair();
  await app.entrar('Carlos Encarregado', 'carlos1');

  const painel = await app.texto();
  assert.match(painel, /Painel do encarregado/i);
  assert.match(painel, /Ana Teste/, 'o encarregado acompanha os músicos da comum');
  assert.match(painel, /Relatórios/i);
  assert.doesNotMatch(painel, /Cadastrar aluno/i);
  assert.doesNotMatch(painel, /Exportar/i);
  assert.doesNotMatch(painel, /Apagar tudo/i);
  assert.doesNotMatch(painel, /Pedidos de acesso/i);
});

test('o ministério vê o andamento, sem a ficha individual de ninguém', async () => {
  await autocadastrar(app);
  await app.sair();
  await app.entrarComoMaster();
  await app.pagina.evaluate(() => {
    const banco = __modulos['armazenamento'];
    const pedido = banco.pedirAcesso({
      nome: 'Jose Ministerio', papelPretendido: 'MINISTERIO', comum: 'Central', senha: 'jose123',
    });
    banco.aprovarSolicitacao(pedido.id);
  });
  await app.sair();
  await app.entrar('Jose Ministerio', 'jose123');

  const painel = await app.texto();
  assert.match(painel, /Painel do ministério/i);
  assert.match(painel, /Relatórios/i);
  assert.doesNotMatch(painel, /Ana Teste/, 'a ficha individual não é do ministério');
  assert.doesNotMatch(painel, /Cadastrar aluno/i);
  assert.doesNotMatch(painel, /Exportar/i);

  await app.ir('#/instrutor/relatorios');
  assert.match(await app.texto(), /Relatórios/i);
});

test('nem encarregado nem ministério levam os dados embora', async () => {
  await app.entrarComoMaster();
  for (const [nome, perfil, senha] of [['Carlos Encarregado', 'ENCARREGADO', 'carlos1'], ['Jose Ministerio', 'MINISTERIO', 'jose123']]) {
    await app.pagina.evaluate(([n, p, s]) => {
      const banco = __modulos['armazenamento'];
      banco.aprovarSolicitacao(banco.pedirAcesso({ nome: n, papelPretendido: p, comum: 'Central', senha: s }).id);
    }, [nome, perfil, senha]);
  }
  await app.sair();
  for (const [nome, senha] of [['Carlos Encarregado', 'carlos1'], ['Jose Ministerio', 'jose123']]) {
    await app.entrar(nome, senha);
    const pode = await app.pagina.evaluate(() => __modulos['armazenamento'].podeNaSessao('dados.exportar'));
    assert.equal(pode, false, `${nome} não pode exportar`);
    await app.sair();
  }
});

test('nada disso derrubou o aplicativo', () => {
  assert.deepEqual(app.erros, []);
});

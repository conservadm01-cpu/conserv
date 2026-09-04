import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conserv-fin-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');

const { getDb, migrate } = await import('../src/db/index.js');
const { criarTitulo, registrarBaixa, estornarBaixa, buscarTitulo, faturarPedido,
        posicao, aging, fluxoPrevisto, realizadoPorMes, ranking } =
  await import('../src/services/financeiro.js');
const { permissoesDe, nivelPorId, TODAS } = await import('../src/lib/permissoes.js');

const db = migrate(getDb());

const hoje = () => new Date().toISOString().slice(0, 10);
const dia = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const novoCliente = () =>
  db.prepare(`INSERT INTO clientes (nome) VALUES (?)`).run(`CLI ${Math.random()}`).lastInsertRowid;
const novoFornecedor = () =>
  db.prepare(`INSERT INTO fornecedores (nome) VALUES (?)`).run(`FOR ${Math.random()}`).lastInsertRowid;

/* ---------------------------------------------------------------- títulos */

test('título simples nasce em aberto com o saldo cheio', () => {
  const [t] = criarTitulo(
    { tipo: 'RECEBER', descricao: 'Venda', cliente_id: novoCliente(), valor: 1000, vencimento: dia(10) },
    db
  );
  assert.equal(t.status, 'ABERTO');
  assert.equal(t.valor, 1000);
  assert.equal(t.saldo, 1000);
  assert.equal(t.pago, 0);
  assert.equal(t.parcelas, 1);
});

test('parcelamento distribui o valor e a diferença de centavos vai na última', () => {
  const titulos = criarTitulo(
    { tipo: 'RECEBER', descricao: 'Venda', cliente_id: novoCliente(), valor: 1000, parcelas: 3, vencimento: dia(10) },
    db
  );
  assert.equal(titulos.length, 3);
  assert.equal(titulos.reduce((s, t) => s + t.valor, 0), 1000);
  assert.equal(titulos[0].valor, 333.33);
  assert.equal(titulos[2].valor, 333.34);
  assert.ok(titulos[0].descricao.endsWith('(1/3)'));
});

test('parcelas vencem no intervalo informado', () => {
  const titulos = criarTitulo(
    { tipo: 'PAGAR', descricao: 'Compra', fornecedor_id: novoFornecedor(), valor: 900,
      parcelas: 3, intervalo_dias: 15, vencimento: dia(0) },
    db
  );
  assert.equal(titulos[0].vencimento, dia(0));
  assert.equal(titulos[1].vencimento, dia(15));
  assert.equal(titulos[2].vencimento, dia(30));
});

test('a receber exige cliente e a pagar exige fornecedor', () => {
  assert.throws(
    () => criarTitulo({ tipo: 'RECEBER', descricao: 'x', valor: 10, vencimento: dia(1) }, db),
    /precisa de cliente/i
  );
  assert.throws(
    () => criarTitulo({ tipo: 'PAGAR', descricao: 'x', valor: 10, vencimento: dia(1) }, db),
    /precisa de fornecedor/i
  );
});

/* ----------------------------------------------------------------- baixas */

test('baixa parcial deixa o título como PARCIAL e quitação fecha em QUITADO', () => {
  const [t] = criarTitulo(
    { tipo: 'RECEBER', descricao: 'Venda', cliente_id: novoCliente(), valor: 500, vencimento: dia(5) },
    db
  );
  let atual = registrarBaixa({ titulo_id: t.id, valor: 200 }, db);
  assert.equal(atual.status, 'PARCIAL');
  assert.equal(atual.saldo, 300);

  atual = registrarBaixa({ titulo_id: t.id, valor: 300 }, db);
  assert.equal(atual.status, 'QUITADO');
  assert.equal(atual.saldo, 0);
  assert.equal(atual.baixas.length, 2);
});

test('baixa acima do saldo é recusada', () => {
  const [t] = criarTitulo(
    { tipo: 'PAGAR', descricao: 'Compra', fornecedor_id: novoFornecedor(), valor: 100, vencimento: dia(5) },
    db
  );
  assert.throws(() => registrarBaixa({ titulo_id: t.id, valor: 150 }, db), /acima do saldo/i);
});

test('juros entram por fora e desconto abate no fechamento', () => {
  const [t] = criarTitulo(
    { tipo: 'RECEBER', descricao: 'Venda', cliente_id: novoCliente(), valor: 100, vencimento: dia(-10) },
    db
  );
  // 90 de principal + 10 de juros fecha os 100 do título
  const atual = registrarBaixa({ titulo_id: t.id, valor: 90, juros: 10 }, db);
  assert.equal(atual.status, 'QUITADO');
  assert.equal(atual.saldo, 0);
});

test('estorno devolve o título ao estado anterior', () => {
  const [t] = criarTitulo(
    { tipo: 'RECEBER', descricao: 'Venda', cliente_id: novoCliente(), valor: 400, vencimento: dia(5) },
    db
  );
  const comBaixa = registrarBaixa({ titulo_id: t.id, valor: 400 }, db);
  assert.equal(comBaixa.status, 'QUITADO');

  const estornado = estornarBaixa(comBaixa.baixas[0].id, db);
  assert.equal(estornado.status, 'ABERTO');
  assert.equal(estornado.saldo, 400);
});

test('título quitado não conta como vencido, mesmo com vencimento passado', () => {
  const [t] = criarTitulo(
    { tipo: 'RECEBER', descricao: 'Venda antiga', cliente_id: novoCliente(), valor: 250, vencimento: dia(-40) },
    db
  );
  assert.ok(buscarTitulo(t.id, db).dias_atraso > 0);
  registrarBaixa({ titulo_id: t.id, valor: 250 }, db);
  assert.equal(buscarTitulo(t.id, db).dias_atraso, 0);
});

/* -------------------------------------------------------------- faturamento */

test('faturar pedido cria as contas a receber e marca o pedido', () => {
  const cliente = db
    .prepare(`INSERT INTO clientes (nome, prazo_pagamento_dias) VALUES (?, 30)`)
    .run(`CLI ${Math.random()}`).lastInsertRowid;
  const produto = db
    .prepare(`INSERT INTO produtos (descricao, preco_padrao) VALUES (?, 10)`)
    .run(`P ${Math.random()}`).lastInsertRowid;
  const pedido = db
    .prepare(`INSERT INTO pedidos (numero, cliente_id, data_pedido) VALUES (?, ?, date('now'))`)
    .run(String(Math.floor(Math.random() * 1e6)), cliente).lastInsertRowid;
  db.prepare(`INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, 100, 12)`)
    .run(pedido, produto);

  const titulos = faturarPedido(pedido, { parcelas: 2 }, db);
  assert.equal(titulos.length, 2);
  assert.equal(titulos.reduce((s, t) => s + t.valor, 0), 1200);
  assert.equal(titulos[0].vencimento, dia(30)); // prazo do cliente
  assert.equal(db.prepare(`SELECT situacao FROM pedidos WHERE id = ?`).get(pedido).situacao, 'FATURADO');

  assert.throws(() => faturarPedido(pedido, {}, db), /já gerou contas/i);
});

/* -------------------------------------------------------------- indicadores */

test('posição separa vencido do que ainda vai vencer', () => {
  const limpar = db.prepare(`DELETE FROM titulos`);
  limpar.run();
  const cliente = novoCliente();
  criarTitulo({ tipo: 'RECEBER', descricao: 'a', cliente_id: cliente, valor: 100, vencimento: dia(-5) }, db);
  criarTitulo({ tipo: 'RECEBER', descricao: 'b', cliente_id: cliente, valor: 200, vencimento: dia(3) }, db);
  criarTitulo({ tipo: 'RECEBER', descricao: 'c', cliente_id: cliente, valor: 400, vencimento: dia(60) }, db);

  const p = posicao('RECEBER', db);
  assert.equal(p.titulos, 3);
  assert.equal(p.aberto, 700);
  assert.equal(p.vencido, 100);
  assert.equal(p.proximos_7, 200);
  assert.equal(p.proximos_30, 200);
});

test('aging distribui os títulos pelas faixas de atraso', () => {
  db.prepare(`DELETE FROM titulos`).run();
  const cliente = novoCliente();
  criarTitulo({ tipo: 'RECEBER', descricao: 'a', cliente_id: cliente, valor: 100, vencimento: dia(10) }, db);
  criarTitulo({ tipo: 'RECEBER', descricao: 'b', cliente_id: cliente, valor: 200, vencimento: dia(-15) }, db);
  criarTitulo({ tipo: 'RECEBER', descricao: 'c', cliente_id: cliente, valor: 300, vencimento: dia(-100) }, db);

  const faixas = Object.fromEntries(aging('RECEBER', db).map((f) => [f.faixa, f.valor]));
  assert.equal(faixas['A vencer'], 100);
  assert.equal(faixas['1 a 30 dias'], 200);
  assert.equal(faixas['Mais de 90 dias'], 300);
});

test('fluxo previsto joga o vencido na primeira semana e acumula o saldo', () => {
  db.prepare(`DELETE FROM titulos`).run();
  const cliente = novoCliente();
  const fornecedor = novoFornecedor();
  criarTitulo({ tipo: 'RECEBER', descricao: 'atrasada', cliente_id: cliente, valor: 1000, vencimento: dia(-30) }, db);
  criarTitulo({ tipo: 'PAGAR', descricao: 'compra', fornecedor_id: fornecedor, valor: 400, vencimento: dia(2) }, db);
  criarTitulo({ tipo: 'RECEBER', descricao: 'futura', cliente_id: cliente, valor: 500, vencimento: dia(10) }, db);

  const fluxo = fluxoPrevisto({ semanas: 4 }, db);
  assert.equal(fluxo[0].entradas, 1000); // o vencido entra na semana corrente
  assert.equal(fluxo[0].saidas, 400);
  assert.equal(fluxo[0].saldo, 600);
  assert.equal(fluxo.at(-1).acumulado, 1100); // 1000 − 400 + 500
});

test('realizado por mês soma o que foi efetivamente pago e recebido', () => {
  db.prepare(`DELETE FROM titulos`).run();
  const ano = Number(hoje().slice(0, 4));
  const [receber] = criarTitulo(
    { tipo: 'RECEBER', descricao: 'x', cliente_id: novoCliente(), valor: 800, vencimento: hoje() }, db);
  const [pagar] = criarTitulo(
    { tipo: 'PAGAR', descricao: 'y', fornecedor_id: novoFornecedor(), valor: 300, vencimento: hoje() }, db);
  registrarBaixa({ titulo_id: receber.id, valor: 800, data: hoje() }, db);
  registrarBaixa({ titulo_id: pagar.id, valor: 300, data: hoje() }, db);

  const mes = realizadoPorMes(ano, db)[Number(hoje().slice(5, 7)) - 1];
  assert.equal(mes.recebido, 800);
  assert.equal(mes.pago, 300);
  assert.equal(mes.resultado, 500);
});

test('ranking mostra quem tem mais em aberto', () => {
  db.prepare(`DELETE FROM titulos`).run();
  const grande = db.prepare(`INSERT INTO clientes (nome) VALUES ('DEVEDOR GRANDE')`).run().lastInsertRowid;
  const pequeno = db.prepare(`INSERT INTO clientes (nome) VALUES ('DEVEDOR PEQUENO')`).run().lastInsertRowid;
  criarTitulo({ tipo: 'RECEBER', descricao: 'a', cliente_id: grande, valor: 5000, vencimento: dia(-10) }, db);
  criarTitulo({ tipo: 'RECEBER', descricao: 'b', cliente_id: pequeno, valor: 100, vencimento: dia(5) }, db);

  const lista = ranking('RECEBER', 10, db);
  assert.equal(lista[0].parte, 'DEVEDOR GRANDE');
  assert.equal(lista[0].aberto, 5000);
  assert.equal(lista[0].vencido, 5000);
  assert.ok(lista[0].maior_atraso >= 10);
});

/* ------------------------------------------------------------- permissões */

test('nível de acesso define o conjunto de áreas', () => {
  const financeiro = permissoesDe({ perfil: 'OPERADOR', nivel_acesso: 'financeiro' });
  assert.equal(financeiro['financeiro.baixar'], true);
  assert.equal(financeiro['pessoas.salario'], false);
  assert.equal(financeiro['producao.apontar'], false);
  assert.equal(financeiro.admin, false);
});

test('ajuste por área sobrepõe o nível, para mais e para menos', () => {
  const p = permissoesDe({
    perfil: 'OPERADOR',
    nivel_acesso: 'chao_de_fabrica',
    permissoes: JSON.stringify({ 'financeiro.ver': true, 'producao.apontar': false }),
  });
  assert.equal(p['financeiro.ver'], true);
  assert.equal(p['producao.apontar'], false);
  assert.equal(p['producao.ver'], true);
});

test('ADMIN recebe todas as áreas, aconteça o que acontecer nos ajustes', () => {
  const p = permissoesDe({ perfil: 'ADMIN', nivel_acesso: 'consulta', permissoes: '{"admin":false}' });
  assert.ok(TODAS.every((a) => p[a] === true));
});

test('permissões inválidas no banco não derrubam o cálculo', () => {
  const p = permissoesDe({ perfil: 'OPERADOR', nivel_acesso: 'pcp', permissoes: 'isto não é json' });
  assert.equal(p['producao.apontar'], true);
  const semNivel = permissoesDe({ perfil: 'OPERADOR', nivel_acesso: 'inexistente' });
  assert.equal(semNivel.admin, false);
  assert.ok(nivelPorId('consulta'));
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

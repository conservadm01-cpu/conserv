import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// O banco é escolhido na importação do módulo de config, então definimos antes.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conserv-test-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');

const { getDb, migrate } = await import('../src/db/index.js');
const { abrirOrdem, atualizarEtapa, buscarOrdem, explodirFichaTecnica, recalcularCustosMO } =
  await import('../src/services/producao.js');
const { registrarMovimento, baixarMateriaisDaOrdem, necessidadeMateriais, saldo } =
  await import('../src/services/estoque.js');
const { resumoCarteira } = await import('../src/services/indicadores.js');
const { toISODate, semanaISO, diasAtraso } = await import('../src/lib/dates.js');
const { toNumber } = await import('../src/lib/numbers.js');
const { chave } = await import('../src/lib/text.js');

const db = migrate(getDb());

/** Cria um cenário mínimo: produto com ficha técnica, custo de MO e um pedido. */
function cenario({ quantidade = 100, consumo = 1.5, perda = 10, estoqueInicial = 500 } = {}) {
  const grupo = db.prepare(`INSERT INTO grupos_produto (nome) VALUES (?)`).run(`G${Date.now()}${Math.random()}`);
  const produto = db
    .prepare(`INSERT INTO produtos (descricao, grupo_id, linha, preco_padrao) VALUES (?, ?, 'LEVE', 20)`)
    .run(`PRODUTO ${Math.random()}`, grupo.lastInsertRowid);
  const material = db
    .prepare(`INSERT INTO materiais (descricao, tipo, unidade, custo_unitario, estoque_min) VALUES (?, 'TECIDO', 'MT', 10, 50)`)
    .run(`MATERIAL ${Math.random()}`);
  db.prepare(`INSERT INTO ficha_tecnica (produto_id, material_id, consumo_por_peca, perda_percentual) VALUES (?, ?, ?, ?)`)
    .run(produto.lastInsertRowid, material.lastInsertRowid, consumo, perda);

  const corte = db.prepare(`SELECT id FROM etapas WHERE codigo = 'CORTE'`).get();
  db.prepare(`INSERT INTO custos_processo (produto_id, etapa_id, custo_por_peca) VALUES (?, ?, 0.5)`)
    .run(produto.lastInsertRowid, corte.id);

  const cliente = db.prepare(`INSERT INTO clientes (nome) VALUES (?)`).run(`CLIENTE ${Math.random()}`);
  const pedido = db
    .prepare(`INSERT INTO pedidos (numero, cliente_id, data_pedido, data_entrega) VALUES (?, ?, date('now'), date('now','+10 day'))`)
    .run(String(Math.floor(Math.random() * 100000)), cliente.lastInsertRowid);
  const item = db
    .prepare(`INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario, liquidacao) VALUES (?, ?, ?, 20, 12)`)
    .run(pedido.lastInsertRowid, produto.lastInsertRowid, quantidade);

  if (estoqueInicial > 0) {
    registrarMovimento(
      { material_id: material.lastInsertRowid, tipo: 'ENTRADA', quantidade: estoqueInicial, custo_unitario: 10 },
      db
    );
  }
  return {
    produtoId: produto.lastInsertRowid,
    materialId: material.lastInsertRowid,
    itemId: item.lastInsertRowid,
    pedidoId: pedido.lastInsertRowid,
    corteId: corte.id,
  };
}

test('toNumber entende os formatos que saem da planilha', () => {
  assert.equal(toNumber('R$ 1.234,50'), 1234.5);
  assert.equal(toNumber('26,5'), 26.5);
  assert.equal(toNumber(58750), 58750);
  assert.equal(toNumber('#REF!'), null);
  assert.equal(toNumber(''), null);
});

test('toISODate cobre Date, texto BR e serial do Excel', () => {
  assert.equal(toISODate(new Date('2026-03-15T00:00:00Z')), '2026-03-15');
  assert.equal(toISODate('15/03/2026'), '2026-03-15');
  assert.equal(toISODate(45000), '2023-03-15');
  assert.equal(toISODate(null), null);
});

test('semanaISO e diasAtraso', () => {
  assert.equal(semanaISO('2026-01-05'), 2);
  assert.equal(diasAtraso('2026-01-01', '2026-01-11'), 10);
  assert.equal(diasAtraso('2026-01-20', '2026-01-11'), 0);
});

test('chave normaliza acento, caixa e pontuação para deduplicar cadastros', () => {
  assert.equal(chave('  M.D  Bôso (PROHALL) '), chave('m.d boso prohall'));
  assert.equal(chave('COSMÉTICO '), chave('cosmetico'));
  assert.notEqual(chave('AVENTAL'), chave('AVENTAL LONGO'));
});

test('abrir ordem cria o roteiro completo e explode a ficha técnica', () => {
  const { itemId, materialId } = cenario({ quantidade: 100, consumo: 1.5, perda: 10 });
  const ordem = abrirOrdem(itemId, {}, db);

  assert.equal(ordem.status, 'ABERTA');
  assert.equal(ordem.etapas.length, 7);
  assert.ok(ordem.etapas.every((e) => e.status === 'PENDENTE'));

  const previsto = ordem.materiais.find((m) => m.material_id === materialId);
  assert.equal(previsto.quantidade_prevista, 165); // 100 pçs × 1,5 × 1,10 de perda
  assert.equal(ordem.custo_mo_total, 50); // 100 pçs × R$ 0,50 no corte
});

test('um item não pode ter duas ordens', () => {
  const { itemId } = cenario();
  abrirOrdem(itemId, {}, db);
  assert.throws(() => abrirOrdem(itemId, {}, db), /já possui ordem/i);
});

test('status da ordem acompanha o avanço das etapas', () => {
  const { itemId } = cenario();
  const ordem = abrirOrdem(itemId, {}, db);
  const etapas = ordem.etapas;

  let atual = atualizarEtapa(ordem.id, etapas[1].etapa_id, { status: 'EM_ANDAMENTO' }, db);
  assert.equal(atual.status, 'EM_PRODUCAO');

  for (const e of etapas.filter((x) => x.codigo !== 'ENTREGA')) {
    atual = atualizarEtapa(ordem.id, e.etapa_id, { status: 'CONCLUIDA' }, db);
  }
  assert.equal(atual.status, 'EM_PRODUCAO');

  const entrega = etapas.find((e) => e.codigo === 'ENTREGA');
  atual = atualizarEtapa(ordem.id, entrega.etapa_id, { status: 'CONCLUIDA' }, db);
  assert.equal(atual.status, 'ENTREGUE');
  assert.ok(atual.data_conclusao);
});

test('pedido é marcado como entregue quando todas as ordens entregam', () => {
  const { itemId, pedidoId } = cenario();
  const ordem = abrirOrdem(itemId, {}, db);
  const entrega = ordem.etapas.find((e) => e.codigo === 'ENTREGA');
  atualizarEtapa(ordem.id, entrega.etapa_id, { status: 'CONCLUIDA' }, db);
  assert.equal(db.prepare(`SELECT situacao FROM pedidos WHERE id = ?`).get(pedidoId).situacao, 'ENTREGUE');
});

test('baixa de material gera saída e não permite baixar duas vezes', () => {
  const { itemId, materialId } = cenario({ quantidade: 100, consumo: 1.5, perda: 10, estoqueInicial: 500 });
  const ordem = abrirOrdem(itemId, {}, db);

  const movimentos = baixarMateriaisDaOrdem(ordem.id, {}, db);
  assert.equal(movimentos.length, 1);
  assert.equal(saldo(materialId, db), 335); // 500 − 165
  assert.throws(() => baixarMateriaisDaOrdem(ordem.id, {}, db), /Nenhuma quantidade pendente/i);
});

test('saída maior que o saldo é recusada', () => {
  const { materialId } = cenario({ estoqueInicial: 10 });
  assert.throws(
    () => registrarMovimento({ material_id: materialId, tipo: 'SAIDA', quantidade: 999 }, db),
    /Saldo insuficiente/i
  );
});

test('baixa parcial respeita o previsto e mantém o restante pendente', () => {
  const { itemId, materialId } = cenario({ quantidade: 100, consumo: 1.5, perda: 10 });
  const ordem = abrirOrdem(itemId, {}, db);

  baixarMateriaisDaOrdem(ordem.id, { itens: [{ material_id: materialId, quantidade: 65 }] }, db);
  const depois = buscarOrdem(ordem.id, db);
  assert.equal(depois.materiais[0].quantidade_baixada, 65);

  assert.throws(
    () => baixarMateriaisDaOrdem(ordem.id, { itens: [{ material_id: materialId, quantidade: 500 }] }, db),
    /acima do previsto/i
  );
});

test('MRP calcula a necessidade líquida das ordens em aberto', () => {
  const { itemId, materialId } = cenario({ quantidade: 200, consumo: 2, perda: 0, estoqueInicial: 100 });
  abrirOrdem(itemId, {}, db);

  const linha = necessidadeMateriais({}, db).find((l) => l.id === materialId);
  assert.equal(linha.necessidade, 400);
  assert.equal(linha.saldo, 100);
  assert.equal(linha.comprar, 300);
  assert.equal(linha.valor_compra, 3000);
});

test('ordem entregue sai da necessidade de compra', () => {
  const { itemId, materialId } = cenario({ quantidade: 50, consumo: 1, perda: 0, estoqueInicial: 0 });
  const ordem = abrirOrdem(itemId, {}, db);
  assert.ok(necessidadeMateriais({}, db).some((l) => l.id === materialId));

  const entrega = ordem.etapas.find((e) => e.codigo === 'ENTREGA');
  atualizarEtapa(ordem.id, entrega.etapa_id, { status: 'CONCLUIDA' }, db);
  assert.ok(!necessidadeMateriais({}, db).some((l) => l.id === materialId));
});

test('alterar a ficha técnica e recalcular atualiza a ordem já aberta', () => {
  const { itemId, produtoId, materialId } = cenario({ quantidade: 100, consumo: 1, perda: 0 });
  const ordem = abrirOrdem(itemId, {}, db);
  assert.equal(ordem.materiais[0].quantidade_prevista, 100);

  db.prepare(`UPDATE ficha_tecnica SET consumo_por_peca = 2 WHERE produto_id = ? AND material_id = ?`)
    .run(produtoId, materialId);
  explodirFichaTecnica(ordem.id, db);
  assert.equal(buscarOrdem(ordem.id, db).materiais[0].quantidade_prevista, 200);

  const corte = db.prepare(`SELECT id FROM etapas WHERE codigo = 'CORTE'`).get();
  db.prepare(`UPDATE custos_processo SET custo_por_peca = 1.25 WHERE produto_id = ? AND etapa_id = ?`)
    .run(produtoId, corte.id);
  recalcularCustosMO(ordem.id, db);
  assert.equal(buscarOrdem(ordem.id, db).custo_mo_total, 125);
});

test('resumo da carteira soma apenas o que ainda não foi entregue', () => {
  const antes = resumoCarteira(db);
  const { itemId } = cenario({ quantidade: 10 });
  abrirOrdem(itemId, {}, db);
  const depois = resumoCarteira(db);
  assert.equal(depois.pecas, antes.pecas + 10);
  assert.equal(depois.faturar, Math.round((antes.faturar + 200) * 100) / 100);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

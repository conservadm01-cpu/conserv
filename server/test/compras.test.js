import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conserv-compras-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');

const { getDb, migrate } = await import('../src/db/index.js');
const { criarRequisicao, gerarRequisicoesDoMinimo, gerarRequisicoesDoMrp,
        criarPedidoCompra, atualizarPedidoCompra, buscarPedidoCompra,
        pedidosAPartirDeRequisicoes, receber, estornarRecebimento,
        abrirInventario, contar, fecharInventario, buscarInventario, resumoCompras } =
  await import('../src/services/compras.js');
const { registrarMovimento, saldo } = await import('../src/services/estoque.js');
const { abrirOrdem } = await import('../src/services/producao.js');
const { montarFiltros, montarOrdem, limitar } = await import('../src/lib/filtros.js');

const db = migrate(getDb());

const hoje = () => new Date().toISOString().slice(0, 10);

function novoFornecedor(prazo = 10) {
  return db.prepare(`INSERT INTO fornecedores (nome, prazo_entrega_dias) VALUES (?, ?)`)
    .run(`FOR ${Math.random()}`, prazo).lastInsertRowid;
}

function novoMaterial({ custo = 10, minimo = 0, fornecedor = null, entrada = 0 } = {}) {
  const id = db
    .prepare(`INSERT INTO materiais (descricao, unidade, custo_unitario, estoque_min, fornecedor_id)
              VALUES (?, 'MT', ?, ?, ?)`)
    .run(`MAT ${Math.random()}`, custo, minimo, fornecedor ?? novoFornecedor()).lastInsertRowid;
  if (entrada > 0) registrarMovimento({ material_id: id, tipo: 'ENTRADA', quantidade: entrada, custo_unitario: custo }, db);
  return id;
}

/* ------------------------------------------------------------- filtros ---- */

test('montarFiltros traduz busca, igualdade, intervalo e booleano', () => {
  const f = montarFiltros(
    { busca: 'ave', status: 'ABERTO', de: '2026-01-01', valor_min: '100', vencidos: 'true', vazio: '' },
    {
      busca: { tipo: 'busca', colunas: ['a.nome', 'a.codigo'] },
      status: { tipo: 'igual', coluna: 'a.status' },
      de: { tipo: 'de', coluna: 'a.data' },
      valor_min: { tipo: 'min', coluna: 'a.valor' },
      vencidos: { tipo: 'booleano', quandoVerdadeiro: 'a.atraso > 0' },
      vazio: { tipo: 'igual', coluna: 'a.ignorado' },
    }
  );
  assert.equal(f.where.length, 5);
  assert.deepEqual(f.params, ['%ave%', '%ave%', 'ABERTO', '2026-01-01', 100]);
  assert.ok(!f.sql.includes('ignorado')); // filtro vazio não entra
});

test('montarOrdem só aceita colunas declaradas', () => {
  assert.equal(montarOrdem({ ordenar_por: 'data', ordem: 'desc' }, ['data'], 'id DESC'), 'data DESC');
  assert.equal(montarOrdem({ ordenar_por: 'data' }, ['data'], 'id DESC'), 'data ASC');
  assert.equal(montarOrdem({ ordenar_por: 'senha; DROP TABLE x' }, ['data'], 'id DESC'), 'id DESC');
  assert.equal(montarOrdem({}, ['data'], 'id DESC'), 'id DESC');
});

test('limitar respeita o teto', () => {
  assert.equal(limitar({}, 100, 500), 100);
  assert.equal(limitar({ limite: '250' }, 100, 500), 250);
  assert.equal(limitar({ limite: '99999' }, 100, 500), 500);
});

/* --------------------------------------------------------- requisições ---- */

test('requisição nasce aberta com o saldo pendente cheio', () => {
  const material = novoMaterial();
  const r = criarRequisicao({ material_id: material, quantidade: 500, urgencia: 'ALTA' }, db);
  assert.equal(r.status, 'ABERTA');
  assert.equal(r.pendente, 500);
  assert.equal(r.urgencia, 'ALTA');
});

test('requisição por estoque mínimo repõe até o dobro do mínimo', () => {
  db.prepare(`DELETE FROM requisicoes_compra`).run();
  const material = novoMaterial({ minimo: 100, entrada: 30 });
  const { criadas } = gerarRequisicoesDoMinimo({}, db);
  const desta = criadas.find((c) => c.material_id === material);
  assert.ok(desta);
  assert.equal(desta.quantidade, 170); // 100 × 2 − 30 de saldo
  assert.equal(desta.origem, 'ESTOQUE_MINIMO');
});

test('o MRP não empilha requisição de um material que já tem uma aberta', () => {
  db.prepare(`DELETE FROM requisicoes_compra`).run();
  const material = novoMaterial({ custo: 5 });
  const produto = db.prepare(`INSERT INTO produtos (descricao, preco_padrao) VALUES (?, 100)`)
    .run(`P ${Math.random()}`).lastInsertRowid;
  db.prepare(`INSERT INTO ficha_tecnica (produto_id, material_id, consumo_por_peca, perda_percentual)
              VALUES (?, ?, 2, 0)`).run(produto, material);
  const cliente = db.prepare(`INSERT INTO clientes (nome) VALUES (?)`).run(`C ${Math.random()}`).lastInsertRowid;
  const pedido = db.prepare(`INSERT INTO pedidos (numero, cliente_id, data_pedido) VALUES (?, ?, date('now'))`)
    .run(String(Math.random()).slice(2, 8), cliente).lastInsertRowid;
  const item = db.prepare(`INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario)
                           VALUES (?, ?, 100, 100)`).run(pedido, produto).lastInsertRowid;
  abrirOrdem(item, {}, db);

  const primeira = gerarRequisicoesDoMrp({}, db);
  assert.equal(primeira.criadas.filter((c) => c.material_id === material).length, 1);

  const segunda = gerarRequisicoesDoMrp({}, db);
  assert.equal(segunda.criadas.filter((c) => c.material_id === material).length, 0);
  assert.ok(segunda.puladas.length > 0);
});

/* ------------------------------------------------------ pedido de compra --- */

test('pedido de compra soma os itens e prevê a entrega pelo prazo do fornecedor', () => {
  const fornecedor = novoFornecedor(15);
  const material = novoMaterial({ fornecedor, custo: 20 });
  const pedido = criarPedidoCompra(
    { fornecedor_id: fornecedor, frete: 100, itens: [{ material_id: material, quantidade: 50, preco_unitario: 20 }] },
    db
  );
  assert.match(pedido.numero, /^PC-\d{4}-\d{4}$/);
  assert.equal(pedido.valor_bruto, 1000);
  assert.equal(pedido.valor_total, 1100);
  assert.equal(pedido.status, 'RASCUNHO');

  const previsto = new Date();
  previsto.setUTCDate(previsto.getUTCDate() + 15);
  assert.equal(pedido.previsao_entrega, previsto.toISOString().slice(0, 10));
});

test('requisições viram pedidos agrupados por fornecedor', () => {
  db.prepare(`DELETE FROM requisicoes_compra`).run();
  const fornecedorA = novoFornecedor();
  const fornecedorB = novoFornecedor();
  const m1 = novoMaterial({ fornecedor: fornecedorA });
  const m2 = novoMaterial({ fornecedor: fornecedorA });
  const m3 = novoMaterial({ fornecedor: fornecedorB });

  const ids = [
    criarRequisicao({ material_id: m1, quantidade: 100 }, db).id,
    criarRequisicao({ material_id: m2, quantidade: 200 }, db).id,
    criarRequisicao({ material_id: m1, quantidade: 50 }, db).id, // mesmo material, some na linha
    criarRequisicao({ material_id: m3, quantidade: 300 }, db).id,
  ];

  const pedidos = pedidosAPartirDeRequisicoes(ids, {}, db);
  assert.equal(pedidos.length, 2);

  const doA = pedidos.find((p) => p.fornecedor_id === fornecedorA);
  assert.equal(doA.linhas.length, 2);
  assert.equal(doA.linhas.find((l) => l.material_id === m1).quantidade, 150);

  // As requisições ficam atendidas na emissão.
  assert.ok(db.prepare(`SELECT COUNT(*) n FROM requisicoes_compra WHERE status = 'ABERTA'`).get().n === 0);
});

test('material sem fornecedor no cadastro não vira pedido', () => {
  const material = db.prepare(`INSERT INTO materiais (descricao, unidade) VALUES (?, 'UN')`)
    .run(`SEM FORN ${Math.random()}`).lastInsertRowid;
  const r = criarRequisicao({ material_id: material, quantidade: 10 }, db);
  assert.throws(() => pedidosAPartirDeRequisicoes([r.id], {}, db), /Sem fornecedor/i);
});

/* ------------------------------------------------------------ recebimento -- */

test('recebimento total entra no estoque, fecha o pedido e gera a conta a pagar', () => {
  const fornecedor = novoFornecedor();
  const material = novoMaterial({ fornecedor, custo: 8 });
  const pedido = criarPedidoCompra(
    { fornecedor_id: fornecedor, prazo_pagamento_dias: 30,
      itens: [{ material_id: material, quantidade: 100, preco_unitario: 8 }] },
    db
  );
  const antes = saldo(material, db);

  const { pedido: depois } = receber(pedido.id, { nota_fiscal: 'NF 1' }, db);
  assert.equal(depois.status, 'RECEBIDO');
  assert.equal(saldo(material, db), antes + 100);

  const titulo = db.prepare(`SELECT * FROM titulos WHERE documento = 'NF 1'`).get();
  assert.ok(titulo);
  assert.equal(titulo.valor, 800);
  assert.equal(titulo.tipo, 'PAGAR');
  assert.equal(titulo.fornecedor_id, fornecedor);
});

test('recebimento parcial deixa o pedido em PARCIAL e o resto pendente', () => {
  const fornecedor = novoFornecedor();
  const material = novoMaterial({ fornecedor, custo: 5 });
  const pedido = criarPedidoCompra(
    { fornecedor_id: fornecedor, itens: [{ material_id: material, quantidade: 100, preco_unitario: 5 }] },
    db
  );
  const item = pedido.linhas[0];

  const { pedido: parcial } = receber(pedido.id, { itens: [{ item_id: item.id, quantidade: 40 }] }, db);
  assert.equal(parcial.status, 'PARCIAL');
  assert.equal(parcial.linhas[0].recebido, 40);
  assert.equal(parcial.linhas[0].pendente, 60);

  const { pedido: completo } = receber(pedido.id, { itens: [{ item_id: item.id, quantidade: 60 }] }, db);
  assert.equal(completo.status, 'RECEBIDO');
  assert.equal(completo.linhas[0].pendente, 0);
});

test('receber acima do pedido é recusado', () => {
  const fornecedor = novoFornecedor();
  const material = novoMaterial({ fornecedor });
  const pedido = criarPedidoCompra(
    { fornecedor_id: fornecedor, itens: [{ material_id: material, quantidade: 10 }] }, db
  );
  assert.throws(
    () => receber(pedido.id, { itens: [{ item_id: pedido.linhas[0].id, quantidade: 15 }] }, db),
    /acima do pedido/i
  );
});

test('estornar recebimento devolve o saldo e apaga o título', () => {
  const fornecedor = novoFornecedor();
  const material = novoMaterial({ fornecedor, custo: 3 });
  const pedido = criarPedidoCompra(
    { fornecedor_id: fornecedor, itens: [{ material_id: material, quantidade: 50, preco_unitario: 3 }] }, db
  );
  const antes = saldo(material, db);
  receber(pedido.id, { nota_fiscal: 'NF ESTORNO' }, db);
  assert.equal(saldo(material, db), antes + 50);

  const recebimento = db.prepare(`SELECT id FROM recebimentos WHERE pedido_compra_id = ?`).get(pedido.id);
  const depois = estornarRecebimento(recebimento.id, db);
  assert.equal(saldo(material, db), antes);
  assert.equal(depois.status, 'CONFIRMADO');
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM titulos WHERE documento = 'NF ESTORNO'`).get().n, 0);
});

test('pedido totalmente recebido não pode ser alterado', () => {
  const fornecedor = novoFornecedor();
  const material = novoMaterial({ fornecedor });
  const pedido = criarPedidoCompra(
    { fornecedor_id: fornecedor, itens: [{ material_id: material, quantidade: 10 }] }, db
  );
  receber(pedido.id, { gerar_titulo: false }, db);
  assert.throws(
    () => atualizarPedidoCompra(pedido.id, { itens: [{ material_id: material, quantidade: 99 }] }, db),
    /já recebido não pode ser alterado/i
  );
});

test('pedido recebido pela metade aceita mudar o cabeçalho, não os itens', () => {
  const fornecedor = novoFornecedor();
  const material = novoMaterial({ fornecedor });
  const pedido = criarPedidoCompra(
    { fornecedor_id: fornecedor, itens: [{ material_id: material, quantidade: 100 }] }, db
  );
  receber(pedido.id, { gerar_titulo: false, itens: [{ item_id: pedido.linhas[0].id, quantidade: 40 }] }, db);

  // Prazo e observação seguem editáveis enquanto falta material chegar.
  const atualizado = atualizarPedidoCompra(pedido.id, { observacao: 'Cobrar o restante' }, db);
  assert.equal(atualizado.observacao, 'Cobrar o restante');
  assert.equal(atualizado.status, 'PARCIAL');

  // Trocar os itens, não: o que já entrou no estoque perderia a referência.
  assert.throws(
    () => atualizarPedidoCompra(pedido.id, { itens: [{ material_id: material, quantidade: 99 }] }, db),
    /não pode ter os itens trocados/i
  );
});

/* -------------------------------------------------------------- inventário */

test('inventário congela o saldo e o fechamento ajusta as divergências', () => {
  const material = novoMaterial({ custo: 10, entrada: 100 });
  const inventario = abrirInventario({ descricao: 'Contagem teste', materiais: [material] }, db);
  assert.equal(inventario.linhas[0].saldo_sistema, 100);
  assert.equal(inventario.pendentes, 1);

  // A prateleira tem 92: sobrou menos do que o sistema achava.
  const contado = contar(inventario.id, material, 92, db);
  assert.equal(contado.linhas[0].diferenca, -8);
  assert.equal(contado.divergencias, 1);
  assert.equal(contado.valor_divergencia, -80);

  const { inventario: fechado, ajustes } = fecharInventario(inventario.id, {}, db);
  assert.equal(fechado.status, 'FECHADO');
  assert.equal(ajustes.length, 1);
  assert.equal(saldo(material, db), 92);
});

test('contagem para cima gera ajuste positivo', () => {
  const material = novoMaterial({ entrada: 50 });
  const inventario = abrirInventario({ descricao: 'Sobra', materiais: [material] }, db);
  contar(inventario.id, material, 63, db);
  fecharInventario(inventario.id, {}, db);
  assert.equal(saldo(material, db), 63);
});

test('inventário fechado não aceita nova contagem', () => {
  const material = novoMaterial({ entrada: 10 });
  const inventario = abrirInventario({ descricao: 'Fechado', materiais: [material] }, db);
  contar(inventario.id, material, 10, db);
  fecharInventario(inventario.id, {}, db);
  assert.throws(() => contar(inventario.id, material, 5, db), /fechado não aceita/i);
});

test('fechar sem nenhuma contagem é recusado', () => {
  const material = novoMaterial({ entrada: 10 });
  const inventario = abrirInventario({ descricao: 'Vazio', materiais: [material] }, db);
  assert.throws(() => fecharInventario(inventario.id, {}, db), /Nenhum material foi contado/i);
});

test('resumo de compras separa requisição de pedido', () => {
  const r = resumoCompras(db);
  assert.equal(typeof r.requisicoes_abertas, 'number');
  assert.equal(typeof r.valor_em_pedido, 'number');
  assert.ok(Array.isArray(r.por_fornecedor));
  assert.ok(Array.isArray(r.entregas_previstas));
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('editar o cabeçalho de um pedido parcial não desfaz o status do recebimento', () => {
  const fornecedor = novoFornecedor();
  const material = novoMaterial({ custo: 5, fornecedor });
  const pedido = criarPedidoCompra({
    fornecedor_id: fornecedor,
    itens: [{ material_id: material, quantidade: 100, preco_unitario: 5 }],
  });

  receber(pedido.id, { itens: [{ item_id: buscarPedidoCompra(pedido.id).linhas[0].id, quantidade: 40 }] });
  assert.equal(buscarPedidoCompra(pedido.id).status, 'PARCIAL');

  // O editor manda o cabeçalho inteiro; um "ENVIADO" vindo dali não pode valer.
  const depois = atualizarPedidoCompra(pedido.id, {
    previsao_entrega: '2030-01-01',
    observacao: 'entrega remarcada',
    status: 'ENVIADO',
  });
  assert.equal(depois.status, 'PARCIAL');
  assert.equal(depois.previsao_entrega, '2030-01-01');
  assert.equal(depois.observacao, 'entrega remarcada');
  assert.equal(depois.linhas[0].recebido, 40);

  // Cancelar segue sendo decisão de quem edita.
  assert.equal(atualizarPedidoCompra(pedido.id, { status: 'CANCELADO' }).status, 'CANCELADO');
});

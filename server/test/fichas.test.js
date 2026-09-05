import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csvsist-fichas-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');

const { getDb, migrate } = await import('../src/db/index.js');
const { abrirOrdem } = await import('../src/services/producao.js');
const {
  montarFicha, salvarGrade, gradeDoItem, garantirOperacoes, apontarOperacao,
  salvarArte, arteDoProduto,
} = await import('../src/services/fichas.js');
const { fichaHtml } = await import('../src/services/fichas-html.js');
const { pcpComMaoDeObra, carteiraConsolidada, pedidosDoCliente, paraCsv } =
  await import('../src/services/relatorios.js');

const db = migrate(getDb());

let sufixo = 0;
const unico = (prefixo) => `${prefixo} ${++sufixo}-${Date.now()}`;

/**
 * Cenário com um material de cada setor: tecido (corte), aviamento (preparação),
 * tinta (silk) e embalagem — é o que permite conferir que cada via imprime só o
 * que lhe diz respeito.
 */
function cenario({ quantidade = 3000 } = {}) {
  const grupo = db.prepare(`INSERT INTO grupos_produto (nome) VALUES (?)`).run(unico('GRUPO'));
  const produtoId = db
    .prepare(`INSERT INTO produtos (descricao, grupo_id, linha, preco_padrao) VALUES (?, ?, 'LEVE', 25)`)
    .run(unico('AVENTAL NY EMBORRACHADO'), grupo.lastInsertRowid).lastInsertRowid;

  const materiais = {};
  for (const [chave, tipo, unidade, consumo, observacao] of [
    ['tecido', 'TECIDO', 'MT', 0.6, null],
    ['aviamento', 'AVIAMENTO', 'UN', 1, null],
    ['tinta', 'TINTA', 'KG', 0.002, null],
    ['saco', 'EMBALAGEM', 'UN', 0.04, '25 POR SACO'],
  ]) {
    const id = db
      .prepare(`INSERT INTO materiais (descricao, tipo, unidade, custo_unitario) VALUES (?, ?, ?, 10)`)
      .run(unico(`MATERIAL ${tipo}`), tipo, unidade).lastInsertRowid;
    db.prepare(
      `INSERT INTO ficha_tecnica (produto_id, material_id, consumo_por_peca, observacao) VALUES (?, ?, ?, ?)`
    ).run(produtoId, id, consumo, observacao);
    materiais[chave] = id;
  }

  for (const [codigo, custo] of [['CORTE', 0.25], ['SILK', 0.7], ['COSTURA', 1.84], ['EMBALAGEM', 0.25]]) {
    const etapa = db.prepare(`SELECT id FROM etapas WHERE codigo = ?`).get(codigo);
    db.prepare(`INSERT INTO custos_processo (produto_id, etapa_id, custo_por_peca) VALUES (?, ?, ?)`)
      .run(produtoId, etapa.id, custo);
  }

  const clienteId = db.prepare(`INSERT INTO clientes (nome) VALUES (?)`).run(unico('HYDRA')).lastInsertRowid;
  const vendedorId = db.prepare(`INSERT INTO vendedores (nome) VALUES (?)`).run(unico('LETICIA')).lastInsertRowid;
  const pedidoId = db
    .prepare(
      `INSERT INTO pedidos (numero, cliente_id, vendedor_id, data_pedido, data_entrega)
       VALUES (?, ?, ?, date('now'), date('now','+20 day'))`
    )
    .run(String(200 + sufixo), clienteId, vendedorId).lastInsertRowid;
  const itemId = db
    .prepare(`INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, 25)`)
    .run(pedidoId, produtoId, quantidade).lastInsertRowid;

  const ordem = abrirOrdem(itemId);
  return { produtoId, itemId, ordemId: ordem.id, clienteId, materiais, quantidade };
}

test('sem grade lançada a peça sai como tamanho único', () => {
  const { itemId, quantidade } = cenario();
  const { grade, total, lancada } = gradeDoItem(itemId, quantidade);
  assert.equal(lancada, false);
  assert.equal(total, quantidade);
  assert.equal(grade.find((g) => g.tamanho === 'ÚNICO').quantidade, quantidade);
  assert.equal(grade.find((g) => g.tamanho === 'P').quantidade, null);
});

test('a grade tem de fechar com a quantidade do item', () => {
  const { itemId } = cenario({ quantidade: 100 });
  assert.throws(
    () => salvarGrade(itemId, [{ tamanho: 'P', quantidade: 30 }, { tamanho: 'M', quantidade: 40 }]),
    /grade soma 70/i
  );
  const salva = salvarGrade(itemId, [
    { tamanho: 'P', quantidade: 30 },
    { tamanho: 'M', quantidade: 40 },
    { tamanho: 'G', quantidade: 30 },
  ]);
  assert.equal(salva.total, 100);
  assert.equal(salva.lancada, true);
});

test('tamanho fora da grade padrão é recusado', () => {
  const { itemId } = cenario({ quantidade: 10 });
  assert.throws(() => salvarGrade(itemId, [{ tamanho: 'GGG', quantidade: 10 }]), /Tamanho inválido/);
});

test('cada via imprime só o material do seu setor', () => {
  const { ordemId } = cenario();
  const ficha = montarFicha(ordemId);
  const via = (setor) => ficha.documentos.find((d) => d.setor === setor);

  assert.equal(via('PRODUCAO').materiais.length, 4, 'a capa lista o dossiê inteiro');
  assert.deepEqual(via('CORTE').materiais.map((m) => m.tipo), ['TECIDO']);
  assert.deepEqual(via('SILK').materiais.map((m) => m.tipo), ['TINTA']);
  assert.deepEqual(via('EMBALAGEM').materiais.map((m) => m.tipo), ['EMBALAGEM']);
  assert.ok(!via('MODELAGEM').materiais.some((m) => m.tipo === 'EMBALAGEM'));
});

test('o setor lançado na ficha técnica manda no padrão por tipo', () => {
  const { ordemId, produtoId, materiais } = cenario();
  db.prepare(`UPDATE ficha_tecnica SET setor = 'EMBALAGEM' WHERE produto_id = ? AND material_id = ?`)
    .run(produtoId, materiais.tecido);
  const ficha = montarFicha(ordemId);
  const embalagem = ficha.documentos.find((d) => d.setor === 'EMBALAGEM');
  assert.equal(embalagem.materiais.length, 2);
  assert.equal(ficha.documentos.find((d) => d.setor === 'CORTE').materiais.length, 0);
});

test('a capa soma a mão de obra das etapas da ordem', () => {
  const { ordemId, quantidade } = cenario();
  const ficha = montarFicha(ordemId);
  const esperado = (0.25 + 0.7 + 1.84 + 0.25) * quantidade;
  assert.equal(ficha.total_mo, esperado);
  assert.equal(ficha.operacoes.length, 4);
  assert.equal(ficha.operacoes[0].custo_unitario, 0.25);
  assert.equal(ficha.operacoes[0].quantidade, quantidade);
});

test('o consumo por peça vem da ficha técnica e a quantidade total da ordem', () => {
  const { ordemId, quantidade } = cenario();
  const ficha = montarFicha(ordemId);
  const tecido = ficha.materiais.find((m) => m.tipo === 'TECIDO');
  assert.equal(tecido.consumo_por_peca, 0.6);
  assert.equal(tecido.quantidade_total, 0.6 * quantidade);
  const saco = ficha.materiais.find((m) => m.tipo === 'EMBALAGEM');
  assert.equal(saco.observacao, '25 POR SACO');
});

test('a sequência operacional é copiada uma vez e não apaga o que foi preenchido', () => {
  const { ordemId } = cenario();
  const primeira = garantirOperacoes(ordemId);
  const corte = primeira.filter((o) => o.setor === 'CORTE');
  assert.equal(corte.length, 4);
  assert.deepEqual(corte.map((o) => o.sequencia), [1, 2, 3, 4]);

  apontarOperacao(corte[0].id, { operador: 'MARIA', inicio: '2026-09-03T07:30' });
  const segunda = garantirOperacoes(ordemId);
  assert.equal(segunda.length, primeira.length, 'rodar de novo não duplica');
  assert.equal(segunda.find((o) => o.id === corte[0].id).operador, 'MARIA');
});

test('escolher as vias limita o dossiê impresso', () => {
  const { ordemId } = cenario();
  const ficha = montarFicha(ordemId, { vias: ['PRODUCAO', 'CORTE'] });
  assert.deepEqual(ficha.documentos.map((d) => d.setor), ['PRODUCAO', 'CORTE']);
  assert.throws(() => montarFicha(ordemId, { vias: ['FINANCEIRO'] }), /Setor inválido/);
});

test('a arte guarda personalização, logos e receita de tinta', () => {
  const { produtoId } = cenario();
  salvarArte(produtoId, { personalizacao: 'SILK', origem_arte: 'VETOR', base_tinta: 'AGUA', tinta_pronta: true });
  db.prepare(
    `INSERT INTO arte_logos (produto_id, descricao, posicao, largura_cm, altura_cm, cor) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(produtoId, 'LOGO PEITO', 'PEITO', 6, 7, 'DOURADO');
  db.prepare(`INSERT INTO arte_cores (produto_id, sequencia, nome, hex) VALUES (?, 1, 'DOURADO', '#c9922f')`)
    .run(produtoId);

  const arte = arteDoProduto(produtoId);
  assert.equal(arte.tinta_pronta, 1);
  assert.equal(arte.logos[0].descricao, 'LOGO PEITO');
  assert.equal(arte.cores[0].nome, 'DOURADO');
});

test('a ficha impressa traz as vias e escapa o que veio do cadastro', () => {
  const { ordemId, produtoId, clienteId } = cenario();
  db.prepare(`UPDATE clientes SET nome = ? WHERE id = ?`).run('<script>alert(1)</script>', clienteId);
  db.prepare(`INSERT INTO produto_instrucoes (produto_id, setor, texto, destaque) VALUES (?, 'CORTE', ?, 1)`)
    .run(produtoId, 'CORTAR 9000 ALÇAS COM 65CM');

  const html = fichaHtml(montarFicha(ordemId));
  assert.match(html, /ORDEM DE PRODUÇÃO/);
  assert.match(html, /LAYOUT: SETOR CORTE/i);
  assert.match(html, /CORTAR 9000 ALÇAS COM 65CM/);
  assert.match(html, /DISTRIBUIÇÃO DESTA VIA/);
  assert.ok(!html.includes('<script>alert(1)</script>'), 'nome de cliente não vira script');
  assert.match(html, /&lt;script&gt;/);
});

test('imagem com origem estranha não entra na ficha impressa', () => {
  const { ordemId, produtoId } = cenario();
  db.prepare(`INSERT INTO produto_imagens (produto_id, setor, titulo, arquivo) VALUES (?, 'CORTE', ?, ?)`)
    .run(produtoId, 'MOLDE', 'javascript:alert(1)');
  db.prepare(`INSERT INTO produto_imagens (produto_id, setor, titulo, arquivo) VALUES (?, 'CORTE', ?, ?)`)
    .run(produtoId, 'FOTO', 'data:image/png;base64,iVBORw0KGgo=');

  const html = fichaHtml(montarFicha(ordemId));
  assert.ok(!html.includes('javascript:alert(1)'));
  assert.match(html, /data:image\/png;base64,iVBORw0KGgo=/);
});

test('o mapa de PCP traz a etapa e a mão de obra de cada item', () => {
  const { ordemId, quantidade } = cenario();
  const ficha = montarFicha(ordemId);
  const linha = pcpComMaoDeObra({ situacao: 'CARTEIRA' }).find((l) => l.ordem_id === ordemId);
  assert.ok(linha, 'o item em carteira aparece no mapa');
  assert.equal(linha.mo_total, ficha.total_mo);
  assert.equal(linha.etapas.CORTE.custo_mo, 0.25 * quantidade);
  assert.equal(linha.etapas.CORTE.status, 'PENDENTE');
  assert.equal(linha.semana_pedido, Number(linha.semana_pedido));
});

test('a carteira consolidada soma peças, faturamento e MO ainda em produção', () => {
  const antes = carteiraConsolidada();
  const { quantidade } = cenario();
  const depois = carteiraConsolidada();
  assert.equal(depois.pecas, antes.pecas + quantidade);
  assert.equal(depois.faturar, Math.round((antes.faturar + quantidade * 25) * 100) / 100);
  assert.ok(depois.mo_em_producao_total > antes.mo_em_producao_total);
  assert.ok(depois.por_grupo.length >= 1);
});

test('o relatório por cliente filtra pelo nome e fecha os totais', () => {
  const { clienteId, quantidade } = cenario();
  const nome = db.prepare(`SELECT nome FROM clientes WHERE id = ?`).get(clienteId).nome;
  const relatorio = pedidosDoCliente({ cliente: nome });
  assert.equal(relatorio.total.pecas, quantidade);
  assert.equal(relatorio.total.valor, quantidade * 25);
  assert.equal(relatorio.itens.length, 1);
  assert.equal(relatorio.por_mes.length, 1);
});

test('o CSV sai com ponto e vírgula, vírgula decimal e aspas escapadas', () => {
  const csv = paraCsv(
    [{ cliente: 'HYDRA; PET', valor: 1234.5 }],
    [{ titulo: 'Cliente', campo: 'cliente' }, { titulo: 'Valor', campo: 'valor' }]
  );
  assert.ok(csv.startsWith('﻿'), 'o BOM faz o Excel abrir com acento certo');
  const linhas = csv.slice(1).trim().split('\n');
  assert.equal(linhas[0], 'Cliente;Valor');
  assert.equal(linhas[1], '"HYDRA; PET";1234,5');
});

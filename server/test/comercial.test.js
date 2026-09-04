import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conserv-com-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');

const { getDb, migrate } = await import('../src/db/index.js');
const { criarOrcamento, atualizarOrcamento, buscarOrcamento, converterEmPedido,
        precificar, moverEtapa, buscarOportunidade, registrarInteracao,
        funil, resumoComercial, desempenhoOrcamentos, proximoNumeroOrcamento } =
  await import('../src/services/comercial.js');
const { permissoesDe } = await import('../src/lib/permissoes.js');

const db = migrate(getDb());

const etapa = (nome) => db.prepare(`SELECT id FROM etapas_funil WHERE nome = ?`).get(nome).id;
const hoje = () => new Date().toISOString().slice(0, 10);
const dia = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const novoCliente = () =>
  db.prepare(`INSERT INTO clientes (nome) VALUES (?)`).run(`CLI ${Math.random()}`).lastInsertRowid;

/** Produto com ficha técnica e processo, para o custo formado existir. */
function produtoCusteado({ preco = 50, consumo = 1, custoMaterial = 10, minutos = 2 } = {}) {
  const produto = db
    .prepare(`INSERT INTO produtos (descricao, preco_padrao) VALUES (?, ?)`)
    .run(`P ${Math.random()}`, preco).lastInsertRowid;
  const material = db
    .prepare(`INSERT INTO materiais (descricao, unidade, custo_unitario) VALUES (?, 'MT', ?)`)
    .run(`M ${Math.random()}`, custoMaterial).lastInsertRowid;
  db.prepare(
    `INSERT INTO ficha_tecnica (produto_id, material_id, consumo_por_peca, perda_percentual) VALUES (?, ?, ?, 0)`
  ).run(produto, material, consumo);
  db.prepare(
    `INSERT INTO produto_processo (produto_id, etapa_id, sequencia, tempo_por_peca_min) VALUES (?, ?, 1, ?)`
  ).run(produto, db.prepare(`SELECT id FROM etapas WHERE codigo = 'CORTE'`).get().id, minutos);
  return produto;
}

function novaOportunidade(campos = {}) {
  const info = db
    .prepare(
      `INSERT INTO oportunidades (titulo, cliente_id, etapa_id, valor_estimado)
       VALUES (?, ?, ?, ?)`
    )
    .run(campos.titulo ?? 'Negócio', campos.cliente_id ?? novoCliente(),
         campos.etapa_id ?? etapa('Contato inicial'), campos.valor_estimado ?? 1000);
  return info.lastInsertRowid;
}

/* ------------------------------------------------------------------- CRM */

test('o funil padrão nasce com as etapas e as probabilidades', () => {
  const etapas = db.prepare(`SELECT * FROM etapas_funil ORDER BY ordem`).all();
  assert.equal(etapas.length, 6);
  assert.equal(etapas[0].nome, 'Contato inicial');
  assert.equal(etapas.find((e) => e.tipo === 'GANHA').probabilidade, 100);
  assert.equal(etapas.find((e) => e.tipo === 'PERDIDA').probabilidade, 0);
});

test('mover para ganha carimba a data de fechamento', () => {
  const id = novaOportunidade();
  const atual = moverEtapa(id, etapa('Ganha'), {}, db);
  assert.equal(atual.etapa_tipo, 'GANHA');
  assert.equal(atual.fechada_em, hoje());
});

test('perder exige motivo, e reabrir limpa o fechamento', () => {
  const id = novaOportunidade();
  assert.throws(() => moverEtapa(id, etapa('Perdida'), {}, db), /motivo da perda/i);

  const perdida = moverEtapa(id, etapa('Perdida'), { motivo_perda: 'Preço' }, db);
  assert.equal(perdida.motivo_perda, 'Preço');
  assert.equal(perdida.fechada_em, hoje());

  const reaberta = moverEtapa(id, etapa('Negociação'), {}, db);
  assert.equal(reaberta.fechada_em, null);
  assert.equal(reaberta.motivo_perda, null);
});

test('o funil pondera o valor pela probabilidade da etapa', () => {
  db.prepare(`DELETE FROM oportunidades`).run();
  novaOportunidade({ etapa_id: etapa('Levantamento'), valor_estimado: 1000 });  // 25%
  novaOportunidade({ etapa_id: etapa('Negociação'), valor_estimado: 1000 });    // 75%

  const colunas = funil({}, db);
  const levantamento = colunas.find((c) => c.etapa.nome === 'Levantamento');
  const negociacao = colunas.find((c) => c.etapa.nome === 'Negociação');
  assert.equal(levantamento.valor_ponderado, 250);
  assert.equal(negociacao.valor_ponderado, 750);

  const resumo = resumoComercial({}, db);
  assert.equal(resumo.valor_aberto, 2000);
  assert.equal(resumo.valor_ponderado, 1000);
});

test('a probabilidade da própria oportunidade sobrepõe a da etapa', () => {
  db.prepare(`DELETE FROM oportunidades`).run();
  const id = novaOportunidade({ etapa_id: etapa('Levantamento'), valor_estimado: 1000 });
  db.prepare(`UPDATE oportunidades SET probabilidade = 90 WHERE id = ?`).run(id);
  const coluna = funil({}, db).find((c) => c.etapa.nome === 'Levantamento');
  assert.equal(coluna.valor_ponderado, 900);
});

test('conversão olha só o que já fechou', () => {
  db.prepare(`DELETE FROM oportunidades`).run();
  novaOportunidade({ etapa_id: etapa('Ganha') });
  novaOportunidade({ etapa_id: etapa('Ganha') });
  novaOportunidade({ etapa_id: etapa('Perdida') });
  novaOportunidade({ etapa_id: etapa('Negociação') }); // aberta não entra na conta
  assert.equal(resumoComercial({}, db).conversao, 66.67);
});

test('interação precisa de vínculo e alimenta a agenda', () => {
  assert.throws(() => registrarInteracao({ resumo: 'x' }, db), /Vincule a interação/i);

  const id = novaOportunidade({ etapa_id: etapa('Negociação') });
  registrarInteracao(
    { oportunidade_id: id, resumo: 'Ligação feita', proximo_passo: 'Enviar proposta', proxima_data: dia(3) },
    db
  );
  const oportunidade = buscarOportunidade(id, db);
  assert.equal(oportunidade.interacoes.length, 1);
  assert.ok(resumoComercial({}, db).agenda.some((a) => a.oportunidade_id === id));
});

/* ------------------------------------------------------------ precificação */

test('markup incide sobre o custo e margem sobre o preço — contas diferentes', () => {
  const produto = produtoCusteado({ preco: 0, consumo: 1, custoMaterial: 10, minutos: 0 });
  const custo = precificar(produto, {}, db).custo_unitario;
  assert.equal(custo, 10);

  const comMarkup = precificar(produto, { markup: 50 }, db);
  assert.equal(comMarkup.preco_sugerido, 15);
  assert.equal(comMarkup.margem_no_sugerido, 33.33); // 50% de markup ≠ 50% de margem

  const comMargem = precificar(produto, { margem: 50 }, db);
  assert.equal(comMargem.preco_sugerido, 20);
  assert.equal(comMargem.margem_no_sugerido, 50);
});

test('precificação mostra a margem do preço de tabela, mesmo negativa', () => {
  const produto = produtoCusteado({ preco: 8, consumo: 1, custoMaterial: 10, minutos: 0 });
  const p = precificar(produto, {}, db);
  assert.equal(p.preco_tabela, 8);
  assert.ok(p.margem_no_tabela < 0);
});

/* --------------------------------------------------------------- orçamentos */

test('o número do orçamento é sequencial por ano', () => {
  const ano = new Date().getFullYear();
  assert.match(proximoNumeroOrcamento(db, ano), new RegExp(`^ORC-${ano}-\\d{4}$`));
});

test('orçamento calcula bruto, desconto, total e margem', () => {
  const produto = produtoCusteado({ preco: 50, consumo: 1, custoMaterial: 10, minutos: 0 });
  const orcamento = criarOrcamento(
    {
      cliente_id: novoCliente(),
      desconto_percentual: 10,
      frete: 100,
      itens: [{ produto_id: produto, quantidade: 100, preco_unitario: 50 }],
    },
    db
  );
  assert.equal(orcamento.valor_bruto, 5000);
  assert.equal(orcamento.desconto, 500);
  assert.equal(orcamento.valor_total, 4600); // 5000 − 500 + 100 de frete
  assert.equal(orcamento.custo_total, 1000);
  assert.equal(orcamento.margem, 3500);      // o frete não entra na margem
});

test('o custo do item é congelado no momento da proposta', () => {
  const produto = produtoCusteado({ preco: 50, consumo: 1, custoMaterial: 10, minutos: 0 });
  const orcamento = criarOrcamento(
    { cliente_id: novoCliente(), itens: [{ produto_id: produto, quantidade: 10, preco_unitario: 50 }] },
    db
  );
  assert.equal(orcamento.linhas[0].custo_unitario, 10);

  // O material dobra de preço depois da proposta enviada.
  const material = db.prepare(`SELECT material_id FROM ficha_tecnica WHERE produto_id = ?`).get(produto);
  db.prepare(`UPDATE materiais SET custo_unitario = 20 WHERE id = ?`).run(material.material_id);

  assert.equal(buscarOrcamento(orcamento.id, db).linhas[0].custo_unitario, 10);
});

test('orçamento exige cliente ou prospect e ao menos um item', () => {
  const produto = produtoCusteado();
  assert.throws(
    () => criarOrcamento({ itens: [{ produto_id: produto, quantidade: 1 }] }, db),
    /cliente ou o nome do prospect/i
  );
  assert.throws(() => criarOrcamento({ cliente_id: novoCliente(), itens: [] }, db), /ao menos um item/i);
});

test('converter gera pedido com ordens e leva a oportunidade para ganha', () => {
  const produto = produtoCusteado({ preco: 50, consumo: 1, custoMaterial: 10, minutos: 2 });
  const cliente = novoCliente();
  const oportunidade = novaOportunidade({ cliente_id: cliente, etapa_id: etapa('Negociação') });

  const orcamento = criarOrcamento(
    {
      cliente_id: cliente,
      oportunidade_id: oportunidade,
      prazo_entrega_dias: 20,
      status: 'ENVIADO',
      itens: [{ produto_id: produto, quantidade: 200, preco_unitario: 50 }],
    },
    db
  );

  const { pedido_id, orcamento: depois } = converterEmPedido(orcamento.id, {}, db);
  assert.equal(depois.status, 'APROVADO');
  assert.equal(depois.pedido_id, pedido_id);

  const pedido = db.prepare(`SELECT * FROM pedidos WHERE id = ?`).get(pedido_id);
  assert.equal(pedido.data_entrega, dia(20));
  assert.equal(pedido.orcamento_id, orcamento.id);

  const itens = db.prepare(`SELECT * FROM pedido_itens WHERE pedido_id = ?`).all(pedido_id);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].quantidade, 200);

  const ordens = db
    .prepare(
      `SELECT COUNT(*) AS n FROM ordens_producao o
       JOIN pedido_itens i ON i.id = o.pedido_item_id WHERE i.pedido_id = ?`
    )
    .get(pedido_id).n;
  assert.equal(ordens, 1);

  assert.equal(buscarOportunidade(oportunidade, db).etapa_tipo, 'GANHA');
});

test('o desconto do cabeçalho entra rateado no preço do item do pedido', () => {
  const produto = produtoCusteado({ preco: 100 });
  const cliente = novoCliente();
  const orcamento = criarOrcamento(
    {
      cliente_id: cliente,
      desconto_percentual: 20,
      itens: [{ produto_id: produto, quantidade: 10, preco_unitario: 100 }],
    },
    db
  );
  const { pedido_id } = converterEmPedido(orcamento.id, { abrir_ordens: false }, db);
  const item = db.prepare(`SELECT * FROM pedido_itens WHERE pedido_id = ?`).get(pedido_id);
  assert.equal(item.preco_unitario, 80);
});

test('não dá para converter duas vezes nem alterar depois de convertido', () => {
  const produto = produtoCusteado();
  const orcamento = criarOrcamento(
    { cliente_id: novoCliente(), itens: [{ produto_id: produto, quantidade: 5, preco_unitario: 30 }] },
    db
  );
  converterEmPedido(orcamento.id, { abrir_ordens: false }, db);
  assert.throws(() => converterEmPedido(orcamento.id, {}, db), /já virou pedido/i);
  assert.throws(
    () => atualizarOrcamento(orcamento.id, { desconto_percentual: 5 }, db),
    /já convertido/i
  );
});

test('prospect sem cadastro não vira pedido antes de virar cliente', () => {
  const produto = produtoCusteado();
  const orcamento = criarOrcamento(
    { prospect: 'MALHARIA NOVA LTDA', itens: [{ produto_id: produto, quantidade: 10, preco_unitario: 40 }] },
    db
  );
  assert.equal(orcamento.parte, 'MALHARIA NOVA LTDA');
  assert.throws(() => converterEmPedido(orcamento.id, {}, db), /Cadastre o prospect/i);
});

test('orçamento vencido é sinalizado sem mudar de status sozinho', () => {
  const produto = produtoCusteado();
  const orcamento = criarOrcamento(
    {
      cliente_id: novoCliente(),
      validade: dia(-3),
      status: 'ENVIADO',
      itens: [{ produto_id: produto, quantidade: 1, preco_unitario: 10 }],
    },
    db
  );
  assert.equal(orcamento.vencido, 1);
  assert.equal(orcamento.status, 'ENVIADO');
});

test('desempenho separa aprovado de recusado e calcula a conversão', () => {
  db.prepare(`DELETE FROM orcamentos`).run();
  const produto = produtoCusteado();
  const cliente = novoCliente();
  const base = { cliente_id: cliente, itens: [{ produto_id: produto, quantidade: 10, preco_unitario: 100 }] };
  criarOrcamento({ ...base, status: 'APROVADO' }, db);
  criarOrcamento({ ...base, status: 'APROVADO' }, db);
  criarOrcamento({ ...base, status: 'RECUSADO' }, db);
  criarOrcamento({ ...base, status: 'ENVIADO' }, db); // em aberto não conta

  const d = desempenhoOrcamentos({}, db);
  assert.equal(d.total, 4);
  assert.equal(d.aprovados, 2);
  assert.equal(d.conversao, 66.67);
  assert.equal(d.ticket_medio, 1000);
});

/* ------------------------------------------------------------- permissões */

test('o nível comercial orça e vê custo, mas não vê folha nem financeiro', () => {
  const p = permissoesDe({ perfil: 'VENDEDOR', nivel_acesso: 'comercial' });
  assert.equal(p['orcamentos.editar'], true);
  assert.equal(p['orcamentos.aprovar'], true);
  assert.equal(p['produtos.custo'], true);
  assert.equal(p['crm.editar'], true);
  assert.equal(p['pessoas.salario'], false);
  assert.equal(p['financeiro.ver'], false);
  assert.equal(p['engenharia.jornada'], false);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

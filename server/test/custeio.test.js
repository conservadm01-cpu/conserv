import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conserv-custeio-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');

const { getDb, migrate } = await import('../src/db/index.js');
const { jornada, custoMinutoDepartamento, capacidadeProdutivaMes, taxaCustoIndireto,
        custoCompletoProduto, custoRealOrdem } = await import('../src/services/custeio.js');
const { registrarApontamento, excluirApontamento, produtividade } =
  await import('../src/services/apontamento.js');
const { abrirOrdem, buscarOrdem, custoPadraoPorPeca } = await import('../src/services/producao.js');
const { registrarMovimento } = await import('../src/services/estoque.js');

const db = migrate(getDb());

const idEtapa = (codigo) => db.prepare(`SELECT id FROM etapas WHERE codigo = ?`).get(codigo).id;
const idDepto = (nome) => db.prepare(`SELECT id FROM departamentos WHERE nome = ?`).get(nome).id;

/** Uma pessoa no setor com o salário informado. */
function contratar(setor, salario, vt = 0, produtivo = 1) {
  return db
    .prepare(
      `INSERT INTO colaboradores (nome, departamento_id, salario, vale_transporte, produtivo, status)
       VALUES (?, ?, ?, ?, ?, 'ATIVO')`
    )
    .run(`P${Math.random()}`, idDepto(setor), salario, vt, produtivo).lastInsertRowid;
}

/** Produto com ficha técnica e roteiro, dentro de um pedido, pronto para virar OP. */
function cenario({ quantidade = 100, preco = 50, tempoCorte = 2, consumo = 1, custoMaterial = 10 } = {}) {
  const produto = db
    .prepare(`INSERT INTO produtos (descricao, linha, preco_padrao) VALUES (?, 'LEVE', ?)`)
    .run(`PROD ${Math.random()}`, preco).lastInsertRowid;
  const material = db
    .prepare(`INSERT INTO materiais (descricao, unidade, custo_unitario) VALUES (?, 'MT', ?)`)
    .run(`MAT ${Math.random()}`, custoMaterial).lastInsertRowid;
  db.prepare(
    `INSERT INTO ficha_tecnica (produto_id, material_id, consumo_por_peca, perda_percentual) VALUES (?, ?, ?, 0)`
  ).run(produto, material, consumo);
  db.prepare(
    `INSERT INTO produto_processo (produto_id, etapa_id, sequencia, tempo_por_peca_min) VALUES (?, ?, 1, ?)`
  ).run(produto, idEtapa('CORTE'), tempoCorte);

  const cliente = db.prepare(`INSERT INTO clientes (nome) VALUES (?)`).run(`C ${Math.random()}`).lastInsertRowid;
  const pedido = db
    .prepare(`INSERT INTO pedidos (numero, cliente_id, data_pedido) VALUES (?, ?, date('now'))`)
    .run(String(Math.floor(Math.random() * 1e6)), cliente).lastInsertRowid;
  const item = db
    .prepare(`INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)`)
    .run(pedido, produto, quantidade, preco).lastInsertRowid;

  registrarMovimento({ material_id: material, tipo: 'ENTRADA', quantidade: quantidade * consumo * 2, custo_unitario: custoMaterial }, db);
  return { produto, material, item, quantidade, preco };
}

test('a migração cria a estrutura de fábrica e vincula as etapas aos setores', () => {
  const etapas = db.prepare(`SELECT codigo, departamento_id FROM etapas`).all();
  assert.ok(etapas.length >= 7);
  assert.ok(etapas.every((e) => e.departamento_id !== null));
  assert.ok(db.prepare(`SELECT id FROM parametros WHERE id = 1`).get());
  assert.ok(db.prepare(`SELECT id FROM locais_estoque WHERE nome = 'ALMOXARIFADO'`).get());
});

test('jornada desconta os intervalos do dia bruto', () => {
  const j = jornada(db);
  // 06:00 → 15:48 = 588 min brutos, menos 75 de intervalo = 513 produtivos
  assert.equal(j.minutos_brutos, 588);
  assert.equal(j.minutos_produtivos, 513);
  assert.equal(j.minutos_mes, 513 * j.dias_uteis_mes);
});

test('custo do minuto do setor sai da folha com encargos e vale-transporte', () => {
  db.prepare(`DELETE FROM colaboradores`).run();
  contratar('SILK', 3000, 300);
  const c = custoMinutoDepartamento(idDepto('SILK'), db);
  const j = jornada(db);
  // (3000 × 1,80 + 300) / minutos do mês
  const esperado = (3000 * 1.8 + 300) / j.minutos_mes;
  assert.equal(c.pessoas, 1);
  assert.ok(Math.abs(c.custo_minuto - esperado) < 1e-6);
  assert.equal(c.sem_salario, false);
});

test('quem está sem salário fica fora da média e a resposta avisa', () => {
  db.prepare(`DELETE FROM colaboradores`).run();
  contratar('CORTE', 2000);
  contratar('CORTE', 0);
  const c = custoMinutoDepartamento(idDepto('CORTE'), db);
  assert.equal(c.pessoas, 2);
  assert.equal(c.com_salario, 1);
  assert.equal(c.incompleto, true);
  assert.equal(c.salario_medio, 2000);
});

test('setor sem ninguém tem custo zero, não erro', () => {
  db.prepare(`DELETE FROM colaboradores`).run();
  const c = custoMinutoDepartamento(idDepto('COSTURA'), db);
  assert.equal(c.custo_minuto, 0);
  assert.equal(c.sem_salario, true);
});

test('capacidade da fábrica conta só quem produz', () => {
  db.prepare(`DELETE FROM colaboradores`).run();
  contratar('COSTURA', 2000);
  contratar('COSTURA', 2000);
  contratar('EXPEDICAO', 5000, 0, 0); // administrativo não é capacidade
  const cap = capacidadeProdutivaMes(db);
  assert.equal(cap.pessoas, 2);
  assert.equal(cap.minutos_teoricos, 2 * cap.minutos_dia * cap.dias_uteis_mes);
  assert.equal(cap.minutos_reais, Math.round(cap.minutos_teoricos * (cap.ocupacao_percentual / 100)));
});

test('taxa de custo indireto avisa quando não há custo fixo cadastrado', () => {
  db.prepare(`DELETE FROM custos_fixos`).run();
  const t = taxaCustoIndireto(db);
  assert.equal(t.total, 0);
  assert.equal(t.configurado, false);
  assert.ok(t.avisos.some((a) => /custo fixo/i.test(a)));
});

test('custo indireto por minuto é o custo fixo dividido pela capacidade real', () => {
  db.prepare(`DELETE FROM custos_fixos`).run();
  db.prepare(`INSERT INTO custos_fixos (descricao, tipo, valor_mensal) VALUES ('Aluguel', 'ALUGUEL', 10000)`).run();
  const t = taxaCustoIndireto(db);
  assert.equal(t.total, 10000);
  assert.ok(Math.abs(t.por_minuto - 10000 / t.capacidade.minutos_reais) < 1e-6);
  assert.equal(t.configurado, true);
});

test('custo completo da peça soma material, mão de obra e indireto', () => {
  db.prepare(`DELETE FROM colaboradores`).run();
  db.prepare(`DELETE FROM custos_fixos`).run();
  contratar('CORTE', 2000);
  const { produto } = cenario({ preco: 60, tempoCorte: 3, consumo: 2, custoMaterial: 10 });

  const c = custoCompletoProduto(produto, db);
  const custoMinuto = custoMinutoDepartamento(idDepto('CORTE'), db).custo_minuto;

  assert.equal(c.material, 20); // 2 MT × R$ 10
  assert.ok(Math.abs(c.mao_de_obra - 3 * custoMinuto) < 1e-4);
  assert.equal(c.minutos_por_peca, 3);
  assert.equal(c.indireto, 0); // sem custo fixo cadastrado
  assert.ok(Math.abs(c.total - (c.material + c.mao_de_obra)) < 1e-4);
  assert.equal(c.margem, Number((60 - c.total).toFixed(2)));
});

test('o custo padrão da ordem vem da engenharia quando o produto tem processo', () => {
  db.prepare(`DELETE FROM colaboradores`).run();
  contratar('CORTE', 2000);
  const { produto, item, quantidade } = cenario({ quantidade: 200, tempoCorte: 4 });

  const mapa = custoPadraoPorPeca(produto, db);
  const custoMinuto = custoMinutoDepartamento(idDepto('CORTE'), db).custo_minuto;
  assert.ok(Math.abs(mapa.get(idEtapa('CORTE')) - 4 * custoMinuto) < 1e-6);

  const ordem = abrirOrdem(item, {}, db);
  const corte = ordem.etapas.find((e) => e.codigo === 'CORTE');
  assert.ok(Math.abs(corte.custo_mo - Number((4 * custoMinuto * quantidade).toFixed(2))) < 0.02);
});

test('apontamento move a etapa e conclui quando fecha a quantidade', () => {
  db.prepare(`DELETE FROM colaboradores`).run();
  const pessoa = contratar('CORTE', 2000);
  const { item } = cenario({ quantidade: 100, tempoCorte: 2 });
  const ordem = abrirOrdem(item, {}, db);
  const corte = idEtapa('CORTE');

  registrarApontamento({ ordem_id: ordem.id, etapa_id: corte, colaborador_id: pessoa, quantidade: 40 }, db);
  let atual = buscarOrdem(ordem.id, db);
  assert.equal(atual.etapas.find((e) => e.codigo === 'CORTE').status, 'EM_ANDAMENTO');
  assert.equal(atual.status, 'EM_PRODUCAO');

  registrarApontamento({ ordem_id: ordem.id, etapa_id: corte, colaborador_id: pessoa, quantidade: 60 }, db);
  atual = buscarOrdem(ordem.id, db);
  assert.equal(atual.etapas.find((e) => e.codigo === 'CORTE').status, 'CONCLUIDA');
});

test('apontamento acima da quantidade da ordem é recusado', () => {
  const { item } = cenario({ quantidade: 50 });
  const ordem = abrirOrdem(item, {}, db);
  registrarApontamento({ ordem_id: ordem.id, etapa_id: idEtapa('CORTE'), quantidade: 50 }, db);
  assert.throws(
    () => registrarApontamento({ ordem_id: ordem.id, etapa_id: idEtapa('CORTE'), quantidade: 1 }, db),
    /acima do saldo/i
  );
});

test('apontar numa etapa fora do roteiro da ordem é recusado', () => {
  const { item } = cenario();
  const ordem = abrirOrdem(item, {}, db);
  const fora = db.prepare(`INSERT INTO etapas (codigo, nome, ordem) VALUES (?, 'Fora', 99)`)
    .run(`X${Math.random()}`).lastInsertRowid;
  assert.throws(
    () => registrarApontamento({ ordem_id: ordem.id, etapa_id: fora, quantidade: 1 }, db),
    /não faz parte do roteiro/i
  );
});

test('sem minutos informados o apontamento usa o tempo padrão do roteiro', () => {
  db.prepare(`DELETE FROM colaboradores`).run();
  contratar('CORTE', 2000);
  const { item } = cenario({ quantidade: 100, tempoCorte: 1.5 });
  const ordem = abrirOrdem(item, {}, db);
  const a = registrarApontamento({ ordem_id: ordem.id, etapa_id: idEtapa('CORTE'), quantidade: 20 }, db);
  assert.equal(a.minutos, 30); // 20 peças × 1,5 min
  assert.ok(a.custo_mo > 0);
});

test('excluir apontamento devolve a etapa ao estado anterior', () => {
  const { item } = cenario({ quantidade: 10 });
  const ordem = abrirOrdem(item, {}, db);
  const a = registrarApontamento({ ordem_id: ordem.id, etapa_id: idEtapa('CORTE'), quantidade: 10 }, db);
  assert.equal(buscarOrdem(ordem.id, db).etapas.find((e) => e.codigo === 'CORTE').status, 'CONCLUIDA');
  excluirApontamento(a.id, db);
  assert.equal(buscarOrdem(ordem.id, db).etapas.find((e) => e.codigo === 'CORTE').status, 'EM_ANDAMENTO');
});

test('custo real da ordem junta material baixado, MO apontada e indireto', () => {
  db.prepare(`DELETE FROM colaboradores`).run();
  db.prepare(`DELETE FROM custos_fixos`).run();
  contratar('CORTE', 2000);
  db.prepare(`INSERT INTO custos_fixos (descricao, tipo, valor_mensal) VALUES ('Energia', 'ENERGIA', 5000)`).run();

  const { item, quantidade } = cenario({ quantidade: 100, preco: 40, tempoCorte: 2, consumo: 1, custoMaterial: 10 });
  const ordem = abrirOrdem(item, {}, db);
  registrarMovimento(
    { material_id: ordem.materiais[0].material_id, tipo: 'SAIDA', quantidade: 100, custo_unitario: 10, ordem_id: ordem.id },
    db
  );
  registrarApontamento({ ordem_id: ordem.id, etapa_id: idEtapa('CORTE'), quantidade }, db);

  const c = custoRealOrdem(ordem.id, db);
  assert.equal(c.custo_material, 1000);
  assert.ok(c.custo_mao_de_obra > 0);
  assert.ok(c.custo_indireto > 0);
  assert.equal(c.minutos_apontados, 200);
  assert.equal(c.receita, 4000);
  assert.equal(c.custo_total, Number((c.custo_material + c.custo_mao_de_obra + c.custo_indireto).toFixed(2)));
});

test('produtividade agrupa por colaborador e calcula peças por hora', () => {
  db.prepare(`DELETE FROM apontamentos`).run();
  db.prepare(`DELETE FROM colaboradores`).run();
  const pessoa = contratar('CORTE', 2000);
  const { item } = cenario({ quantidade: 120, tempoCorte: 1 }); // 1 min por peça → 60 peças/hora
  const ordem = abrirOrdem(item, {}, db);
  registrarApontamento({ ordem_id: ordem.id, etapa_id: idEtapa('CORTE'), colaborador_id: pessoa, quantidade: 120 }, db);

  const linha = produtividade({}, db).find((l) => l.id === pessoa);
  assert.equal(linha.pecas, 120);
  assert.equal(linha.minutos, 120);
  assert.equal(linha.pecas_hora, 60);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

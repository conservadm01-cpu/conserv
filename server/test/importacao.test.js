import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conserv-importacao-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');

const { getDb, migrate } = await import('../src/db/index.js');
const { importarPlanilha } = await import('../src/import/planilha.js');

const db = migrate(getDb());

/** Monta um .xlsx em memória com as abas e linhas informadas. */
async function planilha(abas) {
  const wb = new ExcelJS.Workbook();
  for (const [nome, linhas] of Object.entries(abas)) {
    const ws = wb.addWorksheet(nome);
    for (const linha of linhas) ws.addRow(linha);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Cabeçalho da aba CARTEIRA da planilha da ConServ (a que traz a MO em R$). */
const CABECALHO_CARTEIRA = [
  'VENDEDOR', 'PEDIDO', 'DATA DO PEDIDO', 'SEMANA DO PEDIDO', 'CATEGORIA', 'CLIENTE', 'PRODUTO',
  'GRUPO', 'LINHA', 'QTD', 'VALOR UNID', 'TOTAL', 'LIQUIDAÇÃO', 'DATA ENTREGA', 'SEMANA DE ENTREGA',
  'MATERIA PRIMA', 'ENTREGA', 'MO CORTE', 'MO SILK', 'MO COSTURA', 'MO EMBALAGEM', 'TOTAL',
];

/** Cabeçalho da Planilha1 — é a que acompanha etapa por etapa e a data de saída. */
const CABECALHO_ACOMPANHAMENTO = [
  'VENDEDOR', 'DATA DE ENTRADA', 'GRUPO DE CLIENTE', 'PEDIDO', 'CLIENTE', 'PRODUTO', 'GRUPO',
  'LINHA', 'QUANTIDADE', 'PREÇO UNITARIO', 'TOTAL', 'DATA DE ENTREGA', 'STATUS', 'DATA DE SAIDA',
  'MATERIA PRIMA', 'CORTE', 'SILK', 'COSTURA', 'EMBALAGEM', 'NF', 'ENTREGA',
];

const ordemDe = (pedido, produto) =>
  db
    .prepare(
      `SELECT o.* FROM ordens_producao o
       JOIN vw_itens v ON v.item_id = o.pedido_item_id
       WHERE v.pedido_numero = ? AND v.produto = ?`
    )
    .get(pedido, produto);

const etapaDa = (ordemId, codigo) =>
  db
    .prepare(
      `SELECT oe.* FROM ordem_etapas oe JOIN etapas e ON e.id = oe.etapa_id
       WHERE oe.ordem_id = ? AND e.codigo = ?`
    )
    .get(ordemId, codigo);

test('a aba de carteira vira pedido, item e ordem com o roteiro da planilha', async () => {
  const arquivo = await planilha({
    CARTEIRA: [
      CABECALHO_CARTEIRA,
      ['LETICIA', 5001, '2026-01-05', 2, 'PET', 'PETCO CLEAN', 'AVENTAL NYLON', 'AVENTAL', 'LEVE',
       200, 23.5, 4700, 0, '2026-02-10', 7, 'OK', '', 50, 200, 330, 100, 680],
    ],
  });

  const relatorio = await importarPlanilha(arquivo);
  assert.equal(relatorio.totais.pedidos, 1);
  assert.equal(relatorio.totais.itens, 1);
  assert.equal(relatorio.totais.ordens, 1);

  const ordem = ordemDe('5001', 'AVENTAL NYLON');
  assert.equal(ordem.quantidade, 200);
  assert.equal(ordem.data_prevista, '2026-02-10');
  assert.equal(ordem.status, 'EM_PRODUCAO');

  // A coluna de MO em R$ marca a etapa como feita e guarda o valor pago por ela.
  const costura = etapaDa(ordem.id, 'COSTURA');
  assert.equal(costura.status, 'CONCLUIDA');
  assert.equal(costura.custo_mo, 330);
  assert.equal(etapaDa(ordem.id, 'MATERIA_PRIMA').status, 'CONCLUIDA');
  assert.equal(etapaDa(ordem.id, 'ENTREGA').status, 'PENDENTE');
});

test('DATA DE SAIDA fecha a entrega com o dia real, não com o dia prometido', async () => {
  const arquivo = await planilha({
    Planilha1: [
      CABECALHO_ACOMPANHAMENTO,
      ['LETICIA', '2026-01-08', 'COSMÉTICO', 5002, 'FLORA DISTRIBUIDORA', 'CAMISETA PV', 'CAMISETA',
       'LEVE', 112, 26.5, 2968, '2026-02-05', '', '2026-02-12', 'OK', 'OK', 'OK', 'OK', 'OK', '959', 'ENTREGUE'],
    ],
  });
  await importarPlanilha(arquivo);

  const ordem = ordemDe('5002', 'CAMISETA PV');
  assert.equal(ordem.status, 'ENTREGUE');
  assert.equal(ordem.data_prevista, '2026-02-05');
  assert.equal(ordem.data_conclusao, '2026-02-12'); // saiu 7 dias depois do combinado
  assert.equal(etapaDa(ordem.id, 'ENTREGA').concluido_em, '2026-02-12');
  assert.equal(etapaDa(ordem.id, 'NF').status, 'CONCLUIDA');
});

test('quando a saída traz o motivo em vez da data, o motivo fica na ordem e ela não fecha', async () => {
  const arquivo = await planilha({
    Planilha1: [
      CABECALHO_ACOMPANHAMENTO,
      ['LETICIA', '2026-01-09', 'PET', 5003, 'CHEMVET', 'JALECO MICROFIBRA', 'JALECO', 'LEVE',
       200, 55, 11000, '2026-02-06', '', 'FALTA MATERIAL', 'OK', 'OK', '', '', '', '', ''],
    ],
  });
  await importarPlanilha(arquivo);

  const ordem = ordemDe('5003', 'JALECO MICROFIBRA');
  assert.equal(ordem.observacao, 'FALTA MATERIAL');
  assert.equal(ordem.data_conclusao, null);
  assert.notEqual(ordem.status, 'ENTREGUE');
  assert.equal(etapaDa(ordem.id, 'ENTREGA').status, 'PENDENTE');
  assert.equal(db.prepare(`SELECT situacao FROM pedidos WHERE numero = '5003'`).get().situacao, 'ABERTO');
});

test('a mesma venda repetida em duas abas entra uma vez só', async () => {
  const linha = ['LETICIA', 5004, '2026-01-12', 3, 'PET', 'PET SOCIETY', 'AVENTAL NY', 'AVENTAL',
    'LEVE', 100, 23.5, 2350, 0, '2026-02-14', 7, 'OK', '', 25, 100, 165, 50, 340];
  const arquivo = await planilha({
    CARTEIRA: [CABECALHO_CARTEIRA, linha],
    'CARTEIRA (CÓPIA)': [CABECALHO_CARTEIRA, linha],
  });

  const relatorio = await importarPlanilha(arquivo);
  assert.equal(relatorio.totais.itens, 1);
  assert.equal(relatorio.totais.duplicadas, 1);
});

test('simulação relata o que entraria sem gravar nada', async () => {
  const antes = db.prepare(`SELECT COUNT(*) AS n FROM pedidos`).get().n;
  const arquivo = await planilha({
    CARTEIRA: [
      CABECALHO_CARTEIRA,
      ['REBECA', 5005, '2026-02-02', 6, 'EDITORA', 'EDITORA RECORD', 'SACOLA CRU', 'SACOLA',
       'LEVE', 400, 10.5, 4200, 0, '2026-03-02', 10, '', '', '', '', '', '', ''],
    ],
  });

  const relatorio = await importarPlanilha(arquivo, { simular: true });
  assert.equal(relatorio.simulacao, true);
  assert.equal(relatorio.totais.itens, 1);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM pedidos`).get().n, antes);
});

test('linha sem cliente, produto ou quantidade é relatada e descartada', async () => {
  const arquivo = await planilha({
    CARTEIRA: [
      CABECALHO_CARTEIRA,
      ['LETICIA', 5006, '2026-02-03', 6, 'PET', 'CLIENTE SEM QTD', 'AVENTAL NY', 'AVENTAL', 'LEVE',
       0, 23.5, 0, 0, '2026-03-03', 10, '', '', '', '', '', '', ''],
    ],
  });

  const relatorio = await importarPlanilha(arquivo);
  assert.equal(relatorio.totais.itens, 0);
  assert.equal(relatorio.totais.ignoradas, 1);
  assert.match(relatorio.avisos[0], /linha 2/);
});

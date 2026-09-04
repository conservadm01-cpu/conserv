import { getDb } from '../db/index.js';
import { notFound, badRequest, conflict } from '../lib/errors.js';
import { round2 } from '../lib/numbers.js';
import { hoje } from '../lib/dates.js';
import { custoMinutoDepartamento } from './custeio.js';

/**
 * Gera o próximo número de OP no formato OP-<ano>-<sequencial>.
 * O sequencial é por ano, calculado a partir do maior número já emitido.
 */
export function proximoNumeroOP(db = getDb(), ano = new Date().getFullYear()) {
  const prefixo = `OP-${ano}-`;
  const row = db
    .prepare(`SELECT numero FROM ordens_producao WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1`)
    .get(`${prefixo}%`);
  const seq = row ? Number(row.numero.slice(prefixo.length)) + 1 : 1;
  return `${prefixo}${String(seq).padStart(5, '0')}`;
}

/**
 * Abre a ordem de produção de um item de pedido: cria o roteiro completo de etapas
 * (com o custo de MO padrão do produto) e explode a ficha técnica em necessidade de material.
 * Idempotente por item — um item tem no máximo uma OP.
 */
export function abrirOrdem(itemId, { observacao = null, dataPrevista = null } = {}, db = getDb()) {
  const item = db
    .prepare(
      `SELECT i.*, p.data_entrega AS pedido_entrega
       FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id WHERE i.id = ?`
    )
    .get(itemId);
  if (!item) throw notFound('Item de pedido não encontrado');

  const existente = db.prepare(`SELECT id FROM ordens_producao WHERE pedido_item_id = ?`).get(itemId);
  if (existente) throw conflict('Este item já possui ordem de produção', { ordem_id: existente.id });

  const etapas = db.prepare(`SELECT * FROM etapas WHERE ativo = 1 ORDER BY ordem`).all();
  const custoPorEtapa = custoPadraoPorPeca(item.produto_id, db);

  const tx = db.transaction(() => {
    const numero = proximoNumeroOP(db);
    const { lastInsertRowid: ordemId } = db
      .prepare(
        `INSERT INTO ordens_producao (numero, pedido_item_id, quantidade, data_prevista, observacao)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(numero, itemId, item.quantidade, dataPrevista || item.data_entrega || item.pedido_entrega, observacao);

    const insEtapa = db.prepare(
      `INSERT INTO ordem_etapas (ordem_id, etapa_id, custo_mo) VALUES (?, ?, ?)`
    );
    for (const e of etapas) {
      insEtapa.run(ordemId, e.id, round2((custoPorEtapa.get(e.id) || 0) * item.quantidade));
    }

    explodirFichaTecnica(ordemId, db);
    return ordemId;
  });

  const ordemId = tx();
  return buscarOrdem(ordemId, db);
}

/** Recalcula ordem_materiais a partir da ficha técnica do produto e da quantidade da OP. */
export function explodirFichaTecnica(ordemId, db = getDb()) {
  const ordem = db
    .prepare(
      `SELECT o.id, o.quantidade, i.produto_id
       FROM ordens_producao o JOIN pedido_itens i ON i.id = o.pedido_item_id
       WHERE o.id = ?`
    )
    .get(ordemId);
  if (!ordem) throw notFound('Ordem de produção não encontrada');

  const ficha = db
    .prepare(`SELECT material_id, consumo_por_peca, perda_percentual FROM ficha_tecnica WHERE produto_id = ?`)
    .all(ordem.produto_id);

  const upsert = db.prepare(
    `INSERT INTO ordem_materiais (ordem_id, material_id, quantidade_prevista) VALUES (?, ?, ?)
     ON CONFLICT(ordem_id, material_id) DO UPDATE SET quantidade_prevista = excluded.quantidade_prevista`
  );
  const idsFicha = ficha.map((f) => f.material_id);
  for (const f of ficha) {
    const previsto = ordem.quantidade * f.consumo_por_peca * (1 + f.perda_percentual / 100);
    upsert.run(ordemId, f.material_id, round2(previsto));
  }
  // Remove linhas de materiais que saíram da ficha técnica e ainda não tiveram baixa.
  const placeholders = idsFicha.length ? idsFicha.map(() => '?').join(',') : 'NULL';
  db.prepare(
    `DELETE FROM ordem_materiais
     WHERE ordem_id = ? AND quantidade_baixada = 0 AND material_id NOT IN (${placeholders})`
  ).run(ordemId, ...idsFicha);

  return db.prepare(`SELECT * FROM ordem_materiais WHERE ordem_id = ?`).all(ordemId);
}

/**
 * Reaplica o custo de MO padrão do produto às etapas da ordem.
 * Usado quando a tabela de custos muda depois da OP já aberta.
 */
export function recalcularCustosMO(ordemId, db = getDb()) {
  const ordem = db
    .prepare(
      `SELECT o.id, o.quantidade, i.produto_id FROM ordens_producao o
       JOIN pedido_itens i ON i.id = o.pedido_item_id WHERE o.id = ?`
    )
    .get(ordemId);
  if (!ordem) throw notFound('Ordem de produção não encontrada');

  const atualizar = db.prepare(
    `UPDATE ordem_etapas SET custo_mo = ? WHERE ordem_id = ? AND etapa_id = ?`
  );
  const custos = custoPadraoPorPeca(ordem.produto_id, db);
  for (const [etapaId, porPeca] of custos) {
    atualizar.run(round2(porPeca * ordem.quantidade), ordemId, etapaId);
  }
  return custos.size;
}

/**
 * Custo de mão de obra por peça de cada etapa do produto.
 *
 * A fonte preferida é a engenharia — tempo padrão da etapa × custo do minuto do
 * setor —, porque acompanha sozinha qualquer mudança de folha ou de jornada.
 * Produtos que ainda não têm processo cadastrado caem na tabela de custo fixo
 * por etapa, que era como o sistema funcionava antes.
 */
export function custoPadraoPorPeca(produtoId, db = getDb()) {
  const processo = db
    .prepare(
      `SELECT pp.etapa_id, pp.tempo_por_peca_min, e.departamento_id
       FROM produto_processo pp JOIN etapas e ON e.id = pp.etapa_id
       WHERE pp.produto_id = ?`
    )
    .all(produtoId);

  if (processo.length > 0) {
    const porSetor = new Map();
    const mapa = new Map();
    for (const linha of processo) {
      if (!porSetor.has(linha.departamento_id)) {
        porSetor.set(
          linha.departamento_id,
          linha.departamento_id ? custoMinutoDepartamento(linha.departamento_id, db).custo_minuto : 0
        );
      }
      mapa.set(linha.etapa_id, linha.tempo_por_peca_min * porSetor.get(linha.departamento_id));
    }
    return mapa;
  }

  return new Map(
    db
      .prepare(`SELECT etapa_id, custo_por_peca FROM custos_processo WHERE produto_id = ?`)
      .all(produtoId)
      .map((c) => [c.etapa_id, c.custo_por_peca])
  );
}

const STATUS_ETAPA = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'NAO_APLICAVEL'];

/** Atualiza uma etapa da OP, carimba as datas e reavalia o status da ordem. */
export function atualizarEtapa(ordemId, etapaId, dados, db = getDb()) {
  const etapa = db
    .prepare(`SELECT * FROM ordem_etapas WHERE ordem_id = ? AND etapa_id = ?`)
    .get(ordemId, etapaId);
  if (!etapa) throw notFound('Etapa não encontrada nesta ordem');

  const status = dados.status ?? etapa.status;
  if (!STATUS_ETAPA.includes(status)) throw badRequest(`Status inválido: ${status}`);

  const agora = hoje();
  const iniciado =
    dados.iniciado_em !== undefined
      ? dados.iniciado_em
      : etapa.iniciado_em || (status === 'EM_ANDAMENTO' || status === 'CONCLUIDA' ? agora : null);
  const concluido =
    dados.concluido_em !== undefined
      ? dados.concluido_em
      : status === 'CONCLUIDA'
        ? etapa.concluido_em || agora
        : null;

  db.prepare(
    `UPDATE ordem_etapas
     SET status = ?, responsavel = ?, iniciado_em = ?, concluido_em = ?, custo_mo = ?, observacao = ?
     WHERE id = ?`
  ).run(
    status,
    dados.responsavel ?? etapa.responsavel,
    iniciado,
    concluido,
    dados.custo_mo !== undefined ? Number(dados.custo_mo) : etapa.custo_mo,
    dados.observacao ?? etapa.observacao,
    etapa.id
  );

  recalcularStatusOrdem(ordemId, db);
  return buscarOrdem(ordemId, db);
}

/**
 * Deriva o status da OP das suas etapas:
 * nenhuma tocada = ABERTA; ENTREGA concluída = ENTREGUE;
 * todas as aplicáveis concluídas = CONCLUIDA; qualquer uma tocada = EM_PRODUCAO.
 */
export function recalcularStatusOrdem(ordemId, db = getDb()) {
  const ordem = db.prepare(`SELECT * FROM ordens_producao WHERE id = ?`).get(ordemId);
  if (!ordem) throw notFound('Ordem de produção não encontrada');
  if (ordem.status === 'CANCELADA') return ordem;

  const etapas = db
    .prepare(
      `SELECT oe.status, e.codigo FROM ordem_etapas oe
       JOIN etapas e ON e.id = oe.etapa_id WHERE oe.ordem_id = ? ORDER BY e.ordem`
    )
    .all(ordemId);

  const aplicaveis = etapas.filter((e) => e.status !== 'NAO_APLICAVEL');
  const concluidas = aplicaveis.filter((e) => e.status === 'CONCLUIDA');
  const entrega = etapas.find((e) => e.codigo === 'ENTREGA');

  let status = 'ABERTA';
  if (entrega?.status === 'CONCLUIDA') status = 'ENTREGUE';
  else if (aplicaveis.length > 0 && concluidas.length === aplicaveis.length) status = 'CONCLUIDA';
  else if (etapas.some((e) => e.status === 'EM_ANDAMENTO' || e.status === 'CONCLUIDA')) status = 'EM_PRODUCAO';

  const dataConclusao =
    status === 'CONCLUIDA' || status === 'ENTREGUE'
      ? ordem.data_conclusao || hoje()
      : null;

  db.prepare(`UPDATE ordens_producao SET status = ?, data_conclusao = ? WHERE id = ?`)
    .run(status, dataConclusao, ordemId);

  sincronizarSituacaoPedido(ordem.pedido_item_id, db);
  return db.prepare(`SELECT * FROM ordens_producao WHERE id = ?`).get(ordemId);
}

/** Marca o pedido como ENTREGUE quando todas as OPs dos seus itens estão entregues. */
function sincronizarSituacaoPedido(pedidoItemId, db) {
  const pedido = db
    .prepare(`SELECT p.id, p.situacao FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id WHERE i.id = ?`)
    .get(pedidoItemId);
  if (!pedido || pedido.situacao === 'CANCELADO') return;

  const { total, entregues } = db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN o.status = 'ENTREGUE' THEN 1 ELSE 0 END) AS entregues
       FROM pedido_itens i LEFT JOIN ordens_producao o ON o.pedido_item_id = i.id
       WHERE i.pedido_id = ?`
    )
    .get(pedido.id);

  if (total > 0 && entregues === total) {
    db.prepare(`UPDATE pedidos SET situacao = 'ENTREGUE' WHERE id = ?`).run(pedido.id);
  } else if (pedido.situacao === 'ENTREGUE') {
    db.prepare(`UPDATE pedidos SET situacao = 'ABERTO' WHERE id = ?`).run(pedido.id);
  }
}

/** Retorna a OP com item, cliente, roteiro de etapas e necessidade de material. */
export function buscarOrdem(ordemId, db = getDb()) {
  const ordem = db
    .prepare(
      `SELECT o.*, v.cliente, v.produto, v.grupo, v.linha, v.pedido_numero, v.pedido_id,
              v.preco_unitario, v.total AS valor_item, v.categoria, v.vendedor
       FROM ordens_producao o JOIN vw_itens v ON v.item_id = o.pedido_item_id
       WHERE o.id = ?`
    )
    .get(ordemId);
  if (!ordem) throw notFound('Ordem de produção não encontrada');

  ordem.etapas = db
    .prepare(
      `SELECT oe.*, e.codigo, e.nome, e.ordem AS sequencia, e.consome_material
       FROM ordem_etapas oe JOIN etapas e ON e.id = oe.etapa_id
       WHERE oe.ordem_id = ? ORDER BY e.ordem`
    )
    .all(ordemId);

  ordem.materiais = db
    .prepare(
      `SELECT om.*, m.codigo, m.descricao, m.unidade, m.custo_unitario, ve.saldo
       FROM ordem_materiais om
       JOIN materiais m ON m.id = om.material_id
       JOIN vw_estoque ve ON ve.id = om.material_id
       WHERE om.ordem_id = ? ORDER BY m.descricao`
    )
    .all(ordemId);

  ordem.custo_mo_total = round2(ordem.etapas.reduce((s, e) => s + e.custo_mo, 0));
  ordem.custo_material_previsto = round2(
    ordem.materiais.reduce((s, m) => s + m.quantidade_prevista * m.custo_unitario, 0)
  );
  return ordem;
}

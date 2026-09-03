import { getDb } from '../db/index.js';
import { round2 } from '../lib/numbers.js';
import { hoje } from '../lib/dates.js';

/** Itens que ainda não foram entregues — a "carteira em produção" da planilha. */
const FILTRO_CARTEIRA = `
  v.situacao IN ('ABERTO','FATURADO')
  AND (v.ordem_status IS NULL OR v.ordem_status NOT IN ('ENTREGUE','CANCELADA'))
`;

export function resumoCarteira(db = getDb()) {
  const r = db
    .prepare(
      `SELECT
         COUNT(*)                     AS itens,
         COALESCE(SUM(v.quantidade),0) AS pecas,
         COALESCE(SUM(v.total),0)      AS faturar,
         COALESCE(SUM(v.liquidacao),0) AS liquidar,
         COUNT(DISTINCT v.pedido_id)   AS pedidos,
         SUM(CASE WHEN v.data_entrega IS NOT NULL AND v.data_entrega < date('now') THEN 1 ELSE 0 END) AS itens_atrasados
       FROM vw_itens v WHERE ${FILTRO_CARTEIRA}`
    )
    .get();
  return {
    ...r,
    faturar: round2(r.faturar),
    liquidar: round2(r.liquidar),
    ticket_medio: r.pecas > 0 ? round2(r.faturar / r.pecas) : 0,
  };
}

export function carteiraPorGrupo(db = getDb()) {
  return db
    .prepare(
      `SELECT COALESCE(v.grupo,'SEM GRUPO') AS grupo,
              SUM(v.quantidade) AS pecas,
              ROUND(SUM(v.total),2) AS faturar,
              ROUND(SUM(v.liquidacao),2) AS liquidar
       FROM vw_itens v WHERE ${FILTRO_CARTEIRA}
       GROUP BY grupo ORDER BY faturar DESC`
    )
    .all();
}

export function vendasPorMes(ano, db = getDb()) {
  return db
    .prepare(
      `SELECT strftime('%m', v.data_pedido) AS mes,
              COUNT(DISTINCT v.pedido_id) AS pedidos,
              SUM(v.quantidade) AS pecas,
              ROUND(SUM(v.total),2) AS valor
       FROM vw_itens v
       WHERE strftime('%Y', v.data_pedido) = ? AND v.situacao <> 'CANCELADO'
       GROUP BY mes ORDER BY mes`
    )
    .all(String(ano))
    .map((r) => ({ ...r, ticket_medio: r.pecas > 0 ? round2(r.valor / r.pecas) : 0 }));
}

export function vendasPorCategoria(ano, db = getDb()) {
  return db
    .prepare(
      `SELECT COALESCE(v.categoria,'SEM CATEGORIA') AS categoria,
              COUNT(DISTINCT v.pedido_id) AS pedidos,
              SUM(v.quantidade) AS pecas,
              ROUND(SUM(v.total),2) AS valor
       FROM vw_itens v
       WHERE strftime('%Y', v.data_pedido) = ? AND v.situacao <> 'CANCELADO'
       GROUP BY categoria ORDER BY valor DESC`
    )
    .all(String(ano));
}

/**
 * Fila de cada etapa. Uma ordem conta uma única vez, na etapa onde de fato está parada
 * (a primeira do roteiro ainda não concluída) — é a mesma leitura do quadro do PCP.
 */
export function producaoPorEtapa(db = getDb()) {
  return db
    .prepare(
      `WITH atual AS (
         SELECT o.id AS ordem_id, o.quantidade,
                (SELECT oe.etapa_id FROM ordem_etapas oe
                  JOIN etapas e2 ON e2.id = oe.etapa_id
                  WHERE oe.ordem_id = o.id AND oe.status IN ('PENDENTE','EM_ANDAMENTO')
                  ORDER BY e2.ordem LIMIT 1) AS etapa_id
         FROM ordens_producao o WHERE o.status IN ('ABERTA','EM_PRODUCAO')
       )
       SELECT e.codigo, e.nome, e.ordem AS sequencia,
              COUNT(a.ordem_id)                    AS ordens_na_fila,
              COALESCE(SUM(a.quantidade), 0)       AS pecas_na_fila,
              (SELECT COUNT(*) FROM ordem_etapas oe WHERE oe.etapa_id = e.id AND oe.status = 'CONCLUIDA') AS concluidas
       FROM etapas e
       LEFT JOIN atual a ON a.etapa_id = e.id
       WHERE e.ativo = 1
       GROUP BY e.id ORDER BY e.ordem`
    )
    .all();
}

export function custoMaoDeObraEmProducao(db = getDb()) {
  const linhas = db
    .prepare(
      `SELECT e.codigo, e.nome, ROUND(COALESCE(SUM(oe.custo_mo),0),2) AS custo
       FROM etapas e
       LEFT JOIN ordem_etapas oe ON oe.etapa_id = e.id
       LEFT JOIN ordens_producao o ON o.id = oe.ordem_id
       WHERE e.ativo = 1 AND (o.status IN ('ABERTA','EM_PRODUCAO') OR o.id IS NULL)
       GROUP BY e.id ORDER BY e.ordem`
    )
    .all();
  return { etapas: linhas, total: round2(linhas.reduce((s, l) => s + l.custo, 0)) };
}

export function itensAtrasados(limite = 50, db = getDb()) {
  return db
    .prepare(
      `SELECT v.*, CAST(julianday('now') - julianday(v.data_entrega) AS INTEGER) AS dias_atraso
       FROM vw_itens v
       WHERE ${FILTRO_CARTEIRA} AND v.data_entrega IS NOT NULL AND v.data_entrega < date('now')
       ORDER BY v.data_entrega ASC LIMIT ?`
    )
    .all(limite);
}

export function entregasDaSemana(db = getDb()) {
  return db
    .prepare(
      `SELECT v.* FROM vw_itens v
       WHERE ${FILTRO_CARTEIRA}
         AND v.data_entrega BETWEEN date('now') AND date('now', '+7 day')
       ORDER BY v.data_entrega ASC`
    )
    .all();
}

export function alertasEstoque(db = getDb()) {
  return db
    .prepare(
      `SELECT id, codigo, descricao, unidade, saldo, estoque_min, custo_unitario
       FROM vw_estoque WHERE ativo = 1 AND abaixo_minimo = 1 ORDER BY (saldo - estoque_min) ASC`
    )
    .all();
}

export function dashboard(ano = new Date().getFullYear(), db = getDb()) {
  return {
    referencia: hoje(),
    ano: Number(ano),
    carteira: resumoCarteira(db),
    por_grupo: carteiraPorGrupo(db),
    vendas_mes: vendasPorMes(ano, db),
    vendas_categoria: vendasPorCategoria(ano, db),
    producao_etapas: producaoPorEtapa(db),
    custo_mo: custoMaoDeObraEmProducao(db),
    atrasados: itensAtrasados(10, db),
    entregas_semana: entregasDaSemana(db),
    alertas_estoque: alertasEstoque(db),
  };
}

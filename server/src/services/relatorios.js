/**
 * Relatórios gerenciais — as leituras que a fábrica tirava da planilha.
 *
 * Cada função aqui reproduz uma aba da PEDIDOS EM CARTEIRA, agora saindo do
 * banco em vez de fórmula copiada: a carteira em produção ("TOTAIS"), o mapa de
 * PCP com mão de obra por etapa ("PCP + MO"), o relatório de pedidos de um
 * cliente ("RELATÓRIO HAVANNA"), os pedidos do mês e as vendas mês a mês.
 *
 * A diferença que importa não é o formato: na planilha, um pedido lançado em
 * duas abas contava duas vezes e ninguém percebia. Aqui a carteira é uma
 * consulta só, sobre os mesmos itens que o PCP e o financeiro enxergam.
 */
import { getDb } from '../db/index.js';
import { round2 } from '../lib/numbers.js';
import { semanaISO } from '../lib/dates.js';

/** Itens ainda não entregues — a "carteira em produção" da planilha. */
const EM_CARTEIRA = `
  v.situacao IN ('ABERTO','FATURADO')
  AND (v.ordem_status IS NULL OR v.ordem_status NOT IN ('ENTREGUE','CANCELADA'))
`;

/**
 * Mapa de PCP com mão de obra, item a item.
 *
 * É a aba "PCP + MO": cada linha traz a venda, a data, a semana, o roteiro
 * marcado etapa por etapa e o custo de MO de cada operação. O custo vem do que
 * está lançado na ordem — o padrão do produto quando a OP abriu, ou o valor
 * corrigido depois — e não de uma coluna digitada.
 */
export function pcpComMaoDeObra({ ano = null, situacao = null, cliente = null, limite = 2000 } = {}, db = getDb()) {
  const where = [];
  const params = [];
  if (ano) {
    where.push(`strftime('%Y', v.data_pedido) = ?`);
    params.push(String(ano));
  }
  if (situacao === 'CARTEIRA') where.push(EM_CARTEIRA);
  else if (situacao) {
    where.push(`v.situacao = ?`);
    params.push(situacao);
  }
  if (cliente) {
    where.push(`v.cliente_id = ?`);
    params.push(Number(cliente));
  }

  const linhas = db
    .prepare(
      `SELECT v.item_id, v.pedido_numero, v.data_pedido, v.categoria, v.cliente, v.cliente_id,
              v.produto, v.grupo, v.linha, v.vendedor, v.quantidade, v.preco_unitario, v.total,
              v.liquidacao, v.data_entrega, v.situacao, v.ordem_id, v.ordem_numero, v.ordem_status,
              (SELECT COALESCE(SUM(oe.custo_mo), 0) FROM ordem_etapas oe WHERE oe.ordem_id = v.ordem_id) AS mo_total,
              (SELECT GROUP_CONCAT(e.codigo || ':' || oe.status || ':' || oe.custo_mo, '|')
                 FROM ordem_etapas oe JOIN etapas e ON e.id = oe.etapa_id
                WHERE oe.ordem_id = v.ordem_id) AS roteiro
       FROM vw_itens v
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY v.cliente, v.data_pedido DESC
       LIMIT ?`
    )
    .all(...params, Math.min(Number(limite) || 2000, 20000));

  return linhas.map((l) => {
    const etapas = {};
    for (const parte of String(l.roteiro || '').split('|').filter(Boolean)) {
      const [codigo, status, custo] = parte.split(':');
      etapas[codigo] = { status, custo_mo: round2(Number(custo)) };
    }
    const { roteiro, ...resto } = l;
    return {
      ...resto,
      semana_pedido: l.data_pedido ? semanaISO(l.data_pedido) : null,
      semana_entrega: l.data_entrega ? semanaISO(l.data_entrega) : null,
      etapas,
      mo_total: round2(l.mo_total),
      margem_bruta: round2(l.total - l.mo_total),
    };
  });
}

/**
 * Carteira em produção consolidada: o quadro "TOTAIS" da planilha.
 *
 * Peças, valor a faturar, valor a liquidar e o custo de MO ainda em produção —
 * este último só das etapas que não fecharam, que é o que de fato ainda vai
 * ser pago.
 */
export function carteiraConsolidada(db = getDb()) {
  const total = db
    .prepare(
      `SELECT COUNT(*) AS itens, COUNT(DISTINCT v.pedido_id) AS pedidos,
              COALESCE(SUM(v.quantidade), 0) AS pecas,
              COALESCE(SUM(v.total), 0) AS faturar,
              COALESCE(SUM(v.liquidacao), 0) AS liquidar
       FROM vw_itens v WHERE ${EM_CARTEIRA}`
    )
    .get();

  const porGrupo = db
    .prepare(
      `SELECT COALESCE(v.grupo, 'SEM GRUPO') AS grupo,
              SUM(v.quantidade) AS pecas,
              ROUND(SUM(v.total), 2) AS faturar,
              ROUND(SUM(v.liquidacao), 2) AS liquidar
       FROM vw_itens v WHERE ${EM_CARTEIRA}
       GROUP BY grupo ORDER BY faturar DESC`
    )
    .all();

  const moEmProducao = db
    .prepare(
      `SELECT e.codigo, e.nome AS etapa, ROUND(COALESCE(SUM(oe.custo_mo), 0), 2) AS custo_mo,
              COUNT(*) AS ordens
       FROM ordem_etapas oe
       JOIN etapas e ON e.id = oe.etapa_id
       JOIN ordens_producao o ON o.id = oe.ordem_id
       WHERE o.status IN ('ABERTA','EM_PRODUCAO') AND oe.status <> 'CONCLUIDA'
       GROUP BY e.id ORDER BY e.ordem`
    )
    .all();

  return {
    pecas: round2(total.pecas),
    faturar: round2(total.faturar),
    liquidar: round2(total.liquidar),
    itens: total.itens,
    pedidos: total.pedidos,
    ticket_medio: total.pecas > 0 ? round2(total.faturar / total.pecas) : 0,
    por_grupo: porGrupo,
    mo_em_producao: moEmProducao,
    mo_em_producao_total: round2(moEmProducao.reduce((s, l) => s + l.custo_mo, 0)),
  };
}

/**
 * Relatório de pedidos de um cliente — a aba que a Conserv mantinha por conta
 * grande. Aceita o cliente por id ou por nome parcial, porque quem pede o
 * relatório pensa no nome, não no cadastro.
 */
export function pedidosDoCliente({ cliente_id = null, cliente = null, ano = null } = {}, db = getDb()) {
  const where = [`v.situacao <> 'CANCELADO'`];
  const params = [];
  if (cliente_id) {
    where.push(`v.cliente_id = ?`);
    params.push(Number(cliente_id));
  } else if (cliente) {
    where.push(`v.cliente LIKE ?`);
    params.push(`%${cliente}%`);
  }
  if (ano) {
    where.push(`strftime('%Y', v.data_pedido) = ?`);
    params.push(String(ano));
  }

  const itens = db
    .prepare(
      `SELECT v.pedido_numero, v.data_pedido, v.cliente, v.produto, v.grupo,
              v.quantidade, v.preco_unitario, v.total, v.situacao, v.data_entrega,
              v.ordem_numero, v.ordem_status
       FROM vw_itens v WHERE ${where.join(' AND ')}
       ORDER BY v.data_pedido DESC, v.pedido_numero`
    )
    .all(...params);

  const porMes = db
    .prepare(
      `SELECT strftime('%Y-%m', v.data_pedido) AS mes,
              SUM(v.quantidade) AS pecas, ROUND(SUM(v.total), 2) AS valor
       FROM vw_itens v WHERE ${where.join(' AND ')}
       GROUP BY mes ORDER BY mes`
    )
    .all(...params);

  return {
    itens,
    por_mes: porMes,
    total: {
      itens: itens.length,
      pecas: round2(itens.reduce((s, i) => s + i.quantidade, 0)),
      valor: round2(itens.reduce((s, i) => s + i.total, 0)),
    },
  };
}

/**
 * Pedidos do mês — a tabela dinâmica da planilha, com a semana do pedido.
 * Agrupa por pedido, que é como o comercial confere o que entrou.
 */
export function pedidosDoMes({ ano = null, mes = null } = {}, db = getDb()) {
  const where = [`v.situacao <> 'CANCELADO'`];
  const params = [];
  if (ano) {
    where.push(`strftime('%Y', v.data_pedido) = ?`);
    params.push(String(ano));
  }
  if (mes) {
    where.push(`strftime('%m', v.data_pedido) = ?`);
    params.push(String(mes).padStart(2, '0'));
  }

  const linhas = db
    .prepare(
      `SELECT v.pedido_id, v.pedido_numero, v.data_pedido, v.cliente, v.vendedor, v.categoria,
              SUM(v.quantidade) AS pecas, ROUND(SUM(v.total), 2) AS valor,
              COUNT(*) AS itens
       FROM vw_itens v WHERE ${where.join(' AND ')}
       GROUP BY v.pedido_id ORDER BY v.data_pedido DESC, v.pedido_numero`
    )
    .all(...params);

  return linhas.map((l) => ({ ...l, semana: l.data_pedido ? semanaISO(l.data_pedido) : null }));
}

/** Vendas mês a mês, opcionalmente de um cliente só (a aba "VENDAS <cliente>"). */
export function vendasMensais({ ano = new Date().getFullYear(), cliente_id = null } = {}, db = getDb()) {
  const where = [`strftime('%Y', v.data_pedido) = ?`, `v.situacao <> 'CANCELADO'`];
  const params = [String(ano)];
  if (cliente_id) {
    where.push(`v.cliente_id = ?`);
    params.push(Number(cliente_id));
  }
  const linhas = db
    .prepare(
      `SELECT strftime('%m', v.data_pedido) AS mes,
              COUNT(DISTINCT v.pedido_id) AS pedidos,
              SUM(v.quantidade) AS pecas,
              ROUND(SUM(v.total), 2) AS valor
       FROM vw_itens v WHERE ${where.join(' AND ')}
       GROUP BY mes ORDER BY mes`
    )
    .all(...params);
  return linhas.map((l) => ({ ...l, ticket_medio: l.pecas > 0 ? round2(l.valor / l.pecas) : 0 }));
}

/**
 * Converte qualquer relatório em CSV com separador ponto e vírgula e número no
 * formato brasileiro — é o que o Excel da fábrica abre sem pedir importação.
 */
export function paraCsv(linhas, colunas) {
  const escapar = (v) => {
    if (v === null || v === undefined) return '';
    let texto = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    /*
     * Nome de cliente vem digitado por gente, e planilha trata texto que começa
     * com =, +, - ou @ como fórmula. Um cadastro escrito "=cmd|..." viraria
     * comando ao abrir o arquivo na máquina de quem baixou o relatório; a aspa
     * simples à frente faz o Excel exibir o texto como texto.
     */
    if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const cabecalho = colunas.map((c) => escapar(c.titulo)).join(';');
  const corpo = linhas
    .map((l) => colunas.map((c) => escapar(typeof c.valor === 'function' ? c.valor(l) : l[c.campo])).join(';'))
    .join('\n');
  // O BOM faz o Excel reconhecer o acento sem perguntar a codificação.
  return `﻿${cabecalho}\n${corpo}\n`;
}

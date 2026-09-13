/**
 * Relatórios gerenciais.
 *
 * Cada rota devolve JSON por padrão e CSV quando pedem `?formato=csv` — a
 * fábrica continua querendo abrir no Excel, e negar isso só faz voltar a
 * planilha paralela que o ERP veio substituir.
 */
import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import {
  pcpComMaoDeObra,
  carteiraConsolidada,
  pedidosDoCliente,
  pedidosDoMes,
  vendasMensais,
  paraCsv,
} from '../services/relatorios.js';

export const router = Router();

const ROTULO_ETAPA = {
  MATERIA_PRIMA: 'Matéria-prima',
  CORTE: 'Corte',
  SILK: 'Silk',
  COSTURA: 'Costura',
  EMBALAGEM: 'Embalagem',
  NF: 'Nota fiscal',
  ENTREGA: 'Entrega',
};

/** Marca de etapa como a planilha usava: OK quando fechou, vazio quando não. */
const marcaEtapa = (linha, codigo) =>
  linha.etapas?.[codigo]?.status === 'CONCLUIDA' ? 'OK' : '';

const responder = (res, nome, linhas, colunas, formato) => {
  if (String(formato).toLowerCase() === 'csv') {
    res
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="${nome}.csv"`)
      .send(paraCsv(linhas, colunas));
    return;
  }
  res.json(linhas);
};

/** Mapa de PCP com mão de obra por etapa — a aba "PCP + MO". */
router.get(
  '/pcp-mo',
  asyncHandler((req, res) => {
    const linhas = pcpComMaoDeObra({
      ano: req.query.ano || null,
      situacao: req.query.situacao || null,
      cliente: req.query.cliente_id || null,
      limite: req.query.limite,
    });
    const colunas = [
      { titulo: 'Vendedor', campo: 'vendedor' },
      { titulo: 'Pedido', campo: 'pedido_numero' },
      { titulo: 'Data do pedido', campo: 'data_pedido' },
      { titulo: 'Semana', campo: 'semana_pedido' },
      { titulo: 'Categoria', campo: 'categoria' },
      { titulo: 'Cliente', campo: 'cliente' },
      { titulo: 'Produto', campo: 'produto' },
      { titulo: 'Grupo', campo: 'grupo' },
      { titulo: 'Linha', campo: 'linha' },
      { titulo: 'Qtd', campo: 'quantidade' },
      { titulo: 'Valor unit.', campo: 'preco_unitario' },
      { titulo: 'Total', campo: 'total' },
      { titulo: 'Liquidação', campo: 'liquidacao' },
      { titulo: 'Data entrega', campo: 'data_entrega' },
      { titulo: 'Semana entrega', campo: 'semana_entrega' },
      ...Object.entries(ROTULO_ETAPA).map(([codigo, titulo]) => ({
        titulo,
        valor: (l) => marcaEtapa(l, codigo),
      })),
      ...['CORTE', 'SILK', 'COSTURA', 'EMBALAGEM'].map((codigo) => ({
        titulo: `MO ${ROTULO_ETAPA[codigo]}`,
        valor: (l) => l.etapas?.[codigo]?.custo_mo ?? 0,
      })),
      { titulo: 'Total MO', campo: 'mo_total' },
    ];
    responder(res, 'pcp-mao-de-obra', linhas, colunas, req.query.formato);
  })
);

/** Carteira em produção consolidada — o quadro "TOTAIS". */
router.get('/carteira', asyncHandler((_req, res) => res.json(carteiraConsolidada())));

/** Pedidos de um cliente. */
router.get(
  '/pedidos-cliente',
  asyncHandler((req, res) => {
    const dados = pedidosDoCliente({
      cliente_id: req.query.cliente_id || null,
      cliente: req.query.cliente || null,
      ano: req.query.ano || null,
    });
    if (String(req.query.formato).toLowerCase() === 'csv') {
      return responder(
        res,
        'pedidos-por-cliente',
        dados.itens,
        [
          { titulo: 'Pedido', campo: 'pedido_numero' },
          { titulo: 'Data do pedido', campo: 'data_pedido' },
          { titulo: 'Cliente', campo: 'cliente' },
          { titulo: 'Produto', campo: 'produto' },
          { titulo: 'Grupo', campo: 'grupo' },
          { titulo: 'Qtd', campo: 'quantidade' },
          { titulo: 'Valor unid.', campo: 'preco_unitario' },
          { titulo: 'Total', campo: 'total' },
          { titulo: 'Situação', campo: 'situacao' },
          { titulo: 'Entrega', campo: 'data_entrega' },
        ],
        'csv'
      );
    }
    res.json(dados);
  })
);

/** Pedidos do mês, agrupados por pedido. */
router.get(
  '/pedidos-mes',
  asyncHandler((req, res) => {
    const linhas = pedidosDoMes({ ano: req.query.ano || null, mes: req.query.mes || null });
    responder(
      res,
      'pedidos-do-mes',
      linhas,
      [
        { titulo: 'Data do pedido', campo: 'data_pedido' },
        { titulo: 'Semana', campo: 'semana' },
        { titulo: 'Pedido', campo: 'pedido_numero' },
        { titulo: 'Cliente', campo: 'cliente' },
        { titulo: 'Vendedor', campo: 'vendedor' },
        { titulo: 'Categoria', campo: 'categoria' },
        { titulo: 'Itens', campo: 'itens' },
        { titulo: 'Peças', campo: 'pecas' },
        { titulo: 'Valor', campo: 'valor' },
      ],
      req.query.formato
    );
  })
);

/** Vendas mês a mês (opcionalmente de um cliente só). */
router.get(
  '/vendas-mensais',
  asyncHandler((req, res) => {
    const linhas = vendasMensais({
      ano: req.query.ano || new Date().getFullYear(),
      cliente_id: req.query.cliente_id || null,
    });
    responder(
      res,
      'vendas-mensais',
      linhas,
      [
        { titulo: 'Mês', campo: 'mes' },
        { titulo: 'Pedidos', campo: 'pedidos' },
        { titulo: 'Peças', campo: 'pecas' },
        { titulo: 'Valor', campo: 'valor' },
        { titulo: 'Ticket médio', campo: 'ticket_medio' },
      ],
      req.query.formato
    );
  })
);

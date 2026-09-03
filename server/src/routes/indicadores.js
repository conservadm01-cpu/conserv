import { Router } from 'express';
import { getDb } from '../db/index.js';
import { asyncHandler } from '../lib/errors.js';
import {
  dashboard,
  resumoCarteira,
  carteiraPorGrupo,
  vendasPorMes,
  vendasPorCategoria,
  producaoPorEtapa,
  itensAtrasados,
  alertasEstoque,
} from '../services/indicadores.js';

export const router = Router();

router.get(
  '/dashboard',
  asyncHandler((req, res) => res.json(dashboard(req.query.ano || new Date().getFullYear())))
);

router.get('/carteira', asyncHandler((_req, res) => res.json(resumoCarteira())));
router.get('/carteira/grupos', asyncHandler((_req, res) => res.json(carteiraPorGrupo())));
router.get('/producao/etapas', asyncHandler((_req, res) => res.json(producaoPorEtapa())));
router.get('/estoque/alertas', asyncHandler((_req, res) => res.json(alertasEstoque())));

router.get(
  '/vendas/mensal',
  asyncHandler((req, res) => res.json(vendasPorMes(req.query.ano || new Date().getFullYear())))
);

router.get(
  '/vendas/categorias',
  asyncHandler((req, res) => res.json(vendasPorCategoria(req.query.ano || new Date().getFullYear())))
);

router.get(
  '/atrasados',
  asyncHandler((req, res) => res.json(itensAtrasados(Math.min(Number(req.query.limite) || 100, 1000))))
);

/** Custo realizado por ordem: mão de obra das etapas + material baixado. */
router.get(
  '/custos/ordens',
  asyncHandler((req, res) => {
    const limite = Math.min(Number(req.query.limite) || 200, 2000);
    res.json(
      getDb()
        .prepare(
          `SELECT o.id, o.numero, o.status, o.quantidade,
                  v.cliente, v.produto, v.grupo, v.pedido_numero,
                  ROUND(v.total, 2) AS receita,
                  ROUND(COALESCE((SELECT SUM(oe.custo_mo) FROM ordem_etapas oe WHERE oe.ordem_id = o.id), 0), 2) AS custo_mo,
                  ROUND(COALESCE((SELECT SUM(mv.quantidade * mv.custo_unitario) FROM movimentos_estoque mv
                                  WHERE mv.ordem_id = o.id AND mv.tipo = 'SAIDA'), 0), 2) AS custo_material
           FROM ordens_producao o
           JOIN vw_itens v ON v.item_id = o.pedido_item_id
           WHERE o.status <> 'CANCELADA'
           ORDER BY o.id DESC LIMIT ?`
        )
        .all(limite)
        .map((r) => {
          const custo_total = Math.round((r.custo_mo + r.custo_material) * 100) / 100;
          const margem = Math.round((r.receita - custo_total) * 100) / 100;
          return {
            ...r,
            custo_total,
            margem,
            margem_percentual: r.receita > 0 ? Math.round((margem / r.receita) * 1000) / 10 : 0,
          };
        })
    );
  })
);

/** Ranking de clientes por faturamento no ano. */
router.get(
  '/clientes/ranking',
  asyncHandler((req, res) => {
    const ano = String(req.query.ano || new Date().getFullYear());
    res.json(
      getDb()
        .prepare(
          `SELECT v.cliente_id, v.cliente, v.categoria,
                  COUNT(DISTINCT v.pedido_id) AS pedidos,
                  SUM(v.quantidade) AS pecas,
                  ROUND(SUM(v.total), 2) AS valor
           FROM vw_itens v
           WHERE strftime('%Y', v.data_pedido) = ? AND v.situacao <> 'CANCELADO'
           GROUP BY v.cliente_id ORDER BY valor DESC LIMIT 50`
        )
        .all(ano)
    );
  })
);

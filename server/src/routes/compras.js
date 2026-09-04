import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { asyncHandler, notFound } from '../lib/errors.js';
import { exigir } from '../middleware/auth.js';
import { montarFiltros, montarOrdem, limitar } from '../lib/filtros.js';
import {
  criarRequisicao, buscarRequisicao, gerarRequisicoesDoMrp, gerarRequisicoesDoMinimo,
  criarPedidoCompra, atualizarPedidoCompra, buscarPedidoCompra, pedidosAPartirDeRequisicoes,
  proximoNumeroCompra, receber, estornarRecebimento,
  abrirInventario, buscarInventario, contar, fecharInventario, resumoCompras,
} from '../services/compras.js';

const opcional = z.string().trim().nullish();

export const router = Router();
const podeComprar = exigir('compras.editar');
const podeReceber = exigir('compras.receber');

router.get('/resumo', asyncHandler((_req, res) => res.json(resumoCompras())));

/* ------------------------------------------------------------- requisições */

const FILTROS_REQUISICAO = {
  busca: { tipo: 'busca', colunas: ['m.descricao', 'm.codigo', 'rc.justificativa'] },
  status: { tipo: 'igual', coluna: 'rc.status' },
  urgencia: { tipo: 'igual', coluna: 'rc.urgencia' },
  origem: { tipo: 'igual', coluna: 'rc.origem' },
  material_id: { tipo: 'igual', coluna: 'rc.material_id', numero: true },
  de: { tipo: 'de', coluna: 'rc.criado_em' },
  ate: { tipo: 'ate', coluna: 'rc.criado_em' },
  abertas: { tipo: 'booleano', quandoVerdadeiro: `rc.status IN ('ABERTA','PARCIAL')` },
};

router.get(
  '/requisicoes',
  asyncHandler((req, res) => {
    const f = montarFiltros(req.query, FILTROS_REQUISICAO);
    const ordem = montarOrdem(
      req.query,
      ['rc.criado_em', 'rc.necessidade_em', 'm.descricao', 'rc.quantidade'],
      `CASE rc.urgencia WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
       rc.necessidade_em IS NULL, rc.necessidade_em`
    );
    res.json(
      getDb()
        .prepare(
          `SELECT rc.*, m.descricao AS material, m.codigo, m.unidade, m.custo_unitario,
                  f.nome AS fornecedor, f.id AS fornecedor_id, ve.saldo,
                  ROUND(rc.quantidade - rc.atendida, 3) AS pendente,
                  ROUND((rc.quantidade - rc.atendida) * m.custo_unitario, 2) AS valor
           FROM requisicoes_compra rc
           JOIN materiais m ON m.id = rc.material_id
           JOIN vw_estoque ve ON ve.id = m.id
           LEFT JOIN fornecedores f ON f.id = m.fornecedor_id
           ${f.sql} ORDER BY ${ordem} LIMIT ?`
        )
        .all(...f.params, limitar(req.query))
    );
  })
);

router.get('/requisicoes/:id', asyncHandler((req, res) => res.json(buscarRequisicao(Number(req.params.id)))));

router.post(
  '/requisicoes',
  podeComprar,
  asyncHandler((req, res) => {
    const dados = z
      .object({
        material_id: z.number().int(),
        quantidade: z.number().positive(),
        urgencia: z.enum(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']).optional(),
        necessidade_em: opcional,
        ordem_id: z.number().int().nullish(),
        justificativa: opcional,
      })
      .parse(req.body);
    res.status(201).json(criarRequisicao({ ...dados, usuario_id: req.usuario.sub }));
  })
);

router.put(
  '/requisicoes/:id',
  podeComprar,
  asyncHandler((req, res) => {
    const dados = z
      .object({
        quantidade: z.number().positive().optional(),
        urgencia: z.enum(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']).optional(),
        necessidade_em: opcional,
        justificativa: opcional,
        status: z.enum(['ABERTA', 'PARCIAL', 'ATENDIDA', 'CANCELADA']).optional(),
      })
      .parse(req.body);
    const db = getDb();
    const atual = db.prepare(`SELECT * FROM requisicoes_compra WHERE id = ?`).get(req.params.id);
    if (!atual) throw notFound('Requisição não encontrada');

    const campos = Object.keys(dados);
    if (campos.length) {
      db.prepare(`UPDATE requisicoes_compra SET ${campos.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`)
        .run({ ...Object.fromEntries(campos.map((c) => [c, dados[c] ?? null])), id: atual.id });
    }
    res.json(buscarRequisicao(atual.id, db));
  })
);

router.delete(
  '/requisicoes/:id',
  podeComprar,
  asyncHandler((req, res) => {
    const db = getDb();
    const req_ = db.prepare(`SELECT * FROM requisicoes_compra WHERE id = ?`).get(req.params.id);
    if (!req_) throw notFound('Requisição não encontrada');
    // Requisição já atendida vira histórico: cancela em vez de sumir.
    if (req_.atendida > 0) {
      db.prepare(`UPDATE requisicoes_compra SET status = 'CANCELADA' WHERE id = ?`).run(req_.id);
      return res.json({ ok: true, cancelada: true });
    }
    db.prepare(`DELETE FROM requisicoes_compra WHERE id = ?`).run(req_.id);
    res.json({ ok: true, removida: true });
  })
);

router.post(
  '/requisicoes/gerar-mrp',
  podeComprar,
  asyncHandler((req, res) =>
    res.status(201).json(gerarRequisicoesDoMrp({ ate: req.body?.ate ?? null, usuario_id: req.usuario.sub })))
);

router.post(
  '/requisicoes/gerar-minimo',
  podeComprar,
  asyncHandler((req, res) => res.status(201).json(gerarRequisicoesDoMinimo({ usuario_id: req.usuario.sub })))
);

router.post(
  '/requisicoes/gerar-pedidos',
  podeComprar,
  asyncHandler((req, res) => {
    const { ids } = z.object({ ids: z.array(z.number().int()).min(1) }).parse(req.body);
    res.status(201).json(pedidosAPartirDeRequisicoes(ids, { usuario_id: req.usuario.sub }));
  })
);

/* ---------------------------------------------------------------- pedidos */

const FILTROS_PEDIDO = {
  busca: { tipo: 'busca', colunas: ['numero', 'fornecedor', 'observacao'] },
  status: { tipo: 'igual', coluna: 'status' },
  fornecedor_id: { tipo: 'igual', coluna: 'fornecedor_id', numero: true },
  de: { tipo: 'de', coluna: 'data' },
  ate: { tipo: 'ate', coluna: 'data' },
  valor_min: { tipo: 'min', coluna: 'valor_total' },
  valor_max: { tipo: 'max', coluna: 'valor_total' },
  atrasados: { tipo: 'booleano', quandoVerdadeiro: 'dias_atraso > 0' },
  abertos: { tipo: 'booleano', quandoVerdadeiro: `status IN ('RASCUNHO','ENVIADO','CONFIRMADO','PARCIAL')` },
};

router.get(
  '/pedidos',
  asyncHandler((req, res) => {
    const f = montarFiltros(req.query, FILTROS_PEDIDO);
    const ordem = montarOrdem(req.query, ['data', 'previsao_entrega', 'valor_total', 'numero'], 'data DESC, id DESC');
    res.json(
      getDb().prepare(`SELECT * FROM vw_pedidos_compra${f.sql} ORDER BY ${ordem} LIMIT ?`)
        .all(...f.params, limitar(req.query))
    );
  })
);

router.get('/pedidos/proximo-numero', asyncHandler((_req, res) => res.json({ numero: proximoNumeroCompra() })));
router.get('/pedidos/:id', asyncHandler((req, res) => res.json(buscarPedidoCompra(Number(req.params.id)))));

const itemCompraSchema = z.object({
  material_id: z.number().int(),
  requisicao_id: z.number().int().nullish(),
  quantidade: z.number().positive(),
  preco_unitario: z.number().min(0).optional(),
  observacao: opcional,
});

const pedidoCompraSchema = z.object({
  fornecedor_id: z.number().int(),
  data: opcional,
  previsao_entrega: opcional,
  condicao_pagamento: opcional,
  prazo_pagamento_dias: z.number().int().min(0).max(365).optional(),
  frete: z.number().min(0).optional(),
  desconto: z.number().min(0).optional(),
  status: z.enum(['RASCUNHO', 'ENVIADO', 'CONFIRMADO', 'PARCIAL', 'RECEBIDO', 'CANCELADO']).optional(),
  observacao: opcional,
  itens: z.array(itemCompraSchema).min(1),
});

router.post(
  '/pedidos',
  podeComprar,
  asyncHandler((req, res) => {
    const dados = pedidoCompraSchema.parse(req.body);
    res.status(201).json(criarPedidoCompra({ ...dados, usuario_id: req.usuario.sub }));
  })
);

router.put(
  '/pedidos/:id',
  podeComprar,
  asyncHandler((req, res) => {
    const dados = pedidoCompraSchema.partial().parse(req.body);
    res.json(atualizarPedidoCompra(Number(req.params.id), dados));
  })
);

router.delete(
  '/pedidos/:id',
  podeComprar,
  asyncHandler((req, res) => {
    const db = getDb();
    const pedido = db.prepare(`SELECT * FROM vw_pedidos_compra WHERE id = ?`).get(req.params.id);
    if (!pedido) throw notFound('Pedido de compra não encontrado');
    if (pedido.status === 'PARCIAL' || pedido.status === 'RECEBIDO') {
      db.prepare(`UPDATE pedidos_compra SET status = 'CANCELADO' WHERE id = ?`).run(pedido.id);
      return res.json({ ok: true, cancelado: true });
    }
    db.prepare(`DELETE FROM pedidos_compra WHERE id = ?`).run(pedido.id);
    res.json({ ok: true, removido: true });
  })
);

/* ------------------------------------------------------------ recebimento */

router.post(
  '/pedidos/:id/receber',
  podeReceber,
  asyncHandler((req, res) => {
    const dados = z
      .object({
        data: opcional,
        nota_fiscal: opcional,
        local_id: z.number().int().nullish(),
        gerar_titulo: z.boolean().optional(),
        observacao: opcional,
        itens: z
          .array(z.object({
            item_id: z.number().int(),
            quantidade: z.number().positive(),
            preco_unitario: z.number().min(0).optional(),
          }))
          .optional(),
      })
      .parse(req.body ?? {});
    res.status(201).json(receber(Number(req.params.id), { ...dados, usuario_id: req.usuario.sub }));
  })
);

router.delete(
  '/recebimentos/:id',
  podeReceber,
  asyncHandler((req, res) => res.json(estornarRecebimento(Number(req.params.id))))
);

/* -------------------------------------------------------------- inventário */

router.get(
  '/inventarios',
  asyncHandler((req, res) => {
    const f = montarFiltros(req.query, {
      busca: { tipo: 'busca', colunas: ['i.descricao'] },
      status: { tipo: 'igual', coluna: 'i.status' },
      de: { tipo: 'de', coluna: 'i.data' },
      ate: { tipo: 'ate', coluna: 'i.data' },
    });
    res.json(
      getDb()
        .prepare(
          `SELECT i.*, l.nome AS local,
                  (SELECT COUNT(*) FROM inventario_itens ii WHERE ii.inventario_id = i.id) AS materiais,
                  (SELECT COUNT(*) FROM inventario_itens ii WHERE ii.inventario_id = i.id AND ii.contado IS NOT NULL) AS contados
           FROM inventarios i LEFT JOIN locais_estoque l ON l.id = i.local_id
           ${f.sql} ORDER BY i.data DESC, i.id DESC LIMIT ?`
        )
        .all(...f.params, limitar(req.query, 100))
    );
  })
);

router.get('/inventarios/:id', asyncHandler((req, res) => res.json(buscarInventario(Number(req.params.id)))));

router.post(
  '/inventarios',
  exigir('materiais.mover'),
  asyncHandler((req, res) => {
    const dados = z
      .object({
        descricao: z.string().trim().min(1),
        data: opcional,
        local_id: z.number().int().nullish(),
        materiais: z.array(z.number().int()).optional(),
        observacao: opcional,
      })
      .parse(req.body);
    res.status(201).json(abrirInventario({ ...dados, usuario_id: req.usuario.sub }));
  })
);

router.put(
  '/inventarios/:id/contagem',
  exigir('materiais.mover'),
  asyncHandler((req, res) => {
    const dados = z.object({ material_id: z.number().int(), contado: z.number().min(0) }).parse(req.body);
    res.json(contar(Number(req.params.id), dados.material_id, dados.contado));
  })
);

router.post(
  '/inventarios/:id/fechar',
  exigir('materiais.mover'),
  asyncHandler((req, res) => res.json(fecharInventario(Number(req.params.id), { usuario_id: req.usuario.sub })))
);

router.delete(
  '/inventarios/:id',
  exigir('materiais.mover'),
  asyncHandler((req, res) => {
    const db = getDb();
    const inventario = db.prepare(`SELECT * FROM inventarios WHERE id = ?`).get(req.params.id);
    if (!inventario) throw notFound('Inventário não encontrado');
    if (inventario.status === 'FECHADO') {
      // Fechado já gerou ajuste de estoque: cancelar apagaria a trilha.
      db.prepare(`UPDATE inventarios SET status = 'CANCELADO' WHERE id = ?`).run(inventario.id);
      return res.json({ ok: true, cancelado: true });
    }
    db.prepare(`DELETE FROM inventarios WHERE id = ?`).run(inventario.id);
    res.json({ ok: true, removido: true });
  })
);

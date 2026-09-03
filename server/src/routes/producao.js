import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { asyncHandler, notFound } from '../lib/errors.js';
import {
  abrirOrdem,
  buscarOrdem,
  atualizarEtapa,
  explodirFichaTecnica,
  recalcularStatusOrdem,
  recalcularCustosMO,
} from '../services/producao.js';
import { baixarMateriaisDaOrdem } from '../services/estoque.js';

export const router = Router();

/** Lista de ordens de produção com o andamento do roteiro. */
router.get(
  '/',
  asyncHandler((req, res) => {
    const where = [];
    const params = [];
    if (req.query.status) {
      where.push('o.status = ?');
      params.push(req.query.status);
    } else if (req.query.abertas !== 'false') {
      where.push(`o.status IN ('ABERTA','EM_PRODUCAO')`);
    }
    if (req.query.etapa) {
      where.push(
        `EXISTS (SELECT 1 FROM ordem_etapas oe JOIN etapas e ON e.id = oe.etapa_id
                 WHERE oe.ordem_id = o.id AND e.codigo = ? AND oe.status IN ('PENDENTE','EM_ANDAMENTO'))`
      );
      params.push(req.query.etapa);
    }
    if (req.query.busca) {
      where.push('(o.numero LIKE ? OR v.cliente LIKE ? OR v.produto LIKE ? OR v.pedido_numero LIKE ?)');
      const t = `%${req.query.busca}%`;
      params.push(t, t, t, t);
    }
    const limite = Math.min(Number(req.query.limite) || 300, 3000);

    res.json(
      getDb()
        .prepare(
          `SELECT o.*, v.cliente, v.produto, v.grupo, v.linha, v.pedido_numero, v.pedido_id, v.categoria,
                  v.total AS valor_item,
                  CAST(julianday('now') - julianday(o.data_prevista) AS INTEGER) AS dias_atraso,
                  (SELECT COUNT(*) FROM ordem_etapas oe WHERE oe.ordem_id = o.id AND oe.status = 'CONCLUIDA') AS etapas_concluidas,
                  (SELECT COUNT(*) FROM ordem_etapas oe WHERE oe.ordem_id = o.id AND oe.status <> 'NAO_APLICAVEL') AS etapas_total,
                  (SELECT e.nome FROM ordem_etapas oe JOIN etapas e ON e.id = oe.etapa_id
                    WHERE oe.ordem_id = o.id AND oe.status IN ('PENDENTE','EM_ANDAMENTO')
                    ORDER BY e.ordem LIMIT 1) AS etapa_atual
           FROM ordens_producao o
           JOIN vw_itens v ON v.item_id = o.pedido_item_id
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY o.data_prevista IS NULL, o.data_prevista ASC, o.id DESC
           LIMIT ?`
        )
        .all(...params, limite)
    );
  })
);

/** Quadro (kanban) das ordens abertas agrupadas pela etapa em que estão paradas. */
router.get(
  '/quadro',
  asyncHandler((_req, res) => {
    const db = getDb();
    const etapas = db.prepare(`SELECT * FROM etapas WHERE ativo = 1 ORDER BY ordem`).all();
    const ordens = db
      .prepare(
        `SELECT o.id, o.numero, o.quantidade, o.status, o.data_prevista,
                v.cliente, v.produto, v.grupo, v.pedido_numero,
                CAST(julianday('now') - julianday(o.data_prevista) AS INTEGER) AS dias_atraso,
                (SELECT e.codigo FROM ordem_etapas oe JOIN etapas e ON e.id = oe.etapa_id
                  WHERE oe.ordem_id = o.id AND oe.status IN ('PENDENTE','EM_ANDAMENTO')
                  ORDER BY e.ordem LIMIT 1) AS etapa_codigo
         FROM ordens_producao o
         JOIN vw_itens v ON v.item_id = o.pedido_item_id
         WHERE o.status IN ('ABERTA','EM_PRODUCAO')
         ORDER BY o.data_prevista IS NULL, o.data_prevista ASC`
      )
      .all();

    res.json(
      etapas.map((e) => ({
        etapa: e,
        ordens: ordens.filter((o) => o.etapa_codigo === e.codigo),
      }))
    );
  })
);

router.get(
  '/:id',
  asyncHandler((req, res) => res.json(buscarOrdem(Number(req.params.id))))
);

router.post(
  '/',
  asyncHandler((req, res) => {
    const dados = z
      .object({
        pedido_item_id: z.number().int(),
        observacao: z.string().trim().nullish(),
        data_prevista: z.string().trim().nullish(),
      })
      .parse(req.body);
    res.status(201).json(
      abrirOrdem(dados.pedido_item_id, {
        observacao: dados.observacao ?? null,
        dataPrevista: dados.data_prevista ?? null,
      })
    );
  })
);

router.put(
  '/:id/etapas/:etapaId',
  asyncHandler((req, res) => {
    const dados = z
      .object({
        status: z.enum(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'NAO_APLICAVEL']).optional(),
        responsavel: z.string().trim().nullish(),
        iniciado_em: z.string().trim().nullish(),
        concluido_em: z.string().trim().nullish(),
        custo_mo: z.number().min(0).optional(),
        observacao: z.string().trim().nullish(),
      })
      .parse(req.body);
    res.json(atualizarEtapa(Number(req.params.id), Number(req.params.etapaId), dados));
  })
);

/**
 * Reprocessa a ordem contra os cadastros atuais: necessidade de material vinda da
 * ficha técnica e custo de MO vindo da tabela de custos por processo.
 */
router.post(
  '/:id/recalcular',
  asyncHandler((req, res) => {
    const id = Number(req.params.id);
    explodirFichaTecnica(id);
    recalcularCustosMO(id);
    res.json(buscarOrdem(id));
  })
);

/** Baixa do estoque o material previsto (total ou parcial). */
router.post(
  '/:id/baixar-materiais',
  asyncHandler((req, res) => {
    const dados = z
      .object({
        itens: z
          .array(z.object({ material_id: z.number().int(), quantidade: z.number().positive() }))
          .optional(),
      })
      .parse(req.body ?? {});
    const movimentos = baixarMateriaisDaOrdem(Number(req.params.id), {
      usuarioId: req.usuario?.sub,
      itens: dados.itens ?? null,
    });
    res.json({ movimentos, ordem: buscarOrdem(Number(req.params.id)) });
  })
);

router.put(
  '/:id',
  asyncHandler((req, res) => {
    const dados = z
      .object({
        status: z.enum(['ABERTA', 'EM_PRODUCAO', 'CONCLUIDA', 'ENTREGUE', 'CANCELADA']).optional(),
        data_prevista: z.string().trim().nullish(),
        observacao: z.string().trim().nullish(),
      })
      .parse(req.body);
    const db = getDb();
    const ordem = db.prepare(`SELECT * FROM ordens_producao WHERE id = ?`).get(req.params.id);
    if (!ordem) throw notFound('Ordem de produção não encontrada');

    db.prepare(`UPDATE ordens_producao SET status = ?, data_prevista = ?, observacao = ? WHERE id = ?`)
      .run(
        dados.status ?? ordem.status,
        dados.data_prevista !== undefined ? dados.data_prevista : ordem.data_prevista,
        dados.observacao !== undefined ? dados.observacao : ordem.observacao,
        ordem.id
      );

    // Status manual só é preservado quando é CANCELADA; os demais derivam do roteiro.
    if (dados.status !== 'CANCELADA') recalcularStatusOrdem(ordem.id, db);
    res.json(buscarOrdem(ordem.id, db));
  })
);

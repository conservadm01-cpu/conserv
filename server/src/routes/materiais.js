import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { crudRouter } from '../lib/crud.js';
import { asyncHandler } from '../lib/errors.js';
import { exigir } from '../middleware/auth.js';
import { montarFiltros, montarOrdem, limitar } from '../lib/filtros.js';
import { registrarMovimento, necessidadeMateriais } from '../services/estoque.js';

export const router = crudRouter({
  tabela: 'materiais',
  escrita: 'materiais.editar',
  campos: ['codigo', 'descricao', 'tipo', 'unidade', 'custo_unitario', 'estoque_min',
           'localizacao', 'fornecedor_id', 'grupo_id', 'local_padrao_id', 'ativo'],
  schema: z.object({
    codigo: z.string().trim().nullish(),
    descricao: z.string().trim().min(1),
    grupo_id: z.number().int().nullish(),
    local_padrao_id: z.number().int().nullish(),
    tipo: z.enum(['TECIDO', 'AVIAMENTO', 'EMBALAGEM', 'TINTA', 'ETIQUETA', 'SERVICO', 'OUTRO']).optional(),
    unidade: z.enum(['UN', 'MT', 'M2', 'KG', 'L', 'PC', 'CX', 'RL']).optional(),
    custo_unitario: z.number().min(0).optional(),
    estoque_min: z.number().min(0).optional(),
    localizacao: z.string().trim().nullish(),
    fornecedor_id: z.number().int().nullish(),
    ativo: z.number().int().optional(),
  }),
  ordem: 'descricao',
  busca: ['descricao', 'codigo', 'localizacao'],
  ordenaveis: ['descricao', 'custo_unitario', 'estoque_min', 'tipo'],
  filtros: {
    tipo: { tipo: 'igual', coluna: 'tipo' },
    unidade: { tipo: 'igual', coluna: 'unidade' },
    grupo_id: { tipo: 'igual', coluna: 'grupo_id', numero: true },
    fornecedor_id: { tipo: 'igual', coluna: 'fornecedor_id', numero: true },
  },
});

/** Estoque consolidado (saldo, valor, alerta de mínimo). */
router.get(
  '/estoque/posicao',
  asyncHandler((req, res) => {
    const f = montarFiltros(req.query, {
      busca: { tipo: 'busca', colunas: ['ve.descricao', 've.codigo', 've.localizacao'] },
      tipo: { tipo: 'igual', coluna: 've.tipo' },
      unidade: { tipo: 'igual', coluna: 've.unidade' },
      fornecedor_id: { tipo: 'igual', coluna: 've.fornecedor_id', numero: true },
      saldo_min: { tipo: 'min', coluna: 've.saldo' },
      saldo_max: { tipo: 'max', coluna: 've.saldo' },
      abaixo_minimo: { tipo: 'booleano', quandoVerdadeiro: 've.abaixo_minimo = 1' },
      zerados: { tipo: 'booleano', quandoVerdadeiro: 've.saldo <= 0' },
    });
    const ordem = montarOrdem(
      req.query,
      ['ve.descricao', 've.saldo', 've.valor_estoque', 've.custo_unitario', 've.tipo'],
      've.descricao'
    );
    res.json(
      getDb()
        .prepare(
          `SELECT ve.*, fo.nome AS fornecedor FROM vw_estoque ve
           LEFT JOIN fornecedores fo ON fo.id = ve.fornecedor_id
           WHERE ve.ativo = 1${f.where.length ? ` AND ${f.where.join(' AND ')}` : ''}
           ORDER BY ${ordem} LIMIT ?`
        )
        .all(...f.params, limitar(req.query, 500, 5000))
    );
  })
);

/** Necessidade líquida de compra (MRP) das ordens em aberto. */
router.get(
  '/estoque/necessidade',
  asyncHandler((req, res) => {
    res.json(necessidadeMateriais({ ate: req.query.ate || null }));
  })
);

const movimentoSchema = z.object({
  material_id: z.number().int(),
  local_id: z.number().int().nullish(),
  tipo: z.enum(['ENTRADA', 'SAIDA', 'AJUSTE']),
  quantidade: z.number().positive(),
  custo_unitario: z.number().min(0).optional(),
  data: z.string().trim().optional(),
  documento: z.string().trim().nullish(),
  ordem_id: z.number().int().nullish(),
  fornecedor_id: z.number().int().nullish(),
  observacao: z.string().trim().nullish(),
});

router.post(
  '/estoque/movimentos',
  exigir('materiais.mover'),
  asyncHandler((req, res) => {
    const dados = movimentoSchema.parse(req.body);
    res.status(201).json(registrarMovimento({ ...dados, usuario_id: req.usuario?.sub }));
  })
);

router.get(
  '/estoque/movimentos',
  asyncHandler((req, res) => {
    const f = montarFiltros(req.query, {
      busca: { tipo: 'busca', colunas: ['m.descricao', 'mv.documento', 'mv.observacao'] },
      material_id: { tipo: 'igual', coluna: 'mv.material_id', numero: true },
      tipo: { tipo: 'igual', coluna: 'mv.tipo' },
      local_id: { tipo: 'igual', coluna: 'mv.local_id', numero: true },
      fornecedor_id: { tipo: 'igual', coluna: 'mv.fornecedor_id', numero: true },
      ordem_id: { tipo: 'igual', coluna: 'mv.ordem_id', numero: true },
      de: { tipo: 'de', coluna: 'mv.data' },
      ate: { tipo: 'ate', coluna: 'mv.data' },
    });
    const where = f.where;
    const params = f.params;
    const limite = limitar(req.query, 200, 1000);
    res.json(
      getDb()
        .prepare(
          `SELECT mv.*, m.descricao AS material, m.unidade, o.numero AS ordem, f.nome AS fornecedor, u.nome AS usuario
           FROM movimentos_estoque mv
           JOIN materiais m ON m.id = mv.material_id
           LEFT JOIN ordens_producao o ON o.id = mv.ordem_id
           LEFT JOIN fornecedores f ON f.id = mv.fornecedor_id
           LEFT JOIN usuarios u ON u.id = mv.usuario_id
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY mv.data DESC, mv.id DESC LIMIT ?`
        )
        .all(...params, limite)
    );
  })
);

/** Saldo do material em cada local de estoque. */
router.get(
  '/estoque/por-local',
  asyncHandler((req, res) => {
    res.json(
      getDb()
        .prepare(
          `SELECT m.id AS material_id, m.descricao AS material, m.unidade,
                  COALESCE(l.nome, 'SEM LOCAL') AS local, mv.local_id,
                  ROUND(SUM(CASE WHEN mv.tipo = 'SAIDA' THEN -mv.quantidade ELSE mv.quantidade END), 3) AS saldo
           FROM movimentos_estoque mv
           JOIN materiais m ON m.id = mv.material_id
           LEFT JOIN locais_estoque l ON l.id = mv.local_id
           ${req.query.material_id ? 'WHERE mv.material_id = ?' : ''}
           GROUP BY m.id, mv.local_id
           HAVING saldo <> 0
           ORDER BY m.descricao, local`
        )
        .all(...(req.query.material_id ? [Number(req.query.material_id)] : []))
    );
  })
);

/** Onde este material é usado (produtos cuja ficha técnica o inclui). */
router.get(
  '/:id/onde-usado',
  asyncHandler((req, res) => {
    res.json(
      getDb()
        .prepare(
          `SELECT p.id, p.descricao AS produto, g.nome AS grupo, f.consumo_por_peca, f.perda_percentual
           FROM ficha_tecnica f
           JOIN produtos p ON p.id = f.produto_id
           LEFT JOIN grupos_produto g ON g.id = p.grupo_id
           WHERE f.material_id = ? ORDER BY p.descricao`
        )
        .all(req.params.id)
    );
  })
);

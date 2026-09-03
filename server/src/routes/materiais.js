import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { crudRouter } from '../lib/crud.js';
import { asyncHandler } from '../lib/errors.js';
import { registrarMovimento, necessidadeMateriais } from '../services/estoque.js';

export const router = crudRouter({
  tabela: 'materiais',
  campos: ['codigo', 'descricao', 'tipo', 'unidade', 'custo_unitario', 'estoque_min', 'localizacao', 'fornecedor_id', 'ativo'],
  schema: z.object({
    codigo: z.string().trim().nullish(),
    descricao: z.string().trim().min(1),
    tipo: z.enum(['TECIDO', 'AVIAMENTO', 'EMBALAGEM', 'TINTA', 'ETIQUETA', 'SERVICO', 'OUTRO']).optional(),
    unidade: z.enum(['UN', 'MT', 'M2', 'KG', 'L', 'PC', 'CX', 'RL']).optional(),
    custo_unitario: z.number().min(0).optional(),
    estoque_min: z.number().min(0).optional(),
    localizacao: z.string().trim().nullish(),
    fornecedor_id: z.number().int().nullish(),
    ativo: z.number().int().optional(),
  }),
  ordem: 'descricao',
  busca: ['descricao', 'codigo'],
});

/** Estoque consolidado (saldo, valor, alerta de mínimo). */
router.get(
  '/estoque/posicao',
  asyncHandler((req, res) => {
    const where = ['ve.ativo = 1'];
    const params = [];
    if (req.query.busca) {
      where.push('(ve.descricao LIKE ? OR ve.codigo LIKE ?)');
      params.push(`%${req.query.busca}%`, `%${req.query.busca}%`);
    }
    if (req.query.tipo) {
      where.push('ve.tipo = ?');
      params.push(req.query.tipo);
    }
    if (req.query.abaixo_minimo === 'true') where.push('ve.abaixo_minimo = 1');

    res.json(
      getDb()
        .prepare(
          `SELECT ve.*, f.nome AS fornecedor FROM vw_estoque ve
           LEFT JOIN fornecedores f ON f.id = ve.fornecedor_id
           WHERE ${where.join(' AND ')} ORDER BY ve.descricao`
        )
        .all(...params)
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
  asyncHandler((req, res) => {
    const dados = movimentoSchema.parse(req.body);
    res.status(201).json(registrarMovimento({ ...dados, usuario_id: req.usuario?.sub }));
  })
);

router.get(
  '/estoque/movimentos',
  asyncHandler((req, res) => {
    const where = [];
    const params = [];
    if (req.query.material_id) {
      where.push('mv.material_id = ?');
      params.push(Number(req.query.material_id));
    }
    if (req.query.tipo) {
      where.push('mv.tipo = ?');
      params.push(req.query.tipo);
    }
    if (req.query.de) {
      where.push('mv.data >= ?');
      params.push(req.query.de);
    }
    if (req.query.ate) {
      where.push('mv.data <= ?');
      params.push(req.query.ate);
    }
    const limite = Math.min(Number(req.query.limite) || 200, 1000);
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

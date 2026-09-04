import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { crudRouter } from '../lib/crud.js';
import { asyncHandler, notFound } from '../lib/errors.js';
import { exigir } from '../middleware/auth.js';
import { montarFiltros, montarOrdem, limitar } from '../lib/filtros.js';
import {
  criarTitulo, buscarTitulo, registrarBaixa, estornarBaixa, faturarPedido,
  posicao, aging, fluxoPrevisto, realizadoPorMes, ranking, resumo,
} from '../services/financeiro.js';

export const router = Router();

const opcional = z.string().trim().nullish();

router.use(
  '/contas-bancarias',
  exigir('financeiro.ver'),
  crudRouter({
    tabela: 'contas_bancarias',
    campos: ['nome', 'tipo', 'banco', 'agencia', 'conta', 'saldo_inicial', 'ativo'],
    schema: z.object({
      nome: z.string().trim().min(1),
      tipo: z.enum(['CAIXA', 'BANCO', 'APLICACAO']).optional(),
      banco: opcional, agencia: opcional, conta: opcional,
      saldo_inicial: z.number().optional(),
      ativo: z.number().int().optional(),
    }),
    ordem: 'nome',
    busca: ['nome', 'banco'],
  })
);

router.use(
  '/categorias',
  exigir('financeiro.ver'),
  crudRouter({
    tabela: 'categorias_financeiras',
    campos: ['nome', 'tipo', 'grupo', 'ativo'],
    schema: z.object({
      nome: z.string().trim().min(1),
      tipo: z.enum(['RECEBER', 'PAGAR']),
      grupo: opcional,
      ativo: z.number().int().optional(),
    }),
    ordem: 'tipo, nome',
    busca: ['nome'],
  })
);

/* ------------------------------------------------------------------ títulos */

const tituloSchema = z.object({
  tipo: z.enum(['RECEBER', 'PAGAR']),
  descricao: z.string().trim().min(1),
  categoria_id: z.number().int().nullish(),
  cliente_id: z.number().int().nullish(),
  fornecedor_id: z.number().int().nullish(),
  pedido_id: z.number().int().nullish(),
  documento: opcional,
  valor: z.number().positive(),
  parcelas: z.number().int().min(1).max(60).optional(),
  intervalo_dias: z.number().int().min(1).max(365).optional(),
  emissao: opcional,
  vencimento: z.string().trim().min(8),
  observacao: opcional,
});

const FILTROS_TITULO = {
  busca: { tipo: 'busca', colunas: ['descricao', 'documento', 'parte'] },
  tipo: { tipo: 'igual', coluna: 'tipo' },
  status: { tipo: 'igual', coluna: 'status' },
  categoria: { tipo: 'igual', coluna: 'categoria' },
  cliente_id: { tipo: 'igual', coluna: 'cliente_id', numero: true },
  fornecedor_id: { tipo: 'igual', coluna: 'fornecedor_id', numero: true },
  pedido_id: { tipo: 'igual', coluna: 'pedido_id', numero: true },
  de: { tipo: 'de', coluna: 'vencimento' },
  ate: { tipo: 'ate', coluna: 'vencimento' },
  emissao_de: { tipo: 'de', coluna: 'emissao' },
  emissao_ate: { tipo: 'ate', coluna: 'emissao' },
  valor_min: { tipo: 'min', coluna: 'valor' },
  valor_max: { tipo: 'max', coluna: 'valor' },
  vencidos: { tipo: 'booleano', quandoVerdadeiro: 'dias_atraso > 0' },
};

router.get(
  '/titulos',
  exigir('financeiro.ver'),
  asyncHandler((req, res) => {
    const f = montarFiltros(req.query, FILTROS_TITULO);
    const where = [...f.where];
    if (!req.query.status && req.query.abertos !== 'false') where.push(`status IN ('ABERTO','PARCIAL')`);
    const ordem = montarOrdem(
      req.query,
      ['vencimento', 'emissao', 'valor', 'saldo', 'parte', 'dias_atraso'],
      'vencimento ASC, id ASC'
    );
    res.json(
      getDb()
        .prepare(
          `SELECT * FROM vw_titulos ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY ${ordem} LIMIT ?`
        )
        .all(...f.params, limitar(req.query))
    );
  })
);

router.get(
  '/titulos/:id',
  exigir('financeiro.ver'),
  asyncHandler((req, res) => res.json(buscarTitulo(Number(req.params.id))))
);

router.post(
  '/titulos',
  exigir('financeiro.lancar'),
  asyncHandler((req, res) => {
    const dados = tituloSchema.parse(req.body);
    res.status(201).json(criarTitulo({ ...dados, usuario_id: req.usuario.sub }));
  })
);

router.put(
  '/titulos/:id',
  exigir('financeiro.lancar'),
  asyncHandler((req, res) => {
    const dados = tituloSchema.partial().omit({ parcelas: true, intervalo_dias: true }).parse(req.body);
    const db = getDb();
    const atual = db.prepare(`SELECT * FROM titulos WHERE id = ?`).get(req.params.id);
    if (!atual) throw notFound('Título não encontrado');

    const campos = ['descricao', 'categoria_id', 'cliente_id', 'fornecedor_id', 'documento',
                    'valor', 'emissao', 'vencimento', 'observacao'].filter((c) => dados[c] !== undefined);
    if (campos.length) {
      db.prepare(`UPDATE titulos SET ${campos.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`)
        .run({ ...Object.fromEntries(campos.map((c) => [c, dados[c] ?? null])), id: atual.id });
    }
    res.json(buscarTitulo(atual.id, db));
  })
);

/** Cancelar preserva o histórico; o título sai das posições sem sumir do sistema. */
router.delete(
  '/titulos/:id',
  exigir('financeiro.lancar'),
  asyncHandler((req, res) => {
    const db = getDb();
    const titulo = db.prepare(`SELECT * FROM vw_titulos WHERE id = ?`).get(req.params.id);
    if (!titulo) throw notFound('Título não encontrado');

    if (titulo.pago > 0) {
      db.prepare(`UPDATE titulos SET status = 'CANCELADO' WHERE id = ?`).run(titulo.id);
      return res.json({ ok: true, cancelado: true });
    }
    db.prepare(`DELETE FROM titulos WHERE id = ?`).run(titulo.id);
    res.json({ ok: true, removido: true });
  })
);

/* ------------------------------------------------------------------- baixas */

router.post(
  '/baixas',
  exigir('financeiro.baixar'),
  asyncHandler((req, res) => {
    const dados = z
      .object({
        titulo_id: z.number().int(),
        data: opcional,
        valor: z.number().positive(),
        juros: z.number().min(0).optional(),
        desconto: z.number().min(0).optional(),
        forma: z.enum(['DINHEIRO', 'PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO', 'CHEQUE', 'OUTRO']).optional(),
        conta_id: z.number().int().nullish(),
        observacao: opcional,
      })
      .parse(req.body);
    res.status(201).json(registrarBaixa({ ...dados, usuario_id: req.usuario.sub }));
  })
);

router.delete(
  '/baixas/:id',
  exigir('financeiro.baixar'),
  asyncHandler((req, res) => res.json(estornarBaixa(Number(req.params.id))))
);

/** Gera as contas a receber de um pedido já entregue ou faturado. */
router.post(
  '/pedidos/:id/faturar',
  exigir('financeiro.lancar'),
  asyncHandler((req, res) => {
    const opcoes = z
      .object({
        parcelas: z.number().int().min(1).max(60).optional(),
        intervalo_dias: z.number().int().min(1).max(365).optional(),
        prazo_dias: z.number().int().min(0).max(365).optional(),
        vencimento: opcional,
        emissao: opcional,
        documento: opcional,
        categoria_id: z.number().int().nullish(),
        forcar: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    res.status(201).json(faturarPedido(Number(req.params.id), { ...opcoes, usuario_id: req.usuario.sub }));
  })
);

/* -------------------------------------------------------------- indicadores */

router.get('/resumo', exigir('financeiro.ver'),
  asyncHandler((req, res) => res.json(resumo(req.query.ano || new Date().getFullYear()))));

router.get('/posicao/:tipo', exigir('financeiro.ver'),
  asyncHandler((req, res) => res.json(posicao(req.params.tipo.toUpperCase()))));

router.get('/aging/:tipo', exigir('financeiro.ver'),
  asyncHandler((req, res) => res.json(aging(req.params.tipo.toUpperCase()))));

router.get('/fluxo', exigir('financeiro.ver'),
  asyncHandler((req, res) => res.json(fluxoPrevisto({ semanas: Math.min(Number(req.query.semanas) || 12, 52) }))));

router.get('/realizado', exigir('financeiro.ver'),
  asyncHandler((req, res) => res.json(realizadoPorMes(req.query.ano || new Date().getFullYear()))));

router.get('/ranking/:tipo', exigir('financeiro.ver'),
  asyncHandler((req, res) => res.json(ranking(req.params.tipo.toUpperCase(), Math.min(Number(req.query.limite) || 20, 100)))));

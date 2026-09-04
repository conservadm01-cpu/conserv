import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { crudRouter } from '../lib/crud.js';
import { asyncHandler, notFound } from '../lib/errors.js';
import { processoDoProduto, custoCompletoProduto } from '../services/custeio.js';
import { exigir } from '../middleware/auth.js';

const texto = z.string().trim().min(1);
const opcional = z.string().trim().nullish();

export const router = Router();

router.use(
  '/vendedores',
  exigir('cadastros.ver'),
  crudRouter({
    escrita: 'cadastros.editar',
    tabela: 'vendedores',
    campos: ['nome', 'email', 'telefone', 'ativo'],
    schema: z.object({ nome: texto, email: opcional, telefone: opcional, ativo: z.number().int().optional() }),
    ordem: 'nome',
    busca: ['nome'],
  })
);

router.use(
  '/categorias-cliente',
  exigir('cadastros.ver'),
  crudRouter({
    escrita: 'cadastros.editar',
    tabela: 'categorias_cliente',
    campos: ['nome'],
    schema: z.object({ nome: texto }),
    ordem: 'nome',
    busca: ['nome'],
  })
);

router.use(
  '/grupos-produto',
  exigir('cadastros.ver'),
  crudRouter({
    escrita: 'produtos.editar',
    tabela: 'grupos_produto',
    campos: ['nome'],
    schema: z.object({ nome: texto }),
    ordem: 'nome',
    busca: ['nome'],
  })
);

router.use(
  '/fornecedores',
  exigir('cadastros.ver'),
  crudRouter({
    escrita: 'cadastros.editar',
    tabela: 'fornecedores',
    campos: ['nome', 'cnpj', 'contato', 'email', 'telefone', 'prazo_entrega_dias', 'ativo'],
    schema: z.object({
      nome: texto,
      cnpj: opcional,
      contato: opcional,
      email: opcional,
      telefone: opcional,
      prazo_entrega_dias: z.number().int().min(0).optional(),
      ativo: z.number().int().optional(),
    }),
    ordem: 'nome',
    busca: ['nome', 'cnpj', 'contato', 'cidade'],
    ordenaveis: ['nome', 'cidade', 'prazo_entrega_dias'],
    filtros: { uf: { tipo: 'igual', coluna: 'uf' }, cidade: { tipo: 'igual', coluna: 'cidade' } },
  })
);

router.use(
  '/clientes',
  exigir('cadastros.ver'),
  crudRouter({
    escrita: 'cadastros.editar',
    tabela: 'clientes',
    campos: ['nome', 'categoria_id', 'cnpj', 'contato', 'email', 'telefone', 'cidade', 'uf', 'observacao', 'ativo'],
    schema: z.object({
      nome: texto,
      categoria_id: z.number().int().nullish(),
      cnpj: opcional,
      contato: opcional,
      email: opcional,
      telefone: opcional,
      cidade: opcional,
      uf: opcional,
      observacao: opcional,
      ativo: z.number().int().optional(),
    }),
    listaSql: `SELECT c.*, cc.nome AS categoria FROM clientes c
               LEFT JOIN categorias_cliente cc ON cc.id = c.categoria_id`,
    ordem: 'c.nome',
    busca: ['c.nome', 'c.cnpj', 'c.contato', 'c.email', 'c.cidade'],
    ordenaveis: ['c.nome', 'c.cidade', 'c.prazo_pagamento_dias', 'c.criado_em'],
    filtros: {
      categoria_id: { tipo: 'igual', coluna: 'c.categoria_id', numero: true },
      uf: { tipo: 'igual', coluna: 'c.uf' },
      cidade: { tipo: 'igual', coluna: 'c.cidade' },
    },
  })
);

router.use(
  '/grupos-material',
  exigir('materiais.ver'),
  crudRouter({
    escrita: 'materiais.editar',
    tabela: 'grupos_material',
    campos: ['nome', 'pai_id'],
    schema: z.object({ nome: texto, pai_id: z.number().int().nullish() }),
    listaSql: `SELECT g.*, p.nome AS pai FROM grupos_material g
               LEFT JOIN grupos_material p ON p.id = g.pai_id`,
    ordem: 'g.nome',
    busca: ['g.nome'],
  })
);

router.use(
  '/locais-estoque',
  exigir('materiais.ver'),
  crudRouter({
    escrita: 'materiais.editar',
    tabela: 'locais_estoque',
    campos: ['nome', 'tipo', 'ativo'],
    schema: z.object({
      nome: texto,
      tipo: z.enum(['ALMOXARIFADO', 'PRODUCAO', 'EXPEDICAO', 'TERCEIRO', 'OUTRO']).optional(),
      ativo: z.number().int().optional(),
    }),
    ordem: 'nome',
    busca: ['nome'],
  })
);

router.use(
  '/etapas',
  exigir('engenharia.ver'),
  crudRouter({
    escrita: 'engenharia.editar',
    tabela: 'etapas',
    campos: ['codigo', 'nome', 'ordem', 'consome_material', 'departamento_id', 'equipamento_id', 'tempo_por_peca_min', 'ativo'],
    schema: z.object({
      codigo: texto,
      nome: texto,
      ordem: z.number().int(),
      consome_material: z.number().int().optional(),
      departamento_id: z.number().int().nullish(),
      equipamento_id: z.number().int().nullish(),
      tempo_por_peca_min: z.number().min(0).optional(),
      ativo: z.number().int().optional(),
    }),
    listaSql: `SELECT e.*, d.nome AS departamento, eq.nome AS equipamento FROM etapas e
               LEFT JOIN departamentos d ON d.id = e.departamento_id
               LEFT JOIN equipamentos eq ON eq.id = e.equipamento_id`,
    ordem: 'e.ordem',
  })
);

// --- Produtos: CRUD + ficha técnica + custos de processo -------------------

const produtoRouter = crudRouter({
  tabela: 'produtos',
  campos: ['codigo', 'descricao', 'grupo_id', 'linha', 'preco_padrao', 'ativo'],
  schema: z.object({
    codigo: opcional,
    descricao: texto,
    grupo_id: z.number().int().nullish(),
    linha: z.enum(['LEVE', 'PESADA', 'AMBAS']).optional(),
    preco_padrao: z.number().min(0).optional(),
    ativo: z.number().int().optional(),
  }),
  listaSql: `SELECT p.*, g.nome AS grupo,
                    (SELECT COUNT(*) FROM ficha_tecnica f WHERE f.produto_id = p.id) AS itens_ficha
             FROM produtos p LEFT JOIN grupos_produto g ON g.id = p.grupo_id`,
  ordem: 'p.descricao',
  busca: ['p.descricao', 'p.codigo'],
  ordenaveis: ['p.descricao', 'p.preco_padrao', 'p.codigo'],
  filtros: {
    grupo_id: { tipo: 'igual', coluna: 'p.grupo_id', numero: true },
    linha: { tipo: 'igual', coluna: 'p.linha' },
    preco_min: { tipo: 'min', coluna: 'p.preco_padrao' },
    preco_max: { tipo: 'max', coluna: 'p.preco_padrao' },
    sem_ficha: { tipo: 'booleano', quandoVerdadeiro: '(SELECT COUNT(*) FROM ficha_tecnica f WHERE f.produto_id = p.id) = 0' },
  },
});

const fichaSchema = z.object({
  material_id: z.number().int(),
  consumo_por_peca: z.number().positive(),
  perda_percentual: z.number().min(0).default(0),
  observacao: z.string().trim().nullish(),
});

produtoRouter.get(
  '/:id/ficha-tecnica',
  asyncHandler((req, res) => {
    res.json(
      getDb()
        .prepare(
          `SELECT f.*, m.codigo, m.descricao AS material, m.unidade, m.custo_unitario,
                  ROUND(f.consumo_por_peca * (1 + f.perda_percentual/100) * m.custo_unitario, 4) AS custo_por_peca
           FROM ficha_tecnica f JOIN materiais m ON m.id = f.material_id
           WHERE f.produto_id = ? ORDER BY m.descricao`
        )
        .all(req.params.id)
    );
  })
);

produtoRouter.post(
  '/:id/ficha-tecnica',
  exigir('produtos.processo'),
  asyncHandler((req, res) => {
    const dados = fichaSchema.parse(req.body);
    getDb()
      .prepare(
        `INSERT INTO ficha_tecnica (produto_id, material_id, consumo_por_peca, perda_percentual, observacao)
         VALUES (@produto_id, @material_id, @consumo_por_peca, @perda_percentual, @observacao)
         ON CONFLICT(produto_id, material_id) DO UPDATE SET
           consumo_por_peca = excluded.consumo_por_peca,
           perda_percentual = excluded.perda_percentual,
           observacao = excluded.observacao`
      )
      .run({ ...dados, produto_id: Number(req.params.id), observacao: dados.observacao ?? null });
    res.status(201).json({ ok: true });
  })
);

produtoRouter.delete(
  '/:id/ficha-tecnica/:materialId',
  exigir('produtos.processo'),
  asyncHandler((req, res) => {
    const info = getDb()
      .prepare(`DELETE FROM ficha_tecnica WHERE produto_id = ? AND material_id = ?`)
      .run(req.params.id, req.params.materialId);
    if (info.changes === 0) throw notFound('Material não está na ficha técnica deste produto');
    res.json({ ok: true });
  })
);

produtoRouter.get(
  '/:id/custos-processo',
  asyncHandler((req, res) => {
    res.json(
      getDb()
        .prepare(
          `SELECT e.id AS etapa_id, e.codigo, e.nome, e.ordem,
                  COALESCE(cp.custo_por_peca, 0) AS custo_por_peca
           FROM etapas e
           LEFT JOIN custos_processo cp ON cp.etapa_id = e.id AND cp.produto_id = ?
           WHERE e.ativo = 1 ORDER BY e.ordem`
        )
        .all(req.params.id)
    );
  })
);

produtoRouter.put(
  '/:id/custos-processo',
  exigir('produtos.processo'),
  asyncHandler((req, res) => {
    const dados = z
      .array(z.object({ etapa_id: z.number().int(), custo_por_peca: z.number().min(0) }))
      .parse(req.body);
    const db = getDb();
    const upsert = db.prepare(
      `INSERT INTO custos_processo (produto_id, etapa_id, custo_por_peca) VALUES (?, ?, ?)
       ON CONFLICT(produto_id, etapa_id) DO UPDATE SET custo_por_peca = excluded.custo_por_peca`
    );
    db.transaction(() => {
      for (const d of dados) upsert.run(Number(req.params.id), d.etapa_id, d.custo_por_peca);
    })();
    res.json({ ok: true });
  })
);

/* ---- Processo produtivo: a sequência de etapas com tempo por peça ---- */

produtoRouter.get(
  '/:id/processo',
  asyncHandler((req, res) => res.json(processoDoProduto(Number(req.params.id))))
);

produtoRouter.put(
  '/:id/processo',
  exigir('produtos.processo'),
  asyncHandler((req, res) => {
    const linhas = z
      .array(
        z.object({
          etapa_id: z.number().int(),
          sequencia: z.number().int().min(1).default(1),
          tempo_por_peca_min: z.number().min(0),
          equipamento_id: z.number().int().nullish(),
          observacao: z.string().trim().nullish(),
        })
      )
      .parse(req.body);

    const db = getDb();
    const produtoId = Number(req.params.id);
    const upsert = db.prepare(
      `INSERT INTO produto_processo (produto_id, etapa_id, sequencia, tempo_por_peca_min, equipamento_id, observacao)
       VALUES (@produto_id, @etapa_id, @sequencia, @tempo_por_peca_min, @equipamento_id, @observacao)
       ON CONFLICT(produto_id, etapa_id) DO UPDATE SET
         sequencia = excluded.sequencia,
         tempo_por_peca_min = excluded.tempo_por_peca_min,
         equipamento_id = excluded.equipamento_id,
         observacao = excluded.observacao`
    );

    db.transaction(() => {
      // Etapa com tempo zero sai do roteiro: é assim que se remove uma operação.
      const manter = linhas.filter((l) => l.tempo_por_peca_min > 0);
      for (const l of manter) {
        upsert.run({
          produto_id: produtoId,
          etapa_id: l.etapa_id,
          sequencia: l.sequencia,
          tempo_por_peca_min: l.tempo_por_peca_min,
          equipamento_id: l.equipamento_id ?? null,
          observacao: l.observacao ?? null,
        });
      }
      const ids = manter.map((l) => l.etapa_id);
      db.prepare(
        `DELETE FROM produto_processo WHERE produto_id = ?
         AND etapa_id NOT IN (${ids.length ? ids.map(() => '?').join(',') : 'NULL'})`
      ).run(produtoId, ...ids);
    })();

    res.json(processoDoProduto(produtoId, db));
  })
);

/** A conta fechada da peça: material + mão de obra + indireto. */
produtoRouter.get(
  '/:id/custo',
  exigir('produtos.custo'),
  asyncHandler((req, res) => res.json(custoCompletoProduto(Number(req.params.id))))
);

router.use('/produtos', exigir('cadastros.ver'), produtoRouter);

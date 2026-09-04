import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { crudRouter } from '../lib/crud.js';
import { asyncHandler, notFound } from '../lib/errors.js';
import { exigir } from '../middleware/auth.js';
import { montarFiltros, montarOrdem, limitar } from '../lib/filtros.js';
import {
  buscarOportunidade, moverEtapa, registrarInteracao, funil, resumoComercial,
  criarOrcamento, atualizarOrcamento, buscarOrcamento, converterEmPedido,
  precificar, desempenhoOrcamentos, proximoNumeroOrcamento,
} from '../services/comercial.js';

const opcional = z.string().trim().nullish();

/* ============================================================== CRM ====== */

export const crm = Router();
const podeEditarCrm = exigir('crm.editar');

crm.get('/resumo', asyncHandler((req, res) =>
  res.json(resumoComercial({ vendedor_id: req.query.vendedor_id ? Number(req.query.vendedor_id) : null }))));

crm.get('/funil', asyncHandler((req, res) =>
  res.json(funil({ vendedor_id: req.query.vendedor_id ? Number(req.query.vendedor_id) : null }))));

crm.use(
  '/etapas-funil',
  crudRouter({
    tabela: 'etapas_funil',
    escrita: 'crm.editar',
    campos: ['nome', 'ordem', 'probabilidade', 'tipo', 'ativo'],
    schema: z.object({
      nome: z.string().trim().min(1),
      ordem: z.number().int(),
      probabilidade: z.number().min(0).max(100).optional(),
      tipo: z.enum(['ABERTA', 'GANHA', 'PERDIDA']).optional(),
      ativo: z.number().int().optional(),
    }),
    ordem: 'ordem',
  })
);

const oportunidadeSchema = z.object({
  titulo: z.string().trim().min(1),
  cliente_id: z.number().int().nullish(),
  prospect: opcional,
  contato: opcional,
  telefone: opcional,
  email: opcional,
  vendedor_id: z.number().int().nullish(),
  etapa_id: z.number().int(),
  origem: z.enum(['INDICACAO', 'SITE', 'REDES', 'FEIRA', 'PROSPECCAO', 'CLIENTE_ATIVO', 'OUTRO']).optional(),
  valor_estimado: z.number().min(0).optional(),
  probabilidade: z.number().min(0).max(100).nullish(),
  previsao_fechamento: opcional,
  observacao: opcional,
});

const FILTROS_OPORTUNIDADE = {
  busca: { tipo: 'busca', colunas: ['o.titulo', 'o.prospect', 'c.nome', 'o.observacao'] },
  vendedor_id: { tipo: 'igual', coluna: 'o.vendedor_id', numero: true },
  etapa_id: { tipo: 'igual', coluna: 'o.etapa_id', numero: true },
  cliente_id: { tipo: 'igual', coluna: 'o.cliente_id', numero: true },
  origem: { tipo: 'igual', coluna: 'o.origem' },
  tipo_etapa: { tipo: 'igual', coluna: 'e.tipo' },
  de: { tipo: 'de', coluna: 'o.criado_em' },
  ate: { tipo: 'ate', coluna: 'o.criado_em' },
  previsao_de: { tipo: 'de', coluna: 'o.previsao_fechamento' },
  previsao_ate: { tipo: 'ate', coluna: 'o.previsao_fechamento' },
  valor_min: { tipo: 'min', coluna: 'o.valor_estimado' },
  valor_max: { tipo: 'max', coluna: 'o.valor_estimado' },
  abertas: { tipo: 'booleano', quandoVerdadeiro: `e.tipo = 'ABERTA'` },
  paradas: { tipo: 'booleano', quandoVerdadeiro: `julianday('now') - julianday(o.atualizado_em) >= 14` },
};

crm.get(
  '/oportunidades',
  asyncHandler((req, res) => {
    const f = montarFiltros(req.query, FILTROS_OPORTUNIDADE);
    const where = f.where;
    const params = f.params;
    const ordem = montarOrdem(
      req.query,
      ['o.atualizado_em', 'o.valor_estimado', 'o.previsao_fechamento', 'o.titulo'],
      'o.atualizado_em DESC'
    );
    res.json(
      getDb()
        .prepare(
          `SELECT o.*, COALESCE(c.nome, o.prospect) AS parte, v.nome AS vendedor,
                  e.nome AS etapa, e.tipo AS etapa_tipo, e.probabilidade AS probabilidade_etapa
           FROM oportunidades o
           LEFT JOIN clientes c ON c.id = o.cliente_id
           LEFT JOIN vendedores v ON v.id = o.vendedor_id
           JOIN etapas_funil e ON e.id = o.etapa_id
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY ${ordem} LIMIT ?`
        )
        .all(...params, limitar(req.query, 400))
    );
  })
);

crm.get('/oportunidades/:id', asyncHandler((req, res) => res.json(buscarOportunidade(Number(req.params.id)))));

crm.post(
  '/oportunidades',
  podeEditarCrm,
  asyncHandler((req, res) => {
    const dados = oportunidadeSchema.parse(req.body);
    const info = getDb()
      .prepare(
        `INSERT INTO oportunidades
           (titulo, cliente_id, prospect, contato, telefone, email, vendedor_id, etapa_id,
            origem, valor_estimado, probabilidade, previsao_fechamento, observacao)
         VALUES (@titulo, @cliente_id, @prospect, @contato, @telefone, @email, @vendedor_id, @etapa_id,
            @origem, @valor_estimado, @probabilidade, @previsao_fechamento, @observacao)`
      )
      .run({
        ...dados,
        cliente_id: dados.cliente_id ?? null,
        prospect: dados.prospect ?? null,
        contato: dados.contato ?? null,
        telefone: dados.telefone ?? null,
        email: dados.email ?? null,
        vendedor_id: dados.vendedor_id ?? null,
        origem: dados.origem ?? 'OUTRO',
        valor_estimado: dados.valor_estimado ?? 0,
        probabilidade: dados.probabilidade ?? null,
        previsao_fechamento: dados.previsao_fechamento ?? null,
        observacao: dados.observacao ?? null,
      });
    res.status(201).json(buscarOportunidade(info.lastInsertRowid));
  })
);

crm.put(
  '/oportunidades/:id',
  podeEditarCrm,
  asyncHandler((req, res) => {
    const dados = oportunidadeSchema.partial().parse(req.body);
    const db = getDb();
    const atual = db.prepare(`SELECT * FROM oportunidades WHERE id = ?`).get(req.params.id);
    if (!atual) throw notFound('Oportunidade não encontrada');

    const campos = Object.keys(dados).filter((c) => c !== 'etapa_id');
    if (campos.length) {
      db.prepare(
        `UPDATE oportunidades SET ${campos.map((c) => `${c} = @${c}`).join(', ')},
         atualizado_em = datetime('now') WHERE id = @id`
      ).run({ ...Object.fromEntries(campos.map((c) => [c, dados[c] ?? null])), id: atual.id });
    }
    // A etapa muda pela rota própria, que carimba fechamento e exige o motivo da perda.
    if (dados.etapa_id && dados.etapa_id !== atual.etapa_id) {
      moverEtapa(atual.id, dados.etapa_id, req.body, db);
    }
    res.json(buscarOportunidade(atual.id, db));
  })
);

crm.put(
  '/oportunidades/:id/etapa',
  podeEditarCrm,
  asyncHandler((req, res) => {
    const dados = z.object({ etapa_id: z.number().int(), motivo_perda: opcional }).parse(req.body);
    res.json(moverEtapa(Number(req.params.id), dados.etapa_id, dados));
  })
);

crm.delete(
  '/oportunidades/:id',
  podeEditarCrm,
  asyncHandler((req, res) => {
    const info = getDb().prepare(`DELETE FROM oportunidades WHERE id = ?`).run(req.params.id);
    if (info.changes === 0) throw notFound('Oportunidade não encontrada');
    res.json({ ok: true });
  })
);

crm.post(
  '/interacoes',
  podeEditarCrm,
  asyncHandler((req, res) => {
    const dados = z
      .object({
        oportunidade_id: z.number().int().nullish(),
        cliente_id: z.number().int().nullish(),
        tipo: z.enum(['LIGACAO', 'VISITA', 'REUNIAO', 'EMAIL', 'WHATSAPP', 'PROPOSTA', 'OUTRO']).optional(),
        data: opcional,
        resumo: z.string().trim().min(1),
        proximo_passo: opcional,
        proxima_data: opcional,
        concluida: z.boolean().optional(),
      })
      .parse(req.body);
    res.status(201).json(registrarInteracao({ ...dados, usuario_id: req.usuario.sub }));
  })
);

crm.get(
  '/interacoes',
  asyncHandler((req, res) => {
    const where = [];
    const params = [];
    if (req.query.cliente_id) { where.push('i.cliente_id = ?'); params.push(Number(req.query.cliente_id)); }
    if (req.query.pendentes === 'true') where.push(`i.proxima_data IS NOT NULL AND i.proxima_data <= date('now','+14 day')`);
    res.json(
      getDb()
        .prepare(
          `SELECT i.*, o.titulo AS oportunidade, COALESCE(c.nome, o.prospect) AS parte, u.nome AS usuario
           FROM interacoes i
           LEFT JOIN oportunidades o ON o.id = i.oportunidade_id
           LEFT JOIN clientes c ON c.id = COALESCE(i.cliente_id, o.cliente_id)
           LEFT JOIN usuarios u ON u.id = i.usuario_id
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY i.data DESC, i.id DESC LIMIT 200`
        )
        .all(...params)
    );
  })
);

/* ========================================================= ORÇAMENTOS ==== */

export const orcamentos = Router();
const podeEditarOrcamento = exigir('orcamentos.editar');

const itemSchema = z.object({
  produto_id: z.number().int(),
  descricao: opcional,
  quantidade: z.number().positive(),
  preco_unitario: z.number().min(0).default(0),
  custo_unitario: z.number().min(0).optional(),
  sequencia: z.number().int().optional(),
});

const orcamentoSchema = z.object({
  cliente_id: z.number().int().nullish(),
  prospect: opcional,
  oportunidade_id: z.number().int().nullish(),
  vendedor_id: z.number().int().nullish(),
  data: opcional,
  validade: opcional,
  prazo_entrega_dias: z.number().int().min(0).optional(),
  condicao_pagamento: opcional,
  desconto_percentual: z.number().min(0).max(100).optional(),
  frete: z.number().min(0).optional(),
  status: z.enum(['RASCUNHO', 'ENVIADO', 'EM_NEGOCIACAO', 'APROVADO', 'RECUSADO', 'EXPIRADO']).optional(),
  motivo_recusa: opcional,
  observacao: opcional,
  itens: z.array(itemSchema).min(1),
});

const FILTROS_ORCAMENTO = {
  busca: { tipo: 'busca', colunas: ['numero', 'parte', 'observacao'] },
  status: { tipo: 'igual', coluna: 'status' },
  cliente_id: { tipo: 'igual', coluna: 'cliente_id', numero: true },
  vendedor_id: { tipo: 'igual', coluna: 'vendedor_id', numero: true },
  oportunidade_id: { tipo: 'igual', coluna: 'oportunidade_id', numero: true },
  de: { tipo: 'de', coluna: 'data' },
  ate: { tipo: 'ate', coluna: 'data' },
  valor_min: { tipo: 'min', coluna: 'valor_total' },
  valor_max: { tipo: 'max', coluna: 'valor_total' },
  vencidos: { tipo: 'booleano', quandoVerdadeiro: 'vencido = 1' },
};

orcamentos.get(
  '/',
  asyncHandler((req, res) => {
    const f = montarFiltros(req.query, FILTROS_ORCAMENTO);
    const where = [...f.where];
    if (!req.query.status && req.query.abertos === 'true') {
      where.push(`status IN ('RASCUNHO','ENVIADO','EM_NEGOCIACAO')`);
    }
    const ordem = montarOrdem(
      req.query, ['data', 'validade', 'valor_total', 'numero', 'parte'], 'data DESC, id DESC'
    );
    res.json(
      getDb()
        .prepare(
          `SELECT * FROM vw_orcamentos ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY ${ordem} LIMIT ?`
        )
        .all(...f.params, limitar(req.query))
    );
  })
);

orcamentos.get('/desempenho', asyncHandler((req, res) =>
  res.json(desempenhoOrcamentos({ de: req.query.de ?? null, ate: req.query.ate ?? null }))));

orcamentos.get('/proximo-numero', asyncHandler((_req, res) =>
  res.json({ numero: proximoNumeroOrcamento() })));

/** Preço sugerido a partir do custo formado — a conta que evita vender no prejuízo. */
orcamentos.get(
  '/precificar/:produtoId',
  exigir('produtos.custo', 'orcamentos.editar'),
  asyncHandler((req, res) => {
    res.json(
      precificar(Number(req.params.produtoId), {
        markup: req.query.markup !== undefined ? Number(req.query.markup) : null,
        margem: req.query.margem !== undefined ? Number(req.query.margem) : null,
        quantidade: Number(req.query.quantidade) || 1,
      })
    );
  })
);

orcamentos.get('/:id', asyncHandler((req, res) => res.json(buscarOrcamento(Number(req.params.id)))));

orcamentos.post(
  '/',
  podeEditarOrcamento,
  asyncHandler((req, res) => {
    const dados = orcamentoSchema.parse(req.body);
    res.status(201).json(criarOrcamento({ ...dados, usuario_id: req.usuario.sub }));
  })
);

orcamentos.put(
  '/:id',
  podeEditarOrcamento,
  asyncHandler((req, res) => {
    const dados = orcamentoSchema.partial().parse(req.body);
    res.json(atualizarOrcamento(Number(req.params.id), dados));
  })
);

orcamentos.post(
  '/:id/converter',
  exigir('orcamentos.aprovar'),
  asyncHandler((req, res) => {
    const opcoes = z
      .object({
        numero: opcional,
        data_entrega: opcional,
        abrir_ordens: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    res.status(201).json(converterEmPedido(Number(req.params.id), opcoes));
  })
);

orcamentos.delete(
  '/:id',
  podeEditarOrcamento,
  asyncHandler((req, res) => {
    const db = getDb();
    const orcamento = db.prepare(`SELECT * FROM orcamentos WHERE id = ?`).get(req.params.id);
    if (!orcamento) throw notFound('Orçamento não encontrado');
    if (orcamento.pedido_id) {
      db.prepare(`UPDATE orcamentos SET status = 'RECUSADO' WHERE id = ?`).run(orcamento.id);
      return res.json({ ok: true, cancelado: true });
    }
    db.prepare(`DELETE FROM orcamentos WHERE id = ?`).run(orcamento.id);
    res.json({ ok: true, removido: true });
  })
);

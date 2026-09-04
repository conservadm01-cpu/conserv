import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { crudRouter } from '../lib/crud.js';
import { asyncHandler } from '../lib/errors.js';
import {
  registrarApontamento, excluirApontamento, produtividade, eficienciaPorSetor,
} from '../services/apontamento.js';

import { exigir } from '../middleware/auth.js';
import { montarFiltros, montarOrdem, limitar } from '../lib/filtros.js';

export const router = Router();
const podeApontar = exigir('producao.apontar');

const apontamentoSchema = z.object({
  ordem_id: z.number().int(),
  etapa_id: z.number().int(),
  colaborador_id: z.number().int().nullish(),
  equipamento_id: z.number().int().nullish(),
  data: z.string().trim().optional(),
  quantidade: z.number().min(0).optional(),
  refugo: z.number().min(0).optional(),
  minutos: z.number().min(0).optional(),
  observacao: z.string().trim().nullish(),
});

router.post(
  '/',
  podeApontar,
  asyncHandler((req, res) => {
    const dados = apontamentoSchema.parse(req.body);
    res.status(201).json(registrarApontamento({ ...dados, usuario_id: req.usuario?.sub }));
  })
);

router.get(
  '/',
  asyncHandler((req, res) => {
    const f = montarFiltros(req.query, {
      busca: { tipo: 'busca', colunas: ['o.numero', 'v.cliente', 'v.produto', 'c.nome'] },
      ordem_id: { tipo: 'igual', coluna: 'a.ordem_id', numero: true },
      colaborador_id: { tipo: 'igual', coluna: 'a.colaborador_id', numero: true },
      etapa_id: { tipo: 'igual', coluna: 'a.etapa_id', numero: true },
      equipamento_id: { tipo: 'igual', coluna: 'a.equipamento_id', numero: true },
      de: { tipo: 'de', coluna: 'a.data' },
      ate: { tipo: 'ate', coluna: 'a.data' },
      com_refugo: { tipo: 'booleano', quandoVerdadeiro: 'a.refugo > 0' },
    });
    const where = f.where;
    const params = f.params;
    const limite = limitar(req.query);

    res.json(
      getDb()
        .prepare(
          `SELECT a.*, e.nome AS etapa, c.nome AS colaborador, eq.nome AS equipamento,
                  o.numero AS ordem, v.produto, v.cliente
           FROM apontamentos a
           JOIN etapas e ON e.id = a.etapa_id
           JOIN ordens_producao o ON o.id = a.ordem_id
           JOIN vw_itens v ON v.item_id = o.pedido_item_id
           LEFT JOIN colaboradores c ON c.id = a.colaborador_id
           LEFT JOIN equipamentos eq ON eq.id = a.equipamento_id
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY a.data DESC, a.id DESC LIMIT ?`
        )
        .all(...params, limite)
    );
  })
);

router.get(
  '/produtividade',
  asyncHandler((req, res) => res.json(produtividade({ de: req.query.de, ate: req.query.ate })))
);

router.get(
  '/eficiencia',
  asyncHandler((req, res) => res.json(eficienciaPorSetor({ de: req.query.de, ate: req.query.ate })))
);

router.delete('/:id', podeApontar, asyncHandler((req, res) => res.json(excluirApontamento(Number(req.params.id)))));

/** Ocorrências: o que parou a produção e como foi resolvido. */
export const ocorrencias = crudRouter({
  tabela: 'ocorrencias',
  escrita: 'producao.apontar',
  campos: ['data', 'departamento_id', 'ordem_id', 'equipamento_id', 'motivo', 'minutos_parado', 'descricao', 'acao', 'resolvida'],
  schema: z.object({
    data: z.string().trim().optional(),
    departamento_id: z.number().int().nullish(),
    ordem_id: z.number().int().nullish(),
    equipamento_id: z.number().int().nullish(),
    motivo: z.enum(['FALTA_MATERIAL', 'QUEBRA_EQUIPAMENTO', 'FALTA_PESSOAL', 'RETRABALHO',
                    'ENERGIA', 'AGUARDANDO_SETOR', 'TREINAMENTO', 'OUTRO']).optional(),
    minutos_parado: z.number().min(0).optional(),
    descricao: z.string().trim().nullish(),
    acao: z.string().trim().nullish(),
    resolvida: z.number().int().optional(),
  }),
  listaSql: `SELECT oc.*, d.nome AS departamento, o.numero AS ordem, e.nome AS equipamento
             FROM ocorrencias oc
             LEFT JOIN departamentos d ON d.id = oc.departamento_id
             LEFT JOIN ordens_producao o ON o.id = oc.ordem_id
             LEFT JOIN equipamentos e ON e.id = oc.equipamento_id`,
  ordem: 'oc.data DESC, oc.id DESC',
  busca: ['oc.descricao', 'oc.acao'],
  ordenaveis: ['oc.data', 'oc.minutos_parado'],
  filtros: {
    motivo: { tipo: 'igual', coluna: 'oc.motivo' },
    departamento_id: { tipo: 'igual', coluna: 'oc.departamento_id', numero: true },
    equipamento_id: { tipo: 'igual', coluna: 'oc.equipamento_id', numero: true },
    resolvida: { tipo: 'igual', coluna: 'oc.resolvida', numero: true },
    de: { tipo: 'de', coluna: 'oc.data' },
    ate: { tipo: 'ate', coluna: 'oc.data' },
  },
});

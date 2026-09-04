import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { crudRouter } from '../lib/crud.js';
import { asyncHandler } from '../lib/errors.js';
import {
  jornada, parametros, custoMinutoDepartamento,
  capacidadeProdutivaMes, taxaCustoIndireto,
} from '../services/custeio.js';

const texto = z.string().trim().min(1);
const opcional = z.string().trim().nullish();

export const router = Router();

router.use(
  '/departamentos',
  crudRouter({
    tabela: 'departamentos',
    campos: ['nome', 'responsavel', 'produtivo', 'observacao', 'ativo'],
    schema: z.object({
      nome: texto,
      responsavel: opcional,
      produtivo: z.number().int().optional(),
      observacao: opcional,
      ativo: z.number().int().optional(),
    }),
    listaSql: `SELECT d.*,
                 (SELECT COUNT(*) FROM colaboradores c
                   WHERE c.departamento_id = d.id AND c.status = 'ATIVO' AND c.ativo = 1) AS pessoas,
                 (SELECT COUNT(*) FROM equipamentos e WHERE e.departamento_id = d.id AND e.ativo = 1) AS equipamentos
               FROM departamentos d`,
    ordem: 'd.nome',
    busca: ['d.nome'],
  })
);

router.use(
  '/equipamentos',
  crudRouter({
    tabela: 'equipamentos',
    campos: ['nome', 'tipo', 'departamento_id', 'patrimonio', 'quantidade', 'status', 'observacao', 'ativo'],
    schema: z.object({
      nome: texto,
      tipo: opcional,
      departamento_id: z.number().int().nullish(),
      patrimonio: opcional,
      quantidade: z.number().int().min(1).optional(),
      status: z.enum(['ATIVO', 'MANUTENCAO', 'PARADO', 'BAIXADO']).optional(),
      observacao: opcional,
      ativo: z.number().int().optional(),
    }),
    listaSql: `SELECT e.*, d.nome AS departamento FROM equipamentos e
               LEFT JOIN departamentos d ON d.id = e.departamento_id`,
    ordem: 'e.nome',
    busca: ['e.nome', 'e.patrimonio'],
  })
);

router.use(
  '/custos-fixos',
  crudRouter({
    tabela: 'custos_fixos',
    campos: ['descricao', 'tipo', 'valor_mensal', 'observacao', 'ativo'],
    schema: z.object({
      descricao: texto,
      tipo: z.enum(['ALUGUEL', 'ENERGIA', 'AGUA', 'MANUTENCAO', 'ADMINISTRATIVO',
                    'IMPOSTO', 'SEGURO', 'DEPRECIACAO', 'SOFTWARE', 'OUTRO']).optional(),
      valor_mensal: z.number().min(0).optional(),
      observacao: opcional,
      ativo: z.number().int().optional(),
    }),
    ordem: 'valor_mensal DESC',
    busca: ['descricao'],
  })
);

/** Jornada e parâmetros da fábrica — a linha única que sustenta o custeio. */
router.get('/parametros', asyncHandler((_req, res) => res.json(jornada())));

router.put(
  '/parametros',
  asyncHandler((req, res) => {
    const dados = z
      .object({
        jornada_inicio: z.string().trim().optional(),
        jornada_fim: z.string().trim().optional(),
        intervalo_min: z.number().int().min(0).optional(),
        dias_semana: z.string().trim().optional(),
        dias_uteis_mes: z.number().int().min(1).max(31).optional(),
        encargos_percentual: z.number().min(0).optional(),
        ocupacao_percentual: z.number().min(1).max(100).optional(),
        extensao_fim: z.string().trim().nullish(),
        sabado_inicio: z.string().trim().nullish(),
        sabado_fim: z.string().trim().nullish(),
      })
      .parse(req.body);

    const db = getDb();
    const atual = parametros(db);
    const campos = Object.keys(dados);
    if (campos.length) {
      db.prepare(
        `UPDATE parametros SET ${campos.map((c) => `${c} = @${c}`).join(', ')},
         atualizado_em = datetime('now') WHERE id = 1`
      ).run(Object.fromEntries(campos.map((c) => [c, dados[c] ?? atual[c]])));
    }
    res.json(jornada(db));
  })
);

/** Custo do minuto de cada setor, com os avisos de folha incompleta. */
router.get(
  '/custo-setores',
  asyncHandler((_req, res) => {
    const db = getDb();
    const setores = db.prepare(`SELECT id FROM departamentos WHERE ativo = 1 ORDER BY nome`).all();
    res.json(setores.map((s) => custoMinutoDepartamento(s.id, db)));
  })
);

router.get('/capacidade', asyncHandler((_req, res) => res.json(capacidadeProdutivaMes())));
router.get('/custo-indireto', asyncHandler((_req, res) => res.json(taxaCustoIndireto())));

import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { crudRouter } from '../lib/crud.js';
import { asyncHandler, notFound } from '../lib/errors.js';
import { exigir } from '../middleware/auth.js';
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
    escrita: 'engenharia.editar',
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
    busca: ['d.nome', 'd.responsavel'],
    ordenaveis: ['d.nome'],
    filtros: { produtivo: { tipo: 'igual', coluna: 'd.produtivo', numero: true } },
  })
);

router.use(
  '/equipamentos',
  crudRouter({
    tabela: 'equipamentos',
    escrita: 'engenharia.editar',
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
    busca: ['e.nome', 'e.patrimonio', 'e.tipo'],
    ordenaveis: ['e.nome', 'e.tipo', 'e.quantidade'],
    filtros: {
      departamento_id: { tipo: 'igual', coluna: 'e.departamento_id', numero: true },
      status: { tipo: 'igual', coluna: 'e.status' },
      tipo: { tipo: 'igual', coluna: 'e.tipo' },
    },
  })
);

router.use(
  '/custos-fixos',
  crudRouter({
    tabela: 'custos_fixos',
    escrita: 'engenharia.jornada',
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
    busca: ['descricao', 'observacao'],
    ordenaveis: ['descricao', 'valor_mensal', 'tipo'],
    filtros: { tipo: { tipo: 'igual', coluna: 'tipo' } },
  })
);

/** Jornada e parâmetros da fábrica — a linha única que sustenta o custeio. */
router.get('/parametros', asyncHandler((_req, res) => res.json(jornada())));

router.put(
  '/parametros',
  exigir('engenharia.jornada'),
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

/* ---- Aferição de tempo: cronometrar a operação para achar o tempo padrão ---- */

router.post(
  '/afericoes',
  exigir('producao.apontar', 'engenharia.editar'),
  asyncHandler((req, res) => {
    const dados = z
      .object({
        produto_id: z.number().int(),
        etapa_id: z.number().int(),
        colaborador_id: z.number().int().nullish(),
        equipamento_id: z.number().int().nullish(),
        data: z.string().trim().optional(),
        pecas: z.number().positive(),
        minutos: z.number().positive(),
        observacao: opcional,
      })
      .parse(req.body);

    const info = getDb()
      .prepare(
        `INSERT INTO afericoes (produto_id, etapa_id, colaborador_id, equipamento_id, data, pecas, minutos, observacao, usuario_id)
         VALUES (@produto_id, @etapa_id, @colaborador_id, @equipamento_id, @data, @pecas, @minutos, @observacao, @usuario_id)`
      )
      .run({
        ...dados,
        colaborador_id: dados.colaborador_id ?? null,
        equipamento_id: dados.equipamento_id ?? null,
        data: dados.data || new Date().toISOString().slice(0, 10),
        observacao: dados.observacao ?? null,
        usuario_id: req.usuario?.sub ?? null,
      });
    res.status(201).json({ id: info.lastInsertRowid, ok: true });
  })
);

router.get(
  '/afericoes',
  asyncHandler((req, res) => {
    const where = [];
    const params = [];
    if (req.query.produto_id) { where.push('a.produto_id = ?'); params.push(Number(req.query.produto_id)); }
    if (req.query.etapa_id) { where.push('a.etapa_id = ?'); params.push(Number(req.query.etapa_id)); }

    res.json(
      getDb()
        .prepare(
          `SELECT a.*, p.descricao AS produto, e.nome AS etapa, c.nome AS colaborador,
                  eq.nome AS equipamento,
                  ROUND(a.minutos / a.pecas, 4) AS tempo_por_peca,
                  ROUND(60.0 * a.pecas / a.minutos, 2) AS pecas_hora
           FROM afericoes a
           JOIN produtos p ON p.id = a.produto_id
           JOIN etapas e ON e.id = a.etapa_id
           LEFT JOIN colaboradores c ON c.id = a.colaborador_id
           LEFT JOIN equipamentos eq ON eq.id = a.equipamento_id
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY a.data DESC, a.id DESC LIMIT 300`
        )
        .all(...params)
    );
  })
);

/**
 * Média aferida de cada operação de um produto — a base para definir o tempo
 * padrão do processo com número medido, não com estimativa.
 */
router.get(
  '/afericoes/:produtoId/media',
  asyncHandler((req, res) => {
    res.json(
      getDb()
        .prepare(
          `SELECT a.etapa_id, e.nome AS etapa, e.ordem,
                  COUNT(*) AS medicoes,
                  ROUND(SUM(a.minutos) / SUM(a.pecas), 4) AS tempo_por_peca,
                  ROUND(MIN(a.minutos / a.pecas), 4) AS melhor,
                  ROUND(MAX(a.minutos / a.pecas), 4) AS pior,
                  (SELECT pp.tempo_por_peca_min FROM produto_processo pp
                    WHERE pp.produto_id = a.produto_id AND pp.etapa_id = a.etapa_id) AS tempo_padrao
           FROM afericoes a JOIN etapas e ON e.id = a.etapa_id
           WHERE a.produto_id = ?
           GROUP BY a.etapa_id ORDER BY e.ordem`
        )
        .all(req.params.produtoId)
    );
  })
);

router.delete(
  '/afericoes/:id',
  exigir('producao.apontar', 'engenharia.editar'),
  asyncHandler((req, res) => {
    const info = getDb().prepare(`DELETE FROM afericoes WHERE id = ?`).run(req.params.id);
    if (info.changes === 0) throw notFound('Aferição não encontrada');
    res.json({ ok: true });
  })
);

/**
 * Fichas de produção: o dossiê da ordem e os cadastros que o alimentam.
 *
 * Leitura para quem acompanha a produção; escrita separada em duas chaves —
 * quem monta a ficha do produto (arte, instrução, imagem) precisa de
 * `produtos.processo`, e quem preenche o que aconteceu no chão de fábrica
 * (grade, início e término da operação) precisa de `producao.ordens`.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { asyncHandler, notFound, badRequest } from '../lib/errors.js';
import { exigir } from '../middleware/auth.js';
import {
  montarFicha,
  salvarGrade,
  gradeDoItem,
  garantirOperacoes,
  apontarOperacao,
  arteDoProduto,
  salvarArte,
  instrucoesDoProduto,
  imagensDoProduto,
  setorValido,
  SETORES,
  TAMANHOS,
  VIAS,
} from '../services/fichas.js';
import { fichaHtml } from '../services/fichas-html.js';

export const router = Router();

const idDaRota = (req, campo = 'id') => {
  const id = Number(req.params[campo]);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Identificador inválido');
  return id;
};

const viasDaQuery = (query) =>
  String(query.vias || '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);

/** Catálogo das vias, tamanhos e setores — a tela monta os seletores a partir daqui. */
router.get('/opcoes', (_req, res) => res.json({ vias: VIAS, setores: SETORES, tamanhos: TAMANHOS }));

/** Dossiê completo da ordem, em JSON. */
router.get(
  '/ordens/:id',
  asyncHandler((req, res) => {
    res.json(montarFicha(idDaRota(req), { vias: viasDaQuery(req.query) }));
  })
);

/**
 * Dossiê pronto para impressão.
 *
 * Sai como HTML e não como PDF de propósito: o navegador imprime (ou salva em
 * PDF) com as fontes e as cores do documento, sem uma dependência a mais no
 * servidor para gerar o que a impressora já sabe fazer.
 */
router.get(
  '/ordens/:id/impressao',
  asyncHandler((req, res) => {
    const ficha = montarFicha(idDaRota(req), { vias: viasDaQuery(req.query) });
    res.type('html').send(fichaHtml(ficha));
  })
);

/** Sequência operacional da ordem (copiada do padrão na primeira leitura). */
router.get(
  '/ordens/:id/operacoes',
  asyncHandler((req, res) => res.json(garantirOperacoes(idDaRota(req))))
);

const operacaoSchema = z.object({
  inicio: z.string().trim().nullish(),
  termino: z.string().trim().nullish(),
  operador: z.string().trim().nullish(),
  maquina: z.string().trim().nullish(),
  observacao: z.string().trim().nullish(),
});

router.patch(
  '/operacoes/:id',
  exigir('producao.ordens'),
  asyncHandler((req, res) => {
    res.json(apontarOperacao(idDaRota(req), operacaoSchema.parse(req.body)));
  })
);

/** Grade de tamanhos do item de pedido. */
router.get(
  '/itens/:id/grade',
  asyncHandler((req, res) => {
    const id = idDaRota(req);
    const item = getDb().prepare(`SELECT id, quantidade FROM pedido_itens WHERE id = ?`).get(id);
    if (!item) throw notFound('Item de pedido não encontrado');
    res.json(gradeDoItem(id, item.quantidade));
  })
);

const gradeSchema = z.object({
  linhas: z.array(z.object({ tamanho: z.string(), quantidade: z.number().min(0) })).default([]),
});

router.put(
  '/itens/:id/grade',
  exigir('pedidos.editar'),
  asyncHandler((req, res) => {
    res.json(salvarGrade(idDaRota(req), gradeSchema.parse(req.body).linhas));
  })
);

/** Ficha do produto: arte, instruções e imagens que as vias imprimem. */
router.get(
  '/produtos/:id',
  asyncHandler((req, res) => {
    const id = idDaRota(req);
    const produto = getDb().prepare(`SELECT id, codigo, descricao FROM produtos WHERE id = ?`).get(id);
    if (!produto) throw notFound('Produto não encontrado');
    res.json({
      produto,
      arte: arteDoProduto(id),
      instrucoes: instrucoesDoProduto(id),
      imagens: imagensDoProduto(id),
    });
  })
);

const arteSchema = z.object({
  personalizacao: z.enum(['SILK', 'TRANSFER', 'BORDADO', 'SUBLIMACAO', 'SEM']).optional(),
  origem_arte: z.enum(['VETOR', 'IMAGEM']).optional(),
  base_tinta: z.enum(['AGUA', 'VINILICA']).nullish(),
  tinta_pronta: z.union([z.boolean(), z.number()]).optional(),
  observacao: z.string().trim().nullish(),
});

router.put(
  '/produtos/:id/arte',
  exigir('produtos.processo'),
  asyncHandler((req, res) => res.json(salvarArte(idDaRota(req), arteSchema.parse(req.body))))
);

const logoSchema = z.object({
  descricao: z.string().trim().min(1),
  posicao: z.string().trim().nullish(),
  largura_cm: z.number().min(0).nullish(),
  altura_cm: z.number().min(0).nullish(),
  cor: z.string().trim().nullish(),
  cor_hex: z.string().trim().nullish(),
  ordem: z.number().int().optional(),
});

router.post(
  '/produtos/:id/logos',
  exigir('produtos.processo'),
  asyncHandler((req, res) => {
    const id = idDaRota(req);
    const d = logoSchema.parse(req.body);
    const info = getDb()
      .prepare(
        `INSERT INTO arte_logos (produto_id, descricao, posicao, largura_cm, altura_cm, cor, cor_hex, ordem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, d.descricao, d.posicao ?? null, d.largura_cm ?? null, d.altura_cm ?? null,
           d.cor ?? null, d.cor_hex ?? null, d.ordem ?? 0);
    res.status(201).json(getDb().prepare(`SELECT * FROM arte_logos WHERE id = ?`).get(info.lastInsertRowid));
  })
);

router.delete(
  '/logos/:id',
  exigir('produtos.processo'),
  asyncHandler((req, res) => {
    const info = getDb().prepare(`DELETE FROM arte_logos WHERE id = ?`).run(idDaRota(req));
    if (info.changes === 0) throw notFound('Logo não encontrado');
    res.status(204).end();
  })
);

const coresSchema = z.object({
  cores: z
    .array(
      z.object({
        sequencia: z.number().int().min(1).max(12),
        nome: z.string().trim().min(1),
        referencia: z.string().trim().nullish(),
        hex: z.string().trim().nullish(),
      })
    )
    .default([]),
});

/** A receita de tinta é substituída inteira: é uma lista curta e ordenada. */
router.put(
  '/produtos/:id/cores',
  exigir('produtos.processo'),
  asyncHandler((req, res) => {
    const id = idDaRota(req);
    const { cores } = coresSchema.parse(req.body);
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM arte_cores WHERE produto_id = ?`).run(id);
      const ins = db.prepare(
        `INSERT INTO arte_cores (produto_id, sequencia, nome, referencia, hex) VALUES (?, ?, ?, ?, ?)`
      );
      for (const c of cores) ins.run(id, c.sequencia, c.nome, c.referencia ?? null, c.hex ?? null);
    });
    tx();
    res.json(arteDoProduto(id));
  })
);

const instrucaoSchema = z.object({
  setor: z.string().trim(),
  texto: z.string().trim().min(1),
  destaque: z.union([z.boolean(), z.number()]).optional(),
  ordem: z.number().int().optional(),
});

router.post(
  '/produtos/:id/instrucoes',
  exigir('produtos.processo'),
  asyncHandler((req, res) => {
    const id = idDaRota(req);
    const d = instrucaoSchema.parse(req.body);
    const setor = d.setor.toUpperCase();
    if (!setorValido(setor)) throw badRequest(`Setor inválido: ${d.setor}`, { aceitos: SETORES });
    const info = getDb()
      .prepare(`INSERT INTO produto_instrucoes (produto_id, setor, texto, destaque, ordem) VALUES (?, ?, ?, ?, ?)`)
      .run(id, setor, d.texto, d.destaque ? 1 : 0, d.ordem ?? 0);
    res.status(201).json(getDb().prepare(`SELECT * FROM produto_instrucoes WHERE id = ?`).get(info.lastInsertRowid));
  })
);

router.delete(
  '/instrucoes/:id',
  exigir('produtos.processo'),
  asyncHandler((req, res) => {
    const info = getDb().prepare(`DELETE FROM produto_instrucoes WHERE id = ?`).run(idDaRota(req));
    if (info.changes === 0) throw notFound('Instrução não encontrada');
    res.status(204).end();
  })
);

/**
 * Imagem da ficha, guardada como data URI.
 *
 * O limite de 2 MB é o que separa uma foto útil de um banco que engorda a cada
 * ordem impressa — e a via precisa mesmo é de uma imagem legível em A4.
 */
const imagemSchema = z.object({
  setor: z.string().trim().default('PRODUCAO'),
  titulo: z.string().trim().nullish(),
  arquivo: z
    .string()
    .regex(/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i, 'Envie uma imagem em data URI')
    .max(2 * 1024 * 1024, 'Imagem acima de 2 MB'),
  ordem: z.number().int().optional(),
});

router.post(
  '/produtos/:id/imagens',
  exigir('produtos.processo'),
  asyncHandler((req, res) => {
    const id = idDaRota(req);
    const d = imagemSchema.parse(req.body);
    const setor = d.setor.toUpperCase();
    if (!setorValido(setor)) throw badRequest(`Setor inválido: ${d.setor}`, { aceitos: SETORES });
    const info = getDb()
      .prepare(`INSERT INTO produto_imagens (produto_id, setor, titulo, arquivo, ordem) VALUES (?, ?, ?, ?, ?)`)
      .run(id, setor, d.titulo ?? null, d.arquivo, d.ordem ?? 0);
    res.status(201).json({ id: info.lastInsertRowid, setor, titulo: d.titulo ?? null });
  })
);

router.delete(
  '/imagens/:id',
  exigir('produtos.processo'),
  asyncHandler((req, res) => {
    const info = getDb().prepare(`DELETE FROM produto_imagens WHERE id = ?`).run(idDaRota(req));
    if (info.changes === 0) throw notFound('Imagem não encontrada');
    res.status(204).end();
  })
);

/** Sequência operacional padrão dos setores — editável pela engenharia. */
export const operacoesPadrao = Router();

operacoesPadrao.get(
  '/',
  asyncHandler((_req, res) =>
    res.json(getDb().prepare(`SELECT * FROM operacoes_setor ORDER BY setor, sequencia`).all())
  )
);

const operacaoPadraoSchema = z.object({
  setor: z.string().trim(),
  sequencia: z.number().int().min(1),
  nome: z.string().trim().min(1),
  maquina: z.string().trim().nullish(),
  ativo: z.number().int().optional(),
});

operacoesPadrao.post(
  '/',
  exigir('engenharia.editar'),
  asyncHandler((req, res) => {
    const d = operacaoPadraoSchema.parse(req.body);
    const setor = d.setor.toUpperCase();
    if (!setorValido(setor)) throw badRequest(`Setor inválido: ${d.setor}`, { aceitos: SETORES });
    const info = getDb()
      .prepare(
        `INSERT INTO operacoes_setor (setor, sequencia, nome, maquina, ativo) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(setor, nome) DO UPDATE SET sequencia = excluded.sequencia,
           maquina = excluded.maquina, ativo = excluded.ativo`
      )
      .run(setor, d.sequencia, d.nome, d.maquina ?? null, d.ativo ?? 1);
    res.status(201).json({ id: info.lastInsertRowid, setor, ...d });
  })
);

operacoesPadrao.delete(
  '/:id',
  exigir('engenharia.editar'),
  asyncHandler((req, res) => {
    const info = getDb().prepare(`DELETE FROM operacoes_setor WHERE id = ?`).run(idDaRota(req));
    if (info.changes === 0) throw notFound('Operação não encontrada');
    res.status(204).end();
  })
);

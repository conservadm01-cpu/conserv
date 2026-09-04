import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { asyncHandler, notFound } from '../lib/errors.js';
import { montarFiltros, limitar } from '../lib/filtros.js';

export const router = Router();

const TIPOS = ['SUGESTAO', 'PROBLEMA', 'RISCO', 'RELATO', 'ELOGIO'];

/**
 * Conversa aberta: qualquer pessoa registra sugestão, problema ou risco —
 * anonimamente se quiser. Por isso o envio fica FORA da autenticação
 * (montado antes do middleware de sessão em index.js).
 */
export const publico = Router();

publico.post(
  '/manifestacoes',
  asyncHandler((req, res) => {
    const dados = z
      .object({
        tipo: z.enum(TIPOS).default('SUGESTAO'),
        assunto: z.string().trim().nullish(),
        mensagem: z.string().trim().min(3, 'Escreva ao menos algumas palavras'),
        autor: z.string().trim().nullish(),
        setor: z.string().trim().nullish(),
        anonima: z.boolean().default(true),
      })
      .parse(req.body);

    const info = getDb()
      .prepare(
        `INSERT INTO manifestacoes (tipo, assunto, mensagem, autor, anonima, setor)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        dados.tipo,
        dados.assunto ?? null,
        dados.mensagem,
        dados.anonima ? null : (dados.autor ?? null),
        dados.anonima ? 1 : 0,
        dados.setor ?? null
      );
    res.status(201).json({ id: info.lastInsertRowid, ok: true });
  })
);

router.get(
  '/manifestacoes',
  asyncHandler((req, res) => {
    const f = montarFiltros(req.query, {
      busca: { tipo: 'busca', colunas: ['assunto', 'mensagem', 'setor', 'tratativa'] },
      status: { tipo: 'igual', coluna: 'status' },
      tipo: { tipo: 'igual', coluna: 'tipo' },
      setor: { tipo: 'igual', coluna: 'setor' },
      de: { tipo: 'de', coluna: 'criado_em' },
      ate: { tipo: 'ate', coluna: 'criado_em' },
      anonimas: { tipo: 'booleano', quandoVerdadeiro: 'anonima = 1' },
    });
    res.json(
      getDb()
        .prepare(
          `SELECT * FROM manifestacoes${f.sql}
           ORDER BY CASE status WHEN 'ABERTA' THEN 0 WHEN 'EM_ANALISE' THEN 1 ELSE 2 END,
                    criado_em DESC LIMIT ?`
        )
        .all(...f.params, limitar(req.query, 500))
    );
  })
);

router.put(
  '/manifestacoes/:id',
  asyncHandler((req, res) => {
    const dados = z
      .object({
        status: z.enum(['ABERTA', 'EM_ANALISE', 'RESOLVIDA', 'ARQUIVADA']).optional(),
        tratativa: z.string().trim().nullish(),
      })
      .parse(req.body);

    const db = getDb();
    const atual = db.prepare(`SELECT * FROM manifestacoes WHERE id = ?`).get(req.params.id);
    if (!atual) throw notFound('Manifestação não encontrada');

    const status = dados.status ?? atual.status;
    db.prepare(
      `UPDATE manifestacoes SET status = ?, tratativa = ?, respondido_em = ? WHERE id = ?`
    ).run(
      status,
      dados.tratativa !== undefined ? dados.tratativa : atual.tratativa,
      status === 'ABERTA' ? null : (atual.respondido_em ?? new Date().toISOString()),
      atual.id
    );
    res.json(db.prepare(`SELECT * FROM manifestacoes WHERE id = ?`).get(atual.id));
  })
);

router.get(
  '/resumo',
  asyncHandler((_req, res) => {
    res.json(
      getDb()
        .prepare(
          `SELECT tipo, status, COUNT(*) AS total FROM manifestacoes GROUP BY tipo, status`
        )
        .all()
    );
  })
);

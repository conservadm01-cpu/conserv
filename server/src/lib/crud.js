import { Router } from 'express';
import { getDb } from '../db/index.js';
import { asyncHandler, notFound, badRequest } from './errors.js';

/**
 * Monta um CRUD REST padrão sobre uma tabela.
 *
 * @param {object} opts
 * @param {string} opts.tabela      nome da tabela
 * @param {string[]} opts.campos    colunas graváveis
 * @param {import('zod').ZodType} opts.schema  validação do corpo (create); update usa .partial()
 * @param {string} [opts.listaSql]  SELECT alternativo para a listagem (com joins)
 * @param {string} [opts.ordem]     ORDER BY padrão
 * @param {string[]} [opts.busca]   colunas usadas pelo parâmetro ?busca=
 * @param {string} [opts.alias]    apelido da tabela dentro de listaSql (para o filtro ?ativo=)
 */
export function crudRouter({ tabela, campos, schema, listaSql, ordem = 'id DESC', busca = [], alias }) {
  const router = Router();
  const base = listaSql || `SELECT * FROM ${tabela}`;
  // Consultas com join apelidam a tabela; o filtro precisa usar o mesmo apelido.
  const prefixo = alias || apelidoDe(listaSql, tabela) || tabela;

  router.get(
    '/',
    asyncHandler((req, res) => {
      const db = getDb();
      const where = [];
      const params = [];
      if (req.query.busca && busca.length) {
        where.push(`(${busca.map((c) => `${c} LIKE ?`).join(' OR ')})`);
        busca.forEach(() => params.push(`%${req.query.busca}%`));
      }
      if (req.query.ativo !== undefined && campos.includes('ativo')) {
        where.push(`${prefixo}.ativo = ?`);
        params.push(req.query.ativo === 'false' || req.query.ativo === '0' ? 0 : 1);
      }
      const sql = `${base}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${ordem}`;
      res.json(db.prepare(sql).all(...params));
    })
  );

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const row = getDb().prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(req.params.id);
      if (!row) throw notFound();
      res.json(row);
    })
  );

  router.post(
    '/',
    asyncHandler((req, res) => {
      const dados = schema.parse(req.body);
      const cols = campos.filter((c) => dados[c] !== undefined);
      if (cols.length === 0) throw badRequest('Nenhum campo informado');
      const info = getDb()
        .prepare(
          `INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`
        )
        .run(somenteColunas(dados, cols));
      res.status(201).json(getDb().prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(info.lastInsertRowid));
    })
  );

  router.put(
    '/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const atual = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(req.params.id);
      if (!atual) throw notFound();
      const dados = schema.partial().parse(req.body);
      const cols = campos.filter((c) => dados[c] !== undefined);
      if (cols.length === 0) throw badRequest('Nenhum campo para atualizar');
      db.prepare(`UPDATE ${tabela} SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`)
        .run({ ...somenteColunas(dados, cols), id: Number(req.params.id) });
      res.json(db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(req.params.id));
    })
  );

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      const db = getDb();
      const atual = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(req.params.id);
      if (!atual) throw notFound();
      // Cadastros com histórico são inativados, não apagados.
      if (campos.includes('ativo')) {
        db.prepare(`UPDATE ${tabela} SET ativo = 0 WHERE id = ?`).run(req.params.id);
        return res.json({ ok: true, inativado: true });
      }
      db.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(req.params.id);
      res.json({ ok: true, removido: true });
    })
  );

  return router;
}

/** Lê o apelido dado à tabela no FROM do SELECT customizado ("FROM produtos p" → "p"). */
function apelidoDe(listaSql, tabela) {
  if (!listaSql) return null;
  const m = new RegExp(`FROM\\s+${tabela}\\s+(?:AS\\s+)?([a-z_][a-z0-9_]*)`, 'i').exec(listaSql);
  return m && m[1].toLowerCase() !== 'where' ? m[1] : null;
}

/** better-sqlite3 recusa parâmetros nomeados que a query não usa — filtramos antes de vincular. */
function somenteColunas(dados, cols) {
  return Object.fromEntries(cols.map((c) => [c, dados[c] ?? null]));
}

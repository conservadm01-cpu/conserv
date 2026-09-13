import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const aqui = path.dirname(fileURLToPath(import.meta.url));

/**
 * Banco do núcleo.
 *
 * Fica num arquivo próprio, separado do sistema antigo: enquanto os dois
 * convivem, migrar não pode significar arriscar o que já está em produção.
 */
let banco = null;

export function getDb() {
  if (banco) return banco;
  const caminho = process.env.NUCLEO_DB_PATH
    ?? path.join(aqui, '../../../data/nucleo.db');
  fs.mkdirSync(path.dirname(caminho), { recursive: true });

  banco = new Database(caminho);
  banco.pragma('journal_mode = WAL');
  banco.pragma('foreign_keys = ON');
  return banco;
}

export function migrar(db = getDb()) {
  db.exec(fs.readFileSync(path.join(aqui, 'schema.sql'), 'utf8'));
  return db;
}

/** Fecha e esquece — usado pelos testes entre cenários. */
export function fechar() {
  if (banco) { banco.close(); banco = null; }
}

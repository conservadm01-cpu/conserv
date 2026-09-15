import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let instance = null;

/** Abre (e cria, se necessário) a conexão única com o banco. */
export function getDb() {
  if (instance) return instance;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  instance = new Database(config.dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  return instance;
}

/** Aplica o schema. Idempotente: rodar de novo não muda nada. */
export function migrate(db = getDb()) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
  return db;
}

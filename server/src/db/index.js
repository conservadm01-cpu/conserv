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

/** Aplica o schema (idempotente) e os dados fixos de etapas. */
export function migrate(db = getDb()) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
  seedEtapas(db);
  return db;
}

/**
 * Etapas do processo produtivo da Conserv, na ordem em que acontecem no chão de fábrica.
 * São dados estruturais (o PCP inteiro se apoia nelas), por isso vivem na migração.
 */
export const ETAPAS_PADRAO = [
  { codigo: 'MATERIA_PRIMA', nome: 'Matéria-prima', ordem: 1, consome_material: 1 },
  { codigo: 'CORTE',         nome: 'Corte',         ordem: 2, consome_material: 0 },
  { codigo: 'SILK',          nome: 'Silk',          ordem: 3, consome_material: 0 },
  { codigo: 'COSTURA',       nome: 'Costura',       ordem: 4, consome_material: 0 },
  { codigo: 'EMBALAGEM',     nome: 'Embalagem',     ordem: 5, consome_material: 0 },
  { codigo: 'NF',            nome: 'Nota fiscal',   ordem: 6, consome_material: 0 },
  { codigo: 'ENTREGA',       nome: 'Entrega',       ordem: 7, consome_material: 0 },
];

function seedEtapas(db) {
  const insert = db.prepare(
    `INSERT INTO etapas (codigo, nome, ordem, consome_material) VALUES (?, ?, ?, ?)
     ON CONFLICT(codigo) DO UPDATE SET nome = excluded.nome, ordem = excluded.ordem`
  );
  const tx = db.transaction((etapas) => {
    for (const e of etapas) insert.run(e.codigo, e.nome, e.ordem, e.consome_material);
  });
  tx(ETAPAS_PADRAO);
}

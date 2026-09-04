import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { aplicarMigracoes } from './migracoes.js';

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

/** Aplica o schema, as migrações incrementais e os dados fixos. Idempotente. */
export function migrate(db = getDb()) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
  aplicarMigracoes(db);
  seedEtapas(db);
  seedEstruturaFabrica(db);
  return db;
}

/**
 * Etapas do processo produtivo da Conserv, na ordem em que acontecem no chão de fábrica.
 * São dados estruturais (o PCP inteiro se apoia nelas), por isso vivem na migração.
 */
export const ETAPAS_PADRAO = [
  { codigo: 'MATERIA_PRIMA', nome: 'Matéria-prima', ordem: 1, consome_material: 1, setor: 'ALMOXARIFADO' },
  { codigo: 'CORTE',         nome: 'Corte',         ordem: 2, consome_material: 0, setor: 'CORTE' },
  { codigo: 'SILK',          nome: 'Silk',          ordem: 3, consome_material: 0, setor: 'SILK' },
  { codigo: 'COSTURA',       nome: 'Costura',       ordem: 4, consome_material: 0, setor: 'COSTURA' },
  { codigo: 'EMBALAGEM',     nome: 'Embalagem',     ordem: 5, consome_material: 0, setor: 'EMBALAGEM' },
  { codigo: 'NF',            nome: 'Nota fiscal',   ordem: 6, consome_material: 0, setor: 'EXPEDICAO' },
  { codigo: 'ENTREGA',       nome: 'Entrega',       ordem: 7, consome_material: 0, setor: 'EXPEDICAO' },
];

/**
 * Estrutura mínima para o custeio funcionar: um setor por etapa do roteiro,
 * um local de estoque e a linha única de parâmetros da fábrica.
 */
function seedEstruturaFabrica(db) {
  db.prepare(
    `INSERT INTO parametros (id) VALUES (1) ON CONFLICT(id) DO NOTHING`
  ).run();

  db.prepare(
    `INSERT INTO locais_estoque (nome, tipo) VALUES ('ALMOXARIFADO', 'ALMOXARIFADO')
     ON CONFLICT(nome) DO NOTHING`
  ).run();

  const inserirDepto = db.prepare(
    `INSERT INTO departamentos (nome, produtivo) VALUES (?, 1) ON CONFLICT(nome) DO NOTHING`
  );
  const vincular = db.prepare(
    `UPDATE etapas SET departamento_id = (SELECT id FROM departamentos WHERE nome = ?)
     WHERE codigo = ? AND departamento_id IS NULL`
  );
  const tx = db.transaction(() => {
    for (const e of ETAPAS_PADRAO) {
      if (!e.setor) continue;
      inserirDepto.run(e.setor);
      vincular.run(e.setor, e.codigo);
    }
  });
  tx();
}

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

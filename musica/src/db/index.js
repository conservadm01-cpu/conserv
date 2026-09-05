import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let banco = null;

/** Abre (e cria, se preciso) o banco do app. `:memory:` serve aos testes. */
export function db() {
  if (banco) return banco;
  if (config.dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  }
  banco = new DatabaseSync(config.dbPath);
  banco.exec('PRAGMA foreign_keys = ON;');
  return banco;
}

export function migrar() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db().exec(sql);
}

export function fechar() {
  if (banco) banco.close();
  banco = null;
}

// node:sqlite não aceita undefined nem boolean como parâmetro; a conversão fica
// aqui para as rotas não precisarem lembrar disso a cada consulta.
function limpar(params) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

export const todos = (sql, ...params) => db().prepare(sql).all(...limpar(params));
export const um = (sql, ...params) => db().prepare(sql).get(...limpar(params)) ?? null;
export const rodar = (sql, ...params) => db().prepare(sql).run(...limpar(params));

/**
 * Insere e devolve a linha criada. Campo com `undefined` é omitido do INSERT —
 * é assim que o DEFAULT da tabela (a data de hoje, por exemplo) continua valendo.
 */
export function inserir(tabela, dados) {
  const campos = Object.keys(dados).filter((c) => dados[c] !== undefined);
  const marcadores = campos.map(() => '?').join(', ');
  const info = rodar(
    `INSERT INTO ${tabela} (${campos.join(', ')}) VALUES (${marcadores})`,
    ...campos.map((c) => dados[c]),
  );
  return um(`SELECT * FROM ${tabela} WHERE id = ?`, Number(info.lastInsertRowid));
}

/** Atualiza só os campos presentes em `dados` e devolve a linha. */
export function atualizar(tabela, id, dados) {
  const campos = Object.keys(dados).filter((c) => dados[c] !== undefined);
  if (campos.length) {
    rodar(
      `UPDATE ${tabela} SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      ...campos.map((c) => dados[c]),
      id,
    );
  }
  return um(`SELECT * FROM ${tabela} WHERE id = ?`, id);
}

export function transacao(fn) {
  const conexao = db();
  conexao.exec('BEGIN');
  try {
    const saida = fn();
    conexao.exec('COMMIT');
    return saida;
  } catch (erro) {
    conexao.exec('ROLLBACK');
    throw erro;
  }
}

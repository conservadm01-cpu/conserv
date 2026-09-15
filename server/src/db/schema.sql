PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- A BASE DO CSVSIST
-- ============================================================

/*
 * O sistema trabalha com um documento só — um JSON com todas as coleções
 * (colaboradores, materiais, saldos, movimentações, ordens, engenharia…) — e é
 * assim que ele é guardado aqui: inteiro, com número de versão.
 *
 * Guardar o documento inteiro, em vez de espalhá-lo em tabelas, é uma escolha
 * e tem um motivo: as regras do negócio vivem no app, que trabalha sobre esse
 * documento. Quebrá-lo em tabelas exigiria manter duas verdades sobre a mesma
 * coisa — e a que diverge sempre é a que ninguém está olhando.
 *
 * A versão é o que impede que duas pessoas gravando ao mesmo tempo apaguem o
 * trabalho uma da outra: quem grava informa a versão que leu, e a gravação que
 * chegou velha é recusada em vez de passar por cima.
 *
 * Uma linha só (id = 1): é a base da fábrica.
 */
CREATE TABLE IF NOT EXISTS app_estado (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  documento      TEXT    NOT NULL,
  versao         INTEGER NOT NULL DEFAULT 0,
  atualizado_em  TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_por TEXT
);

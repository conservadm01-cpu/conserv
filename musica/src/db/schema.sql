-- CLAVE — acompanhamento de alunos de música.
--
-- Regra que orienta o modelo inteiro: percentual não é campo digitado. Ele sai
-- das avaliações dos objetivos da fase, com peso. Quem quiser mudar a nota do
-- aluno avalia um objetivo — não edita um número solto.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS aluno (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nome         TEXT NOT NULL,
  nascimento   TEXT,
  responsavel  TEXT,
  contato      TEXT,
  professor    TEXT,
  inicio       TEXT NOT NULL DEFAULT (date('now')),
  ativo        INTEGER NOT NULL DEFAULT 1,
  observacao   TEXT,
  criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Trilha é o caminho de estudo: "Formação musical (MSA)", "Violino (Método XYZ)",
-- "Repertório". Cada trilha define o seu próprio mínimo para passar de fase.
CREATE TABLE IF NOT EXISTS trilha (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL UNIQUE,
  metodo        TEXT,
  descricao     TEXT,
  minimo_avanco REAL NOT NULL DEFAULT 80,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fase (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  trilha_id INTEGER NOT NULL REFERENCES trilha(id) ON DELETE CASCADE,
  numero    INTEGER NOT NULL,
  nome      TEXT NOT NULL,
  descricao TEXT,
  UNIQUE (trilha_id, numero)
);

-- Objetivo é o que se avalia: "afinação nas cordas soltas", "leitura rítmica em
-- compasso composto". O peso diz o quanto ele vale dentro da fase.
CREATE TABLE IF NOT EXISTS objetivo (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  fase_id INTEGER NOT NULL REFERENCES fase(id) ON DELETE CASCADE,
  ordem   INTEGER NOT NULL DEFAULT 1,
  titulo  TEXT NOT NULL,
  peso    REAL NOT NULL DEFAULT 1 CHECK (peso > 0),
  ativo   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS matricula (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id  INTEGER NOT NULL REFERENCES aluno(id) ON DELETE CASCADE,
  trilha_id INTEGER NOT NULL REFERENCES trilha(id) ON DELETE CASCADE,
  fase_id   INTEGER NOT NULL REFERENCES fase(id),
  inicio    TEXT NOT NULL DEFAULT (date('now')),
  situacao  TEXT NOT NULL DEFAULT 'Em curso'
               CHECK (situacao IN ('Em curso', 'Trancada', 'Concluída')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (aluno_id, trilha_id)
);

-- Avaliação nunca é sobrescrita: cada registro fica no histórico e a vigente de
-- cada objetivo é a última lançada. É assim que se enxerga a evolução — e o
-- retrocesso, que também acontece.
CREATE TABLE IF NOT EXISTS avaliacao (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula_id INTEGER NOT NULL REFERENCES matricula(id) ON DELETE CASCADE,
  objetivo_id  INTEGER NOT NULL REFERENCES objetivo(id) ON DELETE CASCADE,
  nivel        INTEGER NOT NULL CHECK (nivel BETWEEN 0 AND 4),
  data         TEXT NOT NULL DEFAULT (date('now')),
  professor    TEXT,
  observacao   TEXT,
  criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_avaliacao_matricula ON avaliacao (matricula_id, objetivo_id, id);

-- Fase encerrada guarda o percentual do dia em que fechou. Se o currículo mudar
-- amanhã, o boletim de ontem continua contando o que foi avaliado ontem.
CREATE TABLE IF NOT EXISTS fase_concluida (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula_id INTEGER NOT NULL REFERENCES matricula(id) ON DELETE CASCADE,
  fase_id      INTEGER NOT NULL REFERENCES fase(id),
  percentual   REAL NOT NULL,
  data         TEXT NOT NULL DEFAULT (date('now')),
  UNIQUE (matricula_id, fase_id)
);

CREATE TABLE IF NOT EXISTS aula (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id    INTEGER NOT NULL REFERENCES aluno(id) ON DELETE CASCADE,
  data        TEXT NOT NULL DEFAULT (date('now')),
  duracao_min INTEGER NOT NULL DEFAULT 50 CHECK (duracao_min > 0),
  presenca    TEXT NOT NULL DEFAULT 'Presente'
                 CHECK (presenca IN ('Presente', 'Falta', 'Falta justificada', 'Reposição')),
  conteudo    TEXT,
  professor   TEXT,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_aula_aluno ON aula (aluno_id, data);

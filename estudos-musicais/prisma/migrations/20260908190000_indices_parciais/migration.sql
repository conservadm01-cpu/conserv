-- Índices únicos parciais para as chaves que têm coluna anulável.
--
-- Em índice único do PostgreSQL, NULL não colide com NULL: sem estes índices,
-- um aluno poderia abrir duas jornadas no mesmo método transversal (sem
-- instrumento), e uma medalha do método poderia ser concedida duas vezes.

CREATE UNIQUE INDEX IF NOT EXISTS "jornadas_do_aluno_sem_instrumento_unico"
  ON "jornadas_do_aluno" ("alunoId", "metodoId")
  WHERE "instrumentoId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "medalhas_sem_unidade_unico"
  ON "medalhas" ("alunoId", "metodoId")
  WHERE "unidadeId" IS NULL;

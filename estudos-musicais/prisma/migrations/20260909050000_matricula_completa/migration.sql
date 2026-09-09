-- A matrícula ganha instrutor, localidade, data de encerramento e as
-- situações que faltavam.
--
-- Não se cria tabela nova: `jornadas_do_aluno` JÁ É a matrícula — quem estuda
-- o quê, com quem, onde, desde quando. Uma segunda tabela ao lado desta
-- duplicaria a espinha do sistema, e duas espinhas divergem.
--
-- INTERROMPIDA continua existindo no enum. Ela é o nome antigo do que hoje se
-- chama TRANCADA; remover o valor apagaria registros já gravados.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SituacaoDaJornada" ADD VALUE 'TRANCADA';
ALTER TYPE "SituacaoDaJornada" ADD VALUE 'CANCELADA';

-- DropIndex
DROP INDEX "responsaveis_criadoPorId_idx";

-- AlterTable
ALTER TABLE "jornadas_do_aluno" ADD COLUMN     "comumId" TEXT,
ADD COLUMN     "encerradaEm" TIMESTAMP(3),
ADD COLUMN     "instrutorId" TEXT;

-- CreateIndex
CREATE INDEX "jornadas_do_aluno_instrutorId_status_idx" ON "jornadas_do_aluno"("instrutorId", "status");

-- CreateIndex
CREATE INDEX "jornadas_do_aluno_comumId_status_idx" ON "jornadas_do_aluno"("comumId", "status");

-- AddForeignKey
ALTER TABLE "jornadas_do_aluno" ADD CONSTRAINT "jornadas_do_aluno_instrutorId_fkey" FOREIGN KEY ("instrutorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornadas_do_aluno" ADD CONSTRAINT "jornadas_do_aluno_comumId_fkey" FOREIGN KEY ("comumId") REFERENCES "comuns"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ==================================================== migração dos dados

-- A matrícula herda o instrutor e a comum que já constavam na ficha do aluno.
-- Nenhum dado é inventado: só se copia o que já estava lá, e apenas onde a
-- matrícula ainda não tinha o seu.
UPDATE jornadas_do_aluno j
SET "instrutorId" = pa."instrutorId"
FROM perfis_aluno pa
WHERE pa."usuarioId" = j."alunoId"
  AND j."instrutorId" IS NULL
  AND pa."instrutorId" IS NOT NULL;

UPDATE jornadas_do_aluno j
SET "comumId" = pa."comumId"
FROM perfis_aluno pa
WHERE pa."usuarioId" = j."alunoId"
  AND j."comumId" IS NULL;

-- Matrícula já concluída passa a ter também a data de encerramento, que é a
-- mesma da conclusão. Sem isso, um relatório de "quem saiu quando" ignoraria
-- justamente quem terminou.
UPDATE jornadas_do_aluno
SET "encerradaEm" = "conclusaoEm"
WHERE "conclusaoEm" IS NOT NULL AND "encerradaEm" IS NULL;

-- ========================================================= permissões RLS

-- A matrícula passa a ser visível também para o instrutor que a acompanha,
-- mesmo que o aluno esteja em comum que ele não acompanha por vínculo. É o
-- caso do instrutor de instrumento que atende aluno de outra localidade.
DROP POLICY IF EXISTS jornadas_leitura ON jornadas_do_aluno;
CREATE POLICY jornadas_leitura ON jornadas_do_aluno FOR SELECT USING (
  "alunoId" = app.usuario_atual()
  OR "instrutorId" = app.usuario_atual()
  OR app.ve_aluno("alunoId")
  OR app.ve_comum("comumId")
);

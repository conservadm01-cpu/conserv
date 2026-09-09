-- Aulas e frequência.
--
-- A aula pertence a uma TURMA (coletiva) ou a uma MATRÍCULA (individual),
-- nunca às duas. Guardar as duas formas na mesma tabela é deliberado: a
-- frequência de um aluno que faz aula coletiva de teoria e individual de
-- instrumento precisa sair num relatório só. Separado em duas tabelas, ela
-- sairia partida — e ninguém somaria as duas na hora de decidir alguma coisa.

-- CreateEnum
CREATE TYPE "SituacaoDaAula" AS ENUM ('PLANEJADA', 'REALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoDePresenca" AS ENUM ('PRESENTE', 'FALTA', 'FALTA_JUSTIFICADA', 'ATRASO');

-- CreateTable
CREATE TABLE "aulas" (
    "id" TEXT NOT NULL,
    "turmaId" TEXT,
    "jornadaId" TEXT,
    "instrutorId" TEXT NOT NULL,
    "comumId" TEXT,
    "data" DATE NOT NULL,
    "horaInicio" VARCHAR(5),
    "horaFim" VARCHAR(5),
    "situacao" "SituacaoDaAula" NOT NULL DEFAULT 'REALIZADA',
    "conteudo" TEXT,
    "observacao" TEXT,
    "proximaAtividade" TEXT,
    "unidadeId" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presencas" (
    "id" TEXT NOT NULL,
    "aulaId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "jornadaId" TEXT,
    "tipo" "TipoDePresenca" NOT NULL DEFAULT 'PRESENTE',
    "justificativa" TEXT,
    "observacao" TEXT,
    "registradoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presencas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aulas_data_idx" ON "aulas"("data");

-- CreateIndex
CREATE INDEX "aulas_instrutorId_data_idx" ON "aulas"("instrutorId", "data");

-- CreateIndex
CREATE INDEX "aulas_turmaId_data_idx" ON "aulas"("turmaId", "data");

-- CreateIndex
CREATE INDEX "aulas_jornadaId_data_idx" ON "aulas"("jornadaId", "data");

-- CreateIndex
CREATE INDEX "presencas_alunoId_tipo_idx" ON "presencas"("alunoId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "presencas_aulaId_alunoId_key" ON "presencas"("aulaId", "alunoId");

-- AddForeignKey
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "turmas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "jornadas_do_aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_instrutorId_fkey" FOREIGN KEY ("instrutorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_comumId_fkey" FOREIGN KEY ("comumId") REFERENCES "comuns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "unidades_curriculares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presencas" ADD CONSTRAINT "presencas_aulaId_fkey" FOREIGN KEY ("aulaId") REFERENCES "aulas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presencas" ADD CONSTRAINT "presencas_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presencas" ADD CONSTRAINT "presencas_jornadaId_fkey" FOREIGN KEY ("jornadaId") REFERENCES "jornadas_do_aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presencas" ADD CONSTRAINT "presencas_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Aula é de turma OU de matrícula, e sempre de uma das duas. A regra fica no
-- banco porque uma aula órfã não aparece em relatório nenhum: some sem erro.
ALTER TABLE "aulas" ADD CONSTRAINT "aula_pertence_a_turma_ou_matricula"
  CHECK (("turmaId" IS NOT NULL) <> ("jornadaId" IS NOT NULL));

-- ========================================================= permissões RLS

ALTER TABLE aulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE presencas ENABLE ROW LEVEL SECURITY;

-- Quem enxerga uma aula: quem a deu, quem a registrou, quem acompanha a
-- localidade, e o aluno que esteve nela. O aluno precisa ver a própria aula
-- para saber o que ficou combinado para a próxima.
CREATE OR REPLACE FUNCTION app.ve_aula(alvo text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT EXISTS (
    SELECT 1 FROM aulas a
    WHERE a.id = alvo
      AND (
        a."instrutorId" = app.usuario_atual()
        OR a."registradoPorId" = app.usuario_atual()
        OR app.eh_admin()
        OR app.ve_comum(a."comumId")
        OR EXISTS (SELECT 1 FROM presencas p WHERE p."aulaId" = a.id AND p."alunoId" = app.usuario_atual())
        OR EXISTS (SELECT 1 FROM jornadas_do_aluno j
                   WHERE j.id = a."jornadaId" AND (j."alunoId" = app.usuario_atual() OR app.ve_aluno(j."alunoId")))
        OR EXISTS (SELECT 1 FROM turmas t WHERE t.id = a."turmaId" AND app.ve_comum(t."comumId"))
      )
  )
$$;

-- Quem pode REGISTRAR aula: o instrutor da turma ou da matrícula, e quem
-- administra. A conta é feita fora da política, em função SECURITY DEFINER,
-- para não repetir a travessia turma → matrícula → aluno em cada linha.
CREATE OR REPLACE FUNCTION app.registra_aula(p_turma text, p_jornada text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT app.eh_admin()
    OR EXISTS (
      SELECT 1 FROM turmas t
      WHERE t.id = p_turma AND (t."instrutorId" = app.usuario_atual() OR app.ve_comum(t."comumId"))
    )
    OR EXISTS (
      SELECT 1 FROM jornadas_do_aluno j
      WHERE j.id = p_jornada AND (j."instrutorId" = app.usuario_atual() OR app.ve_aluno(j."alunoId"))
    )
$$;

CREATE POLICY aulas_leitura ON aulas FOR SELECT USING (app.ve_aula(id));

-- Escrita ⊆ leitura: quem grava precisa conseguir ler de volta, porque o
-- Prisma sempre grava com RETURNING. O instrutor consta como registrador, e é
-- por isso que ele lê a linha que acabou de criar.
CREATE POLICY aulas_insere ON aulas FOR INSERT
  WITH CHECK (app.registra_aula("turmaId", "jornadaId") AND "registradoPorId" = app.usuario_atual());
CREATE POLICY aulas_atualiza ON aulas FOR UPDATE
  USING (app.registra_aula("turmaId", "jornadaId"))
  WITH CHECK (app.registra_aula("turmaId", "jornadaId"));
CREATE POLICY aulas_apaga ON aulas FOR DELETE
  USING (app.eh_admin() OR "registradoPorId" = app.usuario_atual());

-- A presença acompanha a aula: quem vê a aula vê quem esteve nela; quem
-- registra a aula registra a presença. O aluno vê a própria, sempre.
CREATE POLICY presencas_leitura ON presencas FOR SELECT USING (
  "alunoId" = app.usuario_atual() OR app.ve_aluno("alunoId") OR app.ve_aula("aulaId")
);
CREATE POLICY presencas_escrita ON presencas FOR ALL
  USING (app.eh_admin() OR app.ve_aula("aulaId"))
  WITH CHECK (app.eh_admin() OR app.ve_aula("aulaId"));

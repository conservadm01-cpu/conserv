-- Pessoas e lugares: responsáveis pelo aluno, ficha do instrutor e tipo de
-- localidade.
--
-- Tudo aqui é aditivo. Nenhuma coluna é removida e nenhum dado é apagado: os
-- campos de texto que hoje guardam o responsável em `perfis_aluno` continuam
-- onde estão e são COPIADOS para as tabelas novas, não movidos. Se algo der
-- errado, o dado antigo ainda está no lugar de sempre.

-- CreateEnum
CREATE TYPE "TipoDeLocalidade" AS ENUM ('COMUM', 'ESCOLA_DE_MUSICA', 'POLO', 'SALA', 'UNIDADE', 'OUTRO');

-- AlterTable
ALTER TABLE "comuns" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" VARCHAR(9),
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "responsavelNome" TEXT,
ADD COLUMN     "telefone" TEXT,
ADD COLUMN     "tipo" "TipoDeLocalidade" NOT NULL DEFAULT 'COMUM';

-- CreateTable
CREATE TABLE "responsaveis" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "nomeCompleto" TEXT NOT NULL,
    "documento" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "endereco" TEXT,
    "numero" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "estado" VARCHAR(2),
    "cep" VARCHAR(9),
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "responsaveis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responsaveis_do_aluno" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "parentesco" TEXT,
    "pedagogico" BOOLEAN NOT NULL DEFAULT false,
    "financeiro" BOOLEAN NOT NULL DEFAULT false,
    "recebeAvisos" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responsaveis_do_aluno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfis_instrutor" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "comumId" TEXT,
    "documento" TEXT,
    "formacao" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfis_instrutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atuacoes_do_instrutor" (
    "id" TEXT NOT NULL,
    "instrutorId" TEXT NOT NULL,
    "instrumentoId" TEXT,
    "metodoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atuacoes_do_instrutor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "responsaveis_usuarioId_key" ON "responsaveis"("usuarioId");

-- CreateIndex
CREATE INDEX "responsaveis_ativo_idx" ON "responsaveis"("ativo");

-- CreateIndex
CREATE INDEX "responsaveis_do_aluno_responsavelId_idx" ON "responsaveis_do_aluno"("responsavelId");

-- CreateIndex
CREATE UNIQUE INDEX "responsaveis_do_aluno_alunoId_responsavelId_key" ON "responsaveis_do_aluno"("alunoId", "responsavelId");

-- CreateIndex
CREATE UNIQUE INDEX "perfis_instrutor_usuarioId_key" ON "perfis_instrutor"("usuarioId");

-- CreateIndex
CREATE INDEX "perfis_instrutor_ativo_idx" ON "perfis_instrutor"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "atuacoes_do_instrutor_instrutorId_instrumentoId_metodoId_key" ON "atuacoes_do_instrutor"("instrutorId", "instrumentoId", "metodoId");

-- CreateIndex
CREATE INDEX "comuns_tipo_ativo_idx" ON "comuns"("tipo", "ativo");

-- AddForeignKey
ALTER TABLE "responsaveis" ADD CONSTRAINT "responsaveis_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsaveis_do_aluno" ADD CONSTRAINT "responsaveis_do_aluno_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responsaveis_do_aluno" ADD CONSTRAINT "responsaveis_do_aluno_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "responsaveis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfis_instrutor" ADD CONSTRAINT "perfis_instrutor_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfis_instrutor" ADD CONSTRAINT "perfis_instrutor_comumId_fkey" FOREIGN KEY ("comumId") REFERENCES "comuns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atuacoes_do_instrutor" ADD CONSTRAINT "atuacoes_do_instrutor_instrutorId_fkey" FOREIGN KEY ("instrutorId") REFERENCES "perfis_instrutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atuacoes_do_instrutor" ADD CONSTRAINT "atuacoes_do_instrutor_instrumentoId_fkey" FOREIGN KEY ("instrumentoId") REFERENCES "instrumentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atuacoes_do_instrutor" ADD CONSTRAINT "atuacoes_do_instrutor_metodoId_fkey" FOREIGN KEY ("metodoId") REFERENCES "metodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ==================================================== migração dos dados

-- O responsável que estava como texto solto na ficha do aluno vira registro.
-- Só entra quem tem nome preenchido; ficha sem responsável continua sem.
INSERT INTO responsaveis (id, "nomeCompleto", telefone, email, ativo, "criadoEm", "atualizadoEm")
SELECT
  'resp_' || pa.id,
  trim(pa."responsavelNome"),
  NULLIF(trim(COALESCE(pa."responsavelTelefone", '')), ''),
  NULLIF(trim(COALESCE(pa."responsavelEmail", '')), ''),
  true, now(), now()
FROM perfis_aluno pa
WHERE COALESCE(trim(pa."responsavelNome"), '') <> ''
ON CONFLICT (id) DO NOTHING;

INSERT INTO responsaveis_do_aluno (id, "alunoId", "responsavelId", parentesco, pedagogico, financeiro, "recebeAvisos", "criadoEm")
SELECT
  'rda_' || pa.id,
  pa."usuarioId",
  'resp_' || pa.id,
  NULLIF(trim(COALESCE(pa."responsavelParentesco", '')), ''),
  -- Quem constava como responsável do aluno respondia pelas decisões de
  -- estudo; é o que esse campo significava na prática.
  true, false, true, now()
FROM perfis_aluno pa
WHERE COALESCE(trim(pa."responsavelNome"), '') <> ''
ON CONFLICT ("alunoId", "responsavelId") DO NOTHING;

-- Quem já tem vínculo de instrutor ganha a ficha correspondente, vazia. Sem
-- isto, a tela de instrutores nasceria sem ninguém, embora existam
-- instrutores no sistema desde o primeiro dia.
INSERT INTO perfis_instrutor (id, "usuarioId", "comumId", ativo, "criadoEm", "atualizadoEm")
SELECT DISTINCT ON (v."usuarioId")
  'pinst_' || v."usuarioId",
  v."usuarioId",
  v."comumId",
  true, now(), now()
FROM vinculos v
WHERE v.papel = 'INSTRUTOR' AND v.ativo AND v."revogadoEm" IS NULL
ORDER BY v."usuarioId", v."concedidoEm"
ON CONFLICT ("usuarioId") DO NOTHING;

-- ========================================================= permissões RLS

ALTER TABLE responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE responsaveis_do_aluno ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfis_instrutor ENABLE ROW LEVEL SECURITY;
ALTER TABLE atuacoes_do_instrutor ENABLE ROW LEVEL SECURITY;

-- Quem enxerga um responsável: a administração, ele próprio (quando tem
-- acesso) e quem acompanha algum aluno dele. O contato de um responsável não
-- é dado público entre comuns.
CREATE POLICY responsaveis_leitura ON responsaveis FOR SELECT USING (
  app.eh_admin()
  OR "usuarioId" = app.usuario_atual()
  OR EXISTS (
    SELECT 1 FROM responsaveis_do_aluno rda
    WHERE rda."responsavelId" = responsaveis.id AND app.ve_aluno(rda."alunoId")
  )
);

-- Escrita ⊆ leitura, sempre: o Prisma grava com RETURNING, então uma linha
-- que a política de leitura recusa faz o INSERT falhar mesmo tendo permissão
-- de gravar. Foi assim que dois defeitos apareceram antes; a regra ficou.
CREATE POLICY responsaveis_escrita_insere ON responsaveis FOR INSERT
  WITH CHECK (app.eh_admin() OR app.pode_cadastrar());
CREATE POLICY responsaveis_escrita_atualiza ON responsaveis FOR UPDATE
  USING (
    app.eh_admin()
    OR "usuarioId" = app.usuario_atual()
    OR EXISTS (SELECT 1 FROM responsaveis_do_aluno rda
               WHERE rda."responsavelId" = responsaveis.id AND app.pode_editar_usuario(rda."alunoId"))
  )
  WITH CHECK (
    app.eh_admin()
    OR "usuarioId" = app.usuario_atual()
    OR EXISTS (SELECT 1 FROM responsaveis_do_aluno rda
               WHERE rda."responsavelId" = responsaveis.id AND app.pode_editar_usuario(rda."alunoId"))
  );
CREATE POLICY responsaveis_escrita_apaga ON responsaveis FOR DELETE USING (app.eh_admin());

CREATE POLICY rda_leitura ON responsaveis_do_aluno FOR SELECT USING (
  app.eh_admin()
  OR "alunoId" = app.usuario_atual()
  OR app.ve_aluno("alunoId")
  OR EXISTS (SELECT 1 FROM responsaveis r
             WHERE r.id = responsaveis_do_aluno."responsavelId" AND r."usuarioId" = app.usuario_atual())
);
CREATE POLICY rda_escrita_insere ON responsaveis_do_aluno FOR INSERT
  WITH CHECK (app.eh_admin() OR app.pode_editar_usuario("alunoId"));
CREATE POLICY rda_escrita_atualiza ON responsaveis_do_aluno FOR UPDATE
  USING (app.eh_admin() OR app.pode_editar_usuario("alunoId"))
  WITH CHECK (app.eh_admin() OR app.pode_editar_usuario("alunoId"));
CREATE POLICY rda_escrita_apaga ON responsaveis_do_aluno FOR DELETE
  USING (app.eh_admin() OR app.pode_editar_usuario("alunoId"));

-- A ficha do instrutor é visível a quem acompanha a comum dele — é preciso
-- saber quem dá aula onde — e a ele próprio.
CREATE POLICY perfis_instrutor_leitura ON perfis_instrutor FOR SELECT USING (
  app.eh_admin()
  OR "usuarioId" = app.usuario_atual()
  OR app.ve_comum("comumId")
  OR EXISTS (SELECT 1 FROM vinculos v
             WHERE v."usuarioId" = perfis_instrutor."usuarioId" AND v.ativo AND app.ve_comum(v."comumId"))
);
CREATE POLICY perfis_instrutor_escrita_insere ON perfis_instrutor FOR INSERT
  WITH CHECK (app.eh_admin() OR app.pode_editar_usuario("usuarioId"));
CREATE POLICY perfis_instrutor_escrita_atualiza ON perfis_instrutor FOR UPDATE
  USING (app.eh_admin() OR "usuarioId" = app.usuario_atual() OR app.pode_editar_usuario("usuarioId"))
  WITH CHECK (app.eh_admin() OR "usuarioId" = app.usuario_atual() OR app.pode_editar_usuario("usuarioId"));
CREATE POLICY perfis_instrutor_escrita_apaga ON perfis_instrutor FOR DELETE USING (app.eh_admin());

-- A atuação acompanha a ficha: quem vê a ficha vê com o que o instrutor
-- trabalha; quem edita a ficha edita a atuação.
CREATE POLICY atuacoes_leitura ON atuacoes_do_instrutor FOR SELECT USING (
  EXISTS (SELECT 1 FROM perfis_instrutor p WHERE p.id = atuacoes_do_instrutor."instrutorId")
);
CREATE POLICY atuacoes_escrita ON atuacoes_do_instrutor FOR ALL
  USING (
    app.eh_admin()
    OR EXISTS (SELECT 1 FROM perfis_instrutor p
               WHERE p.id = atuacoes_do_instrutor."instrutorId" AND app.pode_editar_usuario(p."usuarioId"))
  )
  WITH CHECK (
    app.eh_admin()
    OR EXISTS (SELECT 1 FROM perfis_instrutor p
               WHERE p.id = atuacoes_do_instrutor."instrutorId" AND app.pode_editar_usuario(p."usuarioId"))
  );

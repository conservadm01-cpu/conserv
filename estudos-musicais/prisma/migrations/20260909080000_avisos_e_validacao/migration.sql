-- Avisos internos e conferência pública de certificado.

-- CreateEnum
CREATE TYPE "CanalDeAviso" AS ENUM ('INTERNO', 'EMAIL', 'PUSH', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "EstadoDoAviso" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU', 'DISPENSADO');

-- AlterTable
ALTER TABLE "certificados" ADD COLUMN     "responsavelNome" TEXT,
ADD COLUMN     "retrato" JSONB;

-- CreateTable
CREATE TABLE "avisos" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "destino" TEXT,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "lidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas_de_aviso" (
    "id" TEXT NOT NULL,
    "avisoId" TEXT NOT NULL,
    "canal" "CanalDeAviso" NOT NULL,
    "estado" "EstadoDoAviso" NOT NULL DEFAULT 'PENDENTE',
    "destino" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entregas_de_aviso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avisos_usuarioId_lidoEm_idx" ON "avisos"("usuarioId", "lidoEm");

-- CreateIndex
CREATE INDEX "avisos_entidade_entidadeId_idx" ON "avisos"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "entregas_de_aviso_estado_canal_idx" ON "entregas_de_aviso"("estado", "canal");

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_de_aviso" ADD CONSTRAINT "entregas_de_aviso_avisoId_fkey" FOREIGN KEY ("avisoId") REFERENCES "avisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ================================ conferência pública de certificado

-- Um certificado existe para ser mostrado a terceiros. Quem o recebe precisa
-- poder conferir se ele é verdadeiro SEM ter conta no sistema — senão a
-- conferência não serve para nada, porque quem confere é justamente quem está
-- de fora.
--
-- A saída NÃO é abrir a tabela a anônimos. É esta função, de escopo estreito:
-- ela recebe o código, devolve só o que o próprio papel já mostra, e nada
-- mais. Não há como listar certificados, nem descobrir quem estuda onde.
CREATE OR REPLACE FUNCTION app.certificado_publico(p_codigo text)
RETURNS TABLE (
  codigo text, aluno text, metodo text, trilha text,
  emitido_em timestamp(3), revogado_em timestamp(3), revogado_motivo text,
  retrato jsonb, responsavel text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT
    c.codigo,
    -- O nome vem do RETRATO quando existe: é o nome que está impresso no
    -- papel. Quem mudou de nome depois não invalida o próprio certificado.
    COALESCE(c.retrato->>'aluno', u."nomeCompleto"),
    COALESCE(c.retrato->>'metodo', m.nome),
    c.trilha,
    c."emitidoEm",
    c."revogadoEm",
    c."revogadoMotivo",
    c.retrato::jsonb,
    c."responsavelNome"
  FROM certificados c
  JOIN usuarios u ON u.id = c."alunoId"
  LEFT JOIN metodos m ON m.id = c."metodoId"
  -- Código curto demais não consulta: sem isto, alguém varreria o espaço de
  -- códigos curtos procurando acerto.
  WHERE c.codigo = p_codigo AND length(p_codigo) >= 8
$$;

REVOKE ALL ON FUNCTION app.certificado_publico(text) FROM PUBLIC;

-- ========================================================= permissões RLS

ALTER TABLE avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas_de_aviso ENABLE ROW LEVEL SECURITY;

-- Aviso é de quem o recebe. Nem o instrutor lê o aviso do aluno: o que ele
-- precisa saber está no painel dele, não na caixa de avisos de outra pessoa.
CREATE POLICY avisos_leitura ON avisos FOR SELECT USING (
  "usuarioId" = app.usuario_atual() OR app.eh_admin()
);
-- Marcar como lido é a única alteração que o dono faz.
CREATE POLICY avisos_atualiza ON avisos FOR UPDATE
  USING ("usuarioId" = app.usuario_atual() OR app.eh_admin())
  WITH CHECK ("usuarioId" = app.usuario_atual() OR app.eh_admin());
-- Quem avisa é quem acompanha o avisado — ou a administração.
CREATE POLICY avisos_insere ON avisos FOR INSERT
  WITH CHECK (app.eh_admin() OR app.ve_aluno("usuarioId") OR "usuarioId" = app.usuario_atual());
CREATE POLICY avisos_apaga ON avisos FOR DELETE USING (app.eh_admin());

-- A entrega acompanha o aviso.
CREATE POLICY entregas_leitura ON entregas_de_aviso FOR SELECT USING (
  app.eh_admin()
  OR EXISTS (SELECT 1 FROM avisos a WHERE a.id = entregas_de_aviso."avisoId" AND a."usuarioId" = app.usuario_atual())
);
CREATE POLICY entregas_escrita ON entregas_de_aviso FOR ALL
  USING (app.eh_admin()) WITH CHECK (app.eh_admin());

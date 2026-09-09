-- Permissões como dado.
--
-- O catálogo (quais permissões existem) continua em código, porque cada chave
-- corresponde a uma verificação escrita no programa. O que vira dado é a
-- CONCESSÃO — quem tem cada uma —, que é o que resolve o problema real: hoje,
-- dar a um encarregado local a permissão de gerir turmas exige alterar o
-- programa e publicar.
--
-- O que NÃO muda: as políticas de RLS continuam sendo o piso. Conceder aqui
-- uma permissão que o banco recusa faz a tela oferecer um botão que dá erro —
-- por isso as permissões de administração não são concedíveis a papel de
-- campo, e a regra está escrita em src/lib/permissoes.ts e testada.

-- CreateTable
CREATE TABLE "permissoes" (
    "chave" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "soAdministracao" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissoes_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "permissoes_do_papel" (
    "id" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "permissaoChave" TEXT NOT NULL,
    "concedida" BOOLEAN NOT NULL DEFAULT true,
    "concedidoPorId" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissoes_do_papel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permissoes_grupo_idx" ON "permissoes"("grupo");

-- CreateIndex
CREATE INDEX "permissoes_do_papel_papel_concedida_idx" ON "permissoes_do_papel"("papel", "concedida");

-- CreateIndex
CREATE UNIQUE INDEX "permissoes_do_papel_papel_permissaoChave_key" ON "permissoes_do_papel"("papel", "permissaoChave");

-- AddForeignKey
ALTER TABLE "permissoes_do_papel" ADD CONSTRAINT "permissoes_do_papel_permissaoChave_fkey" FOREIGN KEY ("permissaoChave") REFERENCES "permissoes"("chave") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissoes_do_papel" ADD CONSTRAINT "permissoes_do_papel_concedidoPorId_fkey" FOREIGN KEY ("concedidoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ========================================================= permissões RLS

ALTER TABLE permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissoes_do_papel ENABLE ROW LEVEL SECURITY;

-- O catálogo é público a quem está autenticado: a tela precisa dele para
-- dizer o que cada perfil pode, e não há nada de sigiloso na lista de nomes
-- de permissão. Escrever, só a administração.
CREATE POLICY permissoes_leitura ON permissoes FOR SELECT
  USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY permissoes_escrita ON permissoes FOR ALL
  USING (app.eh_admin()) WITH CHECK (app.eh_admin());

-- A concessão também é legível por quem está autenticado — cada um precisa
-- saber o que pode, e esconder isso só produziria botão que some sem
-- explicação. Conceder e retirar, só a administração.
CREATE POLICY permissoes_do_papel_leitura ON permissoes_do_papel FOR SELECT
  USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY permissoes_do_papel_escrita ON permissoes_do_papel FOR ALL
  USING (app.eh_admin()) WITH CHECK (app.eh_admin());

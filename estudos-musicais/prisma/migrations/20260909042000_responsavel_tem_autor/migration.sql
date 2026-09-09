-- Quem cadastrou o responsável.
--
-- Substitui a política "recém-criado" da migração anterior, que era um erro:
-- ela abria QUALQUER responsável criado no último minuto para qualquer pessoa
-- com permissão de cadastrar — inclusive de outra localidade. Um buraco com
-- relógio continua sendo um buraco.
--
-- O critério certo é permanente e nominal: quem cadastrou lê o que cadastrou.
-- É a mesma ideia de `usuarios."criadoPorId"`, que já existe aqui.

ALTER TABLE "responsaveis" ADD COLUMN "criadoPorId" TEXT;
ALTER TABLE "responsaveis" ADD CONSTRAINT "responsaveis_criadoPorId_fkey"
  FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "responsaveis_criadoPorId_idx" ON "responsaveis"("criadoPorId");

DROP POLICY IF EXISTS responsaveis_leitura_recem_criado ON responsaveis;

DROP POLICY IF EXISTS responsaveis_leitura ON responsaveis;
CREATE POLICY responsaveis_leitura ON responsaveis FOR SELECT USING (
  app.eh_admin()
  OR "usuarioId" = app.usuario_atual()
  OR "criadoPorId" = app.usuario_atual()
  OR app.ve_responsavel(id)
);

-- Escrita ⊆ leitura: só grava quem vai conseguir ler de volta.
DROP POLICY IF EXISTS responsaveis_escrita_insere ON responsaveis;
CREATE POLICY responsaveis_escrita_insere ON responsaveis FOR INSERT
  WITH CHECK (
    app.eh_admin()
    OR (app.pode_cadastrar() AND "criadoPorId" = app.usuario_atual())
  );

DROP POLICY IF EXISTS responsaveis_escrita_atualiza ON responsaveis;
CREATE POLICY responsaveis_escrita_atualiza ON responsaveis FOR UPDATE
  USING (
    app.eh_admin() OR "usuarioId" = app.usuario_atual()
    OR "criadoPorId" = app.usuario_atual() OR app.edita_responsavel(id)
  )
  WITH CHECK (
    app.eh_admin() OR "usuarioId" = app.usuario_atual()
    OR "criadoPorId" = app.usuario_atual() OR app.edita_responsavel(id)
  );

-- Corrige duas gravações que a própria RLS impedia.
--
-- No PostgreSQL, `INSERT ... RETURNING` exige que a linha recém-criada passe
-- TAMBÉM pela política de leitura — e o Prisma usa RETURNING em toda gravação.
-- Quando a política de escrita é mais larga que a de leitura, a gravação passa
-- e a devolução falha, com a mensagem enganosa
-- "new row violates row-level security policy".
--
-- Era o caso de duas tabelas, e as duas quebravam justamente para quem NÃO é
-- administração:
--
--   • auditorias — qualquer um podia inserir, só a administração lia. Um
--     instrutor trocando a própria senha derrubava a operação inteira no
--     registro da auditoria;
--   • usuarios — um instrutor podia criar a conta, mas só enxergava a pessoa
--     depois que o vínculo existisse; e o vínculo é gravado no passo seguinte.
--     Na prática, cadastrar só funcionava para a administração.
--
-- A correção é a mesma nos dois casos, e é a regra certa por si só: cada um lê
-- o que ele mesmo produziu.

DROP POLICY IF EXISTS auditorias_leitura ON auditorias;
CREATE POLICY auditorias_leitura ON auditorias FOR SELECT USING (
  app.eh_admin() OR "usuarioId" = app.usuario_atual()
);

DROP POLICY IF EXISTS usuarios_leitura ON usuarios;
CREATE POLICY usuarios_leitura ON usuarios FOR SELECT USING (
  id = app.usuario_atual()
  -- quem cadastrou enxerga quem cadastrou, desde o instante da criação
  OR "criadoPorId" = app.usuario_atual()
  OR app.ve_aluno(id)
  OR EXISTS (SELECT 1 FROM vinculos v WHERE v."usuarioId" = usuarios.id AND v.ativo
             AND (app.eh_admin() OR app.ve_comum(v."comumId")))
);

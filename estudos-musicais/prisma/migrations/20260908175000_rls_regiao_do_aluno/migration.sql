-- O aluno precisa enxergar a região da sua própria comum (aparece na tela de
-- estudo). Antes, a política só abria região para quem ACOMPANHA comuns, e o
-- aluno recebia região nula.

DROP POLICY IF EXISTS regioes_leitura ON regioes;
CREATE POLICY regioes_leitura ON regioes FOR SELECT USING (
  app.eh_admin()
  OR EXISTS (SELECT 1 FROM comuns c WHERE c."regiaoId" = regioes.id AND app.ve_comum(c.id))
  OR EXISTS (SELECT 1 FROM comuns c WHERE c.id = app.minha_comum() AND c."regiaoId" = regioes.id)
);

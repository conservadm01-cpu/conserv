-- Corrige recursão entre as políticas de "turmas" e "matriculas_em_turma".
--
-- O que acontecia: `turmas_leitura` consulta matriculas_em_turma para deixar o
-- aluno ver a própria turma, e `matriculas_escrita`, declarada FOR ALL,
-- consulta turmas. Como uma política FOR ALL também vale para o SELECT (as
-- políticas permissivas são somadas com OR), o planejador ia de uma tabela à
-- outra sem fim e o PostgreSQL abortava com
-- "infinite recursion detected in policy for relation".
--
-- A correção separa a escrita por comando. Assim o SELECT em
-- matriculas_em_turma passa apenas por `matriculas_leitura`, que resolve tudo
-- dentro de app.ve_aluno() — função SECURITY DEFINER, sem voltar a turmas.
-- Quem pode escrever continua exatamente o mesmo: administração, instrutor da
-- turma e quem acompanha a comum dela.

DROP POLICY IF EXISTS matriculas_escrita ON matriculas_em_turma;

CREATE POLICY matriculas_inclui ON matriculas_em_turma FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM turmas t WHERE t.id = matriculas_em_turma."turmaId"
              AND (app.ve_comum(t."comumId") OR t."instrutorId" = app.usuario_atual())));

CREATE POLICY matriculas_atualiza ON matriculas_em_turma FOR UPDATE
  USING (EXISTS (SELECT 1 FROM turmas t WHERE t.id = matriculas_em_turma."turmaId"
         AND (app.ve_comum(t."comumId") OR t."instrutorId" = app.usuario_atual())))
  WITH CHECK (EXISTS (SELECT 1 FROM turmas t WHERE t.id = matriculas_em_turma."turmaId"
              AND (app.ve_comum(t."comumId") OR t."instrutorId" = app.usuario_atual())));

CREATE POLICY matriculas_remove ON matriculas_em_turma FOR DELETE
  USING (EXISTS (SELECT 1 FROM turmas t WHERE t.id = matriculas_em_turma."turmaId"
         AND (app.ve_comum(t."comumId") OR t."instrutorId" = app.usuario_atual())));

-- A leitura da turma pelo próprio aluno também sai de dentro de uma função
-- SECURITY DEFINER: assim `turmas_leitura` não replaneja as políticas de
-- matriculas_em_turma e a ida e volta entre as duas tabelas deixa de existir.
CREATE OR REPLACE FUNCTION app.matriculado_na_turma(turma text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT EXISTS (
    SELECT 1 FROM matriculas_em_turma m
    WHERE m."turmaId" = turma AND m."alunoId" = app.usuario_atual() AND m."saidaEm" IS NULL
  )
$$;

DROP POLICY IF EXISTS turmas_leitura ON turmas;
CREATE POLICY turmas_leitura ON turmas FOR SELECT USING (
  app.ve_comum("comumId") OR "instrutorId" = app.usuario_atual() OR app.matriculado_na_turma(id)
);

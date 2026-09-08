-- Matricular alguém exige enxergar essa pessoa.
--
-- As políticas de escrita de matrícula conferiam só a TURMA: quem acompanha a
-- comum da turma podia matricular qualquer pessoa do sistema nela, inclusive
-- aluno de outra região. A leitura, essa sim, exigia app.ve_aluno() — e como
-- o Prisma grava com RETURNING, a operação estourava com uma mensagem
-- enganosa em vez de recusar por escopo.
--
-- Acrescentar app.ve_aluno("alunoId") às três políticas fecha as duas pontas:
-- a permissão volta a ser a esperada e a escrita passa a caber dentro da
-- leitura, que é o que o RETURNING exige.

DROP POLICY IF EXISTS matriculas_inclui ON matriculas_em_turma;
DROP POLICY IF EXISTS matriculas_atualiza ON matriculas_em_turma;
DROP POLICY IF EXISTS matriculas_remove ON matriculas_em_turma;

CREATE POLICY matriculas_inclui ON matriculas_em_turma FOR INSERT
  WITH CHECK (
    app.ve_aluno("alunoId")
    AND EXISTS (SELECT 1 FROM turmas t WHERE t.id = matriculas_em_turma."turmaId"
                AND (app.ve_comum(t."comumId") OR t."instrutorId" = app.usuario_atual()))
  );

CREATE POLICY matriculas_atualiza ON matriculas_em_turma FOR UPDATE
  USING (
    app.ve_aluno("alunoId")
    AND EXISTS (SELECT 1 FROM turmas t WHERE t.id = matriculas_em_turma."turmaId"
                AND (app.ve_comum(t."comumId") OR t."instrutorId" = app.usuario_atual()))
  )
  WITH CHECK (
    app.ve_aluno("alunoId")
    AND EXISTS (SELECT 1 FROM turmas t WHERE t.id = matriculas_em_turma."turmaId"
                AND (app.ve_comum(t."comumId") OR t."instrutorId" = app.usuario_atual()))
  );

CREATE POLICY matriculas_remove ON matriculas_em_turma FOR DELETE
  USING (
    app.ve_aluno("alunoId")
    AND EXISTS (SELECT 1 FROM turmas t WHERE t.id = matriculas_em_turma."turmaId"
                AND (app.ve_comum(t."comumId") OR t."instrutorId" = app.usuario_atual()))
  );

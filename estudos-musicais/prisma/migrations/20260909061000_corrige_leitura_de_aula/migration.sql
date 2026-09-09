-- Corrige a leitura de `aulas` logo após o INSERT.
--
-- O defeito: a política de SELECT chamava app.ve_aula(id), e essa função
-- consultava a PRÓPRIA tabela `aulas` pelo id. Numa inserção com RETURNING —
-- que é como o Prisma sempre grava — a linha ainda não está visível para uma
-- subconsulta dentro do mesmo comando, então a função respondia "não vejo" e
-- o INSERT falhava com 42501, como se fosse falta de permissão.
--
-- A regra que fica: política de SELECT decide pelas COLUNAS DA PRÓPRIA LINHA.
-- Consulta a outras tabelas continua valendo (elas já estão gravadas); o que
-- não pode é a tabela perguntar por si mesma.

-- Só o que depende de OUTRAS tabelas fica na função. Nada aqui consulta `aulas`.
CREATE OR REPLACE FUNCTION app.ve_aula_por_vinculo(p_turma text, p_jornada text, p_aula text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT EXISTS (
    SELECT 1 FROM jornadas_do_aluno j
    WHERE j.id = p_jornada
      AND (j."alunoId" = app.usuario_atual() OR j."instrutorId" = app.usuario_atual() OR app.ve_aluno(j."alunoId"))
  )
  OR EXISTS (
    SELECT 1 FROM turmas t
    WHERE t.id = p_turma AND (t."instrutorId" = app.usuario_atual() OR app.ve_comum(t."comumId"))
  )
  OR EXISTS (
    SELECT 1 FROM presencas p WHERE p."aulaId" = p_aula AND p."alunoId" = app.usuario_atual()
  )
$$;

DROP POLICY IF EXISTS aulas_leitura ON aulas;
CREATE POLICY aulas_leitura ON aulas FOR SELECT USING (
  "instrutorId" = app.usuario_atual()
  OR "registradoPorId" = app.usuario_atual()
  OR app.eh_admin()
  OR app.ve_comum("comumId")
  OR app.ve_aula_por_vinculo("turmaId", "jornadaId", id)
);

-- app.ve_aula continua existindo para quem consulta aula JÁ GRAVADA — é o
-- caso da política de presenças, que olha para outra tabela.
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
        OR app.ve_aula_por_vinculo(a."turmaId", a."jornadaId", a.id)
      )
  )
$$;

-- Corrige recursão infinita entre `responsaveis` e `responsaveis_do_aluno`.
--
-- O defeito: a política de leitura de `responsaveis` perguntava a
-- `responsaveis_do_aluno` de quem aquele responsável é, e a política de
-- `responsaveis_do_aluno` perguntava a `responsaveis` se o leitor era o
-- próprio. Cada consulta disparava a política da outra tabela, sem fim —
-- PostgreSQL responde 42P17 e a consulta morre.
--
-- A saída é a mesma já usada entre turmas e matrículas: tirar a travessia de
-- dentro da política e pô-la numa função SECURITY DEFINER, que consulta por
-- fora das políticas. A função não afrouxa nada — ela responde exatamente a
-- pergunta que a política faria, e só isso.

CREATE OR REPLACE FUNCTION app.ve_responsavel(alvo text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT EXISTS (
    SELECT 1 FROM responsaveis_do_aluno rda
    WHERE rda."responsavelId" = alvo AND app.ve_aluno(rda."alunoId")
  )
$$;

CREATE OR REPLACE FUNCTION app.edita_responsavel(alvo text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT EXISTS (
    SELECT 1 FROM responsaveis_do_aluno rda
    WHERE rda."responsavelId" = alvo AND app.pode_editar_usuario(rda."alunoId")
  )
$$;

CREATE OR REPLACE FUNCTION app.sou_este_responsavel(alvo text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT EXISTS (
    SELECT 1 FROM responsaveis r
    WHERE r.id = alvo AND r."usuarioId" = app.usuario_atual()
  )
$$;

-- ------------------------------------------------------------ responsáveis

DROP POLICY IF EXISTS responsaveis_leitura ON responsaveis;
CREATE POLICY responsaveis_leitura ON responsaveis FOR SELECT USING (
  app.eh_admin()
  OR "usuarioId" = app.usuario_atual()
  OR app.ve_responsavel(id)
);

DROP POLICY IF EXISTS responsaveis_escrita_atualiza ON responsaveis;
CREATE POLICY responsaveis_escrita_atualiza ON responsaveis FOR UPDATE
  USING (app.eh_admin() OR "usuarioId" = app.usuario_atual() OR app.edita_responsavel(id))
  WITH CHECK (app.eh_admin() OR "usuarioId" = app.usuario_atual() OR app.edita_responsavel(id));

-- Um responsável recém-criado ainda não tem vínculo com aluno nenhum: se a
-- leitura dependesse só do vínculo, o INSERT falharia no RETURNING, que é como
-- o Prisma sempre grava. Quem pode cadastrar lê o que acabou de criar.
DROP POLICY IF EXISTS responsaveis_escrita_insere ON responsaveis;
CREATE POLICY responsaveis_escrita_insere ON responsaveis FOR INSERT
  WITH CHECK (app.eh_admin() OR app.pode_cadastrar());
DROP POLICY IF EXISTS responsaveis_leitura_recem_criado ON responsaveis;
CREATE POLICY responsaveis_leitura_recem_criado ON responsaveis FOR SELECT
  USING (app.pode_cadastrar() AND "criadoEm" > now() - interval '1 minute');

-- ------------------------------------------------- vínculo aluno-responsável

DROP POLICY IF EXISTS rda_leitura ON responsaveis_do_aluno;
CREATE POLICY rda_leitura ON responsaveis_do_aluno FOR SELECT USING (
  app.eh_admin()
  OR "alunoId" = app.usuario_atual()
  OR app.ve_aluno("alunoId")
  OR app.sou_este_responsavel("responsavelId")
);

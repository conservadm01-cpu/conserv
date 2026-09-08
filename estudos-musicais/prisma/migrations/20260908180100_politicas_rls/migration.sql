-- Segurança em nível de linha (RLS).
--
-- Duas cercas independentes: a aplicação resolve o escopo no servidor e o
-- banco resolve de novo, por conta própria. A aplicação só declara QUEM é o
-- usuário (SET LOCAL app.usuario_id); papel, comum, região e método são
-- resolvidos aqui. Consulta que esqueça o filtro continua limitada ao vínculo.

CREATE SCHEMA IF NOT EXISTS app;

-- ------------------------------------------------------------- identidade

CREATE OR REPLACE FUNCTION app.usuario_atual() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.usuario_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app.tem_papel(papeis text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT EXISTS (
    SELECT 1 FROM vinculos v
    WHERE v."usuarioId" = app.usuario_atual()
      AND v.ativo AND v."revogadoEm" IS NULL
      AND v.papel::text = ANY(papeis)
  )
$$;

CREATE OR REPLACE FUNCTION app.eh_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.tem_papel(ARRAY['SUPERADMIN','ADMIN_PEDAGOGICO'])
$$;

-- Comuns que o usuário ACOMPANHA (vínculo de comum ou de região). A comum
-- onde o aluno estuda não entra aqui: é lugar de estudo, não escopo de
-- acompanhamento — sem isso, um aluno enxergaria os colegas.
CREATE OR REPLACE FUNCTION app.comuns_visiveis() RETURNS TABLE (comum_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT DISTINCT c.id
  FROM comuns c
  WHERE EXISTS (
    SELECT 1 FROM vinculos v
    WHERE v."usuarioId" = app.usuario_atual()
      AND v.ativo AND v."revogadoEm" IS NULL
      AND v.papel <> 'ALUNO'
      AND (
        (v.escopo = 'COMUM'  AND v."comumId"  = c.id) OR
        (v.escopo = 'REGIAO' AND v."regiaoId" = c."regiaoId")
      )
  )
$$;

CREATE OR REPLACE FUNCTION app.minha_comum() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT p."comumId" FROM perfis_aluno p WHERE p."usuarioId" = app.usuario_atual() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.ve_comum(alvo text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.eh_admin() OR (alvo IS NOT NULL AND alvo IN (SELECT comum_id FROM app.comuns_visiveis()))
$$;

-- Alunos que o usuário acompanha: ele mesmo, os seus orientandos, os das suas
-- comuns/regiões e os das turmas em que é instrutor.
CREATE OR REPLACE FUNCTION app.ve_aluno(alvo text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT alvo = app.usuario_atual()
      OR app.eh_admin()
      OR EXISTS (
        SELECT 1 FROM perfis_aluno p
        WHERE p."usuarioId" = alvo
          AND (p."instrutorId" = app.usuario_atual()
               OR p."comumId" IN (SELECT comum_id FROM app.comuns_visiveis()))
      )
      OR EXISTS (
        SELECT 1 FROM matriculas_em_turma m
        JOIN turmas t ON t.id = m."turmaId"
        WHERE m."alunoId" = alvo AND t."instrutorId" = app.usuario_atual() AND m."saidaEm" IS NULL
      )
$$;

-- --------------------------------------------------- território e cadastro

ALTER TABLE regioes ENABLE ROW LEVEL SECURITY;
CREATE POLICY regioes_leitura ON regioes FOR SELECT USING (
  app.eh_admin()
  OR EXISTS (SELECT 1 FROM comuns c WHERE c."regiaoId" = regioes.id AND app.ve_comum(c.id))
  OR EXISTS (SELECT 1 FROM comuns c WHERE c.id = app.minha_comum() AND c."regiaoId" = regioes.id)
);
CREATE POLICY regioes_escrita ON regioes FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE comuns ENABLE ROW LEVEL SECURITY;
CREATE POLICY comuns_leitura ON comuns FOR SELECT USING (app.ve_comum(id) OR id = app.minha_comum());
CREATE POLICY comuns_escrita ON comuns FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY usuarios_leitura ON usuarios FOR SELECT USING (
  id = app.usuario_atual() OR app.ve_aluno(id)
  OR EXISTS (SELECT 1 FROM vinculos v WHERE v."usuarioId" = usuarios.id AND v.ativo
             AND (app.eh_admin() OR app.ve_comum(v."comumId")))
);
CREATE POLICY usuarios_atualiza_proprio ON usuarios FOR UPDATE
  USING (id = app.usuario_atual() OR app.eh_admin())
  WITH CHECK (id = app.usuario_atual() OR app.eh_admin());
CREATE POLICY usuarios_admin ON usuarios FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE vinculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY vinculos_leitura ON vinculos FOR SELECT USING (
  "usuarioId" = app.usuario_atual() OR app.eh_admin() OR app.ve_comum("comumId")
);
CREATE POLICY vinculos_escrita ON vinculos FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE perfis_aluno ENABLE ROW LEVEL SECURITY;
CREATE POLICY perfis_leitura ON perfis_aluno FOR SELECT USING (app.ve_aluno("usuarioId"));
CREATE POLICY perfis_atualiza ON perfis_aluno FOR UPDATE
  USING (app.ve_aluno("usuarioId")) WITH CHECK (app.ve_aluno("usuarioId"));
CREATE POLICY perfis_insere ON perfis_aluno FOR INSERT WITH CHECK (
  "usuarioId" = app.usuario_atual() OR app.eh_admin() OR app.ve_comum("comumId")
);
CREATE POLICY perfis_remove ON perfis_aluno FOR DELETE USING (app.eh_admin());

ALTER TABLE sessoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessoes_proprias ON sessoes FOR ALL
  USING ("usuarioId" = app.usuario_atual() OR app.eh_admin())
  WITH CHECK ("usuarioId" = app.usuario_atual() OR app.eh_admin());

ALTER TABLE solicitacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY solicitacoes_leitura ON solicitacoes FOR SELECT USING (app.ve_aluno("usuarioId"));
CREATE POLICY solicitacoes_insere ON solicitacoes FOR INSERT WITH CHECK ("usuarioId" = app.usuario_atual());
CREATE POLICY solicitacoes_decide ON solicitacoes FOR UPDATE
  USING (app.ve_aluno("usuarioId")) WITH CHECK (app.ve_aluno("usuarioId"));

ALTER TABLE auditorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY auditorias_leitura ON auditorias FOR SELECT USING (app.eh_admin());
CREATE POLICY auditorias_insere ON auditorias FOR INSERT WITH CHECK (true);

-- ------------------------------- catálogo pedagógico: leitura ampla, escrita restrita
-- Método, currículo e unidade são catálogo: quem estuda lê o que está
-- publicado; quem edita conteúdo enxerga rascunho também.

ALTER TABLE categorias_instrumento ENABLE ROW LEVEL SECURITY;
CREATE POLICY categorias_leitura ON categorias_instrumento FOR SELECT USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY categorias_escrita ON categorias_instrumento FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE instrumentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY instrumentos_leitura ON instrumentos FOR SELECT USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY instrumentos_escrita ON instrumentos FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE metodos ENABLE ROW LEVEL SECURITY;
CREATE POLICY metodos_leitura ON metodos FOR SELECT USING (
  status = 'ATIVO' OR app.eh_admin() OR app.tem_papel(ARRAY['INSTRUTOR'])
);
CREATE POLICY metodos_escrita ON metodos FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE metodos_instrumentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY metodos_inst_leitura ON metodos_instrumentos FOR SELECT USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY metodos_inst_escrita ON metodos_instrumentos FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE documentos_metodo ENABLE ROW LEVEL SECURITY;
-- Documento de origem é material de terceiros: só quem administra ou ensina.
CREATE POLICY documentos_leitura ON documentos_metodo FOR SELECT USING (
  app.eh_admin() OR app.tem_papel(ARRAY['INSTRUTOR'])
);
CREATE POLICY documentos_escrita ON documentos_metodo FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE competencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY competencias_leitura ON competencias FOR SELECT USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY competencias_escrita ON competencias FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE configuracoes_metodo ENABLE ROW LEVEL SECURITY;
CREATE POLICY config_metodo_leitura ON configuracoes_metodo FOR SELECT USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY config_metodo_escrita ON configuracoes_metodo FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE curriculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY curriculos_leitura ON curriculos FOR SELECT USING (
  status = 'PUBLICADO' OR app.eh_admin() OR app.tem_papel(ARRAY['INSTRUTOR'])
);
CREATE POLICY curriculos_escrita ON curriculos FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE unidades_curriculares ENABLE ROW LEVEL SECURITY;
CREATE POLICY unidades_leitura ON unidades_curriculares FOR SELECT USING (
  EXISTS (SELECT 1 FROM curriculos c WHERE c.id = unidades_curriculares."curriculoId")
);
CREATE POLICY unidades_escrita ON unidades_curriculares FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE licoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY licoes_leitura ON licoes FOR SELECT USING (
  "statusPublicacao" = 'PUBLICADO' OR app.eh_admin() OR app.tem_papel(ARRAY['INSTRUTOR'])
);
CREATE POLICY licoes_escrita ON licoes FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE versoes_licao ENABLE ROW LEVEL SECURITY;
CREATE POLICY versoes_leitura ON versoes_licao FOR SELECT USING (
  EXISTS (SELECT 1 FROM licoes l WHERE l.id = versoes_licao."licaoId")
);
CREATE POLICY versoes_escrita ON versoes_licao FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE agrupamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY agrupamentos_leitura ON agrupamentos FOR SELECT USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY agrupamentos_escrita ON agrupamentos FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE licoes_agrupamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY licoes_agrup_leitura ON licoes_agrupamentos FOR SELECT USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY licoes_agrup_escrita ON licoes_agrupamentos FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE conteudos ENABLE ROW LEVEL SECURITY;
CREATE POLICY conteudos_leitura ON conteudos FOR SELECT USING (
  publicado OR app.eh_admin() OR app.tem_papel(ARRAY['INSTRUTOR'])
);
CREATE POLICY conteudos_escrita ON conteudos FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE analises_de_metodo ENABLE ROW LEVEL SECURITY;
CREATE POLICY analises_admin ON analises_de_metodo FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

-- ------------------------------------------- dados do aluno (o miolo sensível)

ALTER TABLE arquivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY arquivos_leitura ON arquivos FOR SELECT USING (
  "enviadoPorId" = app.usuario_atual() OR app.eh_admin()
  OR EXISTS (SELECT 1 FROM envios_arquivos ea JOIN envios e ON e.id = ea."envioId"
             WHERE ea."arquivoId" = arquivos.id AND app.ve_aluno(e."alunoId"))
  OR EXISTS (SELECT 1 FROM conteudos c WHERE c."arquivoId" = arquivos.id AND c.publicado)
);
CREATE POLICY arquivos_insere ON arquivos FOR INSERT WITH CHECK ("enviadoPorId" = app.usuario_atual() OR app.eh_admin());
CREATE POLICY arquivos_remove ON arquivos FOR DELETE USING (app.eh_admin());

ALTER TABLE atividades ENABLE ROW LEVEL SECURITY;
CREATE POLICY atividades_leitura ON atividades FOR SELECT USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY atividades_escrita ON atividades FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY envios_leitura ON envios FOR SELECT USING (app.ve_aluno("alunoId"));
CREATE POLICY envios_aluno ON envios FOR INSERT WITH CHECK ("alunoId" = app.usuario_atual());
CREATE POLICY envios_atualiza ON envios FOR UPDATE USING (app.ve_aluno("alunoId")) WITH CHECK (app.ve_aluno("alunoId"));

ALTER TABLE envios_arquivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY envios_arq_leitura ON envios_arquivos FOR SELECT USING (
  EXISTS (SELECT 1 FROM envios e WHERE e.id = envios_arquivos."envioId" AND app.ve_aluno(e."alunoId"))
);
CREATE POLICY envios_arq_escrita ON envios_arquivos FOR ALL USING (
  EXISTS (SELECT 1 FROM envios e WHERE e.id = envios_arquivos."envioId" AND app.ve_aluno(e."alunoId"))
) WITH CHECK (
  EXISTS (SELECT 1 FROM envios e WHERE e.id = envios_arquivos."envioId" AND app.ve_aluno(e."alunoId"))
);

ALTER TABLE avaliacoes_envio ENABLE ROW LEVEL SECURITY;
CREATE POLICY aval_envio_leitura ON avaliacoes_envio FOR SELECT USING (
  EXISTS (SELECT 1 FROM envios e WHERE e.id = avaliacoes_envio."envioId" AND app.ve_aluno(e."alunoId"))
);
CREATE POLICY aval_envio_escreve ON avaliacoes_envio FOR INSERT WITH CHECK (
  "avaliadorId" = app.usuario_atual()
  AND app.tem_papel(ARRAY['INSTRUTOR','ENCARREGADO_LOCAL','ENCARREGADO_REGIONAL','ADMIN_PEDAGOGICO','SUPERADMIN'])
  AND EXISTS (SELECT 1 FROM envios e WHERE e.id = avaliacoes_envio."envioId"
              AND app.ve_aluno(e."alunoId") AND e."alunoId" <> app.usuario_atual())
);

ALTER TABLE avaliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY avaliacoes_leitura ON avaliacoes FOR SELECT USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY avaliacoes_escrita ON avaliacoes FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE criterios_avaliacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY criterios_leitura ON criterios_avaliacao FOR SELECT USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY criterios_escrita ON criterios_avaliacao FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE tentativas_avaliacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY tentativas_leitura ON tentativas_avaliacao FOR SELECT USING (app.ve_aluno("alunoId"));
CREATE POLICY tentativas_insere ON tentativas_avaliacao FOR INSERT WITH CHECK ("alunoId" = app.usuario_atual());
CREATE POLICY tentativas_atualiza ON tentativas_avaliacao FOR UPDATE
  USING (app.ve_aluno("alunoId")) WITH CHECK (app.ve_aluno("alunoId"));

ALTER TABLE questoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY questoes_leitura ON questoes FOR SELECT USING (
  "statusRevisao" = 'APROVADA' OR app.eh_admin() OR app.tem_papel(ARRAY['INSTRUTOR'])
);
CREATE POLICY questoes_escrita ON questoes FOR ALL
  USING (app.eh_admin() OR app.tem_papel(ARRAY['INSTRUTOR']))
  WITH CHECK (app.eh_admin() OR app.tem_papel(ARRAY['INSTRUTOR']));

ALTER TABLE questoes_recebidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY recebidas_leitura ON questoes_recebidas FOR SELECT USING (app.ve_aluno("alunoId"));
CREATE POLICY recebidas_insere ON questoes_recebidas FOR INSERT WITH CHECK ("alunoId" = app.usuario_atual());

ALTER TABLE sessoes_estudo ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessoes_estudo_leitura ON sessoes_estudo FOR SELECT USING (app.ve_aluno("usuarioId"));
CREATE POLICY sessoes_estudo_escrita ON sessoes_estudo FOR ALL
  USING ("usuarioId" = app.usuario_atual()) WITH CHECK ("usuarioId" = app.usuario_atual());

ALTER TABLE batimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY batimentos_leitura ON batimentos FOR SELECT USING (
  EXISTS (SELECT 1 FROM sessoes_estudo s WHERE s.id = batimentos."sessaoEstudoId" AND app.ve_aluno(s."usuarioId"))
);
CREATE POLICY batimentos_insere ON batimentos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sessoes_estudo s WHERE s.id = batimentos."sessaoEstudoId" AND s."usuarioId" = app.usuario_atual())
);

ALTER TABLE visualizacoes_pagina ENABLE ROW LEVEL SECURITY;
CREATE POLICY visualizacoes_leitura ON visualizacoes_pagina FOR SELECT USING (app.ve_aluno("usuarioId"));
CREATE POLICY visualizacoes_escrita ON visualizacoes_pagina FOR ALL
  USING ("usuarioId" = app.usuario_atual()) WITH CHECK ("usuarioId" = app.usuario_atual());

ALTER TABLE tempos_diarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY tempos_leitura ON tempos_diarios FOR SELECT USING (app.ve_aluno("usuarioId"));
CREATE POLICY tempos_escrita ON tempos_diarios FOR ALL
  USING ("usuarioId" = app.usuario_atual()) WITH CHECK ("usuarioId" = app.usuario_atual());

-- ------------------------------------------------- jornadas, turmas, prêmios

ALTER TABLE jornadas_do_aluno ENABLE ROW LEVEL SECURITY;
CREATE POLICY jornadas_leitura ON jornadas_do_aluno FOR SELECT USING (app.ve_aluno("alunoId"));
CREATE POLICY jornadas_escrita ON jornadas_do_aluno FOR ALL
  USING (app.ve_aluno("alunoId")) WITH CHECK (app.ve_aluno("alunoId"));

ALTER TABLE turmas ENABLE ROW LEVEL SECURITY;
CREATE POLICY turmas_leitura ON turmas FOR SELECT USING (
  app.ve_comum("comumId") OR "instrutorId" = app.usuario_atual()
  OR EXISTS (SELECT 1 FROM matriculas_em_turma m WHERE m."turmaId" = turmas.id AND m."alunoId" = app.usuario_atual())
);
CREATE POLICY turmas_escrita ON turmas FOR ALL
  USING (app.ve_comum("comumId")) WITH CHECK (app.ve_comum("comumId"));

ALTER TABLE matriculas_em_turma ENABLE ROW LEVEL SECURITY;
CREATE POLICY matriculas_leitura ON matriculas_em_turma FOR SELECT USING (app.ve_aluno("alunoId"));
CREATE POLICY matriculas_escrita ON matriculas_em_turma FOR ALL
  USING (EXISTS (SELECT 1 FROM turmas t WHERE t.id = matriculas_em_turma."turmaId"
                 AND (app.ve_comum(t."comumId") OR t."instrutorId" = app.usuario_atual())))
  WITH CHECK (EXISTS (SELECT 1 FROM turmas t WHERE t.id = matriculas_em_turma."turmaId"
                 AND (app.ve_comum(t."comumId") OR t."instrutorId" = app.usuario_atual())));

ALTER TABLE progresso_licoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY prog_licoes_leitura ON progresso_licoes FOR SELECT USING (app.ve_aluno("alunoId"));
CREATE POLICY prog_licoes_escrita ON progresso_licoes FOR ALL
  USING (app.ve_aluno("alunoId")) WITH CHECK (app.ve_aluno("alunoId"));

ALTER TABLE progresso_unidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY prog_unidades_leitura ON progresso_unidades FOR SELECT USING (app.ve_aluno("alunoId"));
CREATE POLICY prog_unidades_escrita ON progresso_unidades FOR ALL
  USING (app.ve_aluno("alunoId")) WITH CHECK (app.ve_aluno("alunoId"));

ALTER TABLE regras_progressao ENABLE ROW LEVEL SECURITY;
CREATE POLICY regras_leitura ON regras_progressao FOR SELECT USING (app.usuario_atual() IS NOT NULL);
CREATE POLICY regras_escrita ON regras_progressao FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

-- Medalha e certificado são concedidos por quem acompanha, nunca pelo aluno.
ALTER TABLE medalhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY medalhas_leitura ON medalhas FOR SELECT USING (app.ve_aluno("alunoId"));
CREATE POLICY medalhas_escrita ON medalhas FOR ALL
  USING (app.ve_aluno("alunoId") AND "alunoId" <> app.usuario_atual())
  WITH CHECK (app.ve_aluno("alunoId") AND "alunoId" <> app.usuario_atual());

ALTER TABLE certificados ENABLE ROW LEVEL SECURITY;
CREATE POLICY certificados_leitura ON certificados FOR SELECT USING (app.ve_aluno("alunoId"));
CREATE POLICY certificados_escrita ON certificados FOR ALL
  USING (app.ve_aluno("alunoId") AND "alunoId" <> app.usuario_atual())
  WITH CHECK (app.ve_aluno("alunoId") AND "alunoId" <> app.usuario_atual());

ALTER TABLE importacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY importacoes_admin ON importacoes FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE importacoes_linhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY importacoes_linhas_admin ON importacoes_linhas FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tarefas_admin ON tarefas FOR ALL USING (app.eh_admin()) WITH CHECK (app.eh_admin());

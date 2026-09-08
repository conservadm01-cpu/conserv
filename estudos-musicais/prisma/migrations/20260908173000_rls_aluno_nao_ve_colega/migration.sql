-- Correção de escopo: a comum onde o ALUNO estuda não é escopo de
-- acompanhamento. Antes, `comuns_visiveis()` incluía a comum do próprio
-- perfil, e com isso um aluno enxergava os colegas da mesma comum.
-- Agora a função devolve só o que vem de vínculo (comum ou região), e a
-- leitura da própria comum passa por uma função separada.

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

-- A comum em que o usuário estuda, para ele poder ver a própria comum.
CREATE OR REPLACE FUNCTION app.minha_comum() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT p."comumId" FROM perfis_aluno p WHERE p."usuarioId" = app.usuario_atual() LIMIT 1
$$;

DROP POLICY IF EXISTS comuns_leitura ON comuns;
CREATE POLICY comuns_leitura ON comuns FOR SELECT USING (
  app.ve_comum(id) OR id = app.minha_comum()
);

-- O aluno continua enxergando o próprio perfil (primeira condição de
-- ve_aluno) e agora não alcança mais o do colega.

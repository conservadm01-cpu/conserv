-- Administração de usuários: quem cadastra também edita, dentro do seu escopo.
--
-- Até aqui só a administração global alterava outra pessoa. Isso deixava o
-- trabalho do dia a dia parado numa mesa só: corrigir um nome errado, mudar o
-- telefone, inativar quem saiu, redefinir a senha de quem esqueceu. A regra
-- passa a ser a mesma do cadastro — quem concede um papel administra quem o
-- tem, no seu território — com duas travas próprias da edição:
--
--   • quem não é administração não mexe em quem é administração;
--   • ninguém se tranca fora: o próprio usuário não se inativa (isso fica na
--     aplicação, que é quem conhece a intenção da mudança).

CREATE OR REPLACE FUNCTION app.papeis_do_usuario(alvo text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT coalesce(array_agg(DISTINCT v.papel::text), ARRAY[]::text[])
  FROM vinculos v
  WHERE v."usuarioId" = alvo AND v.ativo AND v."revogadoEm" IS NULL
$$;

/*
 * Pode administrar o cadastro desta pessoa?
 *
 * SECURITY DEFINER porque precisa enxergar os vínculos do ALVO — que a RLS
 * esconderia de quem está perguntando — e porque é chamada de dentro de uma
 * política de `usuarios`, onde uma consulta a `vinculos` sujeita a políticas
 * levaria o planejador de volta ao ponto de partida.
 */
CREATE OR REPLACE FUNCTION app.pode_editar_usuario(alvo text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT
    alvo = app.usuario_atual()
    OR app.eh_admin()
    OR (
      app.pode_cadastrar()
      -- quem não é administração não alcança quem é
      AND NOT (app.papeis_do_usuario(alvo) && ARRAY['SUPERADMIN', 'ADMIN_PEDAGOGICO'])
      -- e só alcança quem tem vínculo numa comum que ele acompanha
      AND EXISTS (
        SELECT 1 FROM vinculos v
        WHERE v."usuarioId" = alvo AND v.ativo AND v."revogadoEm" IS NULL
          AND v."comumId" IN (SELECT comum_id FROM app.comuns_visiveis())
      )
    )
$$;

DROP POLICY IF EXISTS usuarios_atualiza_proprio ON usuarios;
CREATE POLICY usuarios_atualiza ON usuarios FOR UPDATE
  USING (app.pode_editar_usuario(id))
  WITH CHECK (app.pode_editar_usuario(id));

-- Revogar e reativar vínculo: mesma régua. Conceder continua em
-- vinculos_concede (20260908200000_cadastro_fechado), que já limita papel,
-- escopo e território.
CREATE POLICY vinculos_revoga ON vinculos FOR UPDATE
  USING (
    app.tem_papel(ARRAY['ENCARREGADO_REGIONAL', 'ENCARREGADO_LOCAL', 'ANCIAO', 'INSTRUTOR'])
    AND papel IN ('INSTRUTOR', 'ENCARREGADO_LOCAL', 'ANCIAO', 'ALUNO')
    AND escopo = 'COMUM'
    AND app.ve_comum("comumId")
  )
  WITH CHECK (
    app.tem_papel(ARRAY['ENCARREGADO_REGIONAL', 'ENCARREGADO_LOCAL', 'ANCIAO', 'INSTRUTOR'])
    AND papel IN ('INSTRUTOR', 'ENCARREGADO_LOCAL', 'ANCIAO', 'ALUNO')
    AND escopo = 'COMUM'
    AND app.ve_comum("comumId")
  );

-- O perfil do aluno (comum, instrumento, nomes do ministério) acompanha a
-- edição do cadastro: quem administra a pessoa administra a ficha dela.
DROP POLICY IF EXISTS perfis_atualiza ON perfis_aluno;
CREATE POLICY perfis_atualiza ON perfis_aluno FOR UPDATE
  USING (app.ve_aluno("usuarioId") OR app.pode_editar_usuario("usuarioId"))
  WITH CHECK (app.ve_aluno("usuarioId") OR app.pode_editar_usuario("usuarioId"));

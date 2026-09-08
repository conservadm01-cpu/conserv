-- Cadastro fechado: ninguém entra sem ter sido cadastrado por alguém.
--
-- Três mudanças que andam juntas:
--   1. o usuário passa a ter um nome de acesso próprio, além do e-mail;
--   2. a senha definida por quem cadastra é provisória — o dono troca no
--      primeiro acesso e, até lá, nenhuma outra tela abre;
--   3. fica registrado QUEM cadastrou cada pessoa. O único registro sem
--      responsável é o primeiro administrador, que nasce com o sistema.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS "login" TEXT,
  ADD COLUMN IF NOT EXISTS "deveTrocarSenha" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "criadoPorId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_login_key" ON usuarios ("login");

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS "usuarios_criadoPorId_fkey";
ALTER TABLE usuarios
  ADD CONSTRAINT "usuarios_criadoPorId_fkey"
  FOREIGN KEY ("criadoPorId") REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------- entrada por nome
-- O login aceita e-mail ou nome de acesso. A normalização (minúsculas,
-- espaços colapsados) é a mesma dos dois lados, para "RENATO MONTEIRO",
-- "Renato Monteiro" e "renato  monteiro" caírem no mesmo cadastro.

CREATE OR REPLACE FUNCTION app.normalizar_login(p_texto text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(regexp_replace(lower(btrim(coalesce(p_texto, ''))), '\s+', ' ', 'g'), '')
$$;

DROP FUNCTION IF EXISTS app.credenciais_para_login(text);
CREATE FUNCTION app.credenciais_para_login(p_identificacao text)
RETURNS TABLE (id text, senha_hash text, status text, deve_trocar_senha boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT u.id, u."senhaHash", u.status::text, u."deveTrocarSenha"
  FROM usuarios u
  WHERE lower(u.email) = lower(btrim(p_identificacao))
     OR u."login" = app.normalizar_login(p_identificacao)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.credenciais_para_login(text) FROM PUBLIC;

-- A sessão passa a informar se a senha ainda é a provisória, para o servidor
-- prender o usuário na troca antes de qualquer outra tela.
DROP FUNCTION IF EXISTS app.usuario_da_sessao(text);
CREATE FUNCTION app.usuario_da_sessao(p_token_hash text)
RETURNS TABLE (usuario_id text, nome_completo text, email text, deve_trocar_senha boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT u.id, u."nomeCompleto", u.email, u."deveTrocarSenha"
  FROM sessoes s
  JOIN usuarios u ON u.id = s."usuarioId"
  WHERE s."tokenHash" = p_token_hash
    AND s."encerradaEm" IS NULL
    AND s."expiraEm" > now()
    AND u.status = 'ATIVO'
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.usuario_da_sessao(text) FROM PUBLIC;

-- --------------------------------------------- quem pode cadastrar alguém
-- Aluno não cadastra ninguém. Os demais papéis cadastram dentro do seu
-- território — e a matriz fina (instrutor cadastra aluno, encarregado local
-- cadastra instrutor e aluno…) é conferida na aplicação, com testes. Aqui
-- fica o piso que o banco garante mesmo se a aplicação errar.

CREATE OR REPLACE FUNCTION app.pode_cadastrar() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.tem_papel(ARRAY[
    'SUPERADMIN', 'ADMIN_PEDAGOGICO', 'ENCARREGADO_REGIONAL',
    'ENCARREGADO_LOCAL', 'ANCIAO', 'INSTRUTOR'
  ])
$$;

DROP POLICY IF EXISTS usuarios_admin ON usuarios;
CREATE POLICY usuarios_admin ON usuarios FOR ALL
  USING (app.eh_admin()) WITH CHECK (app.eh_admin());

-- Criar a linha do usuário é permitido a quem cadastra; o que limita o
-- alcance é o vínculo, logo abaixo — sem vínculo o cadastro não dá acesso a
-- nada, e o vínculo é territorial.
CREATE POLICY usuarios_insere ON usuarios FOR INSERT
  WITH CHECK (app.pode_cadastrar() AND "criadoPorId" = app.usuario_atual());

DROP POLICY IF EXISTS vinculos_escrita ON vinculos;
CREATE POLICY vinculos_admin ON vinculos FOR ALL
  USING (app.eh_admin()) WITH CHECK (app.eh_admin());

-- Quem não é administração só concede papel de campo, com escopo de comum, e
-- somente em comum que já acompanha. SUPERADMIN e ADMIN_PEDAGOGICO ficam
-- fora do alcance: administrador só é criado por administrador.
CREATE POLICY vinculos_concede ON vinculos FOR INSERT
  WITH CHECK (
    app.tem_papel(ARRAY['ENCARREGADO_REGIONAL', 'ENCARREGADO_LOCAL', 'ANCIAO', 'INSTRUTOR'])
    AND papel IN ('INSTRUTOR', 'ENCARREGADO_LOCAL', 'ANCIAO', 'ALUNO')
    AND escopo = 'COMUM'
    AND "comumId" IS NOT NULL
    AND app.ve_comum("comumId")
    AND "concedidoPorId" = app.usuario_atual()
  );

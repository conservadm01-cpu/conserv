-- Autenticação e RLS: o ovo e a galinha.
--
-- Para saber QUEM é o usuário é preciso ler a tabela de usuários; mas a
-- leitura depende de já se saber quem ele é. A saída são duas portas
-- estreitas, de SECURITY DEFINER, que expõem só o necessário ao handshake.

CREATE OR REPLACE FUNCTION app.credenciais_para_login(p_email text)
RETURNS TABLE (id text, senha_hash text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT u.id, u."senhaHash", u.status::text
  FROM usuarios u
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.usuario_da_sessao(p_token_hash text)
RETURNS TABLE (usuario_id text, nome_completo text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT u.id, u."nomeCompleto", u.email
  FROM sessoes s
  JOIN usuarios u ON u.id = s."usuarioId"
  WHERE s."tokenHash" = p_token_hash
    AND s."encerradaEm" IS NULL
    AND s."expiraEm" > now()
    AND u.status = 'ATIVO'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.credenciais_para_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.usuario_da_sessao(text) FROM PUBLIC;

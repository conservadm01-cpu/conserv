-- Permissões do papel da aplicação sobre um banco JÁ MIGRADO.
--
-- Roda com o DONO do schema (não precisa de superusuário) e é idempotente.
-- Sempre depois de `prisma migrate deploy`: tabela nova criada pela migração
-- só chega ao papel da aplicação quando estes GRANTs passam por aqui.
--
--   psql "$DATABASE_URL_MIGRACAO" -f prisma/infra/permissoes-aplicacao.sql

GRANT USAGE ON SCHEMA public, app TO estudos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO estudos_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO estudos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO estudos_app;

-- Portas estreitas do handshake de autenticação: o login precisa ler a
-- credencial antes de existir sessão, e a RLS ainda não tem por quem filtrar.
-- Ver a migração 20260908180200_funcoes_de_autenticacao.
GRANT EXECUTE ON FUNCTION app.credenciais_para_login(text) TO estudos_app;
GRANT EXECUTE ON FUNCTION app.usuario_da_sessao(text) TO estudos_app;

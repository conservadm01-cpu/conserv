-- Provisionamento do papel da aplicação. Roda UMA VEZ, por um superusuário
-- do banco (não entra nas migrações, que rodam com o usuário do schema).
--   psql "$DATABASE_URL_ADMIN" -v senha="'...'" -f prisma/infra/papel-aplicacao.sql
--
-- O servidor web conecta com este papel: sem BYPASSRLS e sem DDL, para que as
-- políticas de RLS valham inclusive se uma consulta esquecer o filtro.

-- ------------------------------------------------------------- papel da aplicação
-- O servidor web conecta com este papel: sem BYPASSRLS, sem DDL.
-- Cria o papel apenas se ainda não existir (idempotente).
SELECT format('CREATE ROLE estudos_app LOGIN PASSWORD %L NOBYPASSRLS', :'senha')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'estudos_app')
\gexec

-- Atualiza a senha em toda execução, para rotação de credencial.
SELECT format('ALTER ROLE estudos_app PASSWORD %L', :'senha')
\gexec

GRANT USAGE ON SCHEMA public, app TO estudos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO estudos_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO estudos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO estudos_app;

-- Portas estreitas do handshake de autenticação (ver migração
-- 20260908174000_funcoes_de_autenticacao).
GRANT EXECUTE ON FUNCTION app.credenciais_para_login(text) TO estudos_app;
GRANT EXECUTE ON FUNCTION app.usuario_da_sessao(text) TO estudos_app;

-- Criação do papel da aplicação. Roda UMA VEZ, por um superusuário do banco
-- (ou por um papel com CREATEROLE) — não entra nas migrações, que rodam com o
-- usuário dono do schema.
--
--   psql "$DATABASE_URL_ADMIN" -v senha="'...'" -f prisma/infra/papel-aplicacao.sql
--
-- O servidor web conecta com este papel: sem BYPASSRLS e sem DDL, para que as
-- políticas de RLS valham inclusive se uma consulta esquecer o filtro.
--
-- As PERMISSÕES ficam em scripts/permissoes.ts, que roda com o dono do schema
-- DEPOIS DE CADA MIGRAÇÃO (`npm run db:permissoes`). É script de Node, e não
-- psql, para rodar igual na máquina de quem desenvolve e no processo de
-- publicação, onde o cliente de linha de comando não existe.

-- Cria o papel apenas se ainda não existir (idempotente).
SELECT format('CREATE ROLE estudos_app LOGIN PASSWORD %L NOBYPASSRLS', :'senha')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'estudos_app')
\gexec

-- Atualiza a senha em toda execução, para rotação de credencial.
SELECT format('ALTER ROLE estudos_app PASSWORD %L', :'senha')
\gexec

#!/bin/bash
# Roda uma vez, na criação do volume do Postgres.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE DATABASE estudos_musicais_sombra OWNER $POSTGRES_USER;
  CREATE DATABASE estudos_musicais_testes OWNER $POSTGRES_USER;
  CREATE ROLE estudos_app LOGIN PASSWORD 'estudos_app' NOBYPASSRLS;
SQL

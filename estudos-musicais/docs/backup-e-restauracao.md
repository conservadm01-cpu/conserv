# Backup e restauração

São **duas** coisas a copiar, e elas precisam voltar juntas: o **banco** (cadastro,
progresso, avaliações) e o **armazenamento de anexos** (foto, áudio, vídeo dos alunos).
Restaurar só o banco deixa envio apontando para arquivo inexistente.

## Banco

```bash
# Cópia (formato custom permite restauração seletiva)
pg_dump --format=custom --no-owner --file="estudos-$(date +%F-%H%M).dump" "$DATABASE_URL_MIGRACAO"

# Restauração
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL_MIGRACAO" estudos-2026-01-01-0300.dump

# Depois de restaurar, reprovisione o papel da aplicação (ele não vem no dump):
psql "$DATABASE_URL_ADMIN" -v senha=a-senha-de-producao -f prisma/infra/papel-aplicacao.sql
psql "$DATABASE_URL_MIGRACAO" -f prisma/infra/permissoes-aplicacao.sql
```

Conferência mínima depois de restaurar:

```bash
psql "$DATABASE_URL_MIGRACAO" -c "select count(*) from usuarios"
psql "$DATABASE_URL_MIGRACAO" -c "select count(*) from pg_policies where schemaname='public'"
npm run teste:integracao   # as políticas voltaram a valer?
```

## Anexos

```bash
# driver "disco"
tar --create --gzip --file "anexos-$(date +%F).tar.gz" ./armazenamento

# driver "s3" (qualquer serviço compatível)
aws s3 sync "s3://$S3_BUCKET" ./copia-anexos --endpoint-url "$S3_ENDPOINT"
```

## Rotina sugerida

| Quando | O quê | Retenção |
|---|---|---|
| Diário, de madrugada | dump do banco + sync dos anexos | 14 dias |
| Semanal | cópia completa fora do servidor | 8 semanas |
| Mensal | cópia arquivada, com teste de restauração | 12 meses |

**Backup sem restauração testada não é backup.** Restaure o dump mais recente num banco
descartável uma vez por mês e rode `npm run teste:integracao` contra ele.

## Cuidados

- O dump contém **dados pessoais** de alunos: guarde cifrado e com acesso restrito.
- Não versione dumps no repositório.
- Antes de restaurar em produção, avise quem usa: a restauração derruba sessões abertas.

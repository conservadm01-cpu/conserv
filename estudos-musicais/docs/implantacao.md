# Implantação em produção

## 1. Banco

```bash
createdb estudos_musicais
# 1) criação do papel: superusuário (ou CREATEROLE), uma vez só
psql "$DATABASE_URL_ADMIN" -v senha="$SENHA_DO_APP" -f prisma/infra/papel-aplicacao.sql
# 2) migrações: dono do schema — as tabelas e as políticas de RLS vêm daqui
npx prisma migrate deploy
# 3) permissões: dono do schema, SEMPRE DEPOIS das migrações
npm run db:permissoes
# 4) primeiro administrador (só age quando não há nenhum usuário)
npm run db:iniciar
```

O papel `estudos_app` é criado **sem BYPASSRLS** e sem DDL: é com ele que o servidor web
conecta. O papel dono do schema fica reservado a migração, importação e backup.

## 2. Variáveis

Copie `.env.example` e preencha. Os pontos que não podem ficar como estão:

| Variável | Cuidado |
|---|---|
| `SEGREDO_SESSAO` | 32 bytes aleatórios: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `DATABASE_URL` | precisa ser o papel da aplicação, nunca o dono do schema |
| `NODE_ENV` | `production` — é o que liga o cookie `secure` |
| `ARMAZENAMENTO_*` | pasta fora da raiz pública, ou bucket **privado** |

## 3. Build e execução

```bash
npm ci
npx prisma generate
npm run build
npm run start        # ou o container do Dockerfile
```

## 4. HTTPS

Obrigatório. O cookie de sessão é `httpOnly`, `sameSite=lax` e `secure` fora de
desenvolvimento — sem TLS, o navegador não guarda a sessão. Um proxy reverso
(nginx, Caddy, Traefik) resolve, com renovação automática de certificado.

## 5. Primeiro acesso

1. Entre como superadministrador da semente e **troque a senha**.
2. Cadastre as regiões e comuns reais (ou importe por CSV, quando o módulo estiver pronto).
3. Conceda os vínculos de instrutor, encarregado local, encarregado regional e ancião.
4. Só então cadastre alunos: o vínculo de cada um define o que os responsáveis enxergam.
5. Remova os usuários de demonstração (`*@exemplo.org`).

## 6. Depois de subir

- [ ] backup agendado e **restauração testada** (`docs/backup-e-restauracao.md`)
- [ ] `npm run teste:integracao` contra uma cópia da produção
- [ ] `npm audit --omit=dev` revisado a cada atualização do Prisma
- [ ] monitoramento de erro do servidor e do banco
- [ ] política de retenção dos anexos definida com os responsáveis
- [ ] aviso de privacidade publicado e aceite registrado no cadastro

## 7. Atualizações

```bash
git pull && npm ci
npm run db:publicar          # migrar + permissões + primeiro administrador, na ordem
npm run build && npm run start
```

Migração que mexe em política de RLS deve ser revisada com a mesma atenção de código:
é ela que segura o acesso entre comuns e regiões.

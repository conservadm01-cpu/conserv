# Publicar no Vercel

A plataforma é um Next.js com PostgreSQL e Row Level Security. Roda bem no
Vercel, com duas atenções que não são opcionais:

1. **O banco não é do Vercel.** É preciso um PostgreSQL gerenciado (Neon,
   Supabase, Vercel Postgres) com **dois endereços**: um com pooler, para a
   aplicação, e um direto, para as migrações.
2. **O papel da aplicação não pode ignorar a RLS.** A segurança desta
   plataforma depende disso: se o servidor web conectar como dono do banco,
   toda a filtragem por comum e região deixa de valer.

---

## 1. Banco

Crie o banco no provedor e, **no console SQL dele**, crie o papel da aplicação:

```sql
CREATE ROLE estudos_app LOGIN PASSWORD 'uma-senha-forte-e-propria' NOBYPASSRLS;
GRANT CONNECT ON DATABASE <nome_do_banco> TO estudos_app;
```

No Neon e no Supabase isso roda com o papel dono do projeto; não é preciso
superusuário. As **permissões** desse papel sobre as tabelas não vão aqui: elas
são aplicadas a cada publicação, pelo passo 3.

> Se o provedor não deixar criar papel (alguns planos gerenciados não deixam),
> a alternativa é hospedar o banco onde dê — inclusive num contêiner com o
> `docker-compose.yml` deste repositório — e apontar o Vercel para ele.

## 2. Projeto no Vercel

- **Root Directory:** `estudos-musicais`
- **Framework:** Next.js (detectado)
- **Build Command:** deixe o padrão — o `vercel.json` já aponta para
  `npm run vercel-build`, que migra o banco, aplica as permissões, cria o
  primeiro administrador e só então compila.
- **Region:** `gru1` (São Paulo), já fixada no `vercel.json` — o banco deve
  ficar na mesma região, ou cada consulta paga a viagem.

## 3. Variáveis de ambiente

| Variável | Valor | Observação |
|---|---|---|
| `DATABASE_URL` | endereço **com pooler**, papel `estudos_app` | `...-pooler...?sslmode=require&pgbouncer=true` |
| `DATABASE_URL_MIGRACAO` | endereço **direto**, papel dono | o Prisma Migrate não funciona através do pooler |
| `SEGREDO_SESSAO` | 32 bytes aleatórios | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `BANCO_MAX_CONEXOES` | `1` | sem servidor, quem multiplexa é o pooler |
| `PAPEL_APLICACAO` | `estudos_app` | só se você mudou o nome do papel |
| `ADMIN_INICIAL_NOME` | `Renato Monteiro` | usado uma única vez |
| `ADMIN_INICIAL_LOGIN` | `Renato Monteiro` | é o que se digita para entrar |
| `ADMIN_INICIAL_EMAIL` | o e-mail real do administrador | |
| `ADMIN_INICIAL_SENHA` | a senha de entrega | trocada obrigatoriamente na primeira entrada |
| `ARMAZENAMENTO_DRIVER` | `s3` | **`disco` não serve**: o sistema de arquivos é somente leitura |

As variáveis do administrador inicial podem ser removidas depois da primeira
publicação: o script não repete a partida quando já existe usuário.

## 4. Primeira publicação

O `vercel-build` faz, nesta ordem:

```
prisma generate
prisma migrate deploy          # tabelas, funções e políticas de RLS
scripts/permissoes.ts          # GRANTs do papel da aplicação
scripts/iniciar.ts             # primeiro administrador, se não houver nenhum
next build
```

Os três passos do banco são idempotentes: publicar de novo não duplica nada.

**Por que as permissões rodam toda vez, e não só na primeira:** cada migração
pode criar tabela nova — que o papel da aplicação ainda não enxerga — e recriar
função — que perde o `GRANT` que tinha. Pular esse passo derruba o login com
`permission denied for function credenciais_para_login`, que é erro de
provisionamento e não de senha.

## 5. Primeira entrada

Abra o endereço publicado e entre com o nome e a senha que você configurou. O
sistema exige a troca da senha antes de abrir qualquer outra tela, encerra as
sessões e pede a entrada de novo com a senha nova.

A partir daí não existe autocadastro: cada pessoa é cadastrada em
**Painel → Cadastrar pessoa** por alguém que já tem acesso, recebe uma senha
provisória e a troca na primeira entrada.

## 6. O que conferir depois de publicar

```sql
-- o servidor web NÃO pode ignorar a RLS
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'estudos_app';
--  esperado: f | f

-- toda tabela de dados com RLS ligada
SELECT count(*) FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace AND NOT relrowsecurity;
--  esperado: 0 (fora _prisma_migrations)
```

## Limites conhecidos

- **Anexos** (foto, áudio, vídeo) exigem `ARMAZENAMENTO_DRIVER=s3`. O envio de
  atividades ainda não está implementado, então isso só pesa quando aquela
  parte entrar.
- **O app de estudo em `/estudar` não funciona offline dentro da plataforma**,
  de propósito: as telas dependem de sessão no servidor, e uma cópia offline
  delas enganaria quem a abrisse. A versão que roda sozinha continua offline.
- **Tempo de resposta a frio.** Sem servidor, a primeira consulta depois de um
  período parado paga a abertura de conexão. Um plano com banco na mesma região
  resolve a maior parte.

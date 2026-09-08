# Estudos Musicais

Plataforma de estudos musicais para alunos, instrutores, encarregados locais,
encarregados regionais e anciães, com controle de acesso por **comum-congregação**,
**região**, **instrumento** e **fase**, e com o índice do **MSA** navegável por assunto
(escala → clave → compasso → fase → exercício → página).

> **Estado desta entrega.** Esta é a primeira etapa, e ela é **funcional, não maquete**:
> banco modelado e migrado, RLS ativa, autenticação, autorização por vínculo, importador
> do MSA com conferência, regras pedagógicas calculadas e testadas, telas de aluno,
> índice por assunto e painel de acompanhamento. O que **ainda não está pronto** está
> listado, sem rodeio, na seção [O que falta](#o-que-falta).

---

## Sumário

- [Como rodar](#como-rodar)
- [Arquitetura](#arquitetura)
- [Segurança e permissões](#segurança-e-permissões)
- [Importação do MSA](#importação-do-msa)
- [Regras pedagógicas](#regras-pedagógicas)
- [Testes](#testes)
- [Backup e restauração](#backup-e-restauração)
- [Publicação em produção](#publicação-em-produção)
- [Direitos autorais e privacidade](#direitos-autorais-e-privacidade)
- [O que falta](#o-que-falta)

---

## Como rodar

Com Docker:

```bash
cp .env.example .env          # ajuste as senhas
docker compose up -d banco
npm install
npm run preparar              # migrações + papel da aplicação + seeds
npm run dados:importar -- dados/MSA_indice.xlsx --aplicar
npm run dev                   # http://localhost:3000
```

Sem Docker, com PostgreSQL 16 local:

```bash
createdb estudos_musicais && createdb estudos_musicais_sombra && createdb estudos_musicais_testes
psql "$DATABASE_URL_MIGRACAO" -v senha=uma-senha-forte -f prisma/infra/papel-aplicacao.sql
npm install && npm run preparar
```

### Acessos da demonstração

Todos com a senha `Estudos2026` (trocar antes de qualquer uso real):

| Papel | E-mail | Escopo |
|---|---|---|
| Superadministrador | `renato@exemplo.org` | global |
| Administração pedagógica | `ana.pedagogica@exemplo.org` | global |
| Instrutor | `paulo.instrutor@exemplo.org` | comum Jardim Aeroporto |
| Instrutor | `marcos.instrutor@exemplo.org` | comum Centro (outra região) |
| Encarregado local | `jose.local@exemplo.org` | comum Jardim Aeroporto |
| Encarregado regional | `antonio.regional@exemplo.org` | região Norte |
| Ancião | `benedito.anciao@exemplo.org` | comum Jardim Aeroporto |
| Alunos | `maria.aluna@` · `joao.aluno@` · `pedro.aluno@` · `lucas.aluno@` | as suas comuns |

---

## Arquitetura

| Camada | Escolha | Por quê |
|---|---|---|
| Interface | Next.js 16 (App Router), React 19, TypeScript, Tailwind | server components consultam o banco já no servidor; PWA instalável |
| Banco | PostgreSQL 16 + Prisma 7 (adapter `pg`) | RLS de verdade, migrações versionadas |
| Autenticação | sessão em cookie httpOnly + scrypt (`node:crypto`) | sem dependência externa; o cookie não carrega papel nem comum |
| Armazenamento | driver `disco` ou qualquer S3 compatível | nada obrigatório e pago; integração substituível |
| Fila | tabela `tarefas` no próprio banco | funciona sem Redis; o driver pode ser trocado |

```
src/
  app/                 telas (App Router)
    entrar/            login
    aluno/             trilha, liberações e dedicação do aluno
    assunto/           navegação escala → clave → compasso → fase
    licao/[id]/        a lição com as versões por clave e as páginas
    painel/            acompanhamento de quem tem vínculo
    painel/aluno/[id]/ ficha do aluno (com checagem de escopo)
  lib/
    banco.ts           conexão; `comoUsuario()` fixa o contexto da RLS
    autorizacao.ts     escopo por vínculo, `podeVerAluno`, guardas
    sessao.ts          cookie, abertura e encerramento de sessão
    senha.ts           scrypt com parâmetros embutidos no resumo
    regras.ts          cálculo das regras pedagógicas (A, B, C, D)
    msa/importacao.ts  normalização e conferência do índice do MSA
    planilha/leitor.ts leitor de .xlsx sem dependência externa
prisma/
  schema.prisma        42 tabelas
  migrations/          inclui as políticas de RLS
  infra/               provisionamento do papel da aplicação
scripts/               importar-msa, semear, preparar-testes
testes/                unitários e de integração (banco real)
```

---

## Segurança e permissões

**A regra que orienta tudo:** papel, comum e região **nunca** vêm do navegador. O cookie
carrega apenas um segredo de sessão; o servidor resolve os vínculos, e o banco repete a
checagem por conta própria. São duas cercas independentes.

### Perfis

`SUPERADMIN`, `ADMIN_PEDAGOGICO`, `INSTRUTOR`, `ENCARREGADO_LOCAL`, `ENCARREGADO_REGIONAL`,
`ANCIAO` e `ALUNO`. Um usuário pode ter mais de um vínculo; cada vínculo tem **escopo**
(`GLOBAL`, `REGIAO` ou `COMUM`) e é concedido por quem administra — ninguém se promove.

### Row Level Security

Todas as tabelas de dados têm RLS ativa. A aplicação conecta com o papel `estudos_app`,
**sem `BYPASSRLS`**, e a cada requisição declara só quem é o usuário:

```sql
SELECT set_config('app.usuario_id', $1, true);
```

O banco resolve o resto por funções próprias: `app.comuns_visiveis()`, `app.ve_aluno()`,
`app.eh_admin()`, `app.minha_comum()`. Consequência prática: **uma consulta que esqueça o
filtro continua devolvendo apenas o escopo do usuário**.

Duas exceções necessárias, e só duas, ambas de escopo estreito e `SECURITY DEFINER`:
`app.credenciais_para_login(email)` (devolve id, resumo da senha e situação — nada mais) e
`app.usuario_da_sessao(hash)` (troca o resumo do cookie pelo usuário). Sem elas, seria
impossível autenticar: para ler o usuário seria preciso já saber quem ele é.

### Senhas

`scrypt` (N=2¹⁵, r=8), sal por usuário, parâmetros gravados no próprio resumo — dá para
elevar o custo no futuro sem invalidar as senhas existentes. Nunca se guarda senha em texto.

---

## Importação do MSA

> A planilha do índice e o PDF do método são **material de terceiros** e por isso **não
> ficam no repositório** (`dados/*.xlsx` e `dados/*.pdf` estão no `.gitignore`). Quem for
> operar coloca o arquivo em `dados/` antes de importar. Sem ele, os testes do índice são
> pulados com aviso, e os demais continuam rodando.

```bash
npm run dados:importar -- dados/MSA_indice.xlsx            # prévia, não grava
npm run dados:importar -- dados/MSA_indice.xlsx --aplicar  # grava
```

A fonte primária é a aba **Índice detalhado** (212 linhas), que é o superconjunto das
demais; as outras abas entram como **conferência cruzada**. O importador não corrige nada
sozinho: divergência vira registro.

O que o importador **respeita**, por decisão declarada:

- não cria exercício, página, tonalidade ou compasso que a fonte não traga;
- mantém separadas **página impressa**, **página do arquivo** e **número original**;
- exercício sem altura definida **não recebe tonalidade**;
- clave adotada para organização é preservada **como adotada**, não como escrita no método;
- o que passa dos limites informados do arquivo (150 páginas, página impressa 151,
  exercício 112) entra como **divergente**;
- **nada é publicado pela importação** — publicar é ato do administrador pedagógico.

Resultado da importação atual (relatório completo em `docs/importacao-msa.md`):

| Situação | Lições |
|---|---|
| Conferido | 16 |
| Pendente de conferência | 135 |
| Divergente das fontes | 2 |

As duas divergências são os exercícios 112 e 113 da fase 16, nas páginas impressas 152 a
156 — além do fim do arquivo informado. **Não foram descartados nem "ajustados":** ficaram
marcados, com o motivo, esperando conferência humana.

---

## Regras pedagógicas

Ficam em tabela (`regras_progressao`), com **versão**; cada liberação registra a versão que
a concedeu. O cálculo está em `src/lib/regras.ts`, com testes.

| Código | O que faz |
|---|---|
| `A-PRE-REQUISITO-MSA` | Fases 1 a 5 do MSA **aprovadas** liberam os métodos do instrumento |
| `B-APROVEITAMENTO-HINARIO` | 40% de aproveitamento aprovado no método do instrumento libera o Hinário |
| `C-AVANCO-DE-FASE` | Avanço exige pré-requisitos, aproveitamento e **aprovação do instrutor** |
| `D-CONCLUSAO` | Conclusão exige todas as etapas, avaliações e validação final |

**Os 40% são regra desta plataforma, não determinação do MSA.** O cálculo é declarado:

- soma dos **pesos aprovados** ÷ soma dos **pesos elegíveis**;
- conta apenas unidade **aprovada** — página aberta, lição iniciada e tempo de tela **não** entram;
- lição que aparece em vários agrupamentos conta **uma vez**;
- pesos configuráveis por atividade;
- o aluno vê o percentual e **quanto falta**.

Exemplo do enunciado, coberto por teste: 20 unidades elegíveis de peso igual, 8 aprovadas = 40%.

---

## Testes

```bash
npm run teste             # unitários (regras, leitor de planilha, importação)
npm run teste:integracao  # autorização contra PostgreSQL real
```

Os testes de integração **tentam atravessar o escopo** e exigem falha: ler aluno de outra
comum, de outra região, trocar o id na URL, promover-se a instrutor, conceder medalha a si
mesmo, alterar o material do método. Também conferem que o papel da aplicação não ignora RLS.

Dois deles já pegaram defeito real durante o desenvolvimento: um vazamento em que o aluno
enxergava colegas da própria comum, e uma consulta de autorização que rodava sem contexto.

---

## Backup e restauração

Ver `docs/backup-e-restauracao.md`. Resumo:

```bash
pg_dump --format=custom --file=estudos-$(date +%F).dump "$DATABASE_URL_MIGRACAO"
pg_restore --clean --if-exists --dbname "$DATABASE_URL_MIGRACAO" estudos-2026-01-01.dump
```

O backup do banco **não** cobre os anexos: a pasta de armazenamento (ou o bucket S3) precisa
de cópia própria. Os dois devem ser restaurados juntos, sob pena de ficarem envios sem arquivo.

---

## Publicação em produção

Ver `docs/implantacao.md`. Em resumo: `npm ci && npm run build`, `prisma migrate deploy`,
papel da aplicação provisionado com senha própria, `SEGREDO_SESSAO` de 32 bytes,
HTTPS obrigatório (o cookie de sessão é `secure` fora de desenvolvimento) e backup agendado.

### Sobre `npm audit`

As vulnerabilidades reportadas hoje vêm todas da **cadeia de ferramentas de desenvolvimento**
(CLI do Prisma → `@prisma/config`/`deepmerge-ts`/`mysql2`), não do caminho de execução do
servidor. O runtime em produção é `next`, `react`, `@prisma/client`, `pg` e `zod`.
Confira a cada atualização do Prisma e registre a conclusão em `docs/implantacao.md`.

---

## Direitos autorais e privacidade

- A plataforma guarda **referências** ao método (fase, tópico, exercício, página) e **não
  distribui** o arquivo do MSA nem do Hinário. Publicar material protegido depende de
  autorização de quem detém os direitos.
- Marcas e identidade visual oficiais não são usadas.
- Dados pessoais (aluno, contato, responsável legal) ficam no banco da instituição, com
  acesso limitado por vínculo e registro de auditoria nos acessos administrativos.
- Anexos (foto, áudio, vídeo) são **privados**: o acesso passa por rota autenticada que
  confere o vínculo de quem pede; nada é público por padrão.

---

## O que falta

Entregue nesta etapa: modelo de dados completo, RLS, autenticação, autorização, importador
do MSA com conferência, regras pedagógicas, seeds, telas de aluno/assunto/lição/painel,
testes e documentação.

Ainda **não** implementado — e é trabalho de verdade, não ajuste:

1. **Envio de atividades** (foto, áudio, vídeo) com armazenamento privado, URLs temporárias
   e o fluxo de correção do instrutor. O modelo de dados já existe (`atividades`, `envios`,
   `avaliacoes_envio`, `arquivos`).
2. **Banco de questões e avaliações** na interface: o modelo existe (`questoes`,
   `avaliacoes`, `tentativas_avaliacao`, `questoes_recebidas`, que já guarda a assinatura
   para a pergunta não repetir), falta a tela e o motor de sorteio.
3. **Tempo de estudo**: modelo pronto (`sessoes_estudo`, `batimentos`,
   `visualizacoes_pagina`, `tempos_diarios`); falta o batimento no cliente e a validação
   no servidor.
4. **Medalhas e certificados**: modelo pronto; falta a emissão e o PDF.
5. **Importação em lote de comuns e regiões por CSV** com prévia e detecção de duplicidade.
6. **CMS de conteúdo** (publicar, revisar, editar lição) — hoje a publicação é feita por
   script/seed.
7. **Relatórios exportáveis** (CSV/Excel/PDF) e os gráficos de evolução.
8. **Fila em execução**: a tabela existe; falta o processo trabalhador.
9. **O PDF do MSA não foi fornecido a esta sessão** — só as 10 páginas de amostra. O
   importador de PDF (`MSA_PDF`) está previsto no modelo, mas a validação página a página
   contra o documento **não pôde ser executada**. Quando o arquivo estiver disponível, é ele
   que vai reduzir as 135 pendências.

# Estudos Musicais

Plataforma **multimétodos e multi-instrumentos** de estudos musicais, para alunos,
instrutores, encarregados locais, encarregados regionais e anciães, com controle de acesso
por **comum-congregação**, **região**, **instrumento** e **unidade do método**.

> **A decisão que orienta a arquitetura.** A plataforma **não é feita para um método**.
> MSA, Melodia em Movimento e o método de cada instrumento são **linhas de tabela**, com
> estrutura, competências e critérios próprios. Não existe `if metodo == "MSA"` no código —
> e há teste que cobra isso. Cadastrar um método novo é cadastrar dados; um formato de
> documento novo é escrever um analisador e acrescentá-lo a uma lista.

> **Estado desta entrega.** É **funcional, não maquete**: banco modelado e migrado, RLS
> ativa, autenticação, autorização por vínculo, análise de método com revisão humana
> obrigatória, currículo em árvore de profundidade livre, jornadas simultâneas por aluno,
> turmas, critérios por método, regras pedagógicas calculadas e testadas, telas de aluno,
> jornada, assunto, lição, turmas e central administrativa. O que **ainda não está pronto**
> está listado, sem rodeio, na seção [O que falta](#o-que-falta).

---

## Sumário

- [Como rodar](#como-rodar)
- [Acesso: cadastro fechado](#acesso-cadastro-fechado)
- [Arquitetura](#arquitetura)
- [Métodos, instrumentos e currículos](#métodos-instrumentos-e-currículos)
- [Segurança e permissões](#segurança-e-permissões)
- [Analisar um método](#analisar-um-método)
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
npm run preparar              # migrações + permissões do papel + seeds
npm run dev                   # http://localhost:3000
```

Sem Docker, com PostgreSQL 16 local:

```bash
createdb estudos_musicais && createdb estudos_musicais_sombra && createdb estudos_musicais_testes
psql "$DATABASE_URL_ADMIN" -v senha=uma-senha-forte -f prisma/infra/papel-aplicacao.sql
npm install && npm run preparar
```

`papel-aplicacao.sql` cria o papel e pede superusuário; roda **uma vez**. As permissões
ficam em `scripts/permissoes.ts` e precisam rodar **depois de cada migração**
(`npm run db:permissoes`): migração pode criar tabela que o papel da aplicação ainda não
enxerga e recriar função que perde o `GRANT`. É script de Node, e não psql, para rodar
igual aqui e no processo de publicação. `npm run preparar` já faz tudo na ordem certa.

A semente monta três métodos, para a plataforma não parecer feita para um só:

| Método | Escopo | Estrutura |
|---|---|---|
| MSA | transversal, compartilhado com todos os instrumentos | 16 fases → 33 módulos, se `dados/MSA_indice.xlsx` estiver presente |
| Melodia em Movimento | transversal | **cadastrado e sem currículo**: o documento ainda não foi analisado, e é assim que fica |
| Método de demonstração — cordas | do instrumento (violino) | 2 níveis → 3 fases → 6 módulos, de um sumário em texto |

O método de cordas é **fictício e declarado como tal** (`dados/metodo-demonstracao.md`):
existe para provar profundidade variável e critérios próprios, não para estudo.

### Primeiro acesso de um sistema novo

Banco vazio, sem nenhuma pessoa cadastrada:

```bash
npm run db:iniciar     # cria o PRIMEIRO administrador e mais ninguém
```

Ele entra com o nome (`Renato Monteiro`, sem diferenciar maiúsculas nem
espaços a mais) ou com o e-mail, usando a senha inicial — e o sistema **exige a
troca da senha antes de abrir qualquer outra tela**. A partir daí, todo cadastro
é feito por quem já tem acesso.

O script tem trava: se já existir qualquer usuário, ele não faz nada. Nome,
login, e-mail e senha iniciais saem de `ADMIN_INICIAL_*` (ver `.env.example`).

### Acessos da demonstração

`npm run db:semear` popula um cenário de demonstração — território, pessoas de
cada perfil, três métodos e turmas. É o oposto de `db:iniciar`: serve para
conhecer o sistema, não para começar um de verdade.

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

## Acesso: cadastro fechado

**Não existe autocadastro.** Toda conta é criada por alguém que já tem acesso, e
fica registrado quem a criou (`usuarios.criadoPorId`). A única conta sem
responsável é a do primeiro administrador, que nasce com o sistema.

### Quem cadastra quem

| Quem cadastra | Pode conceder | Onde |
|---|---|---|
| Superadministrador | qualquer perfil | qualquer abrangência |
| Administração pedagógica | todos, menos superadministrador | qualquer abrangência |
| Encarregado regional | encarregado local, ancião, instrutor, aluno | comuns da sua região |
| Encarregado local · ancião | instrutor, aluno | a sua comum |
| Instrutor | aluno | a sua comum |
| Aluno | ninguém | — |

Um perfil **nunca concede acima de si**, e há teste que percorre a matriz
inteira para garantir. A regra vive em `src/lib/cadastro.ts` (primeira cerca) e
as políticas de RLS repetem o piso no banco (segunda cerca): quem não é
administração só concede papel de campo, com escopo de comum, e apenas em comum
que já acompanha — mesmo que a tela deixe passar.

### Administrar quem já existe

Quem cadastra também administra, no mesmo território: **Painel → Pessoas** lista
quem está sob a sua responsabilidade e abre a ficha de cada um para corrigir nome,
e-mail, nome de acesso e telefone, conceder ou retirar perfil, mudar a situação
(ativo, pendente, inativo, bloqueado) e redefinir a senha.

Três travas próprias da edição, que o cadastro não precisa ter:

- **quem não é administração não mexe em quem é** — a ficha de um administrador só
  abre para outro administrador;
- **não se edita quem não se poderia ter cadastrado** — um instrutor concede apenas
  o papel de aluno, então também só administra alunos;
- **ninguém se tranca fora** — o próprio usuário não se inativa nem retira o
  próprio vínculo de superadministrador, e o último superadministrador ativo não
  pode perder o papel.

Inativar ou redefinir a senha **encerra as sessões abertas** daquela pessoa na hora.
Toda alteração fica na auditoria, com o antes e o depois.

### A senha provisória

Quem cadastra não escolhe a senha do outro — nem ao cadastrar, nem ao redefinir:
o sistema gera uma legível (`rimi-vuce-5849`), mostra **uma vez** para ser entregue
em mãos, e marca a conta com `deveTrocarSenha`. Enquanto o dono não trocar, `usuarioDaTela()` traz
qualquer rota de volta para a troca — a conta existe, mas não abre nada com uma
senha que outra pessoa conhece. Ao trocar, as sessões abertas são encerradas.

### Entrada por nome ou e-mail

O login aceita os dois, com a mesma normalização de um lado e do outro
(`app.normalizar_login` no banco, `normalizarLogin` na aplicação):
`RENATO MONTEIRO`, `Renato Monteiro` e `renato  monteiro` caem no mesmo cadastro.

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
    entrar/            login por nome de acesso ou e-mail
    trocar-senha/      troca obrigatória da senha provisória
    estudar/           o app de estudo, servido dentro da plataforma
    aluno/             as jornadas do aluno (uma por método)
    jornada/[id]/      currículo, liberações e critérios daquele método
    assunto/           navegação método → escala → clave → compasso
    licao/[id]/        a lição, com proveniência e versões por clave
    painel/            acompanhamento de quem tem vínculo
    painel/turmas/     central do instrutor: instrumento → método → turma → unidade
    painel/cadastrar/  cadastro de pessoas (única porta de entrada de uma conta)
    painel/pessoas/    quem tem acesso, e a ficha de cada um para administrar
    painel/aluno/[id]/ ficha do aluno (com checagem de escopo)
    admin/metodos/     central administrativa: métodos, currículos, fila de análises
  lib/
    banco.ts           conexão; `comoUsuario()` fixa o contexto da RLS
    autorizacao.ts     escopo por vínculo, `podeVerAluno`, guardas
    sessao.ts          cookie, abertura e encerramento de sessão
    senha.ts           scrypt com parâmetros embutidos no resumo
    regras.ts          cálculo das regras pedagógicas e critérios por método
    cadastro.ts        quem cadastra e administra quem, com qual papel e onde
    metodos/
      estrutura.ts     o contrato genérico: unidade, item, proveniência
      analisadores/    um por FORMATO de documento, nunca por método
      aplicar.ts       análise → revisão humana → currículo → publicação
      isolamento.ts    o que cruza de um método para outro, e sob que condição
    planilha/leitor.ts leitor de .xlsx sem dependência externa
prisma/
  schema.prisma        48 tabelas
  migrations/          inclui as políticas de RLS
  infra/               papel da aplicação e permissões
public/
  estudar/             o app de estudo (cópia de ../musica), servido em /estudar
scripts/               iniciar, permissoes, publicar-banco, importar-metodo,
                       semear, preparar-testes
testes/                unitários e de integração (banco real)
```

---

## Métodos, instrumentos e currículos

O núcleo é **method-agnostic**: nenhuma função pergunta qual método está processando.

| Entidade | Papel |
|---|---|
| `instrumentos` | o instrumento e as suas claves, transposição e extensão |
| `metodos` | método cadastrado; `escopo` diz se é de um instrumento ou transversal |
| `metodos_instrumentos` | autorização explícita de um método para um instrumento |
| `documentos_metodo` | o documento de origem — é a ele que a proveniência aponta |
| `analises_de_metodo` | a estrutura **proposta**, que espera decisão humana |
| `curriculos` | uma versão da estrutura de um método |
| `unidades_curriculares` | a árvore: `NIVEL`, `FASE`, `MODULO`, `AULA` ou `TOPICO` |
| `licoes` / `versoes_licao` | o item de estudo e as suas versões por clave |
| `competencias` | as competências **daquele** método |
| `configuracoes_metodo` | os critérios **daquele** método, versionados |
| `jornadas_do_aluno` | um aluno em um método (e instrumento); várias ao mesmo tempo |
| `turmas` / `matriculas_em_turma` | comum + instrumento + método + unidade + instrutor |

### Profundidade é do método, não do código

Não há tabela de "fase" nem de "tópico". A árvore de `unidades_curriculares` guarda o
**caminho materializado** (`1/1.4/1.4.2`), e cada método escolhe quantos níveis usa: o MSA
importado fica em duas camadas (fase → módulo); o método de cordas da semente fica em três
(nível → fase → módulo). A mesma tela desenha os dois.

### Isolamento pedagógico

Conteúdo de um método **não** entra em outro. As duas exceções precisam existir juntas:
a lição está marcada como `compartilhado` **e** o método de origem está autorizado para o
instrumento daquela jornada (`metodos_instrumentos`). Sem as duas, o conteúdo não aparece —
e a função diz **por quê**, para a tela poder explicar em vez de sumir com o item.

Isso vale também para os critérios: `criteriosDoMetodo()` resolve percentual, nota mínima,
número de questões, tentativas e exigência de instrutor a partir da configuração **daquele**
método. O que o método não declara cai no **padrão da plataforma**, sinalizado na tela como
tal — nunca no critério de outro método. Na semente, o MSA exige 40% e o método de cordas
exige 60%; a central do instrutor mostra os dois lado a lado.

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

## Analisar um método

> Os documentos dos métodos são **material de terceiros** e por isso **não ficam no
> repositório** (`dados/*.xlsx` e `dados/*.pdf` estão no `.gitignore`). Quem for operar
> coloca o arquivo em `dados/` antes de importar. Sem ele, os testes que dependem do índice
> são pulados com aviso, e os demais continuam rodando.

```bash
# prévia: lê, confere e não grava nada
npm run metodo:importar -- dados/UM_METODO.xlsx

# grava a ANÁLISE (que ainda espera revisão humana)
npm run metodo:importar -- dados/UM_METODO.xlsx --metodo=COD --nome="Nome do método" --registrar

# confirma, com responsável registrado, e cria o currículo em rascunho
npm run metodo:importar -- dados/UM_METODO.xlsx --metodo=COD --registrar \
  --confirmar --revisor=ana.pedagogica@exemplo.org --parecer="conferido contra o índice"
```

Nenhuma dessas linhas menciona um método específico dentro do código: o **analisador é
escolhido pelo formato do arquivo**.

| Analisador | Lê | Propõe |
|---|---|---|
| `indice-em-planilha` | `.xlsx` com uma linha por item | duas camadas, com versões por clave |
| `sumario-em-texto` | `.txt`/`.md` com `#` e `-` | a profundidade que o sumário tiver |

As colunas da planilha são reconhecidas **por sinônimo**: `Fase`/`Nível`/`Etapa`,
`Tópico`/`Módulo`/`Unidade`, `Exercício`/`Lição`/`Item`. Uma planilha que chame a coluna de
"Tópico do MSA" e outra que chame de "Módulo" são lidas pelo mesmo código.

### A revisão humana é obrigatória

Analisar é **propor**. A estrutura sugerida entra como `analises_de_metodo` com situação
`SUGERIDA` e só vira currículo depois de uma pessoa **CONFIRMAR**, **EDITAR** ou
**REJEITAR** — decisão gravada com nome, data e parecer (obrigatório ao editar ou rejeitar).
Rejeitar não deixa rastro de currículo; a mesma análise não é decidida duas vezes. Há teste
de integração para cada uma dessas três afirmações.

Mesmo depois de confirmada, **nada é publicado**: o currículo nasce em rascunho e publicar
é ato à parte do responsável pedagógico, que libera apenas o que está conferido.

### Proveniência

Toda unidade e toda lição guardam de onde vieram: método, instrumento, unidade,
`documentoOrigemId`, página inicial e final e a referência textual. A tela da lição mostra
isso em campo próprio, não em rodapé.

### O que a análise respeita, por decisão declarada

- não cria item, página, tonalidade ou compasso que a fonte não traga;
- mantém separadas **página impressa**, **página do arquivo** e **número original**;
- item sem altura definida **não recebe tonalidade**;
- clave adotada para organização é preservada **como adotada**, não como escrita no método;
- limites do documento são **parâmetro de quem importa**, não verdade universal: o que
  passa deles vira **divergente**, nunca dado corrigido em silêncio;
- as demais abas entram como **conferência cruzada**, escolhidas pelo formato que têm; o que
  não puder ser conferido vira **aviso**, para ninguém achar que foi conferido.

Resultado da análise do índice do MSA com os limites informados para aquela edição
(150 páginas de arquivo, página impressa 151, exercício 112) — relatório completo em
`docs/analise-de-metodo.md`:

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
| `A-PRE-REQUISITO-BASE` | Unidades iniciais do método de base **aprovadas** liberam os métodos do instrumento |
| `B-APROVEITAMENTO-REPERTORIO` | Aproveitamento aprovado no próprio método libera o repertório da etapa |
| `C-AVANCO-DE-UNIDADE` | Avanço exige pré-requisitos, aproveitamento e, se o método exigir, **aprovação do instrutor** |
| `D-CONCLUSAO` | Conclusão da jornada exige todas as unidades, avaliações e validação final |

Nenhuma regra traz o nome de um método no código: qual é o método de base, quais unidades
e qual percentual vêm dos **parâmetros da regra** e da **configuração do método**. Nas
regras B e C o percentual é uma referência (`ConfiguracaoDoMetodo.…`) resolvida por jornada.

**Os 40% são regra desta plataforma para o método de base, não determinação do método.**
O cálculo é declarado:

- soma dos **pesos aprovados** ÷ soma dos **pesos elegíveis**;
- conta apenas unidade **aprovada** — página aberta, lição iniciada e tempo de tela **não** entram;
- lição que aparece em vários agrupamentos conta **uma vez**;
- pesos configuráveis por atividade;
- o aluno vê o percentual e **quanto falta**.

Exemplo do enunciado, coberto por teste: 20 unidades elegíveis de peso igual, 8 aprovadas = 40%.
Outro teste cobra o isolamento: as mesmas 8 de 20 **liberam** num método que exige 40% e
**não liberam** noutro que exige 60%.

---

## Testes

```bash
npm run teste             # unitários: regras, critérios, analisadores, cadastro
npm run teste:preparar    # prepara o banco de testes (migrações, permissões, seeds)
npm run teste:integracao  # autorização e isolamento contra PostgreSQL real
```

60 testes unitários e 46 de integração.

Os de **autorização** tentam atravessar o escopo e exigem falha: ler aluno de outra comum,
de outra região, trocar o id na URL, promover-se a instrutor, conceder medalha a si mesmo,
matricular aluno em turma de outra comum, alterar o material do método. Também conferem que
o papel da aplicação não ignora RLS.

Os de **cadastro fechado** cobram que aluno não crie conta para ninguém, que
quem cadastra não possa se esconder atrás de outro responsável, que instrutor não
conceda papel de administração nem cadastre em comum de outra região — e que o
cadastro legítimo, na própria comum, passe.

Os de **edição** cobram o outro lado: instrutor altera o aluno da sua comum e não
o de outra região, quem não é administração não altera o cadastro da administração,
aluno não se promove mexendo no próprio vínculo, e a função de escopo enxerga os
vínculos de quem está sendo editado — não os de quem pergunta.

Os de **isolamento pedagógico** cobram a outra promessa: que os critérios de um método não
caiam sobre outro, que as competências não se misturem, que o filtro de conteúdo só deixe
passar o que é compartilhado **e** autorizado, que as jornadas do mesmo aluno sejam
independentes, e que análise rejeitada não deixe currículo.

Um teste vale por si: `nenhum analisador conhece o nome de um método` falha se alguém
escrever o nome de um método na identidade de um analisador.

Um defeito que só apareceu ao exercitar o sistema como um instrutor, e não como
administrador: no PostgreSQL, `INSERT ... RETURNING` — que o Prisma usa em toda
gravação — exige que a linha nova passe **também** pela política de leitura.
Enquanto a política de escrita foi mais larga que a de leitura, cadastrar uma
pessoa e registrar auditoria quebravam para todo mundo que não fosse
administração, com uma mensagem enganosa (`new row violates row-level security
policy`). Corrigido em `20260908220000_corrige_leitura_apos_gravar`, com teste
que grava **com** `RETURNING` — o teste anterior não reproduzia o caminho da
aplicação e por isso passava.

Outros três defeitos reais foram pegos por estes testes durante o desenvolvimento: um vazamento em
que o aluno enxergava colegas da própria comum; uma consulta de autorização que rodava sem
contexto de RLS; e uma **recursão infinita** entre as políticas de `turmas` e
`matriculas_em_turma` — a política de escrita, declarada `FOR ALL`, também valia para o
`SELECT` e as duas tabelas se consultavam sem fim (corrigida em
`20260908191000_corrige_recursao_de_turmas`).

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

## Um sistema só

O app de estudo (fases, exercícios lúdicos, avaliação sem pergunta repetida,
certificado) roda **dentro** da plataforma, em `/estudar`. É o mesmo aplicativo
que funciona sozinho no celular, com uma diferença que importa: ali dentro ele
**não tem cadastro próprio nem tela de entrada**. A identidade chega pronta do
servidor, já autenticada, e as rotas de acesso do app ficam desligadas
(`public/estudar/js/plataforma.js`).

Sem isso haveria dois cadastros e duas portas — e a regra da casa é que só se
entra com cadastro feito por quem tem permissão.

O código-fonte do app continua em `../musica`; `npm run app:sincronizar` copia a
versão atual para `public/estudar`.

---

## Publicação em produção

**Vercel:** ver `docs/vercel.md` — banco gerenciado com dois endereços (pooler
para a aplicação, direto para as migrações), papel da aplicação sem `BYPASSRLS`,
e `npm run vercel-build`, que migra, aplica as permissões, cria o primeiro
administrador e compila, nesta ordem.

**Servidor próprio:** ver `docs/implantacao.md`. Em resumo: `npm ci && npm run build`, `prisma migrate deploy`,
papel da aplicação provisionado com senha própria, `SEGREDO_SESSAO` de 32 bytes,
HTTPS obrigatório (o cookie de sessão é `secure` fora de desenvolvimento) e backup agendado.

### Sobre `npm audit`

As vulnerabilidades reportadas hoje vêm todas da **cadeia de ferramentas de desenvolvimento**
(CLI do Prisma → `@prisma/config`/`deepmerge-ts`/`mysql2`), não do caminho de execução do
servidor. O runtime em produção é `next`, `react`, `@prisma/client`, `pg` e `zod`.
Confira a cada atualização do Prisma e registre a conclusão em `docs/implantacao.md`.

---

## Direitos autorais e privacidade

- A plataforma guarda **referências** ao método (unidade, item, página) e **não distribui**
  o arquivo de método nenhum. Cada método tem a sua nota de direitos, mostrada na tela da
  lição. Publicar material protegido depende de autorização de quem detém os direitos.
- Marcas e identidade visual oficiais não são usadas.
- Dados pessoais (aluno, contato, responsável legal) ficam no banco da instituição, com
  acesso limitado por vínculo e registro de auditoria nos acessos administrativos.
- Anexos (foto, áudio, vídeo) são **privados**: o acesso passa por rota autenticada que
  confere o vínculo de quem pede; nada é público por padrão.

---

## O que falta

Entregue nesta etapa: modelo de dados completo e method-agnostic, RLS, autenticação,
autorização, análise de método com revisão humana, currículo em árvore de profundidade
livre, proveniência ponta a ponta, jornadas simultâneas, turmas, competências e critérios
por método, isolamento pedagógico, regras pedagógicas, seeds, telas de aluno, jornada,
assunto, lição, turmas e central de métodos, testes e documentação.

Ainda **não** implementado — e é trabalho de verdade, não ajuste:

1. **Revisão da análise pela interface.** O fluxo CONFIRMAR/EDITAR/REJEITAR existe em
   `src/lib/metodos/aplicar.ts`, com testes, e roda por script; a central administrativa
   hoje **mostra** a fila, mas os botões de decisão (e o editor da árvore proposta) ainda
   não estão na tela.
2. **Analisador de PDF.** O modelo prevê `METODO_PDF`; falta o analisador que leia o sumário
   de um PDF e proponha a estrutura. Hoje o caminho é planilha ou sumário em texto.
3. **Envio de atividades** (foto, áudio, vídeo) com armazenamento privado, URLs temporárias
   e o fluxo de correção do instrutor. O modelo já existe (`atividades`, `envios`,
   `avaliacoes_envio`, `arquivos`).
4. **Banco de questões e avaliações** na interface: o modelo existe (`questoes`,
   `avaliacoes`, `criterios_avaliacao` ligando a avaliação às competências **do método**,
   `tentativas_avaliacao`, `questoes_recebidas`, que já guarda a assinatura para a pergunta
   não repetir), falta a tela e o motor de sorteio.
5. **Tempo de estudo**: modelo pronto (`sessoes_estudo`, `batimentos`,
   `visualizacoes_pagina`, `tempos_diarios`); falta o batimento no cliente e a validação
   no servidor.
6. **Medalhas e certificados**: modelo pronto, já ligado a método e jornada; falta a emissão
   e o PDF.
7. **Cadastro de método pela interface** (criar método, autorizar instrumento, cadastrar
   competência e critério) — hoje é seed e script.
8. **Importação em lote de comuns e regiões por CSV** com prévia e detecção de duplicidade.
9. **Relatórios exportáveis** (CSV/Excel/PDF) e os gráficos de evolução.
10. **Fila em execução**: a tabela existe; falta o processo trabalhador.
11. **O PDF do MSA não foi fornecido a esta sessão** — só as 10 páginas de amostra. A
    validação página a página contra o documento **não pôde ser executada**. Quando o
    arquivo estiver disponível, é ele que vai reduzir as 135 pendências.
12. **O documento de Melodia em Movimento não foi fornecido.** O método está cadastrado e
    **sem currículo**, com uma análise em aberto na fila — que é o comportamento correto, e
    não um esquecimento.

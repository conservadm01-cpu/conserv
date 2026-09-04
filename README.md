# ERP Conserv — controle de materiais e processos

ERP web para confecção, construído a partir da planilha **PEDIDOS EM CARTEIRA** e do sistema
de referência da Conserv. Cobre o caminho completo de um pedido: entrada comercial → ordem de
produção com o roteiro **Matéria-prima → Corte → Silk → Costura → Embalagem → Nota fiscal →
Entrega** → consumo de material do almoxarifado → apontamento de quem produziu → custo real
e margem.

---

## O que ele faz

### Processos (PCP)
- Toda linha de pedido vira uma **ordem de produção (OP)** com o roteiro completo de etapas.
- Quadro tipo kanban mostrando em qual etapa cada ordem está parada, com destaque de atraso.
- Cada etapa registra situação, responsável, datas e o **custo de mão de obra** daquela operação.
- A situação da OP é derivada do roteiro (não é digitada), e a situação do pedido acompanha
  as OPs dos seus itens.

### Materiais
- Cadastro de materiais (tecido, aviamento, tinta, etiqueta, embalagem) com unidade,
  custo, estoque mínimo, localização e fornecedor.
- **Ficha técnica (BOM)** por produto: consumo por peça e percentual de perda.
- Movimentação de estoque com entrada, saída e ajuste — **o saldo nunca fica negativo**.
- **Baixa automática** do material previsto quando a ordem consome o almoxarifado.
- **Necessidade de compra (MRP)**: explode a ficha técnica das ordens em aberto, desconta o
  saldo e mostra o que falta comprar, de qual fornecedor e por quanto.
- **Inventário**: abre a folha de contagem (todo o almoxarifado ou uma lista de materiais),
  registra o contado item a item e, no fechamento, lança o ajuste da diferença no estoque.

### Compras
- **Requisições** avulsas ou geradas em lote: do MRP (o que as ordens em aberto vão exigir)
  ou do estoque mínimo (repõe até o dobro do mínimo). Materiais que já têm requisição
  aberta são pulados, para não empilhar pedido do mesmo item.
- **Pedido de compra** com numeração própria (`PC-AAAA-NNNN`), frete, desconto, condição de
  pagamento e previsão de entrega. As requisições selecionadas viram pedidos **agrupados
  por fornecedor**, somando o que se repete.
- **Recebimento total ou parcial**: o que entra vira movimento de estoque e, se você quiser,
  a conta a pagar já com o vencimento do prazo do fornecedor. O estorno desfaz os três.
- O status do pedido (Parcial, Recebido) **sai do que já entrou** — editar o cabeçalho não
  devolve o pedido a "Enviado".
- Painel com o valor requisitado, o comprometido em pedidos, as entregas previstas e o
  ranking por fornecedor.

### Engenharia e formação de custo
- **Setores, equipamentos e jornada de trabalho** — cada etapa do roteiro pertence a um setor.
- **Aferição de tempo**: cronometre a operação e compare a média medida com o tempo
  padrão do processo, para definir o roteiro com número medido e não com estimativa.
- **Colaboradores** com salário, encargos e vale-transporte: daí sai o **custo do minuto** de
  cada setor (folha da equipe ÷ minutos que o setor produz no mês).
- **Custos fixos** (aluguel, energia, manutenção) rateados pela capacidade produtiva real —
  só quem produz entra no denominador, e a ocupação evita o custo otimista de supor que a
  fábrica nunca para.
- **Processo produtivo do produto**: tempo padrão por peça em cada operação.
- **Custo completo da peça = material + mão de obra + indireto**, com margem sobre o preço e
  avisos explícitos de quando a conta ainda está incompleta.

### Apontamento e chão de fábrica
- Apontamento por ordem, etapa, pessoa e equipamento — peças boas, refugo e minutos.
- A etapa avança sozinha: entra em andamento no primeiro apontamento e conclui quando o total
  fecha a quantidade da ordem.
- O custo de mão de obra é **congelado no apontamento**: se a folha mudar amanhã, o histórico
  continua contando a verdade de ontem.
- **Produtividade por pessoa** (peças/hora), **eficiência por setor** e registro de
  **ocorrências** — o que parou a linha, por quanto tempo e como foi resolvido.
- **Custo real da ordem** = material baixado + MO apontada + indireto pelos minutos gastos.

### Comercial
- **Funil de vendas** configurável, com probabilidade por etapa. O valor da carteira
  sai **ponderado** — é o que separa um pipeline de uma lista de desejos.
- Oportunidade aceita **prospect** antes de o cliente existir no cadastro; ele vira
  cliente quando o negócio fecha.
- **Perder exige motivo** e carimba o fechamento; reabrir limpa os dois. A análise de
  motivos de perda sai daí.
- **Interações** com próximo passo e data, que alimentam a agenda de contatos, e o
  alerta de oportunidades paradas há mais de duas semanas.
- **Orçamento precificado pelo custo real**: ao escolher o produto, o preço vem
  sugerido pela margem alvo sobre o custo formado (material + mão de obra + rateio da
  fábrica). Markup e margem são contas diferentes e o sistema deixa isso explícito —
  50% de markup dá 33% de margem, não 50%.
- O **custo de cada item é congelado na proposta**, então a margem do dia em que ela
  foi feita continua legível depois que o material mudar de preço.
- **Converter** aprova o orçamento, cria o pedido com o desconto rateado no item, abre
  as ordens de produção e leva a oportunidade para ganha — o ciclo inteiro num clique.
- Desempenho por status e por vendedor, com conversão e ticket médio.

### Financeiro
- **Contas a pagar e a receber** com parcelamento, vencimento e vínculo a cliente,
  fornecedor ou pedido.
- **Baixas parciais** com juros e desconto, e estorno que devolve o título ao estado
  anterior. O status nunca é digitado: é sempre derivado das baixas.
- **Faturar um pedido** gera as contas a receber pelo prazo cadastrado no cliente.
- **Fluxo de caixa previsto** por semana — o que já venceu pesa na semana corrente,
  porque é caixa que deveria ter acontecido e continua faltando.
- **Aging** por faixa de atraso, realizado mês a mês e ranking de quem mais deve
  e a quem mais se deve.
- Plano de contas e contas bancárias.

### Filtros e cadastro em todas as telas
- Toda listagem tem a **mesma barra de filtros**: busca por texto (com atraso, para não
  consultar a cada tecla), recortes por situação, período, faixa de valor e marcadores como
  "só atrasados" ou "só em aberto". O botão *Limpar* mostra quantos filtros estão ativos.
- Os filtros são aplicados **no banco**, não na tela: a lista filtrada é a lista carregada.
- Cadastro, edição e exclusão em todas as etapas — pedidos, ordens, requisições, pedidos de
  compra, títulos, oportunidades, orçamentos, apontamentos e as tabelas auxiliares.
- Registro com histórico nunca é apagado: pedido com entrega, título com baixa, ordem com
  apontamento e orçamento convertido são **cancelados**, preservando a trilha.

### Qualidade do cadastro
Planilha importada traz sujeira, e sujeira vira número errado no painel. A tela reúne o que
encontrou e deixa a decisão com quem conhece o negócio — nada é corrigido sozinho:
- **Cadastros repetidos**: o mesmo cliente escrito de dois jeitos, separado por confiança —
  *mesmo nome* (só muda acento ou ponto), *provável* (muda um "LTDA") e *confira* (difere por
  uma ou duas letras). Ao juntar, pedidos, orçamentos, oportunidades, títulos e interações
  passam para o cadastro escolhido, e o outro fica inativo apontando para onde foi.
- **Pedidos repetidos**: a mesma venda lançada duas vezes. *Mesma venda* quando cliente, data e
  número batem; *confira* quando só o valor bate — uma confecção repete SKU, e o cliente pode
  ter comprado duas vezes no mesmo dia.
- **Nomes**: número de pedido colado na frente ("69PATAGONIA CAFÉ"), espaço repetido, pontuação
  sobrando.
- **Pedidos parados**: venda que passou da entrega e ninguém baixou. Quase sempre foi entregue e
  o sistema nunca soube; enquanto ficar assim, entra na carteira e no indicador de atraso.
- **Datas**: entrega marcada antes da venda — o ano digitado errado, que faz um pedido aparecer
  com 900 dias de espera.

Registro com produção apontada nunca é cancelado: o trabalho aconteceu e o histórico fica.

### Acesso, senha e trilha
- **Primeiro acesso**: o administrador cria o usuário com uma **senha provisória**, que vale uma
  entrada só. Enquanto a pessoa não escolher a sua, nenhuma tela abre — nem o painel. A senha
  provisória pode ser curta (é ditada por telefone e morre na entrada); a que a pessoa escolhe
  segue o mínimo de 6 caracteres.
- **Criar acesso pelo colaborador**: na tela de Colaboradores, quem ainda não entra no sistema
  tem o botão *Criar acesso*, já com o nome preenchido e o e-mail sugerido a partir dele
  (`Renato Monteiro` → `renato.monteiro@conserv.com.br`). Quem já tem aparece marcado.
- **Log de senhas e acessos**: registra acesso criado, senha provisória entregue, primeiro
  acesso, troca, redefinição pelo administrador, entrada aceita, tentativa recusada e acesso
  inativo — com quem fez, quando e de qual endereço. **A senha nunca é registrada**, nem em texto
  nem cifrada: um log que guardasse a senha seria uma segunda cópia do cofre, e o motivo de
  existir é poder auditar sem expor. O nome fica congelado em cada linha, então a trilha
  sobrevive à exclusão do cadastro.
- Redefinir a senha de alguém entra como provisória por padrão: quem administra não fica sabendo
  a senha de ninguém.
- Login com e-mail inexistente e login com senha errada devolvem **a mesma resposta** — dizer que
  o e-mail existe entrega meio caminho a quem está tentando adivinhar. O log sabe a diferença.
- O hash da senha não sai do servidor em rota alguma.

### Acesso e permissões
- **31 áreas** em oito grupos, de "ver estoque" a "alterar jornada e encargos".
- **Oito níveis prontos** — total, gerencial, PCP, comercial, almoxarifado, financeiro,
  chão de fábrica e consulta — ajustáveis área a área para cada usuário. Só as diferenças em
  relação ao nível são gravadas, então trocar de nível depois traz o conjunto novo
  por inteiro.
- **Ler e alterar são permissões distintas**: quem lança movimentação de estoque não
  precisa poder cadastrar material, e quem aponta produção não vê salário.
- As permissões são lidas do banco a cada requisição, então revogar acesso vale na
  hora, sem esperar o token do usuário expirar.
- O menu esconde o que a pessoa não alcança — a API barra de qualquer forma, mas
  oferecer o que não se pode abrir é ruído.

### Conversa aberta
Canal de sugestões, problemas, riscos e relatos, com envio **sem login** para quem quiser
registrar anonimamente, e acompanhamento da tratativa de cada manifestação.

### Comercial e gestão
- Carteira em nível de item (a visão que a aba “PCP + MO” trazia), com exportação em CSV.
- Painel com carteira, vendas mês a mês, fila por etapa, ticket médio, atrasos e alertas de estoque.
- Relatórios de margem por ordem (receita × MO × material), ranking de clientes e vendas mensais.
- Formação de custo de todos os produtos, com destaque para os que estão com margem negativa.
- Acesso com login e perfis (`ADMIN`, `GESTOR`, `PCP`, `ALMOXARIFE`, `VENDEDOR`, `OPERADOR`).

### Importação da planilha
Lê um `.xlsx` de carteira/PCP, identifica as abas pelo cabeçalho, cria os cadastros que faltam
e reconstrói o andamento das etapas a partir das colunas de acompanhamento (`OK`) e dos valores
de mão de obra. Registros repetidos entre abas são descartados automaticamente. Tem modo de
**simulação** que processa tudo e mostra o relatório sem gravar nada.

---

## Como rodar

Requisitos: **Node.js 20 ou superior**.

```bash
npm install          # instala as dependências
npm run db:init      # cria o banco e o usuário administrador
npm run build        # compila a interface
npm start            # sobe em http://localhost:3333
```

Acesso inicial: **admin@conserv.com.br** / **conserv123** (troque em `.env` antes de usar de verdade —
veja `.env.example`).

### Desenvolvimento

```bash
npm run dev          # API em :3333 e interface em :5173 com recarga automática
npm test             # 72 testes de PCP, custeio, financeiro, comercial e permissões
```

---

## Trazendo seus dados

### Pelo navegador
**Importar planilha** → escolha o arquivo → deixe **Simular** marcado → confira o relatório →
desmarque **Simular** e importe de verdade.

### Pelo terminal

```bash
npm run import -- docs/PEDIDOS_EM_CARTEIRA.xlsx --simular
npm run import -- docs/PEDIDOS_EM_CARTEIRA.xlsx
npm run import -- caminho/arquivo.xlsx --abas="PCP + MO" --sem-ordens
```

A planilha atual importa assim:

| Aba | Resultado |
|---|---|
| `PCP + MO` | 1.621 itens (base principal, com custo de MO por etapa) |
| `Planilha1` | 180 itens da carteira em atraso |
| `RELATÓRIO HAVANNA` | 229 itens que não estavam nas outras abas |
| `Planilha2` | 1 item (o resto já veio de outra aba) |
| Abas de totais e gráficos | ignoradas — são resumos, não dados de origem |

Total: **1.022 pedidos, 2.031 itens, 450 clientes, 356 produtos**.
O “A liquidar” calculado bate exatamente com o da planilha (R$ 246.959,50).

### Dados de exemplo

```bash
npm run db:seed            # materiais, estoque inicial e ficha técnica
npm run db:seed-fabrica    # equipe, máquinas, custos fixos e tempo das operações
npm run db:seed-financeiro # contas a receber dos pedidos e a pagar dos custos fixos
npm run db:seed-comercial  # funil de vendas e orçamentos a partir do histórico
```

O primeiro cria 15 materiais com estoque e ficha técnica para os grupos mais comuns. O segundo
monta a fábrica: equipe por setor com salário, equipamentos, custos fixos mensais e o tempo
padrão de cada operação — é o que faz o custeio completo sair de zero.

**São valores de exemplo**, plausíveis para uma confecção deste porte, para você ver o MRP e a
formação de custo funcionando. Substitua pelos seus em *Colaboradores*, *Engenharia* e na ficha
de cada produto.

---

## Primeiros passos depois de importar

1. **Engenharia → Jornada e encargos.** Início, fim, intervalos, dias úteis, encargos e ocupação.
   Tudo o mais no custeio se apoia nesses números.
2. **Colaboradores.** Cada pessoa no seu setor, com salário e vale-transporte — é o que forma o
   custo do minuto. Setores sem salário cadastrado aparecem sinalizados na tela de engenharia.
3. **Engenharia → Custos fixos.** Aluguel, energia, manutenção. Sem eles o custo da peça sai
   menor do que o real e a margem parece maior do que é.
4. **Produtos → ficha técnica e processo.** A ficha diz o que a peça consome; o processo diz
   quanto tempo cada operação leva. Comece pelos produtos que mais aparecem na carteira.
5. **Estoque**: lance o saldo real de cada material com um movimento de entrada.
6. **Usuários e permissões.** Crie um usuário por pessoa que usa o sistema e escolha
   o nível de acesso. Quem só aponta produção fica em *Chão de fábrica*; quem cuida
   do caixa, em *Financeiro*. Ajuste área a área o que fugir do padrão.
7. **Financeiro**: confira o plano de contas, cadastre as contas bancárias e lance os
   títulos em aberto que já existem hoje.
8. **Clientes duplicados**: a planilha traz o mesmo cliente escrito de formas diferentes
   (“M.D BOSO (PROHALL)” e “MD BOZO PROHALL”). O importador não tem como saber que são o mesmo —
   ajuste em *Clientes*.
9. **Atrasos históricos**: pedidos de 2024 que nunca foram marcados como entregues na planilha
   aparecem como atrasados. Marque a etapa *Entrega* como concluída para encerrá-los, ou filtre
   a carteira por período.

---

## Estrutura

```
server/            API em Node + Express + SQLite
  src/db/          schema.sql e conexão
  src/services/    regras de negócio (PCP, estoque/MRP, compras, custeio, comercial)
  src/lib/         filtros de listagem, CRUD genérico, permissões
  src/routes/      endpoints REST
  src/import/      leitor da planilha
  test/            testes automatizados
web/               interface em React + TypeScript + Vite
data/              banco SQLite (não versionado)
docs/              planilha de origem
```

O banco é um arquivo SQLite em `data/conserv.db` — para fazer backup, basta copiá-lo com o
servidor parado.

---

## API

Todas as rotas ficam sob `/api` e exigem `Authorization: Bearer <token>`, exceto `/api/auth/login`.

| Recurso | Rota |
|---|---|
| Sessão | `POST /api/auth/login`, `GET /api/auth/eu`, `PUT /api/auth/senha` |
| Pedidos | `GET|POST|PUT|DELETE /api/pedidos`, `GET /api/pedidos/itens/carteira` |
| Produção | `GET /api/ordens`, `GET /api/ordens/quadro`, `PUT|DELETE /api/ordens/:id`, `PUT /api/ordens/:id/etapas/:etapaId`, `POST /api/ordens/:id/recalcular`, `POST /api/ordens/:id/baixar-materiais` |
| Materiais | `GET|POST|PUT|DELETE /api/materiais`, `GET /api/materiais/estoque/posicao`, `GET /api/materiais/estoque/necessidade`, `POST /api/materiais/estoque/movimentos` |
| Compras | `GET|POST|PUT|DELETE /api/compras/requisicoes`, `POST /api/compras/requisicoes/gerar-mrp`, `/gerar-minimo`, `/gerar-pedidos`, `GET|POST|PUT|DELETE /api/compras/pedidos`, `POST /api/compras/pedidos/:id/receber`, `DELETE /api/compras/recebimentos/:id`, `GET /api/compras/resumo` |
| Inventário | `GET|POST|DELETE /api/compras/inventarios`, `PUT /api/compras/inventarios/:id/contagem`, `POST /api/compras/inventarios/:id/fechar` |
| Produtos | `GET|POST /api/produtos/:id/ficha-tecnica`, `GET|PUT /api/produtos/:id/custos-processo` |
| Engenharia | `GET|PUT /api/engenharia/parametros`, `GET /api/engenharia/custo-setores`, `/capacidade`, `/custo-indireto`, CRUD em `/departamentos`, `/equipamentos`, `/custos-fixos` |
| Pessoas | `GET|POST|PUT|DELETE /api/colaboradores` |
| Custo do produto | `GET|PUT /api/produtos/:id/processo`, `GET /api/produtos/:id/custo` |
| Apontamento | `GET|POST /api/apontamentos`, `/produtividade`, `/eficiencia`, CRUD em `/api/ocorrencias` |
| Conversa aberta | `POST /api/canal/manifestacoes` (sem login), `GET|PUT /api/canal/manifestacoes` |
| Financeiro | `GET|POST|PUT|DELETE /api/financeiro/titulos`, `POST /api/financeiro/baixas`, `POST /api/financeiro/pedidos/:id/faturar`, `GET /api/financeiro/resumo`, `/fluxo`, `/aging/:tipo`, `/ranking/:tipo` |
| CRM | `GET /api/crm/resumo`, `/funil`, `GET|POST|PUT|DELETE /api/crm/oportunidades`, `PUT /api/crm/oportunidades/:id/etapa`, `POST /api/crm/interacoes` |
| Orçamentos | `GET|POST|PUT|DELETE /api/orcamentos`, `GET /api/orcamentos/precificar/:produtoId`, `POST /api/orcamentos/:id/converter`, `GET /api/orcamentos/desempenho` |
| Permissões | `GET /api/auth/areas`, `GET|PUT /api/usuarios/:id/permissoes`, `POST /api/usuarios/novo` |
| Acesso e senha | `PUT /api/auth/senha` (a própria pessoa), `PUT /api/usuarios/:id/senha` (provisória, pelo admin), `GET /api/usuarios/situacao`, `GET /api/usuarios/log-senhas`, `/log-senhas/resumo`, `GET /api/usuarios/sugerir-email?nome=` |
| Indicadores | `GET /api/indicadores/dashboard`, `/vendas/mensal`, `/custos/ordens`, `/custos/ordens/:id`, `/custos/produtos`, `/clientes/ranking` |
| Importação | `POST /api/importacao/planilha` (multipart, campo `arquivo`) |
| Qualidade | `GET /api/qualidade/resumo`, `/duplicatas`, `/pedidos-repetidos`, `/nomes`, `/parados`, `/datas`; `POST /api/qualidade/duplicatas/mesclar`, `/pedidos-repetidos/cancelar`, `/parados/encerrar`; `PUT /api/qualidade/nomes/:id`, `/datas/:itemId` |

**Todas as listagens aceitam os mesmos parâmetros**: `?busca=`, os recortes próprios de cada
recurso (situação, período, faixa de valor), `?ordenar_por=` + `?direcao=` — que só aceitam
colunas declaradas pela rota — e `?limite=`.

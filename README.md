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

### Engenharia e formação de custo
- **Setores, equipamentos e jornada de trabalho** — cada etapa do roteiro pertence a um setor.
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
npm test             # 33 testes de PCP, estoque, MRP, custeio, apontamento e importação
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
npm run db:seed          # materiais, estoque inicial e ficha técnica
npm run db:seed-fabrica  # equipe, máquinas, custos fixos e tempo das operações
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
6. **Clientes duplicados**: a planilha traz o mesmo cliente escrito de formas diferentes
   (“M.D BOSO (PROHALL)” e “MD BOZO PROHALL”). O importador não tem como saber que são o mesmo —
   ajuste em *Clientes*.
7. **Atrasos históricos**: pedidos de 2024 que nunca foram marcados como entregues na planilha
   aparecem como atrasados. Marque a etapa *Entrega* como concluída para encerrá-los, ou filtre
   a carteira por período.

---

## Estrutura

```
server/            API em Node + Express + SQLite
  src/db/          schema.sql e conexão
  src/services/    regras de negócio (PCP, estoque/MRP, indicadores)
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
| Produção | `GET /api/ordens`, `GET /api/ordens/quadro`, `PUT /api/ordens/:id/etapas/:etapaId`, `POST /api/ordens/:id/recalcular`, `POST /api/ordens/:id/baixar-materiais` |
| Materiais | `GET|POST|PUT|DELETE /api/materiais`, `GET /api/materiais/estoque/posicao`, `GET /api/materiais/estoque/necessidade`, `POST /api/materiais/estoque/movimentos` |
| Produtos | `GET|POST /api/produtos/:id/ficha-tecnica`, `GET|PUT /api/produtos/:id/custos-processo` |
| Engenharia | `GET|PUT /api/engenharia/parametros`, `GET /api/engenharia/custo-setores`, `/capacidade`, `/custo-indireto`, CRUD em `/departamentos`, `/equipamentos`, `/custos-fixos` |
| Pessoas | `GET|POST|PUT|DELETE /api/colaboradores` |
| Custo do produto | `GET|PUT /api/produtos/:id/processo`, `GET /api/produtos/:id/custo` |
| Apontamento | `GET|POST /api/apontamentos`, `/produtividade`, `/eficiencia`, CRUD em `/api/ocorrencias` |
| Conversa aberta | `POST /api/canal/manifestacoes` (sem login), `GET|PUT /api/canal/manifestacoes` |
| Indicadores | `GET /api/indicadores/dashboard`, `/vendas/mensal`, `/custos/ordens`, `/custos/ordens/:id`, `/custos/produtos`, `/clientes/ranking` |
| Importação | `POST /api/importacao/planilha` (multipart, campo `arquivo`) |

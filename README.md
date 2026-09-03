# ERP Conserv — controle de materiais e processos

ERP web para confecção, construído a partir da planilha **PEDIDOS EM CARTEIRA** da Conserv.
Cobre o caminho completo de um pedido: entrada comercial → ordem de produção com o roteiro
**Matéria-prima → Corte → Silk → Costura → Embalagem → Nota fiscal → Entrega** → consumo de
material do almoxarifado → apuração de custo e margem.

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

### Comercial e gestão
- Carteira em nível de item (a visão que a aba “PCP + MO” trazia), com exportação em CSV.
- Painel com carteira, vendas mês a mês, fila por etapa, ticket médio, atrasos e alertas de estoque.
- Relatórios de margem por ordem (receita × MO × material), ranking de clientes e vendas mensais.
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
npm test             # 15 testes de PCP, estoque, MRP e leitura da planilha
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

### Dados de exemplo de materiais

```bash
npm run db:seed
```

Cria 15 materiais com estoque inicial, ficha técnica e custo de MO por peça para os grupos mais
comuns (avental, camiseta, jaleco, kimono, sacola, capa, necessaire), e recalcula as ordens em
aberto. **São valores de exemplo** para você ver o MRP funcionando — substitua pela ficha técnica
real de cada produto em *Produtos e ficha técnica*.

---

## Primeiros passos depois de importar

1. **Produtos → ficha técnica.** Sem ela o ERP não sabe o que cada peça consome, e a necessidade
   de compra fica vazia. Comece pelos produtos que mais aparecem na carteira.
2. **Custos de MO por etapa** na mesma tela — é o que alimenta a margem por ordem.
3. **Estoque**: lance o saldo real de cada material com um movimento de entrada.
4. **Clientes duplicados**: a planilha traz o mesmo cliente escrito de formas diferentes
   (“M.D BOSO (PROHALL)” e “MD BOZO PROHALL”). O importador não tem como saber que são o mesmo —
   ajuste em *Clientes*.
5. **Atrasos históricos**: pedidos de 2024 que nunca foram marcados como entregues na planilha
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
| Indicadores | `GET /api/indicadores/dashboard`, `/vendas/mensal`, `/custos/ordens`, `/clientes/ranking` |
| Importação | `POST /api/importacao/planilha` (multipart, campo `arquivo`) |

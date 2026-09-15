# CSVSIST — ERP da ConServ Confecções

Sistema de chão de fábrica para confecção: materiais com saldo e reserva, corte
a partir do risco, engenharia com aferição de capacidade, produção apontada,
canal aberto com a equipe e chat interno.

O sistema é um app em `app/`, servido por um servidor Node que faz as duas
coisas que o navegador não faz sozinho: **guardar a base da fábrica inteira** e
**conferir quem entra**.

---

## Como rodar

Requisitos: **Node.js 20 ou superior**.

```bash
npm install
npm run db:init      # cria o arquivo do banco
npm start            # sobe em http://localhost:3333
```

**Primeiro acesso.** A base nasce vazia. Abra `http://localhost:3333`, escolha
*Administrador* e clique em **Definir senha** — é o próprio sistema que conduz o
primeiro acesso. Daí em diante a senha é conferida no servidor, e quem abrir de
outra máquina entra na mesma base.

**Para a fábrica usar**: rode em um computador que fique ligado; as outras
máquinas acessam por `http://<ip-do-computador>:3333`. Cada pessoa tem o seu
cadastro em *Cadastros → Colaboradores*, com função e permissões.

---

## O que o sistema faz

| Área | O que tem |
|---|---|
| **Painel** | O quadro do dia: cadastros, estoque abaixo do mínimo, ordens e o que está parado |
| **Cadastros** | Clientes, fornecedores, colaboradores, funções e permissões, log de acesso |
| **Materiais** | Materiais, posição de estoque, movimentações, reservas, grupos, unidades, conversões (1 rolo = 50 m), locais e centros de custo |
| **Engenharia** | Departamentos, etapas, máquinas, jornada, aferição de capacidade, metas e objetivos |
| **Produtos** | Produto com risco de corte, partes, como é feito (tecidos + processo), versões congeladas |
| **Produção** | Ordens, apontamentos e avaliação do que foi produzido |
| **Conversa aberta** | Sugestão, problema, risco e relato — com vagas, indicações e pesquisa de clima |
| **Chat** | Recados entre a equipe, com notas pessoais |

Duas regras que atravessam o sistema inteiro:

- **O saldo nunca é editado direto.** Toda alteração nasce de uma movimentação,
  e o saldo é o acumulado — sempre reconstruível, o que torna a própria regra
  auditável.
- **A ordem carrega a engenharia do dia em que nasceu.** Mudar o produto depois
  não reescreve o que foi combinado com quem já está produzindo.

---

## Onde a base mora

O sistema trabalha com um documento só — um JSON com todas as coleções — e o
servidor guarda esse documento inteiro, com número de versão, no SQLite.

Isso é o que separa um sistema de um computador de um sistema de fábrica:

- **Todo mundo vê o mesmo dado.** Antes, cada navegador tinha a sua base, e duas
  pessoas nunca viam o mesmo estoque.
- **Backup é copiar um arquivo.** Pare o servidor e copie `data/csvsist.db`.
- **A senha é conferida no servidor.** Antes do login, nada da empresa chega ao
  navegador.
- **Gravação concorrente não some em silêncio.** Quem grava informa a versão que
  leu; se alguém gravou no meio, a gravação é recusada em vez de passar por cima
  do trabalho do outro — e a pessoa recarrega a partir da versão de quem chegou
  primeiro.

O app já perguntava por `window.storage` antes de usar o navegador: é nessa
porta que `app/ponte.js` entra. O app segue sem saber onde a base mora.

---

## Estrutura

```
app/
  index.html      o sistema inteiro (React, sem etapa de build)
  ponte.js        sessão, base e versão contra o servidor
  vendor/         React servido localmente — a fábrica não depende de internet
server/
  src/index.js    servidor: serve o app e a API
  src/routes/     as duas rotas da base
  src/services/   sessão, leitura e gravação do documento
  src/db/         conexão e schema
  test/           testes da base compartilhada
data/             banco SQLite (não versionado)
```

## API

| Rota | O que faz |
|---|---|
| `POST /api/app/sessao` | Confere usuário e senha e devolve token, base e versão |
| `GET /api/app/estado` | Devolve a base e a versão (exige token) |
| `PUT /api/app/estado` | Grava a base; recusa com **409** se a versão já mudou |
| `GET /api/saude` | Responde se o servidor está de pé |

Fábrica recém-instalada não tem ninguém cadastrado — e portanto ninguém que
possa entrar para cadastrar o primeiro. Nesse caso `GET /api/app/estado` abre a
base vazia com um token de instalação, e essa porta fecha assim que existe
alguém com senha.

---

## O que ainda não está aqui

A base anterior do CSVSIST tinha módulos que ainda não foram portados para esta:

1. **Fichas de produção impressas** — o dossiê de 7 vias (ordem de produção,
   preparação, corte, silk, modelagem, costura, embalagem) em A4.
2. **Carteira de pedidos e o importador da planilha** `PEDIDOS EM CARTEIRA`.
3. **Compras e MRP** — requisição, pedido de compra e recebimento.
4. **Financeiro** — contas a pagar e receber, baixas, fluxo e aging.
5. **Comercial** — funil, orçamento precificado pelo custo e conversão em pedido.

O código deles está no histórico do repositório, no commit `400e5bc`, e é de lá
que cada porte parte:

```bash
git show 400e5bc:server/src/services/fichas-html.js   # o renderizador do dossiê
git show 400e5bc:server/src/import/planilha.js        # o leitor da planilha
```

---

## Testes

```bash
npm test
```

Cobrem o que o servidor garante: versão e conflito de gravação, sessão conferida
no servidor, recusa igual para usuário inexistente e senha errada, colaborador
inativo sem acesso e o modo de instalação.

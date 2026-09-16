# Módulo industrial — Budget, MRP e PCP por carteira

Módulo industrial do **Confecção ERP**: dados, motores de cálculo e a aba Industrial dentro
do sistema.

O módulo é código versionado aqui e testável no Node — não se edita o HTML de 37 mil linhas
à mão. A montagem injeta estes arquivos no sistema, do mesmo jeito que a base de teste já é
injetada:

```sh
node --test "industrial/testes/*.test.mjs"        # o teste do §54, ponta a ponta

node docs/teste/confeccao/montar-html.mjs ~/confeccao-erp.html /tmp/teste.html \
  --sem-modulos=produtos,producao --com-industrial
```

## A regra que organiza tudo

Material não é consumido pelo produto acabado: material é **transformado**.

```
MALHA PV
   └─ CORTE ──► frente · costas · manga (2) · gola      ← um enfesto, quatro saídas
                   │        │        │          │
                   │        │        │          └─ PREPARAÇÃO (+ entretela, etiqueta)
                   │        │        │                 └─ gola preparada
                   └─ SILK (+ tinta) │                        │
                         └─ frente estampada ────────────────┐│
                                    └── COSTURA (+ linha) ◄──┴┘
                                            └─ camiseta costurada
                                                   └─ ACABAMENTO (+ saco, tag)
                                                          └─ CAMISETA BÁSICA
```

Cada passo **recebe**, **transforma** e **entrega**. O que sai carrega o custo, o lote e o
tempo do que entrou — é por isso que a camiseta acabada sabe quanto custou desde o rolo.

## Arquivos

| arquivo | o que é |
|---|---|
| `modelo.mjs` | tipos de item, unidades e conversões, tipos de tempo, perdas, retalhos, alertas, as coleções novas e as fábricas de registro (item, estrutura, transformação, carteira, lote, movimento de processo) |
| `motores.mjs` | consolidação, explosão da BOM, MRP, capacidade, budget, plano de produção, execução da transformação, custeio, custo acumulado, liberação da costura, WIP, realizado × budget, rastreabilidade e simulação |
| `demonstracao.mjs` | a demonstração do §49: camiseta básica, 10.000 peças, três clientes, cinco processos |
| `interface.mjs` | a aba Industrial: painel, carteira, plano e budget, produção, estrutura e rastreio |
| `empacotar.mjs` | junta os quatro num `<script>` clássico, dentro de um IIFE, e recusa nome declarado duas vezes |
| `testes/fluxo-industrial.test.mjs` | o teste obrigatório do §54, com os 17 pontos de validação |

## Como entra no sistema (§50)

`montar-html.mjs --com-industrial` costura o módulo em cinco pontos do código que já existe:

1. **`emptyDb`** ganha a coleção `industrial` — sem isso o `loadDb` descarta o que não conhece,
   e a base industrial sumiria a cada recarregada.
2. **A carga** passa a chamar `Industrial.preparar`, que garante as coleções novas.
3. **`ABAS_SISTEMA`** ganha a aba Industrial.
4. **Os níveis de acesso** que já enxergam Engenharia passam a enxergar Industrial.
5. **A App** desenha `GrupoIndustrial` quando a aba está ativa.

O HTML do sistema não é editado à mão em nenhum desses pontos: a montagem refaz tudo a cada
build, a partir do arquivo original.

## O que reaproveita do sistema (§50)

Nada do que já existe foi duplicado. O módulo lê e escreve nas coleções do próprio sistema:

| precisa de | usa |
|---|---|
| material, preço, saldo e fornecedor | `db.materiais`, `db.saldos`, `db.movimentacoes`, `db.fornecedores` |
| setor, etapa e máquina | `db.departamentos`, `db.etapas`, `db.equipamentos` |
| gente, salário e jornada | `db.colaboradores`, `db.jornada`, `db.parametrosMaoDeObra` |
| custo fixo e ocupação | `db.custosFixos`, `db.parametrosCustoIndireto` |
| cliente | `db.clientes` |

O que é novo mora em `db.industrial`, e é só o que não existia:

`itens` · `estruturas` · `transformacoes` · `carteira` · `consolidacoes` · `demandas` ·
`ordens` · `execucoes` · `lotes` · `estoques` · `movimentos` · `perdas` · `retalhos` ·
`budgets` · `rastros` · `parametros`

## As contas

**Explosão com coproduto (§44).** A costura quer 10.000 frentes estampadas; o silk refuga
2%, então precisa de 10.200 frentes; o corte roda 10.200 vezes e entrega, no mesmo enfesto,
10.200 costas, 20.400 mangas e 10.200 golas. O excedente aparece como **sobra planejada**
(200 costas, 400 mangas), não some. Explodir cada componente por conta própria multiplicaria
o tecido por quatro — é o erro que a numeração por nível (*low level code*) evita: uma
transformação só roda no nível da sua saída mais funda.

**MRP (§25).** `bruta − disponível − entradas programadas + segurança = líquida`. Para
matéria-prima o disponível sai do almoxarifado (físico − reservado); para subproduto, do
estoque do processo que o guarda.

**Tempo por ciclo (§10).** A unidade de trabalho é o ciclo, não a peça: o enfesto rende 500
peças em 285 minutos, a mesa de silk estampa 200 por vez, a costureira faz uma peça por vez
(`porCiclo: 1`). `porCiclo: 0` é a operação que acontece **uma vez por ordem** — gravar a
tela, montar a matriz. É ela que faz o custo por peça cair quando o lote cresce, e que mata
o lote pequeno.

**Custeio (§43).** Cada minuto entra numa parcela só, sem dupla contagem:

| parcela | de onde vem |
|---|---|
| material | o que foi consumido, ao custo médio do almoxarifado |
| mão de obra | minutos de processamento e inspeção × custo do minuto do setor |
| manuseio | minutos de manuseio e movimentação × custo do minuto |
| setup | minutos de preparação e setup × custo do minuto |
| máquina e energia | horas de processamento × taxa hora-máquina |
| perda e retrabalho | quantidade perdida × custo, minutos de retrabalho × custo do minuto |
| indireto | minutos trabalhados × custo fixo da fábrica por minuto |

O custo do minuto de cada setor sai da folha da equipe daquele setor (salário + encargos +
vale-transporte) dividida pelos minutos que o setor produz no mês — a mesma conta que o
sistema já usa em Engenharia.

## Exemplo de cálculo — a demonstração do §49

Carteira de 10.000 camisetas (2.000 + 3.000 + 5.000, três clientes), sobre a base de teste:

| | |
|---|---|
| Malha necessária | **5.610 kg** (10.200 enfestadas × 0,55 kg) |
| Compra que o MRP pede | malha, tinta, linha, etiqueta, saco e tag — o que o estoque não cobre |
| Material | R$ 255.959 |
| Processo | R$ 73.262 (corte R$ 0,35/peça · silk R$ 0,45 · preparação R$ 0,25 · costura R$ 5,21 · acabamento R$ 1,07) |
| **Custo industrial** | **R$ 32,92 por peça** |
| Capacidade | costura 181% e acabamento 208% de ocupação → **gargalo** com a equipe atual |

O gargalo aparecer é o ponto: a fábrica da base tem 5 costureiras, e 10.000 camisetas em um
mês exigem quase o dobro disso.

## O que depende de configuração

- **Consumo de malha por peça** (`CONSUMO_MALHA_KG`, em `demonstracao.mjs`): está em 0,55 kg,
  o número do §7. É alto para uma camiseta comum (0,18–0,22 kg é o usual) — trocar esse
  valor muda o custo do material da demonstração, não a lógica.
- **Parâmetros industriais** (`db.industrial.parametros`): dias de estoque de segurança (5),
  eficiência padrão (85%), custo da hora-máquina (R$ 4,50), energia por hora-máquina
  (R$ 3,20), dias úteis (22).
- **Entradas programadas**: o MRP desconta pedidos de compra em aberto de
  `db.industrial.entradasProgramadas`. Enquanto o módulo de compras não gravar ali, a lista
  fica vazia e o MRP trata tudo como falta.
- **Perda por entrada**: cada componente de uma transformação tem a sua `perda` em %. Onde
  ela não é informada, vale a `perdaPadrao` do item — e é fácil contar a mesma perda duas
  vezes se ela estiver no item e na entrada. A demonstração declara todas explicitamente.

## Testes realizados

`node --test "industrial/testes/*.test.mjs"` — 20 testes, todos passando, cobrindo os 17
pontos do §54: explosão da BOM, necessidade de tecido e de aviamentos, geração das demandas,
criação dos subprodutos, transferência para a preparação, demanda do silk, transferência
para a costura, validação dos componentes (com a recusa dizendo *"Faltam 10000 FRENTE
ESTAMPADA"*), produção, produto acabado, custo acumulado, perdas, WIP, budget, realizado,
desvio — mais a conferência de que nenhum saldo de processo fica negativo e de que o saldo
é sempre o acumulado dos movimentos.

## A aba Industrial

| sub-aba | o que mostra |
|---|---|
| Painel | carteira, produzido, custo planejado × real, peças em processo, alertas e o WIP setor a setor |
| Carteira | as linhas de pedido, o botão de consolidar e o de gerar o plano de produção |
| Plano e budget | MRP com o que falta comprar, capacidade por setor com o gargalo, budget aberto em parcelas e a simulação de três tamanhos de lote |
| Produção | as demandas por processo, a conferência de componentes e o apontamento da execução |
| Estrutura | os itens tipados e as receitas de transformação, com entradas, saídas e ciclos |
| Rastreio | os lotes, a árvore de transformação e o custo acumulado etapa a etapa |

Base sem estrutura industrial abre com um convite para carregar a demonstração de 10.000
camisetas — é um clique, e serve para conhecer o módulo com número de verdade.

## Próxima etapa

1. Dashboards por departamento (§29–§31), com a visão própria do corte, da preparação e da costura.
2. Permissões por departamento (§51) sobre o cadastro de níveis que o sistema já tem.
3. Compras: gravar pedido em aberto como entrada programada, fechando o ciclo do MRP — hoje o
   recebimento do plano é um atalho lançado direto no almoxarifado.
4. Cadastro pela tela: item, estrutura e transformação ainda se criam por código ou pela
   demonstração.

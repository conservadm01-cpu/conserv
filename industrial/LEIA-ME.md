# Módulo industrial — Budget, MRP e PCP por carteira

Módulo industrial do **Confecção ERP**: dados, motores de cálculo e a aba Industrial dentro
do sistema.

O módulo é código versionado aqui e testável no Node — não se edita o HTML de 37 mil linhas
à mão. A montagem injeta estes arquivos no sistema, do mesmo jeito que a base de teste já é
injetada:

```sh
node --test "industrial/testes/*.test.mjs"        # 84 testes: fluxo, cadastro, ordens, V2, V3, produto, ordem e lote

node docs/teste/confeccao/montar-html.mjs ~/confeccao-erp.html /tmp/teste.html \
  --sem-modulos=producao --com-industrial
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
| `cadastro.mjs` | cadastro de produto: item, estrutura versionada, transformação, conferência da engenharia, custo padrão, árvore e cópia de produto |
| `ordens.mjs` | ordens de produção: abrir a cadeia, o estado de cada etapa, cancelar, encerrar e a conferência de componentes |
| `interface.mjs` | a aba Industrial: as cinco sub-abas, o painel, o plano e budget da ordem, o chão de fábrica e o apontamento |
| `telas-produtos.mjs` | o ambiente **Produtos**: listas, ficha com a árvore e os formulários de item, estrutura e transformação |
| `telas-ordens.mjs` | o ambiente **Ordens**: abertura com validação de engenharia, detalhe da cadeia e apontamento |
| `ordens-sistema.mjs` | a ordem de produção: abre em `db.ordens` no formato do sistema e planeja no motor; também traz para o motor a ordem aberta antes no módulo Produção |
| `telas-ordens-sistema.mjs` | a sub-aba **Ordens**: abrir, planejar, agrupar e acompanhar — com o MRP e o budget da ordem aberta ali mesmo |
| `telas-integracao.mjs` | a sub-aba **Conferência**: saúde da cadeia, rastreio do lote, ficha industrial e auditoria, em quatro vistas de uma aba só |
| `engenharia.mjs` | a ponte com o cadastro de produto do sistema: lê `db.produtos` (ficha técnica e roteiro) e **deriva** itens, estrutura e uma transformação por setor, com vínculo vivo e detecção de divergência |
| `integracao.mjs` | **V3**: `resolverMaterialIndustrial` (a ponte item ↔ material), custo vigente, conversão de unidade, auditoria da cadeia, indicadores de integração e o mapa dos elos |
| `telas-integracao.mjs` | **V3**: a sub-aba Integração — saúde da engenharia industrial com a prova de cada ponto, mapa clicável e o botão do fluxo completo |
| `testes-v3.mjs` | **V3**: `testarFluxoCompletoERPIndustrial` — 30 passos sobre uma cópia, do cadastro ao rastro |
| `empacotar.mjs` | junta os arquivos num `<script>` clássico, dentro de um IIFE, e recusa nome declarado duas vezes |
| `testes/fluxo-industrial.test.mjs` | o teste obrigatório do §54, com os 17 pontos de validação |

## Como entra no sistema (§50)

`montar-html.mjs --com-industrial` costura o módulo em seis pontos do código que já existe:

1. **`emptyDb`** ganha a coleção `industrial` — sem isso o `loadDb` descarta o que não conhece,
   e a base industrial sumiria a cada recarregada.
2. **A carga** passa a chamar `Industrial.preparar`, que garante as coleções novas.
3. **`ABAS_SISTEMA`** ganha a aba Industrial.
4. **Os níveis de acesso** que já enxergam Engenharia passam a enxergar Industrial.
5. **A App** desenha `GrupoIndustrial` quando a aba está ativa.
6. **A lista de Produtos** ganha o botão de copiar produto, que chama
   `window.Industrial.copiarProdutoDoSistema` com o `update` do próprio sistema.

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
`budgets` · `rastros` · `reservas` · `requisicoesCompra` · `pedidosCompra` · `historico` ·
`parametros`

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

## V2 — o que a segunda versão trouxe

| § | o que mudou |
|---|---|
| §42 | `migrarIndustrialV2()` roda a cada carga: acrescenta coleções e campos, não apaga nem recalcula nada |
| §6/§51 | **reserva de material** por ordem — físico, reservado, disponível e disponível-para-esta-ordem deixam de ser o mesmo número |
| §5 | **MRP V2**: desconta reserva de outras ordens e pedido em aberto, e classifica cada linha (OK · estoque insuficiente · compra necessária · compra programada · abaixo do mínimo · bloqueado) |
| §7/§8 | **compras**: requisição → pedido (agrupado por fornecedor) → recebimento (parcial ou total) → estoque → reserva, com lead time e data limite de compra |
| §9 | **custo hora por máquina**: depreciação + manutenção + energia + outros, com queda para o parâmetro geral quando o equipamento não tem números |
| §10 | **mão de obra**: benefícios e outros custos entram por fora do percentual de encargos, que já cobre férias, 13º e FGTS |
| §4 | **quatro budgets**: industrial, de consumo, de compras e de caixa — custo industrial ≠ valor de compra ≠ necessidade de caixa |
| §22 | **rastreabilidade para frente**: deste rolo, o que saiu, até o produto acabado |
| §33/§34 | **auditoria** (`auditarIndustrial`) e **reconciliação** (`reconciliarEstoqueIndustrial`), que relatam e não corrigem sozinhas |
| §47 | **bateria de 20 testes** (`testarIndustrialV2`), que roda no Node e dentro do sistema, sobre uma cópia da base |
| §52 | a ordem **reserva ao abrir** e **devolve ao cancelar**; o consumo baixa a reserva |

## Onde cada coisa é feita

O industrial **substituiu o módulo Produção**. O cadastro continua fora; a produção é aqui:

| o quê | onde | o que o industrial faz com isso |
|---|---|---|
| material | **Materiais** | aponta para ele — preço, saldo e fornecedor continuam sendo os de lá |
| produto e composição | **Produtos** | deriva estrutura e uma transformação por setor |
| ordem de produção | **Industrial → Ordens** | abre, planeja, reserva, compra, aponta, custeia e rastreia |

A ordem nasce aqui, mas continua sendo **a ordem do sistema**: `abrirOrdemDeProducao` grava em
`db.ordens`, no formato de sempre — código `OP-0010`, produto, versão da engenharia congelada,
cliente, entrega e as tarefas fotografadas do processo, com a mesma conta de minutos por peça
(projeto dilui no lote; por pessoa vale por peça). Ordem aberta antes, no módulo Produção,
continua valendo: `planejarOrdemDoSistema` a traz para o motor sem inventar um segundo número,
e a auditoria de integração acusa ordem em aberto sem plano. Encerrar ou cancelar aqui fecha a
ordem lá.

**Produtos** — a engenharia de cada peça. Cadastra o item (comprado, apontando para o material do
almoxarifado, ou produzido, dizendo em que setor nasce), a estrutura (o que a peça leva dentro,
versionada a cada gravação) e a transformação (o que entra, o que sai, em que setor e com que
tempos). A ficha mostra a árvore inteira — a camiseta é feita de frente estampada, costas, mangas
e gola preparada; a gola preparada vem da gola cortada; a gola cortada vem da malha — com o custo
padrão por peça e, quando falta alguma coisa, a lista do que impede a ordem de abrir.

O cadastro recusa o que quebraria a fábrica depois: nome repetido, item produzido sem setor,
estrutura em laço, dois donos para o mesmo item (só uma transformação produz cada peça),
transformação sem tempo, e a saída de uma receita que seja um item comprado.

**Ordens** — abrir uma ordem cria a cadeia inteira: uma ordem de processo por etapa, cada uma
dependendo da anterior. A tela mostra onde a ordem está, separa a falta de verdade (material que
não existe) da fila normal (a costura esperando o corte), confere componentes antes de liberar,
aponta a execução e fecha a ordem — cancelar só antes de produzir; depois disso o caminho é
encerrar, com motivo quando sobra saldo.

**Carteira, Plano, Produção e Rastreio** — a visão da fábrica: pedidos, consolidação, MRP,
budget, apontamento, WIP e a árvore de transformação.

Os caminhos entre as sub-abas são diretos: um produto pronto oferece **Abrir ordem**; a ordem
mostra **Ver ficha do produto**; a carteira consolidada vira ordem e o botão leva a ela. Uma
carteira consolidada no Plano e uma ordem aberta em Ordens são a mesma coisa para a fábrica —
as duas ganham código `OP-AAAA-NNNN` e aparecem na mesma lista, com a origem anotada.

## A ficha de produção

A aba **Produção** é do chão de fábrica, não de uma ordem. Ela lista **todas as etapas em
aberto de todas as ordens**, agrupadas por setor, com filtro por setor e um atalho para "só o
que pode começar". Antes ela mostrava apenas a ordem escolhida no seletor do topo — e parecia
vazia quando o seletor apontava para outra.

Cada linha diz em uma palavra em que pé está, e a diferença entre as duas situações que a
fábrica confunde:

| situação | o que quer dizer |
|---|---|
| **pode começar** | todo componente na mão |
| **espera `<peça>`** | fila normal: o setor anterior ainda vai entregar |
| **falta material** | problema: material que não existe no almoxarifado |
| **parcial · faltam N** | começou e não terminou |

`conferirEntradasDaOrdem` é a leitura pura dessa situação — não grava nada, o que permite
mostrar o estado de 41 etapas sem escrever na base. `liberarParaCostura` continua sendo a
que libera, e grava.

No apontamento: a quantidade que falta aparece ao lado do campo, o saldo de cada componente
aparece **inclusive para o material do almoxarifado** (antes só dizia "· almoxarifado", e a
falta só aparecia ao lançar), e a perda passou a perguntar **o que** se perdeu — antes ela era
sempre atribuída à primeira linha da receita, custeada pelo `custoPadrao` do item, que para
subproduto é zero: perda registrada pela tela não custava nada. Agora `custoDoItemAgora` dá o
valor real — custo do almoxarifado para o comprado, custo médio do estoque de processo para o
subproduto — e a tela mostra quanto a perda vai custar antes de lançar.

## Cinco lugares, um por pergunta

| aba | a pergunta que ela responde | o que tem dentro |
|---|---|---|
| **Painel** | como estamos? | carteira, produzido, WIP, budget × realizado, compras, caixa, gargalo e alertas |
| **Ordens** | o que produzir, e o que isso exige? | abrir a ordem a partir do produto, planejar as que já existiam, agrupar ordens do mesmo produto num lote, e — dentro da ordem aberta — as etapas, o MRP, os quatro budgets, a capacidade e a simulação |
| **Compras** | o que falta comprar? | requisições (aprovar, cancelar, agrupar em pedido), pedidos (receber total ou parcial) e o que está atrasado |
| **Produção** | o que há para fazer, e o que a fábrica fez? | todas as etapas em aberto de todas as ordens, filtradas por setor, com o apontamento, o estoque entre setores e as perdas |
| **Conferência** | está tudo ligado e rastreado? | saúde da cadeia, rastreio do lote, ficha industrial derivada e a auditoria com as baterias de teste |

Eram dez abas — Carteira, Plano e budget, Ficha industrial, Rastreio, Integração e Auditoria
viraram parte de onde já se precisava delas. Nenhuma conta mudou: mudou o número de lugares
onde procurar.

**Agrupar ordens** é o que sobrou da carteira, e no lugar certo: duas ordens do mesmo produto
rendem mais num enfesto só — o setup acontece uma vez e o custo por peça cai. `agruparOrdens`
desfaz os planos individuais (devolvendo reserva e cancelando as requisições que nasceram
deles), junta as linhas num lote e replaneja. As ordens continuam existindo, cada cliente com
a sua; o que muda é que passam a ser produzidas juntas. Ordem com produção já apontada não
entra — agrupar apagaria o que aconteceu.

## A segunda peça do mesmo tipo

Cadastrar a segunda camiseta custava **vinte formulários**: um do produto, um por material
(5) e um por etapa do roteiro (13), mais a liberação. Mas jaleco é jaleco — o roteiro da casa
não muda a cada peça.

Na lista de **Produtos**, cada linha ganhou o botão **⧉**: pergunta o que muda nesta peça
("gola V", "manga curta", "sem bolso") e cria o produto novo com a ficha e o roteiro inteiros,
já aberto para ajustar o que for diferente.

`copiarProdutoDoSistema(db, produtoId, dados)` copia por dentro:

| o que copia | o que não copia |
|---|---|
| ficha técnica com os consumos | as versões congeladas da origem |
| roteiro inteiro, com setor, etapa, modo, tempo e pessoas | o status — a cópia nasce em **desenvolvimento** |
| **os materiais que cada etapa consome**, remapeados para as linhas novas da ficha | a modelagem, que é o risco do outro produto |

`dados` troca o que muda de uma peça para a outra: `complemento`, `medida`, `tipoId`,
`trocas` (o mesmo modelo noutro tecido) e `consumos`. O nome é remontado do zero pela regra do
sistema — grupo, tipo, medida, tecido e complemento, sem repetir termo — e o código sai da
sigla do grupo (`CA001`), como o sistema faz. Dois produtos com o mesmo nome são recusados:
seriam dois cadastros da mesma peça.

**A essência fica de pé.** A cópia continua tendo de declarar ficha e roteiro — e continua
nascendo em desenvolvimento, sem versão congelada, abrindo ordem **só como amostra** até
alguém conferir a engenharia e liberar. O que ela não precisa é ser redigitada.

## O produto não se cadastra duas vezes

`db.produtos` já guarda a ficha técnica (`tecidos[]`: material e consumo por peça) e o
roteiro (`processo[]`: setor, etapa, tempo, pessoas, e quais materiais entram em cada etapa).
O industrial **não** recadastra isso: ele deriva.

```
db.produtos[].tecidos[]   →  itens comprados (um por material, nunca dois) + estrutura
db.produtos[].processo[]  →  uma transformação por setor, encadeadas pelo subproduto
etapa.modo                →  ciclo: 'projeto' = uma vez por ordem (0) · 'pessoa' = por peça (1)
```

O que só o industrial sabe — coproduto, os sete tipos de tempo, o rendimento do ciclo — fica
gravado aqui e **sobrevive à reimportação**. O item do produto acabado guarda `produtoId` e a
assinatura da ficha de onde veio: quando a Engenharia muda a ficha,
`divergenciasDaFicha` diz o que mudou em português e a auditoria trata como **erro**, não como
detalhe.

| função | o que faz |
|---|---|
| `produtosDaEngenharia(db)` | todo produto do sistema com o estado do vínculo: fora · em dia · divergente |
| `lerFichaDoProduto(db, id)` | a ficha na forma que o industrial entende, com o roteiro agrupado por setor |
| `derivarProdutoDaEngenharia(db, id)` | traz o produto; rodar duas vezes não duplica nada |
| `divergenciasDaFicha(db, id)` | o que a Engenharia mudou e o industrial ainda não copiou |
| `transformacoesDoProduto(db, itemId)` | a cadeia deste produto — a mesma linha de costura entra em cinco fichas |

Na tela: **Industrial → Produtos → Da Engenharia**. Com a base sem estrutura industrial, o
próprio convite inicial oferece *Trazer os produtos da Engenharia*, e a nota da integração
começa em 50% justamente porque os produtos estão fora.

## V3 — uma cadeia só

MATERIAL → ENGENHARIA → INDUSTRIAL deixaram de ser três cadastros que se parecem e passaram
a ser o mesmo dado, ligado por id.

| o que mudou | onde |
|---|---|
| **uma ponte só** entre item industrial e material do almoxarifado: custo, unidade, saldo, reservado, programado e lead time saem de `resolverMaterialIndustrial` — MRP, budget, conferência de engenharia, baixa de produção e telas chamam a mesma função | `integracao.mjs` |
| **recebimento cria lote**: entrar material gera movimentação **e** lote, com fornecedor, documento, data, custo e saldo próprio — nunca só um número de saldo que muda | `compras.mjs` |
| **consumo FIFO por lote**: a baixa de produção reparte a quantidade entre os lotes na ordem em que chegaram e grava quais foram, e é isso que faz o rastro chegar ao rolo e à nota fiscal | `motores.mjs` |
| **saldo de abertura vira lote**: o que já estava no almoxarifado quando o módulo começou entra como lote de abertura, declarado como tal — o rastro nunca termina em "apareceu do nada" | `modelo.mjs` (`migrarIndustrialV3`) |
| **conversão de unidade** usa a conversão do próprio material antes da geral: comprar em rolo e consumir em metro é o mesmo cadastro, não dois | `integracao.mjs` |
| **auditoria da cadeia**: item sem material, unidade divergente, dois itens para o mesmo material, lote sem origem, consumo sem lote, demanda sem engenharia | `auditarIntegracaoMateriaisEngenhariaIndustrial` |
| **saúde da engenharia industrial**: um percentual que sai de seis provas contadas uma a uma — quebrar metade dos vínculos derruba o número, e o teste prova isso | `indicadoresDeIntegracao` |
| **mapa da cadeia**: quinze elos com quantos registros cada um tem e quantos problemas, clicáveis para a aba onde o problema se conserta | `mapaDaCadeia` |
| **fluxo completo em 30 passos**, com prova numérica: 10.000 camisetas do cadastro ao custo, realizado batendo com o budget | `testarFluxoCompletoERPIndustrial` |

O MRP calcula e **não encosta no estoque** — há teste que fotografa saldos, extrato e lotes
antes e depois de três cálculos e exige a mesma fotografia.

## Próxima etapa

1. Dashboards por departamento (§29–§31), com a visão própria do corte, da preparação e da costura.
2. Permissões por departamento (§51) sobre o cadastro de níveis que o sistema já tem.
3. Programação do dia: distribuir as etapas da ordem entre as pessoas e as máquinas do setor.
4. Conversões de compra por material (rolo → kg) cadastradas pela tela — hoje a função já
   converte, mas a conversão precisa existir no cadastro de materiais.

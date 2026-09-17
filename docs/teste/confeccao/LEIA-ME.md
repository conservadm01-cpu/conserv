# Base de teste do Confecção ERP

Base de demonstração para o **Confecção ERP** — o sistema de página única que roda no
navegador e guarda tudo no armazenamento local (`confeccao-erp-db-v1`). É outra coisa que a
versão teste da Fase 1, em `docs/teste/`, que sai do banco do servidor.

A base não é escrita à mão: ela é montada **chamando o motor do próprio sistema**. Cada
entrada de estoque passa por `aplicarMovimento`, cada ordem por `criarOrdem`, cada
apontamento por `apontarProducao` — com as mesmas travas que valem em produção (saldo não
fica negativo, etapa não produz mais do que a anterior entregou, ordem se fecha sozinha
quando a última etapa cumpre a quantidade). O que não passa na regra não entra no arquivo.

## O que tem dentro

| | |
|---|---|
| Pessoas | 17 colaboradores em 9 setores, com salário, função, vale-transporte e as máquinas que cada um opera |
| Fábrica | 15 equipamentos, jornada 06:00–15:48, 7 custos fixos, custo do minuto calculado da folha |
| Cadastros | 8 clientes, 6 fornecedores (2 de serviço: facção de costura e bordado) |
| Almoxarifado | 27 materiais com grupo, unidade, custo e localização · 60+ movimentações · 2 itens abaixo do mínimo |
| Produtos | 6 produtos com ficha técnica, roteiro e engenharia congelada em versão — 5 liberados e 1 ainda em desenvolvimento, que só abre ordem de amostra |
| Produção | 9 ordens: uma concluída, uma amostra, uma atrasada, quatro em andamento e duas que nem começaram · 70+ apontamentos com refugo, parada e motivo de atraso (visível só quando o módulo Produção entra na montagem) |
| Chão de fábrica | 3 ocorrências (máquina parada, falta de material, falta de pessoa) |
| Canal do colaborador | 5 manifestações (elogio, sugestão, problema, risco — duas anônimas), 15 notas de clima, 2 vagas e 3 indicações |

Nomes de pessoas, clientes e fornecedores são fictícios. Os números — consumo por peça,
salário, tempo de operação, preço de tecido — são plausíveis para uma confecção deste porte,
mas são exemplo: **é base de teste, não é dado da empresa.**

## Como usar

Abra `confeccao-erp-teste.html` no navegador (dois cliques, sem servidor). Na primeira
abertura a base é gravada no navegador; a partir daí vale o que você fizer — fechar e
reabrir não desfaz nada.

- **Senha de todos os usuários: `teste123`.** Entre como *Ana Paula Ribeiro* (Administrador)
  para ver o sistema inteiro, ou como uma costureira para ver o que o chão de fábrica vê.
- `arquivo.html?base=nova` — repõe a base de teste por cima do que estiver gravado.
- `arquivo.html?base=vazia` — apaga tudo e cai na tela de primeiro acesso.

Cada navegador (e cada perfil de navegador) guarda a sua cópia: o que um testador fizer não
aparece para o outro.

## Como refazer

O HTML original do sistema não fica no repositório — é o arquivo que você já tem. Passe o
caminho dele nos três comandos:

```sh
# 1. gera a base   (docs/teste/confeccao/base-teste.json)
node docs/teste/confeccao/gerar-base.mjs ~/confeccao-erp.html

# 2. confere a base do jeito que o sistema a lê — falha se alguma conta não fechar
node docs/teste/confeccao/conferir-base.mjs ~/confeccao-erp.html

# 3. monta o HTML de teste com a base dentro (--com-industrial embute o motor industrial)
node docs/teste/confeccao/montar-html.mjs ~/confeccao-erp.html /tmp/confeccao-erp-teste.html \
  --sem-modulos=produtos,producao --com-industrial

# a montagem pode deixar módulos de fora — eles somem do menu e dos níveis de acesso
node docs/teste/confeccao/montar-html.mjs ~/confeccao-erp.html /tmp/teste.html \
  --sem-modulos=produtos,producao
```

`--sem-modulos` recebe os ids de `ABAS_SISTEMA`: `painel`, `pessoas`, `materiais`,
`engenharia`, `produtos`, `producao`, `canal`, `recados`. O código do módulo continua no
arquivo, intocado — o que sai é a entrada do menu e a permissão de cada nível de acesso, e a
montagem seguinte traz o módulo de volta. Os dados do módulo continuam na base: tirar
**Produtos** e **Produção** do menu não apaga as ordens nem a ficha técnica.

| arquivo | o que é |
|---|---|
| `motor.mjs` | carrega o motor do protótipo dentro do Node, sem navegador (React vira esqueleto) |
| `dados.mjs` | o conteúdo: pessoas, materiais, produtos, ordens, canal — é aqui que se mexe para mudar a base |
| `gerar-base.mjs` | monta a base chamando o motor e grava o JSON |
| `conferir-base.mjs` | relê a base como o sistema relê e confere saldo, avanço das ordens, custo e canal |
| `montar-html.mjs` | injeta a base no HTML do sistema |
| `base-teste.json` | a base gerada (pode ser importada/inspecionada à parte) |

As datas são sempre relativas ao dia da geração: a ordem atrasada continua atrasada, e o
apontamento de "hoje" continua sendo de hoje, em qualquer dia que você gerar de novo.

## O que a base não cobre

- **Modelagem (risco/PLT)**: o consumo de tecido está informado à mão, e o sistema avisa
  isso na tela do produto — é o aviso de "consumo estimado, sem modelagem". Para exercitar o
  corte por encaixe é preciso importar um arquivo de risco.
- **Programação do dia** e **aferição de tempo** entram vazias: são telas de operação diária,
  que fazem mais sentido preenchidas pelo próprio testador.
- **Chat interno** começa sem conversa, de propósito: mensagem trocada entre pessoas é o
  tipo de dado que não se inventa numa base de demonstração.

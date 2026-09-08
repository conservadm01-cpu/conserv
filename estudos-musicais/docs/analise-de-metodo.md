# Relatório de análise de método — índice do MSA

Gerado por `npm run metodo:importar -- dados/MSA_indice.xlsx --paginas-arquivo=150
--pagina-maxima=151 --item-maximo=112` (prévia, sem gravar).

É a fotografia do que a fonte sustenta e do que ficou pendente. O critério está em
`src/lib/metodos/analisadores/indice-em-planilha.ts` e no README — e não é específico deste
método: os limites do documento são **parâmetro de quem importa**, e a mesma análise rodaria
sobre a planilha de outro método com outros limites.

## Decisões de fidelidade

| Situação na fonte | O que o analisador faz |
|---|---|
| Item rítmico sem altura | **não** recebe tonalidade |
| "Clave adotada", "clave não indicada" | grava a clave e marca **pendente**, preservando que foi adotada |
| "A conferir no …" | fica pendente até a outra fonte ser disponibilizada |
| "Não indicada", "Sem fórmula indicada" | pendente, com o texto original da fonte |
| Página ou item além dos limites informados | **divergente**, com o motivo |
| Rótulo repetido na subunidade (ex.: "Exemplo de construção") | vira lição própria por escala, com a numeração original preservada |
| Mesmo item em Sol, Dó e Fá | uma lição, três **versões**, cada uma com a sua página |
| Mesma clave com dois compassos (compassos alternados) | uma versão, com os dois compassos |
| Aba que não permite identificar unidade e item | vira **aviso**, e não conta como conferida |

## Estrutura proposta

16 unidades `FASE` → 33 `MODULO` → 153 itens, com 211 versões por clave. A árvore é gravada
com caminho materializado; nada aqui obriga o próximo método a ter duas camadas.

## Saída da prévia

```
Arquivo: MSA_indice.xlsx (XLSX)
SHA-256: ad9c0753b0de6d12…
Analisador: Índice em planilha
Limites informados: paginasArquivo=150, paginaImpressaMaxima=151, exercicioMaximo=112

Unidades: 16 FASE, 33 MODULO
Profundidade da árvore: 2
Itens: 153 | versões: 211

Por situação de conferência:
  CONFERIDO              16
  PENDENTE_CONFERENCIA   135
  DIVERGENTE             2

Motivos de pendência (mais frequentes):
   112 × clave adotada para organização, não escrita no método
    38 × armadura não informada na fonte (“Sem armadura”)
    37 × armadura não informada na fonte (“Não indicada no MSA”)
    27 × fórmula de compasso não informada na fonte (“Não se aplica”)
    21 × fórmula de compasso não informada na fonte (“A conferir no Hinário”)
    21 × armadura não informada na fonte (“A conferir no Hinário”)
    21 × dados musicais dependem de outra fonte (“A conferir no Hinário”), ainda não disponibilizada
    13 × fórmula de compasso não informada na fonte (“Sem fórmula indicada”)
    13 × armadura não informada na fonte (“Não se aplica”)
    12 × armadura não informada na fonte (“Conforme o enunciado”)
     1 × página impressa 154 passa da última página informada (151)
     1 × página 153 do arquivo passa das 150 páginas informadas

Divergências que exigem conferência humana:
  • unidade 16, 16.3, item 113: armadura não informada na fonte (“Sem armadura”); página impressa 154 passa da última página informada (151); página 153 do arquivo passa das 150 páginas informadas; item 113 passa do último item informado (112); página impressa 155 passa da última página informada (151); página 154 do arquivo passa das 150 páginas informadas; página impressa 156 passa da última página informada (151); página 155 do arquivo passa das 150 páginas informadas
  • unidade 16, 16.3, item 112: página impressa 152 passa da última página informada (151); página 151 do arquivo passa das 150 páginas informadas; página impressa 153 passa da última página informada (151); página 152 do arquivo passa das 150 páginas informadas

Avisos da análise (18):
  • [Índice detalhado, linha 156] mesma clave com mais de um compasso — versões fundidas
  • [aba Mapa das escalas] Si maior: a lista anota “Nenhum exercício melódico identificado com esta armadura” — sem item a cruzar
  • [aba Mapa das escalas] Fá♯ maior: a lista anota “Nenhum exercício melódico identificado com esta armadura” — sem item a cruzar
  • [aba Mapa das escalas] Dó♯ maior: a lista anota “Nenhum exercício melódico identificado com esta armadura” — sem item a cruzar
  • [aba Mapa das escalas] Ré♭ maior: a lista anota “Nenhum exercício melódico identificado com esta armadura” — sem item a cruzar
  • [aba Mapa das escalas] Sol♭ maior: a lista anota “Nenhum exercício melódico identificado com esta armadura” — sem item a cruzar
  • [aba Mapa das escalas] Dó♭ maior: a lista anota “Nenhum exercício melódico identificado com esta armadura” — sem item a cruzar
  • [aba Atividades de apoio] unidade 1, item 1 listado aqui e ausente do índice detalhado
  • [aba Atividades de apoio] unidade 1, item 2 listado aqui e ausente do índice detalhado
  • [aba Atividades de apoio] unidade 1, item 3 listado aqui e ausente do índice detalhado
  • [aba Atividades de apoio] unidade 1, item 4 listado aqui e ausente do índice detalhado
  • [aba Atividades de apoio] unidade 1, item 5 listado aqui e ausente do índice detalhado
  • [aba Atividades de apoio] unidade 1, item 6 listado aqui e ausente do índice detalhado
  • [aba Atividades de apoio] unidade 1, item 7 listado aqui e ausente do índice detalhado
  • [aba Atividades de apoio] unidade 4, item 2 listado aqui e ausente do índice detalhado
  • [aba Atividades de apoio] unidade 8, item 1 listado aqui e ausente do índice detalhado
  • [aba Atividades de apoio] unidade 8, item 2 listado aqui e ausente do índice detalhado
  • [aba Atividades de apoio] unidade 8, item 3 listado aqui e ausente do índice detalhado

Amostra da estrutura proposta:
  • FASE 1 — Fase 1 (1 subunidades, 0 itens)
  • FASE 2 — Fase 2 (3 subunidades, 0 itens)
  • FASE 3 — Fase 3 (2 subunidades, 0 itens)

Prévia apenas. Rode com --registrar para gravar a análise (que ainda passará por revisão humana).
```

## O que acontece depois da prévia

1. `--registrar` grava a **análise** (`analises_de_metodo`, situação `SUGERIDA`). Nada de
   currículo ainda, nada visível para aluno.
2. Uma pessoa **CONFIRMA**, **EDITA** ou **REJEITA**, com parecer registrado.
3. Confirmada, a estrutura vira **currículo em rascunho**, com proveniência completa.
4. **Publicar é ato à parte**, e libera apenas o que está conferido.

## Como reduzir as pendências

1. **Conferir no método impresso** (ou no PDF completo, quando disponibilizado) a clave, a
   armadura e o compasso de cada lição pendente, pela central de métodos.
2. **Disponibilizar o Hinário** para os 21 itens de hino, que hoje dependem dele.
3. **Resolver as duas divergências** dos itens 112 e 113 da fase 16: as páginas registradas
   na planilha (152 a 156) passam do fim do arquivo informado (150 páginas, última página
   impressa 151).
4. **Conferir os itens da aba "Atividades de apoio"** que a conferência cruzada apontou como
   ausentes do índice detalhado.

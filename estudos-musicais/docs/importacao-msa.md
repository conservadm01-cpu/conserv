# Relatório de importação do MSA

Gerado por `npm run dados:importar -- dados/MSA_indice.xlsx` (prévia, sem gravar).
É a fotografia do que a fonte sustenta e do que ficou pendente — o critério está em
`src/lib/msa/importacao.ts` e no README.

## Decisões de fidelidade

| Situação na fonte | O que o importador faz |
|---|---|
| Exercício rítmico sem altura | **não** recebe tonalidade |
| "Clave adotada", "clave não indicada" | grava a clave e marca **pendente**, preservando que foi adotada |
| "A conferir no Hinário" | fica pendente até o Hinário ser disponibilizado |
| "Não indicada no MSA", "Sem fórmula indicada" | pendente, com o texto original da fonte |
| Página ou exercício além do arquivo informado | **divergente**, com o motivo |
| Rótulo repetido no tópico (ex.: "Exemplo de construção") | vira lição própria por escala, com a numeração original preservada |
| Mesmo exercício em Sol, Dó e Fá | uma lição, três **versões**, cada uma com a sua página |
| Mesma clave com dois compassos (compassos alternados) | uma versão, com os dois compassos |

## Saída da prévia

```
Planilha: MSA_indice.xlsx
SHA-256: ad9c0753b0de6d12…
Limites informados da edição: 150 páginas de arquivo, até a página impressa 151, último exercício 112.

Linhas lidas: 212
Lições distintas: 153
Versões (clave): 211

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
    21 × dados musicais dependem do Hinário, ainda não disponibilizado
    13 × fórmula de compasso não informada na fonte (“Sem fórmula indicada”)
    13 × armadura não informada na fonte (“Não se aplica”)
    12 × armadura não informada na fonte (“Conforme o enunciado”)
     1 × página impressa 154 passa da última página informada (151)
     1 × página 153 do arquivo passa das 150 páginas informadas

Divergências que exigem conferência humana:
  • fase 16, 16.3, exercício 113: armadura não informada na fonte (“Sem armadura”); página impressa 154 passa da última página informada (151); página 153 do arquivo passa das 150 páginas informadas; exercício 113 passa do último exercício informado (112); página impressa 155 passa da última página informada (151); página 154 do arquivo passa das 150 páginas informadas; página impressa 156 passa da última página informada (151); página 155 do arquivo passa das 150 páginas informadas
  • fase 16, 16.3, exercício 112: página impressa 152 passa da última página informada (151); página 151 do arquivo passa das 150 páginas informadas; página impressa 153 passa da última página informada (151); página 152 do arquivo passa das 150 páginas informadas

Conferência cruzada com as demais abas:
  • [Mapa das escalas] Si maior: o mapa anota “Nenhum exercício melódico identificado com esta armadura” — sem exercício a cruzar
  • [Mapa das escalas] Fá♯ maior: o mapa anota “Nenhum exercício melódico identificado com esta armadura” — sem exercício a cruzar
  • [Mapa das escalas] Dó♯ maior: o mapa anota “Nenhum exercício melódico identificado com esta armadura” — sem exercício a cruzar
  • [Mapa das escalas] Ré♭ maior: o mapa anota “Nenhum exercício melódico identificado com esta armadura” — sem exercício a cruzar
  • [Mapa das escalas] Sol♭ maior: o mapa anota “Nenhum exercício melódico identificado com esta armadura” — sem exercício a cruzar
  • [Mapa das escalas] Dó♭ maior: o mapa anota “Nenhum exercício melódico identificado com esta armadura” — sem exercício a cruzar

Prévia apenas. Rode com --aplicar para gravar no banco.
```

## Como reduzir as pendências

1. **Conferir no método impresso** (ou no PDF completo, quando disponibilizado) a clave, a
   armadura e o compasso de cada lição pendente, pelo painel de administração pedagógica.
2. **Disponibilizar o Hinário** para os 21 exercícios de hino, que hoje dependem dele.
3. **Resolver as duas divergências** dos exercícios 112 e 113 da fase 16: as páginas
   registradas na planilha (152 a 156) passam do fim do arquivo informado (150 páginas,
   última página impressa 151).

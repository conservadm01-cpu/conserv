# Estudo Musical — MSA

Aplicativo de celular para estudar música **fase a fase**, seguindo os assuntos do
**Método Simplificado de Aprendizagem Musical** (Congregação Cristã no Brasil, 1ª edição,
dezembro/2022). Cada fase tem lições curtas, exercícios lúdicos, uma **avaliação de múltipla
escolha que nunca repete a mesma pergunta** e um **certificado** ao ser concluída.

É um **PWA**: roda no navegador do celular, instala na tela de início ("Adicionar à tela de
início") e depois disso funciona **sem internet**. Não há servidor, cadastro nem envio de dados —
nome, progresso e certificados ficam no armazenamento do próprio aparelho.

---

## Como abrir

```bash
node musica/servidor.js          # http://localhost:4173
```

O servidor imprime também o endereço da máquina na rede local
(`http://192.168.x.x:4173`) — é por ele que se abre no celular para instalar o app.

Pela raiz do repositório, os mesmos comandos estão como atalho:

```bash
npm run musica                   # sobe o app
npm run musica:test              # bateria de testes do app
npm run musica:unico             # gera o app inteiro em um arquivo .html
```

### Arquivo único

`node musica/ferramentas/gerar-unico.js` junta HTML, CSS e todos os módulos em
`musica/dist/msa-app.html` (~220 KB). Esse arquivo abre com dois toques, direto do
gerenciador de arquivos do celular, sem servidor nenhum — é o jeito mais simples de
passar o app adiante por mensagem.

---

## As dez fases

| # | Fase | Assunto | Páginas do método |
|---|------|---------|-------------------|
| 1 | O som e a música | propriedades do som, notas musicais | 9 a 11 |
| 2 | A escrita musical | pentagrama, claves, figuras, pausas, equivalência | 12 a 21 |
| 3 | Ritmo, pulsação e compasso | fórmulas simples, tempos fortes, condução | 22 a 30 |
| 4 | Metrônomo, ponto de aumento e tercinas | bpm, ligadura, fermata, divisão especial | 31 a 51 |
| 5 | Tons, semitons e acidentes | sustenido, bemol, bequadro, enarmonia | 52 a 60 |
| 6 | Escalas maiores e armaduras | T T st T T T st, sustenidos e bemóis | 61 a 79 |
| 7 | Tonalidade, intervalos e dinâmica | maior e menor, relativa, ritornello | 80 a 100 |
| 8 | Compasso composto e subdivisão | 6/8, 9/8, 12/8, condução | 101 a 110 |
| 9 | Síncopa, contratempo e ritmos iniciais | tético, anacrústico, acéfalo | 111 a 125 |
| 10 | Interpretação, andamento e forma | agógica, dinâmica, frase e semifrase | 126 a 140 |

A fase 1 já vem aberta; cada fase seguinte abre quando a anterior é aprovada.

---

## A avaliação que não repete

As perguntas **não vêm de uma lista pronta**. São 69 geradores, um para cada tipo de pergunta, e
cada gerador declara o seu universo de **variantes** — a nota, a tonalidade, a fórmula de
compasso, o exemplo e até a forma de perguntar. São **1.319 perguntas distintas** no total, entre
100 e 181 por fase.

Ao montar uma prova o app:

1. lista todas as variantes possíveis da fase;
2. **desconta as assinaturas que aquele aluno já recebeu** (ficam guardadas no aparelho);
3. espalha as 10 questões entre geradores diferentes, para a prova não cair toda no mesmo ponto;
4. embaralha as alternativas.

Ou seja: a pergunta é sempre **do mesmo assunto**, mas **nunca igual** a uma que o aluno já viu.
Cada fase suporta de 10 a 18 provas totalmente inéditas. Só quando esse repertório acaba é que o
app avisa na tela e volta a usar as perguntas mais antigas — e o teste automatizado cobre
exatamente esse comportamento.

Aprovação a partir de **70%**. Reprovou, a próxima tentativa vem com perguntas novas; ao fim de
qualquer prova o app mostra o que errou, com a explicação e a página do método.

---

## Exercícios lúdicos

Sete tipos de jogo, distribuídos pelas fases conforme o assunto:

- **memória** — pares de figura/valor, acidente/efeito, andamento/velocidade;
- **leitura relâmpago** — nomear a nota na pauta contra o relógio, nas três claves;
- **fecha o compasso** — completar o compasso com as figuras certas, sem sobrar nem faltar;
- **teclado** — achar o semitom, montar a escala maior, medir intervalos;
- **ouvido** — grave/agudo e crescendo/diminuendo, com som gerado na hora;
- **pulso** — bater junto com o metrônomo e ver a própria precisão em bpm;
- **armadura** — bater o olho na armadura e dizer a tonalidade.

---

## Certificado

Ao ser aprovado, o aluno ganha um certificado com o seu nome, a fase, o aproveitamento, a data e
um **código de verificação** (derivado de nome + fase + data). Dá para **imprimir**, **salvar em
PDF** pela impressora do próprio celular ou **baixar como imagem PNG**. É um documento de estudo
pessoal, sem validade eclesiástica ou escolar — e o certificado diz isso no rodapé.

---

## Como é feito por dentro

Sem framework, sem dependência, sem etapa de build: HTML, CSS e JavaScript de módulos ES.

```
musica/
  index.html            casca do app
  css/estilo.css        um só arquivo de estilo, com modo escuro
  js/
    app.js              navegação e telas
    musica.js           teoria: notas, figuras, compassos, escalas, intervalos
    notacao.js          desenho SVG de pentagrama, claves, figuras e teclado
    audio.js            notas e metrônomo em Web Audio (nenhum arquivo de som)
    quiz.js             montagem e correção da prova, com a regra do não repetir
    jogos.js            os sete jogos
    certificado.js      certificado em SVG, impressão e PNG
    armazenamento.js    progresso no localStorage
    conteudo/fases.js       as 10 fases e as suas lições
    conteudo/geradores.js   os 69 geradores de pergunta
  teste/musica.test.js  13 testes (node --test)
  ferramentas/gerar-unico.js  empacota tudo em um arquivo
  servidor.js           servidor estático mínimo, só com o Node
  sw.js                 service worker (funciona offline)
```

A notação é **desenhada em SVG pelo próprio app** — claves, cabeças, hastes, bandeirolas,
pausas, armaduras e teclado. Não depende de fonte musical instalada no aparelho, que é
justamente o que costuma falhar em celular.

---

## Sobre o conteúdo

O material de origem são as páginas do método fornecidas em PDF (capa, páginas de borda de cada
faixa e o índice remissivo completo, que dá o mapa dos assuntos do livro inteiro). As lições
seguem esse programa e citam a página correspondente; onde o texto integral do livro não estava
disponível, o conteúdo foi escrito conforme a teoria musical padrão e a nomenclatura do próprio
método (tético/anacrústico/acéfalo, número de equivalência, movimentos de condução, T T st).

**Este app é material de apoio ao estudo. Não substitui o método impresso nem a aula com o
instrutor.**

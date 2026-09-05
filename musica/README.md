# Estudo Musical — MSA

Aplicativo de celular para estudar música **fase a fase**, em duas trilhas:

- **Teoria — MSA**: os assuntos do **Método Simplificado de Aprendizagem Musical**
  (Congregação Cristã no Brasil, 1ª edição, dezembro/2022), em 10 fases;
- **Método do instrumento**: 4 fases montadas para o instrumento que o aluno toca —
  clave, afinação, transposição, produção do som, cuidados e rotina de estudo.

Cada fase tem lições curtas, exercícios lúdicos, uma **avaliação de múltipla escolha que nunca
repete a mesma pergunta** e um **certificado** ao ser concluída. Há **cadastro de alunos com
senha** e **painel do instrutor**.

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
npm run musica:teste             # gera a versão de demonstração, com as fases abertas
```

### Endereço público (GitHub Pages)

O repositório é público, então o app pode ser servido direto pelo GitHub Pages, sem
depender de máquina ligada:

- app: **https://conservadm01-cpu.github.io/conserv/musica/**
- demonstração com as fases abertas: **https://conservadm01-cpu.github.io/conserv/musica/#/teste**

Para ligar: *Settings → Pages → Build and deployment → Source: **Deploy from a branch***,
escolhendo o branch com este código e a pasta `/ (root)`. Todos os caminhos do app são
relativos, então ele funciona em qualquer subpasta; o `.nojekyll` na raiz evita que o
GitHub tente processar os arquivos, e o `index.html` da raiz leva até aqui.

### Link rápido de teste

Para experimentar sem ter que vencer fase por fase, existe uma **versão de demonstração**
com as 10 fases já abertas:

```bash
node musica/ferramentas/gerar-unico.js --teste   # gera musica/dist/msa-teste.html
```

No app servido, o mesmo efeito sai pela rota **`#/teste`** (`http://localhost:4173/#/teste`):
ela abre todas as fases e mostra um aviso de demonstração na tela inicial. O modo vale só
enquanto a aba está aberta — nada é alterado no progresso guardado, e as fases voltam a ser
liberadas uma a uma ao recarregar pelo endereço normal.

### Arquivo único

`node musica/ferramentas/gerar-unico.js` junta HTML, CSS e todos os módulos em
`musica/dist/msa-app.html` (~220 KB). Esse arquivo abre com dois toques, direto do
gerenciador de arquivos do celular, sem servidor nenhum — é o jeito mais simples de
passar o app adiante por mensagem.

---

## Acesso: instrutor e alunos

| Perfil | Entra com | O que faz |
|--------|-----------|-----------|
| **Instrutor** | usuário `RENATO`, senha `CCB123` (de fábrica) | cadastra alunos, define instrumento e senha de cada um, acompanha o progresso, exporta cópia de segurança |
| **Aluno** | o seu nome na lista, com senha se o cadastro exigir | estuda as duas trilhas, joga, faz avaliação e tira certificado |

O app avisa enquanto a senha do instrutor for a de fábrica e oferece a troca no painel.
Cada aluno tem **progresso, histórico de perguntas e certificados próprios** — o que um estuda
não aparece no do outro. O painel tem uma chave para **ligar ou desligar o autocadastro**
(o aluno criar o próprio acesso); desligado, só o instrutor cadastra.

> **Sobre a senha, sem enfeite:** este app roda inteiro no aparelho, sem servidor. As senhas são
> guardadas em **resumo SHA-256 com sal por usuário** (nunca em texto), mas a verificação acontece
> no próprio navegador — é uma **portaria de organização**, boa para separar alunos e proteger o
> painel do uso casual, e **não** uma proteção contra quem sabe abrir o código da página.
> Segurança de verdade exige servidor.

## As dez fases da teoria (MSA)

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

## As quatro fases do instrumento

| # | Fase | Assunto |
|---|------|---------|
| 1 | Conhecendo o instrumento | família, partes, montagem, cuidados |
| 2 | Som, postura e afinação | produção do som, postura, respiração ou arcada, afinação |
| 3 | A leitura no meu instrumento | clave, afinação do instrumento, transposição, extensão, a sua voz no hino |
| 4 | Estudo diário e ensaio | rotina, articulação, metrônomo, tocar junto |

As lições e as perguntas **mudam conforme o instrumento**: o clarinetista aprende que o seu Dó
soa Si♭; o violinista, que as cordas soltas são Sol–Ré–Lá–Mi; o trompista, que a sua parte soa
uma 5ª justa abaixo. São **21 instrumentos** cobertos — cordas (violino, viola, violoncelo,
contrabaixo), madeiras (flauta, oboé, corne inglês, clarinete, clarone, fagote e os quatro
saxofones), metais (trompete, trompa, trombone, bombardino, tuba) e teclas (órgão, acordeon).
Cada fase de instrumento tem de **62 a 87 perguntas possíveis**, ou seja, ao menos 6 provas
inéditas por fase, para cada instrumento.

As duas trilhas são independentes: a fase 1 de cada uma já vem aberta, e a trilha do instrumento
não espera a teoria terminar.

---

## A avaliação que não repete

As perguntas **não vêm de uma lista pronta**. São 69 geradores na teoria e 15 no instrumento, um
para cada tipo de pergunta, e cada gerador declara o seu universo de **variantes** — a nota, a
tonalidade, a fórmula de compasso, o instrumento, o exemplo e até a forma de perguntar. São
**1.319 perguntas distintas** na trilha do MSA (de 100 a 181 por fase) e mais **cerca de 280 por
instrumento** na trilha do método.

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
    senha.js            SHA-256 puro e conferência de senha
    conteudo/fases.js              as 10 fases do MSA e as suas lições
    conteudo/geradores.js          os 69 geradores de pergunta do MSA
    conteudo/instrumentos.js       os 21 instrumentos e a conta de transposição
    conteudo/fases-instrumento.js  as 4 fases e os 15 geradores do instrumento
    conteudo/trilhas.js            junta as duas trilhas do aluno
  teste/                36 testes (node --test): teoria, acesso e instrumento
  ferramentas/gerar-unico.js  empacota tudo em um arquivo
  servidor.js           servidor estático mínimo, só com o Node
  sw.js                 service worker (funciona offline)
```

A notação é **desenhada em SVG pelo próprio app** — claves, cabeças, hastes, bandeirolas,
pausas, armaduras e teclado. Não depende de fonte musical instalada no aparelho, que é
justamente o que costuma falhar em celular.

---

## Sobre o conteúdo

O material de origem da trilha de teoria são as páginas do método fornecidas em PDF (capa,
páginas de borda de cada faixa e o índice remissivo completo, que dá o mapa dos assuntos do livro
inteiro). As lições seguem esse programa e citam a página correspondente; onde o texto integral do
livro não estava disponível, o conteúdo foi escrito conforme a teoria musical padrão e a
nomenclatura do próprio método (tético/anacrústico/acéfalo, número de equivalência, movimentos de
condução, T T st).

**O método impresso de cada instrumento não foi fornecido.** A trilha do instrumento traz a
técnica padrão daquele instrumento (família, clave, afinação, transposição, produção do som,
cuidados, rotina) somada à teoria do MSA. Se os métodos dos instrumentos forem disponibilizados,
as lições e as perguntas podem passar a citar página e exercício, como já acontece no MSA.

**Este app é material de apoio ao estudo. Não substitui o método impresso nem a aula com o
instrutor.**

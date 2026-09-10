# Estudo Musical — MSA

App de estudo de teoria musical e do método do instrumento. É **uma página só**:
`index.html` traz o HTML, o CSS, o JavaScript e todo o conteúdo. Não há servidor,
não há build, não há dependência para rodar. Abrir o arquivo no celular basta.

```bash
cd msa
npm start            # http://localhost:4321 — serve publico/ com os cabeçalhos da Vercel
npm install && npx playwright install chromium && npm test   # 136 testes, num Chromium de verdade
```

Sem instalar nada: abra `msa/publico/index.html` direto no navegador. O app é a
página — ela já está toda ali.

```
msa/
  publico/            ← o que vai para o ar. Só isto.
    index.html          o app inteiro: HTML, CSS, JavaScript e conteúdo
    sw.js               guarda a página para abrir sem internet
    manifest.webmanifest, icone.svg, icone-mascara.svg
  servir.mjs          servidor local com os mesmos cabeçalhos da hospedagem
  test/               os testes
```

---

## O acesso

A entrada é **uma porta só**: usuário e senha, para todo mundo.

| Quem | Usuário | Senha |
| --- | --- | --- |
| **Master** (o acesso de fábrica) | `ADMIN` | `CCB701040` |
| Aluno | o **nome completo** do cadastro dele | a que ele escolheu no cadastro |
| Instrutor, encarregado, ministério | o **nome completo** do pedido | a que ele escolheu no pedido — **depois de o master liberar** |

O usuário não diferencia maiúsculas nem espaços sobrando — `Ana Teste`,
`ana teste` e ` ANA  TESTE ` são a mesma pessoa. A senha diferencia.

Três coisas que a tela de acesso deliberadamente **não** faz:

- **não lista quem estuda no aparelho.** Antes a primeira tela mostrava um
  cartão por aluno, com nome e instrumento, para quem quer que abrisse a página;
  agora quem chega vê um formulário e nada mais;
- **não deixa entrar sem senha.** Todo acesso tem senha — não existe mais a
  opção "entrar sem senha" no cadastro do aluno. Um cadastro antigo que entrava
  só apertando o nome recebe, na primeira abertura desta versão, a senha de
  fábrica (`CCB701040`) e o aviso, em toda tela, para trocá-la;
- **não diz qual dos dois campos errou.** Usuário inexistente e senha errada
  dão exatamente a mesma resposta — senão bastaria chutar nomes para descobrir
  quem estuda aqui.

Quem entra com a senha de fábrica vê um aviso permanente e um caminho para
`#/senha`, onde troca a senha conferindo a atual. Vale para o instrutor e para
o aluno: é a mesma tela.

### O que isto é, e o que não é

O app roda inteiro no aparelho, sem servidor. Isto é uma **portaria**: separa o
progresso de cada aluno e protege o painel do instrutor do uso casual. **Não é**
segurança contra quem sabe abrir o código da página — quem tem o aparelho na mão
e sabe o que está fazendo lê o localStorage. As senhas nunca são guardadas em
texto: fica só o resumo SHA-256 com um sal por usuário, o que protege a senha
(que a pessoa provavelmente repete em outros lugares), não os dados.

Quando os dados forem para um servidor, a conferência passa a ser feita lá, e as
regras de `dados/permissoes` viram a referência do que cada perfil pode.

---

## Quem entra sozinho e quem precisa ser liberado

No primeiro acesso a pessoa diz quem é. **Aluno entra na hora** — o que ele
alcança é o próprio estudo. **Instrutor, encarregado e ministério não entram
sozinhos**: o cadastro vira um *pedido de acesso*, e só o **master** libera.
O acesso deles alcança a turma inteira, e ninguém alcança a turma sem que
alguém tenha deixado.

A senha que a pessoa escolhe no pedido é a que vale no dia da liberação —
não há senha para combinar por fora, nem senha provisória circulando por aí.

Enquanto o pedido espera, quem tenta entrar ouve **"o seu pedido ainda está
esperando a liberação"** em vez de "usuário ou senha incorretos" — mas só
depois de digitar a senha que ele mesmo escolheu. Sem essa prova, a resposta é
a de sempre: um chute não descobre que existe um pedido naquele nome.

Os pedidos esperando aparecem no alto do painel do master, com o contato da
pessoa e quem pode confirmar quem ela é. Liberar ou recusar é um botão; a
recusa leva um motivo, que a pessoa lê ao tentar entrar.

## O que cada perfil alcança

| | master | administrador | instrutor | encarregado | ministério | aluno |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Liberar acesso de outra pessoa | ✔ | | | | | |
| Cadastrar e editar alunos | ✔ | ✔ | ✔ | | | |
| Cadastrar, editar e excluir método | ✔ | ✔ | | | | |
| Criar turma, anexar método, definir critério | ✔ | ✔ | ✔ | | | |
| Ver as turmas | ✔ | ✔ | ✔ | ✔ | ✔ | |
| Ver a ficha e o contato da turma | ✔ | ✔ | ✔ | ✔ | | |
| Ver relatórios e panorama | ✔ | ✔ | ✔ | ✔ | ✔ | |
| Exportar, importar, apagar | ✔ | ✔ | | | | |
| Estudar, e ver o próprio progresso | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

O **encarregado** acompanha os músicos da comum: vê a turma e os relatórios, e
não mexe em cadastro. O **ministério** vê como o trabalho vai — o panorama e os
relatórios — sem a ficha individual de ninguém: responder "como está o trabalho
aqui?" não exige abrir o e-mail e o WhatsApp de cada músico.

**O aluno não exporta nada.** A cópia de segurança leva o aparelho inteiro — a
ficha, o contato e o progresso de toda a turma, e o resumo da senha de cada um.
Ela é do administrador, e a tela de ajustes do aluno diz isso em vez de oferecer
um botão. O que é dele, ele leva: os selos de fase concluída, em *Meus selos*.

Esconder o botão vale para quem não sabe abrir o console — por isso cada ação
sensível também **confere a permissão onde ela acontece**, lendo a mesma tabela
de `dados/permissoes` que a tabela acima descreve. Não há regra paralela que um
dia discorde dessa.

Rota de aluno que aponte para o painel cai de volta em `#/` com um recado; rota
qualquer sem sessão cai na tela de acesso.

---

## Fases, blocos e selos

No MSA a **fase é a unidade de estudo** e o **bloco é a unidade de avaliação**.
As 16 fases do livro estão agrupadas de três em três: seis blocos, seis
avaliações, seis selos.

| Bloco | Fases | Páginas |
| :-: | :-: | :-: |
| 1 | 1 a 3 | 9–33 |
| 2 | 4 a 6 | 34–64 |
| 3 | 7 a 9 | 65–92 |
| 4 | 10 a 12 | 93–117 |
| 5 | 13 a 15 | 118–135 |
| 6 | 16 | 136–157 |

A avaliação do bloco **sorteia das três fases juntas**. Isso é o que torna o
bloco possível: sozinha, a fase 9 tem pouco repertório inédito; dentro do bloco
3 ela divide a prova com as fases 7 e 8, e o bloco todo passa de sessenta
perguntas diferentes. A memória do que já caiu também é do bloco — a mesma
pergunta não volta, venha ela de qual das três fases vier.

Passar na avaliação **conclui as três fases de uma vez** e libera o bloco
seguinte. O aluno estuda as três antes de ser avaliado; enquanto o bloco não
abre, a tela da fase diz qual bloco falta.

O que ele ganha ao passar não se chama certificado: é um **selo de fase
concluída**, um por bloco, com o intervalo no rosto — *Fases 1 a 3*, *Fases 4 a
6*. Certificado é palavra de quem certifica alguém perante terceiros, e não é
isso que um app de estudo faz. O selo fica em *Meus selos*, e o aluno baixa a
imagem.

O último bloco tem uma fase só porque o livro tem 16, não 18. Ele é avaliado
como os outros.

O **método do instrumento continua fase a fase**: uma avaliação e um selo por
fase, sem blocos. Quem cadastra um método novo escolhe — sem bloco, vale a
regra antiga (a fase abre quando a anterior passa).

### A subida para as 16 fases

O MSA tinha 10 fases inventadas para o app antes de seguir o livro. Na primeira
abertura depois da atualização, o app **refaz o conteúdo do MSA** e **apaga o
progresso, os resultados e os selos do MSA** — a fase 5 de antes não é a fase 5
de agora, e aproveitar a nota seria mentir sobre o que o aluno estudou. Uma
cópia de segurança automática é gravada antes, e o método do instrumento não é
tocado.

---

## Métodos

Em **📚 Métodos**, no painel, ficam os métodos cadastrados — os que vêm com o
aplicativo e os que o instrutor cria. Cada um pode ser **inserido, editado ou
excluído**, e há dois caminhos para cadastrar um:

**Pelo aplicativo** — *Cadastrar método*. Você dá nome, descrição e fonte,
anexa o **PDF** que os alunos vão ler, e escreve as **fases** (com as páginas
do PDF em que cada uma está) e as **lições** de cada fase. É o caminho para
quem tem o método impresso na mão.

**Por arquivo** — *Importar de um arquivo*. Um JSON com fases, lições, jogos e
as questões da avaliação, conferido antes de gravar. É o caminho para quem já
tem o método estruturado.

Uma coisa que o aplicativo **não** faz, e é melhor dizer: ele não lê o PDF.
Transformar um livro em fases, lições e questões é trabalho de quem conhece o
método — o app roda no aparelho, sem servidor e sem internet, e inventar esse
conteúdo seria produzir método que ninguém escreveu. O que ele faz é guardar o
PDF para o aluno abrir e deixar o instrutor dizer, fase a fase, em que página
está cada assunto.

Por isso também: uma fase cadastrada aqui nasce **sem questões**, e a avaliação
dela não abre para o aluno até que existam — a tela diz isso em vez de servir
uma prova de zero perguntas. As questões entram pelo arquivo JSON.

### O que não se edita

O MSA e o método do instrumento vêm com o aplicativo: o texto das lições deles
é código que desenha pentagramas e monta tabelas, e a fase cadastrada só aponta
para ele. Editar essas lições pela tela seria mentir — o que a tela mostrasse
não seria o que o aluno leria. Deles se edita o nome, a descrição, a fonte e o
PDF; e nenhum dos dois é removido.

Um método criado no app também não é removido enquanto houver aluno matriculado
ou turma aberta nele. Remover leva junto as fases, as lições, as avaliações e o
PDF.

### Matrícula

Um método criado hoje não alcança sozinho quem já estava cadastrado ontem: a
matrícula é feita quando o aluno entra. O botão **Matricular os alunos neste
método** fecha essa distância, e é explícito de propósito — matricular a turma
inteira sem ninguém pedir seria decidir pelo instrutor.

## Turmas

A turma junta um grupo de alunos em torno de um método, guarda o **método em
PDF** e diz **o que é preciso para ser aprovado** nela. Está no painel, em
**🎓 Turmas**.

### O critério de aprovação

Quatro perguntas, e cada uma é conferida contra o que o aluno **fez** — não há
campo em que alguém escreva "aprovado":

| Critério | O que é conferido |
| --- | --- |
| Nota mínima em cada avaliação | a melhor nota gravada de cada fase |
| Fases para concluir a turma | quantas fases do método já passaram dessa nota (0 = todas) |
| Lições dessas fases lidas | as lições que o aluno abriu, fase a fase |
| Média mínima nas fases concluídas | a média das notas que contaram |

Mexeu no critério, a situação de todo mundo muda junto — e a escola sabe
explicar linha a linha por quê. O aluno vê o mesmo quadro na tela dele: saber o
que se pede é direito de quem está sendo avaliado por isso.

A **nota mínima da turma passa a valer para as fases daquele método**, no lugar
dos 70% padrão. A ordem em que a pergunta é feita: a turma do aluno, depois a
fase, depois a avaliação, depois o aplicativo. Turma encerrada não decide mais
nada.

### O método em PDF

O PDF — o da turma e o do método — vai para o **IndexedDB**, e não para o
localStorage onde mora o resto.
Não é preciosismo: o localStorage tem por volta de 5 MB para *tudo* e guarda
texto — um PDF entraria em base64, um terço maior do que já é. Um método de
8 MB não caberia; e, ao tentar, derrubaria a gravação do progresso de todo mundo
junto, porque o depósito grava o estado inteiro de uma vez. Dado grande e dado
pequeno com ciclos de vida diferentes não dividem gaveta.

O cadastro da turma guarda só a ficha do arquivo — nome, tipo, tamanho e o
identificador. Remover o material ou a turma leva os bytes junto, e o app faz
uma faxina na abertura: um PDF que perdeu o dono (uma cópia importada por cima,
por exemplo) é apagado.

O limite é **65 MB por arquivo**, e mora num lugar só — no módulo que guarda, e
não em cada tela que anexa. Se o aparelho ficar sem espaço antes disso, o app
diz quantos MB não couberam e o que fazer, em vez de repassar o *"The quota has
been exceeded"* do navegador.

**A cópia de segurança não leva os PDFs.** Ela é um arquivo de texto com o
cadastro; os métodos ficam no aparelho e são anexados de novo depois de uma
restauração.

## Os testes

`npm test` sobe o app num servidor local e o abre num Chromium de verdade — com
`localStorage` de verdade, clicando nos mesmos botões que o aluno clica. Testar
esta página fora de um navegador seria testar outra coisa.

| Arquivo | O que cobre |
| --- | --- |
| `test/acesso.test.mjs` | portaria: usuário e senha, perfis, troca de senha, o que cada um alcança |
| `test/estudo.test.mjs` | lição, jogo, avaliação, selo — e o que fica guardado |
| `test/blocos.test.mjs` | as 16 fases do MSA, os 6 blocos, a avaliação do bloco e o selo |
| `test/conteudo.test.mjs` | **todas** as variantes de **todos** os geradores de pergunta |
| `test/perfis.test.mjs` | quem entra sozinho, quem espera liberação, e o que cada perfil alcança |
| `test/turmas.test.mjs` | a turma, o método em PDF e o critério de aprovação conferido item a item |
| `test/metodos.test.mjs` | cadastrar, editar e excluir método, o PDF, as fases e as lições |
| `test/dados.test.mjs` | cadastro, cópia de segurança, remoção e a subida de versão |
| `test/hospedagem.test.mjs` | o que a Vercel serve, com que cabeçalhos, e o app abrindo sem internet |

O de conteúdo é o mais rendoso: passa por cada variante de cada gerador, de cada
fase, para cada um dos 21 instrumentos do catálogo — mais de dez mil perguntas —
e confere que a resposta certa está entre as alternativas, que não há alternativa
repetida, que há explicação e referência ao método, e que nenhum texto saiu com
buraco. Uma pergunta quebrada só apareceria para o aluno no meio da avaliação.

Nenhum teste tolera erro de JavaScript: qualquer exceção na página derruba a
suíte, mesmo que a tela pareça certa.

Se o Chromium já estiver instalado na máquina, aponte para ele com
`MSA_CHROMIUM=/caminho/para/chrome npm test` em vez de baixar outro.

---

## Hospedar na Vercel

Está tudo pronto no repositório: `vercel.json` na raiz e `.vercelignore` ao lado.
Não há build — a Vercel só publica o conteúdo de `msa/publico/`.

```bash
npx vercel            # pré-visualização
npx vercel --prod     # publica
```

Ou pelo painel: **Add New → Project**, importe o repositório e **Deploy**. Não
mexa em nada na tela de configuração — o `vercel.json` já diz o que fazer:

```json
{ "framework": null, "installCommand": "", "buildCommand": "", "outputDirectory": "msa/publico" }
```

`installCommand` e `buildCommand` vazios são de propósito. Sem eles a Vercel
acharia o `package.json` da raiz e rodaria o build do **ERP**, que não tem nada a
ver com este app e derrubaria o deploy por um motivo que não é dele.

**Os cabeçalhos** também vêm do `vercel.json`, e os testes usam exatamente os
mesmos — um app que passa nos testes e quebra em produção porque a CSP barrou
alguma coisa é um app que não foi testado.

| Cabeçalho | Por quê |
| --- | --- |
| `Content-Security-Policy` | o app não busca nada fora do próprio endereço, e a política diz isso ao navegador: nenhum script, fonte ou imagem de fora entra |
| `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` | o endereço do aparelho não vaza para lugar nenhum |
| `Permissions-Policy` | câmera, microfone e localização ficam desligados — o app não usa nenhum deles |
| `Cache-Control` na página e no `sw.js` | `max-age=0, must-revalidate`: uma correção publicada hoje chega ao aluno hoje |

**Sem internet.** `sw.js` guarda a página no aparelho, com a estratégia de
**rede primeiro**: quem está on-line sempre recebe a versão de agora, e o cache
só entra quando a rede falha. Cache primeiro seria mais rápido e traria um
problema pior — uma correção publicada hoje só chegaria quando o cache do aluno
vencesse, e ninguém saberia dizer quando.

**Na tela de início.** Com o `manifest.webmanifest`, o celular oferece "adicionar
à tela de início" e o app abre em tela cheia, com ícone próprio.

**Antes de publicar**, lembre-se de trocar a senha do `ADMIN` — o endereço da
Vercel é público, e `CCB701040` está escrito neste README.

---

## O conteúdo

A trilha de **teoria** segue o *Método Simplificado de Aprendizagem Musical*
(Congregação Cristã no Brasil, 1ª edição, dez/2022) na ordem do livro: **16
fases**, com o título e as páginas de cada assunto como estão lá.

| Fase | Assunto | Páginas |
| :-: | --- | :-: |
| 1 | Música, som e escrita | 9–16 |
| 2 | Figuras, compasso e pulsação | 17–26 |
| 3 | Endecagrama e solfejo | 27–33 |
| 4 | Ligadura, ponto e compassos em 3 e em 2 | 34–43 |
| 5 | Tercinas, fermata e compasso em 6 | 44–51 |
| 6 | Tom, semitom, acidentes e escalas maiores | 52–64 |
| 7 | Armadura de clave e compassos em 9 e em 12 | 65–79 |
| 8 | Tonalidade e acidentes ocorrentes | 80–85 |
| 9 | Barra de repetição | 86–92 |
| 10 | Dinâmica | 93–99 |
| 11 | Acento métrico, compasso simples e composto | 100–110 |
| 12 | Síncopa e contratempo | 111–117 |
| 13 | Ritmos iniciais | 118–125 |
| 14 | Notas pontuadas na subdivisão | 126–129 |
| 15 | Andamento | 130–135 |
| 16 | Frases e interpretação musical | 136–157 |

O texto das lições **foi escrito para o app**, não copiado do livro: o método é
material da Congregação, com reprodução vedada fora dos seus recintos. A lição
apresenta o assunto, aponta a página, e o aluno lê o original no **PDF anexado
ao método** — que fica no aparelho dele, não no repositório nem no site.

A trilha do **instrumento** traz a técnica padrão do
instrumento escolhido — família, clave, afinação, transposição, cuidados e rotina
de estudo; o método impresso do instrumento não foi fornecido, e este conteúdo
não o substitui. Nenhuma das duas substitui a aula com o instrutor.

As perguntas da avaliação não são um banco fixo: nascem de geradores com
variantes, e a mesma pergunta nunca cai duas vezes para o mesmo aluno. Quando o
aluno esgota o repertório inédito, o app avisa antes de reaproveitar as mais
antigas.

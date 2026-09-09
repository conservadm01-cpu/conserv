# Estudo Musical — MSA

App de estudo de teoria musical e do método do instrumento. É **uma página só**:
`index.html` traz o HTML, o CSS, o JavaScript e todo o conteúdo. Não há servidor,
não há build, não há dependência para rodar. Abrir o arquivo no celular basta.

```bash
# rodar: abra msa/index.html no navegador, ou sirva a pasta
python3 -m http.server 4321 --directory msa

# testar (Chromium de verdade, via Playwright)
cd msa && npm install && npx playwright install chromium && npm test
```

---

## O acesso

A entrada é **uma porta só**: usuário e senha, para todo mundo.

| Quem | Usuário | Senha |
| --- | --- | --- |
| Instrutor (administrador) | `admin` | `ccb123` |
| Aluno | o **nome completo** do cadastro dele | a que ele escolheu no cadastro |

O usuário não diferencia maiúsculas nem espaços sobrando — `Ana Teste`,
`ana teste` e ` ANA  TESTE ` são a mesma pessoa. A senha diferencia.

Três coisas que a tela de acesso deliberadamente **não** faz:

- **não lista quem estuda no aparelho.** Antes a primeira tela mostrava um
  cartão por aluno, com nome e instrumento, para quem quer que abrisse a página;
  agora quem chega vê um formulário e nada mais;
- **não deixa entrar sem senha.** Todo acesso tem senha — não existe mais a
  opção "entrar sem senha" no cadastro do aluno. Um cadastro antigo que entrava
  só apertando o nome recebe, na primeira abertura desta versão, a senha de
  fábrica (`ccb123`) e o aviso, em toda tela, para trocá-la;
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

## O que cada perfil alcança

- **Instrutor** — painel com o quadro da turma, alertas, relatórios, métodos,
  cadastro e edição de alunos, exportação (planilha e cópia de segurança),
  importação e "abrir o app como este aluno" (que não pede a senha do aluno: quem
  autoriza é a sessão de instrutor já aberta).
- **Aluno** — trilhas, lições, jogos, avaliação, certificados, desempenho,
  conquistas, histórico e a própria ficha.

Rota de aluno que aponte para o painel cai de volta em `#/` com um recado; rota
qualquer sem sessão cai na tela de acesso.

---

## Os testes

`npm test` sobe o app num servidor local e o abre num Chromium de verdade — com
`localStorage` de verdade, clicando nos mesmos botões que o aluno clica. Testar
esta página fora de um navegador seria testar outra coisa.

| Arquivo | O que cobre |
| --- | --- |
| `test/acesso.test.mjs` | portaria: usuário e senha, perfis, troca de senha, o que cada um alcança |
| `test/estudo.test.mjs` | lição, jogo, avaliação, certificado — e o que fica guardado |
| `test/conteudo.test.mjs` | **todas** as variantes de **todos** os geradores de pergunta |
| `test/dados.test.mjs` | cadastro, cópia de segurança, remoção e a subida de versão |

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

## O conteúdo

A trilha de **teoria** segue os assuntos do *Método Simplificado de Aprendizagem
Musical* (Congregação Cristã no Brasil, 1ª edição, dez/2022), com a página do
livro em cada lição. A trilha do **instrumento** traz a técnica padrão do
instrumento escolhido — família, clave, afinação, transposição, cuidados e rotina
de estudo; o método impresso do instrumento não foi fornecido, e este conteúdo
não o substitui. Nenhuma das duas substitui a aula com o instrutor.

As perguntas da avaliação não são um banco fixo: nascem de geradores com
variantes, e a mesma pergunta nunca cai duas vezes para o mesmo aluno. Quando o
aluno esgota o repertório inédito de uma fase, o app avisa antes de reaproveitar
as mais antigas.

# CLAVE — acompanhamento de progresso de alunos de música

App próprio, separado do ERP de confecção que vive na raiz deste repositório. Ele responde a
uma pergunta só, e responde bem:

```
ALUNO: CARLOS
FORMAÇÃO MUSICAL   MSA               FASE 4    82%
VIOLINO            Método XYZ        FASE 2    74%
REPERTÓRIO         Nível iniciante             68%
```

De onde vêm esses percentuais? No CLAVE eles **não são digitados**. Cada trilha tem fases, cada
fase tem objetivos com peso, e o professor avalia objetivo por objetivo numa escala de cinco
níveis. O percentual da fase é a média dos níveis ponderada pelo peso — mexeu na avaliação, o
número muda; mudou o peso do objetivo, o número muda. É a diferença entre um boletim que
alguém preencheu e um boletim que a escola pode explicar linha a linha.

---

## Como rodar

Sem instalar dependência nenhuma: o app usa só o que vem no Node 22 (servidor HTTP e
`node:sqlite`), e a interface é HTML, CSS e JavaScript servidos direto.

```bash
cd musica
npm run db:seed      # cria o banco com o currículo e a turma de demonstração
npm start            # http://localhost:3400
npm test             # 20 testes, sem rede e sem banco em disco
```

`npm run db:init` cria um banco vazio, quando você não quiser os dados de demonstração.
O banco fica em `musica/data/clave.db` (mude com `DB_PATH`), e a porta com `PORT`.

O seed imprime o boletim do Carlos ao terminar — e ele bate com o quadro acima, porque sai
da mesma conta que a tela usa.

---

## O modelo

**Trilha → fase → objetivo.** A trilha é o caminho de estudo (*Formação musical*, *Violino*,
*Repertório*), com o método e o **mínimo para avançar de fase**, que cada trilha define no seu
cadastro. A fase é a etapa (*Fase 4 — escalas maiores, intervalos e colcheias*). O objetivo é o
que se avalia (*ditado melódico de quatro compassos em Dó maior*), com um **peso**: leitura à
primeira vista pesa mais que reconhecer duas notas ao ouvido, e o peso é onde isso fica escrito.

**Matrícula.** O aluno entra numa trilha e começa pela primeira fase. Um aluno tem uma
matrícula por trilha — as três do Carlos andam em ritmos diferentes, e é isso que o boletim
mostra.

**Avaliação.** Cinco níveis: 0 não iniciado, 1 introduzido, 2 em desenvolvimento,
3 consolidado, 4 dominado.

```
percentual da fase = Σ (peso do objetivo × nível) ÷ (Σ pesos × 4)
```

Objetivo sem avaliação entra como zero — quem ninguém olhou não vira crédito. Para o número
não mentir por omissão, ao lado dele aparece a **cobertura**: quanto do peso da fase já foi
avaliado ao menos uma vez. Fase com 40% e cobertura de 40% não é um aluno ruim; é uma fase que
mal começou a ser avaliada.

---

## As regras que o app defende

- **Percentual não é campo.** Não existe endpoint para escrever "82%". Existe endpoint para
  avaliar um objetivo. O resto é conta.
- **Avaliação não é sobrescrita.** Cada lançamento fica no histórico; a vigente é a última por
  data. Dá para ver a evolução — e o retrocesso, que também acontece.
- **Passar de fase tem porteiro.** Abaixo do mínimo da trilha, o avanço é recusado, e a
  mensagem diz quantos pontos faltam. Forçar é possível, mas **exige justificativa escrita**:
  a exceção fica registrada em vez de virar hábito silencioso.
- **Fase encerrada congela.** O percentual do fechamento é gravado. Se o currículo mudar no ano
  que vem, o histórico continua contando o que foi avaliado no ano passado.
- **Fase encerrada não aceita avaliação nova**, e objetivo de fase que o aluno ainda não
  começou também não.
- **Histórico não se apaga.** Aluno com avaliação lançada é inativado, não excluído; objetivo já
  avaliado sai da conta da fase (`ativo = 0`) mas permanece no histórico; fase onde alguém está
  matriculado não é excluída.
- **Aula não é lançada no futuro.**

## O que se vê na tela

- **Painel** — alunos ativos, trilhas em curso, média das fases, aulas do mês; média por trilha;
  **quem está apto a avançar de fase** (com o botão para encerrar a fase ali mesmo); e **quem
  está sem avaliação há mais de 30 dias**, que é o aluno que some da conversa antes de sumir da
  escola.
- **Alunos** — lista com a fase e o percentual de cada trilha, média e frequência; cadastro e busca.
- **Aluno** — o boletim: uma faixa por trilha com fase, percentual, cobertura, o que falta para o
  mínimo, os objetivos com o seletor de nível (avaliar é mudar o seletor), histórico de
  avaliações e o registro de aulas.
- **Currículo** — trilhas, fases e objetivos, com o peso de cada objetivo e o mínimo da trilha.
- **Boletim impresso** — `/boletim/:id` sai em A4, com escala, assinaturas e as últimas aulas.
  O navegador imprime ou salva em PDF; não há gerador de PDF no servidor.

## API

| Método | Rota | O que faz |
| --- | --- | --- |
| `GET` | `/api/alunos` | lista com média, frequência e resumo por trilha (`?busca=`, `?ativo=`) |
| `POST` | `/api/alunos` | cadastra |
| `GET` | `/api/alunos/:id` | boletim completo |
| `PUT` `DELETE` | `/api/alunos/:id` | edita; exclui ou inativa quem tem histórico |
| `POST` | `/api/alunos/:id/matriculas` | matricula numa trilha, na primeira fase |
| `GET` `POST` | `/api/alunos/:id/aulas` | registro de aulas |
| `GET` | `/api/matriculas/:id` | progresso da trilha, com objetivos e avaliação vigente |
| `POST` | `/api/matriculas/:id/avaliacoes` | avalia um objetivo (`objetivo_id`, `nivel`) |
| `POST` | `/api/matriculas/:id/avancar` | encerra a fase (`forcar`, `justificativa`) |
| `GET` | `/api/matriculas/:id/historico` | tudo que já foi lançado |
| `GET` `POST` `PUT` | `/api/trilhas`… | currículo: trilhas, fases (`/api/trilhas/:id/fases`) e objetivos (`/api/fases/:id/objetivos`) |
| `GET` | `/api/indicadores` | números do painel |
| `GET` | `/api/niveis` | a escala de avaliação |
| `GET` | `/boletim/:id` | boletim em HTML A4 |

Erro de regra volta com status 4xx e `{ "erro": "mensagem em português" }` — a mesma frase que a
tela mostra.

## Estrutura

```
musica/
  src/
    services/progresso.js   a conta: percentual, cobertura, avanço de fase, boletim
    services/boletim-html.js o A4 impresso
    routes/                 alunos, trilhas, matrículas, indicadores, boletim
    lib/http.js             roteador mínimo sobre o http do Node
    db/schema.sql           o modelo inteiro, comentado
    scripts/seed.js         currículo + turma de demonstração (o Carlos sai daqui)
  public/                   interface: index.html, app.js, estilos.css
  test/                     20 testes: a conta, as regras, a API e o seed
```

## Limites conhecidos

- **Sem login.** O app pressupõe uso interno na secretaria e na sala de aula. Antes de expor na
  internet, é preciso pôr autenticação na frente — o ERP da raiz do repositório tem um exemplo
  de sessão com JWT e permissão por área.
- `node:sqlite` ainda é marcado como experimental no Node 22; por isso os scripts sobem com
  `--no-warnings`. A API é estável o bastante para este uso, mas é bom saber.
- A média entre trilhas é aritmética simples: nenhuma trilha pesa mais que a outra. Se a escola
  quiser que formação musical valha mais que repertório, isso vira peso na trilha.

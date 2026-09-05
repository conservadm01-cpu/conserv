/**
 * Base de demonstração do CLAVE.
 *
 * Os números do Carlos (formação musical 82%, violino 74%, repertório 68%) não
 * estão escritos em lugar nenhum: eles saem das avaliações lançadas aqui, pela
 * mesma conta que a tela usa. Se a escala ou os pesos mudarem, o percentual
 * muda junto — que é exatamente o comportamento que se quer de um boletim.
 */
import { config } from '../config.js';
import { db, migrar, inserir, um, rodar, fechar } from '../db/index.js';
import { matricular, progressoMatricula, avancarFase } from '../services/progresso.js';

const hoje = new Date();
const dia = (offset) => new Date(hoje.getTime() + offset * 86400000).toISOString().slice(0, 10);

const CURRICULO = [
  {
    nome: 'Formação musical',
    metodo: 'MSA',
    minimo_avanco: 80,
    descricao: 'Percepção, leitura e teoria — a base que sustenta qualquer instrumento.',
    fases: [
      ['Pulso e primeiros sons', [
        ['Manter o pulso batendo palmas sobre a música gravada', 3],
        ['Reconhecer som grave e agudo, forte e fraco', 2],
        ['Imitar células rítmicas de dois tempos', 3],
        ['Cantar afinado uma melodia de três notas', 2],
      ]],
      ['Leitura rítmica em compasso simples', [
        ['Semibreve, mínima, semínima e suas pausas', 3],
        ['Ler ritmo à primeira vista em 2/4 e 4/4', 4],
        ['Ditado rítmico de quatro compassos', 3],
        ['Solfejar o ritmo com sílabas, no andamento marcado', 2],
      ]],
      ['Pauta, clave de sol e alturas', [
        ['Nomear as notas nas linhas e espaços da clave de sol', 4],
        ['Escrever na pauta uma melodia ditada nota a nota', 3],
        ['Identificar movimento por grau conjunto e por salto', 3],
        ['Solfejar a escala de Dó maior, ascendente e descendente', 3],
      ]],
      ['Escalas maiores, intervalos e colcheias', [
        ['Escala maior até dois sustenidos, ascendente e descendente', 4],
        ['Leitura rítmica com colcheias e semicolcheias em 2/4 e 4/4', 4],
        ['Identificação auditiva de 2ª, 3ª e 5ª justa', 3],
        ['Ditado melódico de quatro compassos em Dó maior', 3],
        ['Solfejo cantado à primeira vista em Sol maior', 3],
        ['Compasso composto 6/8: pulso, subdivisão e regência', 3],
        ['Armadura de clave: até dois sustenidos e dois bemóis', 3],
        ['Ditado rítmico com síncope e contratempo', 2],
      ]],
      ['Tonalidades menores e acordes', [
        ['Escala menor natural e harmônica', 4],
        ['Tríades maiores e menores: escrever e reconhecer ao ouvido', 4],
        ['Cadência I–IV–V–I identificada na audição', 3],
        ['Leitura em clave de fá', 3],
        ['Ditado a duas vozes em movimento paralelo', 3],
      ]],
      ['Modulação e leitura avançada', [
        ['Intervalos compostos e inversões', 3],
        ['Ditado melódico com nota cromática de passagem', 4],
        ['Compassos alternados e mudança de andamento', 3],
        ['Análise formal de uma peça em forma binária', 3],
        ['Regência de 3/4 e 6/8 conduzindo o grupo', 3],
      ]],
    ],
  },
  {
    nome: 'Violino',
    metodo: 'Método XYZ',
    minimo_avanco: 80,
    descricao: 'Técnica do instrumento: mão esquerda, arco e afinação.',
    fases: [
      ['Postura, arco e cordas soltas', [
        ['Segurar violino e arco sem tensão no ombro e no polegar', 4],
        ['Arco no meio, som limpo em cada corda solta', 4],
        ['Travessia entre cordas vizinhas sem raspar', 3],
        ['Reconhecer a corda desafinada e afinar com o professor', 2],
        ['Tocar em pizzicato uma melodia de quatro compassos', 2],
      ]],
      ['Primeira posição nas cordas Lá e Mi', [
        ['Dedos 1, 2 e 3 na corda Lá com afinação estável', 4],
        ['Dedos 1, 2 e 3 na corda Mi com afinação estável', 4],
        ['Escala de Ré maior em uma oitava', 4],
        ['Arco na metade superior, som constante do talão à ponta', 3],
        ['Detaché e legato ligando duas notas', 3],
        ['Travessia Lá–Mi sem tocar a corda vizinha', 3],
        ['Ler a partitura na primeira posição, sem decorar', 2],
        ['Vibrato: exercício preparatório de movimento do braço', 2],
      ]],
      ['Cordas Ré e Sol, escalas de duas oitavas', [
        ['Escala de Sol maior em duas oitavas', 4],
        ['Afinação nas cordas graves, com apoio do ouvido', 4],
        ['Distribuição de arco em notas longas', 3],
        ['Arpejos de Sol e Ré maior', 3],
      ]],
      ['Golpes de arco', [
        ['Staccato controlado na metade do arco', 4],
        ['Martelé com ataque limpo', 3],
        ['Spiccato inicial, no ponto de equilíbrio', 3],
        ['Ligaduras de quatro notas com som igual', 3],
      ]],
      ['Terceira posição e mudanças', [
        ['Mudança da 1ª para a 3ª posição sem glissando audível', 4],
        ['Escala de duas oitavas usando a 3ª posição', 4],
        ['Leitura de trecho escrito na 3ª posição', 3],
      ]],
      ['Vibrato contínuo e música de câmara', [
        ['Vibrato contínuo em notas longas', 4],
        ['Sustentar a própria linha em dueto', 4],
        ['Ajustar afinação ao outro instrumento durante a peça', 3],
      ]],
    ],
  },
  {
    nome: 'Repertório',
    metodo: 'Peças por nível',
    minimo_avanco: 70,
    descricao: 'A peça inteira, do começo ao fim, tocada para alguém.',
    fases: [
      ['Nível iniciante', [
        ['Peça de estudo tocada de cor, do início ao fim, sem parar', 5],
        ['Andamento mantido com o metrônomo', 5],
        ['Dinâmica escrita na partitura respeitada', 4],
        ['Afinação estável nas passagens já estudadas', 4],
        ['Postura e som em apresentação pública', 4],
        ['Tocar junto com acompanhamento, entrando no tempo certo', 3],
      ]],
      ['Nível intermediário', [
        ['Duas peças de estilos diferentes prontas para audição', 5],
        ['Fraseado com respiração e direção melódica', 4],
        ['Passagem difícil resolvida com estudo lento documentado', 4],
        ['Memória segura em apresentação', 4],
        ['Andamento de concerto mantido do início ao fim', 3],
      ]],
      ['Nível avançado', [
        ['Peça de repertório padrão do instrumento apresentada em recital', 5],
        ['Interpretação própria sustentada com argumento musical', 5],
        ['Sonoridade projetada em sala grande', 4],
        ['Preparo de audição: entrada, cumprimento e recuperação de erro', 4],
      ]],
    ],
  },
];

// Avaliações do Carlos na fase em que ele está — a fonte dos 82 / 74 / 68.
const CARLOS = {
  'Formação musical': [4, 4, 4, 3, 3, 3, 3, 1],
  Violino: [4, 3, 3, 3, 3, 2, 3, 2],
  Repertório: [3, 3, 3, 3, 2, 2],
};

function limpar() {
  for (const tabela of ['avaliacao', 'fase_concluida', 'aula', 'matricula', 'objetivo', 'fase', 'trilha', 'aluno']) {
    rodar(`DELETE FROM ${tabela}`);
  }
  rodar("DELETE FROM sqlite_sequence WHERE name IN ('avaliacao','fase_concluida','aula','matricula','objetivo','fase','trilha','aluno')");
}

function criarCurriculo() {
  const trilhas = {};
  for (const t of CURRICULO) {
    const trilha = inserir('trilha', {
      nome: t.nome,
      metodo: t.metodo,
      descricao: t.descricao,
      minimo_avanco: t.minimo_avanco,
    });
    t.fases.forEach(([nome, objetivos], i) => {
      const fase = inserir('fase', { trilha_id: trilha.id, numero: i + 1, nome });
      objetivos.forEach(([titulo, peso], j) => {
        inserir('objetivo', { fase_id: fase.id, ordem: j + 1, titulo, peso });
      });
    });
    trilhas[t.nome] = trilha;
  }
  return trilhas;
}

/** Leva a matrícula até a fase pedida, fechando as anteriores com o percentual dado. */
function levarAteFase(matriculaId, faseAlvo, percentualPorFase, diaBase) {
  let atual = progressoMatricula(matriculaId);
  let passo = 0;
  while (atual.fase_numero < faseAlvo) {
    for (const objetivo of atual.objetivos) {
      // Nível 3 em tudo fecha a fase em 75%, e 4 fecha em 100%: a mistura abaixo
      // põe a fase anterior perto do percentual histórico que se quer mostrar.
      const alvo = percentualPorFase >= 90 ? 4 : 3;
      inserir('avaliacao', {
        matricula_id: matriculaId,
        objetivo_id: objetivo.id,
        nivel: alvo,
        data: dia(diaBase + passo),
        professor: 'Secretaria (histórico)',
      });
    }
    avancarFase(matriculaId, { data: dia(diaBase + passo), forcar: true, justificativa: 'Histórico anterior ao sistema.' });
    atual = progressoMatricula(matriculaId);
    passo += 7;
  }
  return atual;
}

function avaliar(matriculaId, niveis, { professor, diaBase = -20 }) {
  const progresso = progressoMatricula(matriculaId);
  progresso.objetivos.forEach((objetivo, i) => {
    const nivel = niveis[i];
    if (nivel === undefined) return;
    inserir('avaliacao', {
      matricula_id: matriculaId,
      objetivo_id: objetivo.id,
      nivel,
      data: dia(diaBase + i),
      professor,
    });
  });
}

function main() {
  migrar();
  limpar();
  const trilhas = criarCurriculo();

  const carlos = inserir('aluno', {
    nome: 'Carlos Eduardo Ribeiro',
    nascimento: '2013-03-18',
    responsavel: 'Marina Ribeiro',
    contato: '(11) 98888-1020',
    professor: 'Prof.ª Helena Vasquez',
    inicio: dia(-620),
    observacao: 'Estuda em casa quase todos os dias; a leitura anda mais devagar que o instrumento.',
  });

  const matriculas = {
    'Formação musical': matricular(carlos.id, trilhas['Formação musical'].id, { inicio: dia(-620) }),
    Violino: matricular(carlos.id, trilhas.Violino.id, { inicio: dia(-620) }),
    Repertório: matricular(carlos.id, trilhas.Repertório.id, { inicio: dia(-300) }),
  };

  levarAteFase(matriculas['Formação musical'].id, 4, 85, -560);
  levarAteFase(matriculas.Violino.id, 2, 82, -420);

  avaliar(matriculas['Formação musical'].id, CARLOS['Formação musical'], { professor: 'Prof. André Lima', diaBase: -24 });
  avaliar(matriculas.Violino.id, CARLOS.Violino, { professor: 'Prof.ª Helena Vasquez', diaBase: -18 });
  avaliar(matriculas.Repertório.id, CARLOS.Repertório, { professor: 'Prof.ª Helena Vasquez', diaBase: -12 });

  const aulas = [
    [-28, 'Presente', 'Escala de Ré maior; leitura do estudo nº 12.'],
    [-21, 'Presente', 'Colcheias em 6/8; ditado rítmico com síncope — ponto fraco da fase.'],
    [-14, 'Falta justificada', 'Consulta médica; reposição combinada.'],
    [-12, 'Reposição', 'Repertório: peça inteira de cor, com metrônomo a 72.'],
    [-7, 'Presente', 'Travessia Lá–Mi e distribuição de arco.'],
    [-2, 'Presente', 'Ensaio da audição do fim do semestre.'],
  ];
  for (const [offset, presenca, conteudo] of aulas) {
    inserir('aula', {
      aluno_id: carlos.id,
      data: dia(offset),
      presenca,
      conteudo,
      professor: 'Prof.ª Helena Vasquez',
    });
  }

  // Colegas de turma, para o painel não nascer com um aluno só.
  const helena = inserir('aluno', {
    nome: 'Helena Duarte',
    nascimento: '2015-07-02',
    responsavel: 'Paulo Duarte',
    professor: 'Prof. André Lima',
    inicio: dia(-200),
  });
  const mHelenaFm = matricular(helena.id, trilhas['Formação musical'].id, { inicio: dia(-200) });
  const mHelenaVl = matricular(helena.id, trilhas.Violino.id, { inicio: dia(-200) });
  levarAteFase(mHelenaFm.id, 2, 80, -180);
  avaliar(mHelenaFm.id, [3, 2, 2, 2], { professor: 'Prof. André Lima', diaBase: -15 });
  avaliar(mHelenaVl.id, [3, 3, 2, 2, 1], { professor: 'Prof.ª Helena Vasquez', diaBase: -10 });
  for (const offset of [-25, -18, -11, -4]) {
    inserir('aula', { aluno_id: helena.id, data: dia(offset), presenca: 'Presente', professor: 'Prof. André Lima' });
  }

  const rafael = inserir('aluno', {
    nome: 'Rafael Nogueira',
    nascimento: '2009-11-30',
    professor: 'Prof.ª Helena Vasquez',
    inicio: dia(-1100),
    observacao: 'Prepara audição de conservatório para o ano que vem.',
  });
  const mRafaelFm = matricular(rafael.id, trilhas['Formação musical'].id, { inicio: dia(-1100) });
  const mRafaelVl = matricular(rafael.id, trilhas.Violino.id, { inicio: dia(-1100) });
  const mRafaelRep = matricular(rafael.id, trilhas.Repertório.id, { inicio: dia(-700) });
  levarAteFase(mRafaelFm.id, 5, 92, -1000);
  levarAteFase(mRafaelVl.id, 4, 90, -900);
  levarAteFase(mRafaelRep.id, 2, 88, -500);
  avaliar(mRafaelFm.id, [4, 4, 4, 3, 4], { professor: 'Prof. André Lima', diaBase: -9 });
  avaliar(mRafaelVl.id, [4, 3, 3, 3], { professor: 'Prof.ª Helena Vasquez', diaBase: -6 });
  avaliar(mRafaelRep.id, [3, 3, 2, 3, 3], { professor: 'Prof.ª Helena Vasquez', diaBase: -40 });
  for (const offset of [-30, -23, -16, -9, -2]) {
    inserir('aula', { aluno_id: rafael.id, data: dia(offset), presenca: 'Presente', professor: 'Prof.ª Helena Vasquez' });
  }

  const resumo = ['Formação musical', 'Violino', 'Repertório'].map((nome) => {
    const p = progressoMatricula(matriculas[nome].id);
    return `  ${nome.padEnd(18)} fase ${p.fase_numero} — ${p.percentual}%`;
  });
  console.log(`Base de demonstração criada em ${config.dbPath}`);
  console.log(`Aluno ${carlos.nome}:`);
  console.log(resumo.join('\n'));
  console.log(`Alunos: ${um('SELECT COUNT(*) AS n FROM aluno').n} · trilhas: ${um('SELECT COUNT(*) AS n FROM trilha').n} · avaliações: ${um('SELECT COUNT(*) AS n FROM avaliacao').n}`);
}

main();
db();
fechar();

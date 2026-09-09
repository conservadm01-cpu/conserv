// Gamificação.
//
// Um aviso que vale estar escrito no código, porque muda o que se pode
// acrescentar aqui depois: isto existe para sustentar a CONSTÂNCIA do estudo,
// não para criar disputa. Por isso não há placar entre alunos, não há nada
// que compare um com o outro e nenhuma conquista premia velocidade. O que se
// premia é voltar, insistir e concluir.
//
// Também não se inventa hierarquia: os níveis são numerados. Num contexto em
// que existem designações reais no ministério, dar nomes de patente a níveis
// de aplicativo confundiria coisas que não se confundem.

import * as R from '../dados/repositorios.js';
import * as eventos from './eventos.js';

// ---------------------------------------------------------------- níveis

// A escada cresce devagar no começo, para o aluno sentir progresso cedo, e
// vai abrindo depois, para que o nível continue significando alguma coisa.
export const XP_DO_NIVEL = (nivel) => Math.round(100 * nivel * (nivel + 1) / 2);

export function nivelDoXp(xp) {
  let nivel = 1;
  while (xp >= XP_DO_NIVEL(nivel)) nivel += 1;
  const anterior = nivel > 1 ? XP_DO_NIVEL(nivel - 1) : 0;
  const proximo = XP_DO_NIVEL(nivel);
  return {
    nivel,
    xp,
    faltamParaOProximo: proximo - xp,
    percentualNoNivel: Math.round(((xp - anterior) / (proximo - anterior)) * 100),
  };
}

export function xpDoAluno(alunoId) {
  const aluno = R.alunos.buscar(alunoId);
  const linhas = R.progressoDeTodasAsFases(alunoId);
  return (aluno ? aluno.xpHistorico || 0 : 0) + linhas.reduce((soma, l) => soma + (l.xp || 0), 0);
}

// -------------------------------------------------------------- sequência

const DIA = 86400000;
const somenteData = (iso) => String(iso).slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA);

// Dias seguidos de estudo. Conta até ontem, não até hoje: quem estudou ontem
// e ainda não abriu o aplicativo hoje não perdeu a sequência — ainda dá tempo.
export function sequencia(alunoId, hoje = new Date().toISOString()) {
  const dias = eventos.diasComAtividade(alunoId);
  if (!dias.length) return { dias: 0, ativaHoje: false, ultimoDia: null };

  const hojeData = somenteData(hoje);
  const distanciaDoUltimo = diasEntre(hojeData, dias[0]);
  if (distanciaDoUltimo > 1) return { dias: 0, ativaHoje: false, ultimoDia: dias[0] };

  let contagem = 1;
  for (let i = 1; i < dias.length; i++) {
    if (diasEntre(dias[i - 1], dias[i]) !== 1) break;
    contagem += 1;
  }
  return { dias: contagem, ativaHoje: distanciaDoUltimo === 0, ultimoDia: dias[0] };
}

// -------------------------------------------------------------- conquistas

// Cada conquista sabe dizer sozinha se foi alcançada. Acrescentar uma nova é
// acrescentar uma linha aqui — nenhuma tela precisa saber que ela existe.
export const CONQUISTAS = [
  { chave: 'primeira-licao', icone: '📖', titulo: 'Primeira lição',
    descricao: 'Você leu a sua primeira lição.',
    alcancada: (d) => d.licoesLidas >= 1 },
  { chave: 'primeira-fase', icone: '🎯', titulo: 'Primeira fase concluída',
    descricao: 'Você foi aprovado na avaliação de uma fase.',
    alcancada: (d) => d.fasesAprovadas >= 1 },
  { chave: 'cinco-fases', icone: '🏔️', titulo: 'Cinco fases',
    descricao: 'Cinco fases concluídas.',
    alcancada: (d) => d.fasesAprovadas >= 5 },
  { chave: 'metodo-completo', icone: '🎓', titulo: 'Método concluído',
    descricao: 'Você concluiu todas as fases de um método.',
    alcancada: (d) => d.metodosConcluidos >= 1 },
  { chave: 'constancia-3', icone: '🔥', titulo: 'Três dias seguidos',
    descricao: 'Você estudou três dias seguidos.',
    alcancada: (d) => d.sequencia >= 3 },
  { chave: 'constancia-7', icone: '🔥', titulo: 'Uma semana seguida',
    descricao: 'Sete dias seguidos de estudo.',
    alcancada: (d) => d.sequencia >= 7 },
  { chave: 'constancia-30', icone: '🔥', titulo: 'Um mês seguido',
    descricao: 'Trinta dias seguidos de estudo.',
    alcancada: (d) => d.sequencia >= 30 },
  { chave: 'sem-erro', icone: '💯', titulo: 'Prova sem erro',
    descricao: 'Você acertou todas as questões de uma avaliação.',
    alcancada: (d) => d.provaPerfeita },
  // A que mais importa: não desistir depois de não conseguir.
  { chave: 'superacao', icone: '💪', titulo: 'Superação',
    descricao: 'Você não passou numa avaliação, voltou e passou.',
    alcancada: (d) => d.superou },
  { chave: 'persistente', icone: '🧗', titulo: 'Persistente',
    descricao: 'Dez avaliações feitas.',
    alcancada: (d) => d.tentativas >= 10 },
  { chave: 'todos-os-jogos', icone: '🎲', titulo: 'Todos os exercícios de uma fase',
    descricao: 'Você jogou todos os exercícios de uma fase.',
    alcancada: (d) => d.faseComTodosOsJogos },
];

function retratoDoAluno(alunoId) {
  const linhas = R.progressoDeTodasAsFases(alunoId);
  const resultados = R.resultadosDoAluno(alunoId);

  // Superação: houve reprovação numa fase antes da aprovação dela.
  const porFase = new Map();
  for (const r of resultados.slice().sort((a, b) => String(a.data).localeCompare(String(b.data)))) {
    if (!porFase.has(r.faseId)) porFase.set(r.faseId, []);
    porFase.get(r.faseId).push(r);
  }
  const superou = [...porFase.values()].some((lista) => {
    const primeiraAprovacao = lista.findIndex((r) => r.aprovado);
    return primeiraAprovacao > 0 && lista.slice(0, primeiraAprovacao).some((r) => !r.aprovado);
  });

  const matriculas = R.matriculasDoAluno(alunoId);

  return {
    licoesLidas: linhas.reduce((s, l) => s + l.licoesLidas.length, 0),
    fasesAprovadas: linhas.filter((l) => l.aprovadoEm).length,
    metodosConcluidos: matriculas.filter((m) => m.situacao === 'concluida').length,
    sequencia: sequencia(alunoId).dias,
    provaPerfeita: resultados.some((r) => r.total > 0 && r.acertos === r.total),
    superou,
    tentativas: resultados.length,
    faseComTodosOsJogos: linhas.some((l) => Object.keys(l.jogos).length >= 2),
  };
}

// Confere as conquistas e grava as que acabaram de ser alcançadas. Devolve só
// as novas, para que a tela possa comemorar uma vez — e não a cada desenho.
export function conferir(alunoId) {
  const retrato = retratoDoAluno(alunoId);
  const jaTem = new Set(R.conquistasDoAluno(alunoId).map((c) => c.chave));
  const novas = [];

  for (const conquista of CONQUISTAS) {
    if (jaTem.has(conquista.chave)) continue;
    if (!conquista.alcancada(retrato)) continue;
    const gravada = R.conquistas.criar({
      alunoId, chave: conquista.chave, titulo: conquista.titulo,
      descricao: conquista.descricao, icone: conquista.icone,
    });
    eventos.registrar({
      alunoId, tipo: eventos.TIPOS.CONQUISTA, titulo: `Conquista: ${conquista.titulo}`,
      detalhe: conquista.descricao,
    });
    novas.push(gravada);
  }
  return novas;
}

// O painel de conquistas: as ganhas e as que faltam, para que o aluno veja o
// que ainda dá para alcançar.
export function painel(alunoId) {
  const ganhas = new Map(R.conquistasDoAluno(alunoId).map((c) => [c.chave, c]));
  return CONQUISTAS.map((c) => ({
    ...c,
    ganha: ganhas.has(c.chave),
    conquistadaEm: ganhas.has(c.chave) ? ganhas.get(c.chave).conquistadaEm : null,
  }));
}

export function resumo(alunoId) {
  const xp = xpDoAluno(alunoId);
  return {
    ...nivelDoXp(xp),
    sequencia: sequencia(alunoId),
    conquistas: R.conquistasDoAluno(alunoId).length,
    totalDeConquistas: CONQUISTAS.length,
  };
}

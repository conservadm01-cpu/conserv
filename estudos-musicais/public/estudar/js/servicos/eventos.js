// Eventos: o que aconteceu, na ordem em que aconteceu.
//
// A linha do tempo do aluno não é escrita à mão em lugar nenhum: ela é o
// registro dos fatos que o próprio estudo produz. Ler uma lição, jogar,
// fazer uma avaliação, ser aprovado, receber um certificado, ganhar uma
// conquista. Quem desenha a tela apenas lê esta lista.
//
// A regra desta camada é não inventar: só entra evento correspondente a algo
// que realmente ocorreu, com a data em que ocorreu.

import * as R from '../dados/repositorios.js';

export const TIPOS = {
  LICAO_LIDA: 'licao_lida',
  JOGO: 'jogo',
  AVALIACAO: 'avaliacao',
  APROVACAO: 'aprovacao',
  CERTIFICADO: 'certificado',
  CONQUISTA: 'conquista',
  MATRICULA: 'matricula',
  FASE_LIBERADA: 'fase_liberada',
};

export function registrar({ alunoId, matriculaId = null, tipo, titulo, detalhe = '', faseId = null, valor = null, dataHora = null }) {
  if (!alunoId || !tipo) return null;
  return R.eventos.criar({
    alunoId, matriculaId, tipo, titulo, detalhe, faseId, valor,
    dataHora: dataHora || new Date().toISOString(),
  });
}

export const doAluno = (alunoId, limite = 0) => R.eventosDoAluno(alunoId, limite);

// Os dias em que o aluno registrou alguma atividade, do mais recente para o
// mais antigo. É a base da sequência de estudo.
export function diasComAtividade(alunoId) {
  const dias = new Set(R.eventosDoAluno(alunoId).map((e) => String(e.dataHora).slice(0, 10)));
  return [...dias].sort().reverse();
}

// A linha do tempo agrupada por dia, pronta para a tela.
export function linhaDoTempo(alunoId, { limite = 40 } = {}) {
  const porDia = new Map();
  for (const evento of R.eventosDoAluno(alunoId, limite)) {
    const dia = String(evento.dataHora).slice(0, 10);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(evento);
  }
  return [...porDia.entries()].map(([dia, lista]) => ({ dia, eventos: lista }));
}

export const ultimaAtividade = (alunoId) => {
  const lista = R.eventosDoAluno(alunoId, 1);
  return lista.length ? lista[0].dataHora : null;
};

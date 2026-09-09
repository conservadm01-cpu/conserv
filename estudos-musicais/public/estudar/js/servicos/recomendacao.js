// Recomendação.
//
// Regras determinísticas e explicáveis, de propósito. Uma recomendação que o
// aluno não entende é indistinguível de um palpite, e num aplicativo de
// estudo isso corrói a confiança no que ele mostra. Aqui, toda recomendação
// vem com o motivo e com o número que a sustenta.
//
// A ordem também é deliberada: reforçar antes de avançar. Se há dificuldade
// medida em um assunto, revisar vem primeiro; só depois o próximo passo.

import * as desempenho from './desempenho.js';
import { proximaAtividade } from './progresso.js';
import * as R from '../dados/repositorios.js';
import * as catalogo from './catalogo.js';

export function recomendar(alunoId) {
  const { fracos } = desempenho.pontos(alunoId);
  const seguinte = proximaAtividade(alunoId);

  // 1. Dificuldade medida: revisar a fase onde ela está, antes de seguir.
  if (fracos.length) {
    const alvo = fracos[0];
    const aluno = R.alunos.buscar(alunoId);
    const fase = catalogo.faseDoAluno(alvo.faseId, aluno ? aluno.instrumentoId : '',
      { matriculas: R.matriculasDoAluno(alunoId) });
    const jogo = fase && (fase.jogos || [])[0];

    return {
      prioridade: 'reforco',
      titulo: `Revisar ${alvo.assunto}`,
      motivo: `Você acertou ${alvo.acerto}% das ${alvo.total} questões desta fase — abaixo do que costuma acertar nas outras.`,
      destino: jogo ? `#/fase/${alvo.faseId}/jogo/0` : `#/fase/${alvo.faseId}`,
      acao: jogo ? `Exercício: ${jogo.titulo}` : 'Rever as lições da fase',
      faseId: alvo.faseId,
      antesDe: seguinte,
    };
  }

  // 2. Sem dificuldade medida: o próximo passo do método.
  return {
    prioridade: 'seguir',
    titulo: seguinte.titulo,
    motivo: seguinte.motivo,
    destino: seguinte.destino,
    acao: { licao: 'Ler a lição', jogo: 'Jogar', avaliacao: 'Fazer a avaliação', nada: '' }[seguinte.tipo] || '',
    faseId: seguinte.fase ? seguinte.fase.id : null,
    antesDe: null,
  };
}

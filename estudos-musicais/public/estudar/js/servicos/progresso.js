// Motor pedagógico.
//
// É aqui que mora a resposta para as perguntas que o aluno faz sem falar:
// "onde eu parei?", "o que eu faço agora?", "quanto falta?". E as que o
// instrutor faz em voz alta: "esse aluno está andando?".
//
// Duas escolhas de projeto que valem explicar:
//
//   O progresso pertence à matrícula, não ao aluno. Quem estuda violino e
//   depois começa flauta tem dois progressos, não um só embaralhado.
//
//   A liberação de fase é uma regra só, escrita uma vez: a primeira fase de
//   cada método está aberta; as demais abrem quando a anterior é aprovada.
//   Ela não sabe quantas fases o método tem, então serve igual para um de
//   dez e para um de vinte.

import * as R from '../dados/repositorios.js';
import * as catalogo from './catalogo.js';
import { NOTA_MINIMA } from '../quiz.js';

const porcentagem = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : 0);

// A nota mínima que vale para uma fase: a da própria fase, se ela declarar
// uma; senão a do método; senão a do aplicativo.
export function notaMinimaDaFase(fase) {
  if (fase && fase.notaMinima) return fase.notaMinima;
  const avaliacao = fase ? R.avaliacaoDaFase(fase.id) : null;
  if (avaliacao && avaliacao.notaMinima) return avaliacao.notaMinima;
  return NOTA_MINIMA;
}

// ------------------------------------------------------------ por fase

export const SITUACOES = {
  TRANCADA: 'trancada',
  NAO_INICIADA: 'nao_iniciada',
  EM_ANDAMENTO: 'em_andamento',
  APROVADA: 'aprovada',
};

// O retrato de uma fase para um aluno: quanto ele andou, se está liberada,
// quantas tentativas fez. Tudo lido, nada gravado.
export function situacaoDaFase(alunoId, fase, { aprovadas = null } = {}) {
  const linha = R.progressos.buscar(`${alunoId}#${fase.id}`);
  const jaAprovadas = aprovadas || new Set(
    R.progressoDeTodasAsFases(alunoId).filter((p) => p.aprovadoEm).map((p) => p.faseId));

  const liberada = !fase.anteriorId || jaAprovadas.has(fase.anteriorId);
  const totalDeLicoes = (fase.licoes || []).length;
  const lidas = linha ? linha.licoesLidas.length : 0;
  const jogosFeitos = linha ? Object.keys(linha.jogos).length : 0;
  const totalDeJogos = (fase.jogos || []).length;
  const tentativas = R.resultadosDoAluno(alunoId, fase.id);
  const aprovada = Boolean(linha && linha.aprovadoEm);

  // O percentual da fase pesa o que o aluno de fato faz: as lições, os jogos
  // e a avaliação. A avaliação vale metade porque é ela que conclui a fase.
  const partes = [
    { peso: 0.35, feito: porcentagem(lidas, totalDeLicoes || 1) },
    { peso: 0.15, feito: totalDeJogos ? porcentagem(jogosFeitos, totalDeJogos) : 100 },
    { peso: 0.50, feito: aprovada ? 100 : Math.min(99, linha ? linha.melhorNota : 0) },
  ];
  const percentual = Math.round(partes.reduce((soma, p) => soma + p.peso * p.feito, 0));

  let situacao = SITUACOES.NAO_INICIADA;
  if (aprovada) situacao = SITUACOES.APROVADA;
  else if (!liberada) situacao = SITUACOES.TRANCADA;
  else if (lidas || jogosFeitos || tentativas.length) situacao = SITUACOES.EM_ANDAMENTO;

  return {
    faseId: fase.id,
    fase,
    liberada,
    aprovada,
    situacao,
    percentual: aprovada ? 100 : percentual,
    licoesLidas: lidas,
    totalDeLicoes,
    jogosFeitos,
    totalDeJogos,
    tentativas: tentativas.length,
    melhorNota: linha ? linha.melhorNota : 0,
    aprovadoEm: linha ? linha.aprovadoEm : null,
    notaMinima: notaMinimaDaFase(fase),
  };
}

// --------------------------------------------------------- por matrícula

export function situacaoDaMatricula(matricula) {
  const aluno = R.alunos.buscar(matricula.alunoId);
  const trilhas = catalogo.trilhasDoAluno(matricula.instrumentoId || (aluno ? aluno.instrumentoId : ''),
    { matriculas: [matricula] });
  const trilha = trilhas.trilhas[0];
  const fases = trilha ? trilha.fases : [];

  const aprovadas = new Set(R.progressoDeTodasAsFases(matricula.alunoId)
    .filter((p) => p.aprovadoEm).map((p) => p.faseId));
  const porFase = fases.map((f) => situacaoDaFase(matricula.alunoId, f, { aprovadas }));

  const concluidas = porFase.filter((s) => s.aprovada).length;
  const atual = porFase.find((s) => !s.aprovada && s.liberada) || null;

  return {
    matricula,
    metodo: trilha ? trilha.metodo : null,
    versao: trilha ? trilha.versao : null,
    fases: porFase,
    total: fases.length,
    concluidas,
    // O percentual da matrícula é a média do avanço em todas as fases, e não
    // só a contagem de aprovadas: quem está no meio da fase 7 já andou.
    percentual: fases.length
      ? Math.round(porFase.reduce((soma, s) => soma + s.percentual, 0) / fases.length)
      : 0,
    faseAtual: atual ? atual.fase : null,
    situacaoDaFaseAtual: atual,
    concluida: fases.length > 0 && concluidas === fases.length,
  };
}

export function situacaoDoAluno(alunoId) {
  const matriculas = R.matriculasDoAluno(alunoId);
  const porMatricula = matriculas.map(situacaoDaMatricula);
  const total = porMatricula.reduce((s, m) => s + m.total, 0);
  const concluidas = porMatricula.reduce((s, m) => s + m.concluidas, 0);
  return {
    alunoId,
    matriculas: porMatricula,
    total,
    concluidas,
    percentual: total ? Math.round(porMatricula.reduce((s, m) => s + m.percentual * m.total, 0) / total) : 0,
  };
}

// ------------------------------------------------------ próxima atividade

// A pergunta que o aluno faz ao abrir o aplicativo: "e agora?".
//
// A resposta segue uma ordem deliberada, e cada passo tem um porquê:
//
//   1. Lição não lida da fase atual — estudar vem antes de ser avaliado.
//   2. Jogo ainda não jogado da fase atual — fixa o que acabou de ler.
//   3. Avaliação, quando as lições já foram lidas — é o que conclui a fase.
//   4. A próxima fase liberada, quando a atual acabou.
//   5. Nada pendente: o aluno concluiu tudo o que estava aberto.
//
// Devolve também o motivo, porque uma recomendação que não se explica é
// apenas uma ordem.
export function proximaAtividade(alunoId) {
  const situacao = situacaoDoAluno(alunoId);

  for (const matricula of situacao.matriculas) {
    const alvo = matricula.situacaoDaFaseAtual;
    if (!alvo) continue;
    const fase = alvo.fase;

    const linha = R.progressos.buscar(`${alunoId}#${fase.id}`);
    const lidas = new Set(linha ? linha.licoesLidas : []);
    const indiceDaLicao = (fase.licoes || []).findIndex((_, i) => !lidas.has(i));

    if (indiceDaLicao >= 0) {
      const licao = fase.licoes[indiceDaLicao];
      return {
        tipo: 'licao',
        titulo: licao.titulo,
        metodo: matricula.metodo ? matricula.metodo.nome : '',
        fase,
        indice: indiceDaLicao,
        destino: `#/fase/${fase.id}/licao/${indiceDaLicao}`,
        motivo: indiceDaLicao === 0
          ? `Começar a Fase ${fase.numero} — ${fase.titulo}.`
          : `Continuar de onde você parou na Fase ${fase.numero}.`,
      };
    }

    const jogosFeitos = linha ? linha.jogos : {};
    const indiceDoJogo = (fase.jogos || []).findIndex((j) => !jogosFeitos[j.titulo]);
    if (indiceDoJogo >= 0) {
      const jogo = fase.jogos[indiceDoJogo];
      return {
        tipo: 'jogo',
        titulo: jogo.titulo,
        metodo: matricula.metodo ? matricula.metodo.nome : '',
        fase,
        indice: indiceDoJogo,
        destino: `#/fase/${fase.id}/jogo/${indiceDoJogo}`,
        motivo: 'Você já leu as lições desta fase — este exercício fixa o que leu.',
      };
    }

    return {
      tipo: 'avaliacao',
      titulo: `Avaliação da Fase ${fase.numero}`,
      metodo: matricula.metodo ? matricula.metodo.nome : '',
      fase,
      destino: `#/fase/${fase.id}`,
      motivo: alvo.tentativas
        ? `Você já tentou ${alvo.tentativas === 1 ? 'uma vez' : `${alvo.tentativas} vezes`}; a melhor nota foi ${alvo.melhorNota}%. A aprovação é a partir de ${alvo.notaMinima}%.`
        : `Lições e exercícios em dia. A aprovação é a partir de ${alvo.notaMinima}%.`,
    };
  }

  return {
    tipo: 'nada',
    titulo: 'Tudo em dia',
    destino: '#/',
    motivo: situacao.total && situacao.concluidas === situacao.total
      ? 'Você concluiu todas as fases dos seus métodos. Parabéns!'
      : 'Não há atividade liberada no momento.',
  };
}

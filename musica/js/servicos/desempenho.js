// Análise de desempenho.
//
// "Você errou 3 de 10" não ajuda ninguém a estudar melhor. O que ajuda é
// saber ONDE se erra. Como cada questão respondida fica guardada com o
// gerador que a produziu, dá para somar acertos por assunto e dizer, com
// número, em que o aluno vai bem e em que ele tropeça.
//
// Cuidado deliberado: nada disso é afirmado com pouca evidência. Um assunto
// só é apontado como ponto fraco depois de um mínimo de questões — senão o
// aplicativo estaria chamando de dificuldade o que foi azar em duas
// perguntas.

import * as R from '../dados/repositorios.js';
import * as catalogo from './catalogo.js';

export const MINIMO_DE_QUESTOES = 6;   // abaixo disso não se conclui nada
const LIMITE_FRACO = 60;               // % de acerto que caracteriza dificuldade
const LIMITE_FORTE = 85;               // % de acerto que caracteriza domínio

const porcentagem = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : 0);

// Acertos e erros por fase, a partir do detalhe guardado em cada tentativa.
export function porFase(alunoId) {
  const contagem = new Map();
  for (const resultado of R.resultadosDoAluno(alunoId)) {
    const atual = contagem.get(resultado.faseId) || { certas: 0, total: 0, tentativas: 0, notas: [] };
    atual.tentativas += 1;
    atual.notas.push({ data: resultado.data, nota: resultado.nota });
    for (const r of resultado.respostas || []) {
      atual.total += 1;
      if (r.certa) atual.certas += 1;
    }
    // Tentativa antiga, gravada antes de existir o detalhe por questão: usa
    // o total da prova, que é o que ela tem.
    if (!(resultado.respostas || []).length) {
      atual.total += resultado.total || 0;
      atual.certas += resultado.acertos || 0;
    }
    contagem.set(resultado.faseId, atual);
  }

  const aluno = R.alunos.buscar(alunoId);
  const fases = new Map(catalogo.trilhasDoAluno(aluno ? aluno.instrumentoId : '',
    { matriculas: R.matriculasDoAluno(alunoId) }).todas.map((f) => [f.id, f]));

  return [...contagem.entries()].map(([faseId, dados]) => {
    const fase = fases.get(faseId) || R.fases.buscar(faseId);
    return {
      faseId,
      assunto: fase ? `${fase.titulo}` : `Fase ${faseId}`,
      detalhe: fase ? (fase.subtitulo || '') : '',
      metodo: fase ? (fase.nomeTrilha || '') : '',
      certas: dados.certas,
      total: dados.total,
      acerto: porcentagem(dados.certas, dados.total),
      tentativas: dados.tentativas,
      notas: dados.notas.sort((a, b) => String(a.data).localeCompare(String(b.data))),
    };
  }).sort((a, b) => a.acerto - b.acerto);
}

// Acertos por gerador — o corte mais fino, para o instrutor. O gerador é a
// pergunta específica ("ler nota na clave", "completar o compasso"), então é
// aqui que aparece a dificuldade pontual.
export function porAssunto(alunoId) {
  const contagem = new Map();
  for (const resultado of R.resultadosDoAluno(alunoId)) {
    for (const r of resultado.respostas || []) {
      if (!r.gerador) continue;
      const atual = contagem.get(r.gerador) || { certas: 0, total: 0, faseId: resultado.faseId };
      atual.total += 1;
      if (r.certa) atual.certas += 1;
      contagem.set(r.gerador, atual);
    }
  }
  return [...contagem.entries()]
    .map(([gerador, d]) => ({ gerador, ...d, acerto: porcentagem(d.certas, d.total) }))
    .sort((a, b) => a.acerto - b.acerto);
}

// O que dizer ao aluno. Só entra o que tem evidência suficiente.
export function pontos(alunoId) {
  const fases = porFase(alunoId).filter((f) => f.total >= MINIMO_DE_QUESTOES);
  return {
    fracos: fases.filter((f) => f.acerto < LIMITE_FRACO),
    fortes: fases.filter((f) => f.acerto >= LIMITE_FORTE).sort((a, b) => b.acerto - a.acerto),
    // Sem evidência bastante ainda: dito assim, sem fingir conclusão.
    semEvidencia: porFase(alunoId).filter((f) => f.total < MINIMO_DE_QUESTOES).length,
  };
}

// A evolução das notas ao longo do tempo, para o gráfico e para a conversa
// com o instrutor.
export function evolucao(alunoId, faseId = null) {
  return R.resultadosDoAluno(alunoId, faseId)
    .slice()
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    .map((r) => ({ data: r.data, nota: r.nota, faseId: r.faseId, aprovado: r.aprovado }));
}

// Está melhorando? Compara a média das três primeiras tentativas com a das
// três últimas. Com menos de quatro tentativas, não se afirma nada.
export function tendencia(alunoId) {
  const notas = evolucao(alunoId).map((e) => e.nota);
  if (notas.length < 4) return { conclusiva: false, variacao: 0 };
  const media = (lista) => Math.round(lista.reduce((s, n) => s + n, 0) / lista.length);
  const inicio = media(notas.slice(0, 3));
  const fim = media(notas.slice(-3));
  return {
    conclusiva: true,
    inicio,
    fim,
    variacao: fim - inicio,
    sentido: fim - inicio >= 5 ? 'subindo' : fim - inicio <= -5 ? 'caindo' : 'estável',
  };
}

export function resumo(alunoId) {
  const resultados = R.resultadosDoAluno(alunoId);
  const comTempo = resultados.filter((r) => r.duracaoSegundos > 0);
  const eventos = R.eventosDoAluno(alunoId);
  const dias = new Set(eventos.map((e) => String(e.dataHora).slice(0, 10)));

  return {
    tentativas: resultados.length,
    aprovacoes: resultados.filter((r) => r.aprovado).length,
    melhorNota: resultados.reduce((maior, r) => Math.max(maior, r.nota), 0),
    mediaDasNotas: resultados.length
      ? Math.round(resultados.reduce((s, r) => s + r.nota, 0) / resultados.length) : 0,
    tempoMedioSegundos: comTempo.length
      ? Math.round(comTempo.reduce((s, r) => s + r.duracaoSegundos, 0) / comTempo.length) : 0,
    diasDeEstudo: dias.size,
    ultimaAtividade: eventos.length ? eventos[0].dataHora : null,
  };
}

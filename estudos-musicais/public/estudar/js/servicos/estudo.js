// Estudo: o que o aluno faz e que precisa ficar registrado.
//
// Ler uma lição e jogar um exercício eram, até aqui, duas gravações soltas no
// armazenamento. Viraram serviço por um motivo prático: cada uma delas produz
// mais de um efeito — o progresso, o evento da linha do tempo, a conferência
// das conquistas. Espalhar isso pelas telas seria pedir que alguém esquecesse
// um dos três.

import * as R from '../dados/repositorios.js';
import * as eventos from './eventos.js';
import * as gamificacao from './gamificacao.js';

const matriculaDaFase = (alunoId, faseId) => {
  const fase = R.fases.buscar(String(faseId));
  if (!fase) return null;
  return R.matriculasDoAluno(alunoId).find((m) => m.metodoId === fase.metodoId) || null;
};

const tituloDaFase = (faseId) => {
  const fase = R.fases.buscar(String(faseId));
  return fase ? fase.titulo : `Fase ${faseId}`;
};

export function marcarLicaoLida(alunoId, faseId, indice, { titulo = '' } = {}) {
  const linha = R.progressoDoAluno(alunoId, faseId);
  if (linha.licoesLidas.includes(indice)) return { linha, novidade: false, conquistas: [] };

  const matricula = matriculaDaFase(alunoId, faseId);
  const agora = new Date().toISOString();
  linha.matriculaId = linha.matriculaId || (matricula ? matricula.id : null);
  linha.licoesLidas.push(indice);
  linha.xp = (linha.xp || 0) + 5;
  linha.iniciadoEm = linha.iniciadoEm || agora;
  linha.atualizadoEm = agora;
  R.progressos.salvar(linha);

  eventos.registrar({
    alunoId, matriculaId: linha.matriculaId, tipo: eventos.TIPOS.LICAO_LIDA,
    titulo: `Lição ${indice + 1} — ${titulo || tituloDaFase(faseId)}`,
    detalhe: tituloDaFase(faseId), faseId: String(faseId), valor: 5, dataHora: agora,
  });

  return { linha, novidade: true, conquistas: gamificacao.conferir(alunoId) };
}

export function registrarJogo(alunoId, faseId, tipo, pontos) {
  const linha = R.progressoDoAluno(alunoId, faseId);
  const anterior = linha.jogos[tipo] || 0;
  const recorde = pontos > anterior;
  const matricula = matriculaDaFase(alunoId, faseId);
  const agora = new Date().toISOString();

  linha.matriculaId = linha.matriculaId || (matricula ? matricula.id : null);
  if (recorde) {
    linha.jogos[tipo] = pontos;
    linha.xp = (linha.xp || 0) + Math.max(0, pontos - anterior);
  }
  linha.iniciadoEm = linha.iniciadoEm || agora;
  linha.atualizadoEm = agora;
  R.progressos.salvar(linha);

  eventos.registrar({
    alunoId, matriculaId: linha.matriculaId, tipo: eventos.TIPOS.JOGO,
    titulo: tipo, detalhe: `${pontos} pontos${recorde && anterior ? ' — novo recorde' : ''}`,
    faseId: String(faseId), valor: pontos, dataHora: agora,
  });

  return { linha, recorde, conquistas: gamificacao.conferir(alunoId) };
}

export function registrarUsadas(alunoId, faseId, assinaturas) {
  const linha = R.progressoDoAluno(alunoId, faseId);
  linha.usadas = [...linha.usadas, ...assinaturas];
  R.progressos.salvar(linha);
  return linha;
}

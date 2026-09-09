/**
 * Matrícula: quem estuda o quê, com quem, onde, desde quando.
 *
 * No banco ela se chama `JornadaDoAluno`, e o nome descreve o que ela guarda.
 * Aqui o vocabulário é o da secretaria, porque é dela que a tela fala:
 * matricular, trancar, concluir, cancelar.
 *
 * A regra que organiza tudo: um aluno tem UMA matrícula em curso por método e
 * instrumento, e pode ter várias ao mesmo tempo em métodos diferentes. Quem
 * estuda teoria e violino tem duas, com progressos que não se misturam.
 */

import type { EscopoDoUsuario } from './autorizacao.ts';
import { SemPermissao } from './autorizacao.ts';

export type SituacaoDaMatricula =
  | 'ATIVA' | 'TRANCADA' | 'CONCLUIDA' | 'CANCELADA' | 'INTERROMPIDA' | 'AGUARDANDO_LIBERACAO';

/** As situações oferecidas na tela. INTERROMPIDA não entra: é nome antigo. */
export const SITUACOES_DA_MATRICULA: Array<{ id: SituacaoDaMatricula; nome: string; encerra: boolean }> = [
  { id: 'ATIVA', nome: 'Ativa', encerra: false },
  { id: 'AGUARDANDO_LIBERACAO', nome: 'Aguardando liberação', encerra: false },
  { id: 'TRANCADA', nome: 'Trancada', encerra: true },
  { id: 'CONCLUIDA', nome: 'Concluída', encerra: true },
  { id: 'CANCELADA', nome: 'Cancelada', encerra: true },
];

/** INTERROMPIDA e TRANCADA são a mesma coisa com nomes de épocas diferentes. */
export const nomeDaSituacao = (situacao: string): string =>
  situacao === 'INTERROMPIDA'
    ? 'Trancada'
    : SITUACOES_DA_MATRICULA.find((s) => s.id === situacao)?.nome ?? situacao;

export const estaEmCurso = (situacao: string): boolean =>
  situacao === 'ATIVA' || situacao === 'AGUARDANDO_LIBERACAO';

export const encerra = (situacao: string): boolean =>
  ['TRANCADA', 'CONCLUIDA', 'CANCELADA', 'INTERROMPIDA'].includes(situacao);

/**
 * As mudanças de situação que fazem sentido.
 *
 * Concluída é final: uma matrícula concluída não volta a ativa, porque isso
 * apagaria a conclusão de quem já recebeu certificado. Quem precisa continuar
 * estudando o mesmo método abre matrícula nova — o histórico dos dois ciclos
 * fica separado, que é o que a secretaria precisa enxergar.
 */
const TRANSICOES: Record<string, SituacaoDaMatricula[]> = {
  ATIVA: ['TRANCADA', 'CONCLUIDA', 'CANCELADA', 'AGUARDANDO_LIBERACAO'],
  AGUARDANDO_LIBERACAO: ['ATIVA', 'CANCELADA', 'TRANCADA'],
  TRANCADA: ['ATIVA', 'CANCELADA'],
  INTERROMPIDA: ['ATIVA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
};

export function motivoDaRecusaDeSituacaoDaMatricula(de: string, para: string): string | null {
  if (de === para) return null;
  const permitidas = TRANSICOES[de];
  if (!permitidas) return `Situação desconhecida: "${de}".`;
  if (!permitidas.includes(para as SituacaoDaMatricula)) {
    if (de === 'CONCLUIDA') {
      return 'Matrícula concluída não é reaberta. Para continuar o estudo, abra uma nova matrícula — assim o ciclo anterior e o certificado dele continuam valendo.';
    }
    if (de === 'CANCELADA') return 'Matrícula cancelada não é reaberta. Abra uma nova.';
    return `Não é possível passar de ${nomeDaSituacao(de).toLowerCase()} para ${nomeDaSituacao(para).toLowerCase()}.`;
  }
  return null;
}

export interface MatriculaParaAbrir {
  alunoId: string;
  metodoId: string;
  instrumentoId?: string | null;
  instrutorId?: string | null;
  comumId?: string | null;
}

export interface MatriculaExistente {
  id: string;
  alunoId: string;
  metodoId: string;
  instrumentoId: string | null;
  status: string;
}

/**
 * O que impede abrir uma matrícula. A duplicidade em curso é o caso real:
 * alguém matricula o mesmo aluno duas vezes no mesmo método e, a partir daí,
 * há dois progressos disputando a mesma trilha.
 */
export function motivoDaRecusaDeAbertura(
  nova: MatriculaParaAbrir,
  existentes: MatriculaExistente[],
): string | null {
  if (!nova.alunoId) return 'Matrícula sem aluno.';
  if (!nova.metodoId) return 'Matrícula sem método.';

  const repetida = existentes.find((m) =>
    m.alunoId === nova.alunoId
    && m.metodoId === nova.metodoId
    && (m.instrumentoId ?? null) === (nova.instrumentoId ?? null)
    && estaEmCurso(m.status));

  if (repetida) return 'Este aluno já tem uma matrícula em curso neste método e instrumento.';
  return null;
}

/**
 * Quem pode mexer na matrícula: quem administra o aluno, e o instrutor que a
 * acompanha. O instrutor precisa poder registrar andamento sem depender da
 * secretaria a cada aula.
 */
export function motivoDaRecusaDeGestao(
  quem: EscopoDoUsuario,
  matricula: { alunoId: string; instrutorId?: string | null },
  podeEditarOAluno: boolean,
): string | null {
  if (matricula.instrutorId && matricula.instrutorId === quem.usuarioId) return null;
  if (podeEditarOAluno) return null;
  if (matricula.alunoId === quem.usuarioId) {
    return 'A sua própria matrícula é alterada pelo instrutor ou pela secretaria.';
  }
  return 'Você não acompanha este aluno.';
}

export function exigirPodeGerir(
  quem: EscopoDoUsuario,
  matricula: { alunoId: string; instrutorId?: string | null },
  podeEditarOAluno: boolean,
): void {
  const motivo = motivoDaRecusaDeGestao(quem, matricula, podeEditarOAluno);
  if (motivo) throw new SemPermissao(motivo);
}

/**
 * O que gravar ao mudar a situação. A data de encerramento é preenchida
 * quando a matrícula sai de circulação e LIMPA quando ela volta — senão uma
 * matrícula reaberta continuaria constando como encerrada nos relatórios.
 */
export function camposDaMudancaDeSituacao(
  para: SituacaoDaMatricula,
  agora: Date = new Date(),
): { status: SituacaoDaMatricula; encerradaEm: Date | null; conclusaoEm?: Date | null } {
  if (para === 'CONCLUIDA') return { status: para, encerradaEm: agora, conclusaoEm: agora };
  if (encerra(para)) return { status: para, encerradaEm: agora };
  return { status: para, encerradaEm: null, conclusaoEm: null };
}

/** Resumo para a lista da secretaria. */
export const descreverMatricula = (m: {
  metodo?: { nome: string } | null;
  instrumento?: { nome: string } | null;
  status: string;
}): string => {
  const partes = [m.metodo?.nome, m.instrumento?.nome].filter(Boolean);
  return `${partes.join(' · ') || 'Método'} — ${nomeDaSituacao(m.status).toLowerCase()}`;
};

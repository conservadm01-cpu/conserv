/**
 * Aulas e frequência.
 *
 * O registro de aula é o único momento em que o instrutor conta ao sistema o
 * que aconteceu de verdade no encontro com o aluno. Por isso ele precisa ser
 * curto de preencher: data, quem veio, o que se viu, o que fica para a
 * próxima. Tudo o mais é derivado daqui.
 *
 * A frequência não é um número solto: é a contagem dessas presenças. Não
 * existe campo "faltas" em lugar nenhum a ser mantido em dia — quem some da
 * lista de presentes some da conta, e as duas coisas não podem discordar.
 */

export type TipoDePresenca = 'PRESENTE' | 'FALTA' | 'FALTA_JUSTIFICADA' | 'ATRASO';
export type SituacaoDaAula = 'PLANEJADA' | 'REALIZADA' | 'CANCELADA';

export const TIPOS_DE_PRESENCA: Array<{ id: TipoDePresenca; nome: string; conta: boolean }> = [
  // `conta` diz se entra como comparecimento no cálculo de frequência.
  { id: 'PRESENTE', nome: 'Presente', conta: true },
  { id: 'ATRASO', nome: 'Chegou atrasado', conta: true },
  { id: 'FALTA_JUSTIFICADA', nome: 'Falta justificada', conta: false },
  { id: 'FALTA', nome: 'Falta', conta: false },
];

export const nomeDaPresenca = (tipo: string): string =>
  TIPOS_DE_PRESENCA.find((t) => t.id === tipo)?.nome ?? tipo;

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface AulaParaGravar {
  turmaId?: string | null;
  jornadaId?: string | null;
  data?: Date | string | null;
  horaInicio?: string | null;
  horaFim?: string | null;
  situacao?: SituacaoDaAula;
  conteudo?: string | null;
}

/**
 * O que impede gravar uma aula. Devolve mensagem, não lança.
 *
 * A regra de "turma ou matrícula, nunca as duas" está aqui e também no banco,
 * como CHECK. Duas cercas: a de cima explica ao instrutor o que houve; a de
 * baixo garante que nenhum caminho da aplicação crie uma aula órfã, que não
 * apareceria em relatório nenhum e sumiria sem erro.
 */
export function motivoDaRecusaDeAula(aula: AulaParaGravar, hoje: Date = new Date()): string | null {
  const temTurma = Boolean(aula.turmaId);
  const temMatricula = Boolean(aula.jornadaId);
  if (!temTurma && !temMatricula) return 'A aula precisa ser de uma turma ou de uma matrícula.';
  if (temTurma && temMatricula) return 'A aula é de uma turma ou de uma matrícula, não das duas.';

  if (!aula.data) return 'Informe a data da aula.';
  const data = aula.data instanceof Date ? aula.data : new Date(String(aula.data));
  if (Number.isNaN(data.getTime())) return 'Data da aula inválida.';

  // Aula lançada para o futuro só faz sentido como planejada. Um registro de
  // aula REALIZADA com data futura é engano de digitação, e engano de data
  // estraga silenciosamente todo relatório de frequência.
  const situacao = aula.situacao ?? 'REALIZADA';
  const amanha = new Date(hoje.getTime() + 24 * 3600 * 1000);
  if (situacao === 'REALIZADA' && data.getTime() > amanha.getTime()) {
    return 'Aula com data futura só pode ser registrada como planejada.';
  }

  const inicio = String(aula.horaInicio ?? '').trim();
  const fim = String(aula.horaFim ?? '').trim();
  if (inicio && !HORA.test(inicio)) return 'Hora de início inválida (use HH:MM).';
  if (fim && !HORA.test(fim)) return 'Hora de término inválida (use HH:MM).';
  if (inicio && fim && fim <= inicio) return 'A aula não pode terminar antes de começar.';

  return null;
}

/** Falta justificada exige a justificativa: sem ela, é falta. */
export function motivoDaRecusaDePresenca(presenca: {
  tipo: TipoDePresenca; justificativa?: string | null;
}): string | null {
  if (presenca.tipo === 'FALTA_JUSTIFICADA' && !String(presenca.justificativa ?? '').trim()) {
    return 'Falta justificada precisa da justificativa.';
  }
  return null;
}

export const comparece = (tipo: string): boolean =>
  TIPOS_DE_PRESENCA.find((t) => t.id === tipo)?.conta ?? false;

export interface ResumoDeFrequencia {
  aulas: number;
  presencas: number;
  faltas: number;
  faltasJustificadas: number;
  atrasos: number;
  percentual: number | null;
  faltasSeguidas: number;
}

/**
 * A frequência de um aluno.
 *
 * `percentual` é nulo quando não houve aula: dizer "0% de frequência" a quem
 * nunca teve aula seria uma acusação falsa, e é o tipo de número que vai parar
 * numa conversa com o encarregado.
 *
 * A aula CANCELADA não entra na conta — não faltou quem não teve aula.
 */
export function resumoDeFrequencia(
  presencas: Array<{ tipo: string; aula?: { data: Date | string; situacao?: string } | null }>,
): ResumoDeFrequencia {
  const validas = presencas.filter((p) => (p.aula?.situacao ?? 'REALIZADA') !== 'CANCELADA');
  const aulas = validas.length;
  const conta = (tipo: string) => validas.filter((p) => p.tipo === tipo).length;
  const presentes = validas.filter((p) => comparece(p.tipo)).length;

  // Faltas seguidas até hoje: é o número que dispara a conversa com a família,
  // e é diferente do total de faltas espalhadas ao longo do ano.
  const emOrdem = validas
    .slice()
    .sort((a, b) => String(b.aula?.data ?? '').localeCompare(String(a.aula?.data ?? '')));
  let seguidas = 0;
  for (const p of emOrdem) {
    if (comparece(p.tipo)) break;
    seguidas += 1;
  }

  return {
    aulas,
    presencas: presentes,
    faltas: conta('FALTA'),
    faltasJustificadas: conta('FALTA_JUSTIFICADA'),
    atrasos: conta('ATRASO'),
    percentual: aulas ? Math.round((presentes / aulas) * 100) : null,
    faltasSeguidas: seguidas,
  };
}

export const FALTAS_SEGUIDAS_PARA_ALERTA = 3;
export const FREQUENCIA_MINIMA = 75;

/**
 * O que o instrutor precisa saber sobre a frequência deste aluno. Silêncio
 * quando não há nada a dizer — um painel que alerta sobre todo mundo não
 * alerta sobre ninguém.
 */
export function alertaDeFrequencia(resumo: ResumoDeFrequencia, primeiroNome: string): string | null {
  if (resumo.faltasSeguidas >= FALTAS_SEGUIDAS_PARA_ALERTA) {
    return `${primeiroNome} faltou às ${resumo.faltasSeguidas} últimas aulas.`;
  }
  // Abaixo de quatro aulas, um percentual baixo é ruído: duas faltas em três
  // aulas dão 33%, e não significam o mesmo que 33% em trinta aulas.
  if (resumo.aulas >= 4 && resumo.percentual !== null && resumo.percentual < FREQUENCIA_MINIMA) {
    return `${primeiroNome} está com ${resumo.percentual}% de presença em ${resumo.aulas} aulas.`;
  }
  return null;
}

/**
 * A lista de presença que a tela oferece ao instrutor: todo mundo da turma já
 * marcado como presente. Marcar quem faltou é mais rápido do que marcar quem
 * veio, e a aula em que ninguém falta é a mais comum.
 */
export const listaDePresencaInicial = <T extends { alunoId: string }>(
  matriculados: T[],
): Array<T & { tipo: TipoDePresenca }> =>
  matriculados.map((m) => ({ ...m, tipo: 'PRESENTE' as TipoDePresenca }));

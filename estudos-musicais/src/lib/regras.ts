/**
 * Regras pedagógicas.
 *
 * As regras ficam em tabela (RegraProgressao), com versão; aqui está apenas
 * como cada tipo é CALCULADO. Toda liberação registra a versão da regra que a
 * concedeu, para que uma mudança futura não reescreva o passado.
 *
 * Sobre os 40%: é regra desta plataforma, definida pelos responsáveis por
 * ela — não é determinação do MSA. O cálculo é declarado abaixo, sem
 * contagem de página aberta nem de tempo de tela.
 */

export type EstadoProgresso = 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'APROVADO' | 'REPROVADO';

export interface UnidadeElegivel {
  /** Identificador da lição. A mesma lição em vários agrupamentos conta UMA vez. */
  licaoId: string;
  peso: number;
  estado: EstadoProgresso;
}

export interface Aproveitamento {
  pesoElegivel: number;
  pesoAprovado: number;
  percentual: number;
  unidadesElegiveis: number;
  unidadesAprovadas: number;
  faltamUnidades: number;
  faltamPeso: number;
}

/**
 * Aproveitamento = soma dos pesos aprovados ÷ soma dos pesos elegíveis.
 * Só conta unidade APROVADA — aberta, iniciada ou concluída sem aprovação
 * não entra. Lição repetida em mais de um agrupamento é contada uma vez.
 */
export function calcularAproveitamento(unidades: UnidadeElegivel[], percentualExigido: number): Aproveitamento {
  const porLicao = new Map<string, UnidadeElegivel>();
  for (const unidade of unidades) {
    const anterior = porLicao.get(unidade.licaoId);
    // Se a mesma lição vier duas vezes, prevalece o estado mais avançado.
    if (!anterior || (anterior.estado !== 'APROVADO' && unidade.estado === 'APROVADO')) {
      porLicao.set(unidade.licaoId, unidade);
    }
  }
  const lista = [...porLicao.values()];
  const pesoElegivel = lista.reduce((soma, u) => soma + Math.max(0, u.peso), 0);
  const aprovadas = lista.filter((u) => u.estado === 'APROVADO');
  const pesoAprovado = aprovadas.reduce((soma, u) => soma + Math.max(0, u.peso), 0);
  const percentual = pesoElegivel === 0 ? 0 : Math.round((pesoAprovado / pesoElegivel) * 1000) / 10;
  const pesoNecessario = (percentualExigido / 100) * pesoElegivel;

  return {
    pesoElegivel,
    pesoAprovado,
    percentual,
    unidadesElegiveis: lista.length,
    unidadesAprovadas: aprovadas.length,
    faltamPeso: Math.max(0, Math.ceil((pesoNecessario - pesoAprovado) * 10) / 10),
    faltamUnidades: Math.max(0, Math.ceil(
      (pesoNecessario - pesoAprovado) / (pesoElegivel / Math.max(1, lista.length)),
    )),
  };
}

export interface FaseConcluida {
  numero: number;
  estado: EstadoProgresso;
}

/** Regra A: as fases exigidas do MSA precisam estar APROVADAS, não apenas vistas. */
export function preRequisitoDeFases(fases: FaseConcluida[], exigidas: number[]) {
  const aprovadas = new Set(fases.filter((f) => f.estado === 'APROVADO').map((f) => f.numero));
  const faltando = exigidas.filter((n) => !aprovadas.has(n));
  return { liberado: faltando.length === 0, faltando };
}

/** Regra B: percentual mínimo de aproveitamento no método do instrumento. */
export function liberaHinario(unidades: UnidadeElegivel[], percentualExigido: number) {
  const aproveitamento = calcularAproveitamento(unidades, percentualExigido);
  return {
    liberado: aproveitamento.percentual >= percentualExigido,
    percentualExigido,
    ...aproveitamento,
  };
}

/**
 * Regra C: avanço de fase exige pré-requisitos cumpridos E aprovação do
 * instrutor. Tempo de estudo entra como indicador, nunca como aprovação.
 */
export function podeAvancarDeFase(entrada: {
  licoesDaFase: UnidadeElegivel[];
  percentualExigido: number;
  aprovacaoDoInstrutor: boolean;
  preRequisitosCumpridos: boolean;
}) {
  const aproveitamento = calcularAproveitamento(entrada.licoesDaFase, entrada.percentualExigido);
  const motivos: string[] = [];
  if (!entrada.preRequisitosCumpridos) motivos.push('pré-requisitos da fase anterior não cumpridos');
  if (aproveitamento.percentual < entrada.percentualExigido) {
    motivos.push(`aproveitamento de ${aproveitamento.percentual}% abaixo dos ${entrada.percentualExigido}% exigidos`);
  }
  if (!entrada.aprovacaoDoInstrutor) motivos.push('falta a aprovação do instrutor');
  return { liberado: motivos.length === 0, motivos, aproveitamento };
}

/** Regra D: conclusão do curso — todas as etapas obrigatórias e a validação final. */
export function podeConcluirCurso(entrada: {
  fasesObrigatorias: FaseConcluida[];
  atividadesObrigatoriasPendentes: number;
  validacaoFinal: boolean;
}) {
  const motivos: string[] = [];
  const naoAprovadas = entrada.fasesObrigatorias.filter((f) => f.estado !== 'APROVADO');
  if (naoAprovadas.length) motivos.push(`fases pendentes: ${naoAprovadas.map((f) => f.numero).join(', ')}`);
  if (entrada.atividadesObrigatoriasPendentes > 0) {
    motivos.push(`${entrada.atividadesObrigatoriasPendentes} atividade(s) obrigatória(s) sem aprovação`);
  }
  if (!entrada.validacaoFinal) motivos.push('falta a validação final do responsável');
  return { liberado: motivos.length === 0, motivos };
}

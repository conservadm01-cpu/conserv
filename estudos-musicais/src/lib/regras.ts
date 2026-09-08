/**
 * Regras pedagógicas.
 *
 * As regras ficam em tabela (RegraProgressao), com versão; aqui está apenas
 * como cada tipo é CALCULADO. Toda liberação registra a versão da regra que a
 * concedeu, para que uma mudança futura não reescreva o passado.
 *
 * Nenhuma função daqui sabe o nome de método nenhum. O critério — percentual,
 * nota mínima, exigência de instrutor — chega como PARÂMETRO, resolvido a
 * partir da configuração do método em questão. É o que impede o critério de um
 * método de cair sobre outro.
 *
 * Sobre os 40%: é regra desta plataforma, definida pelos responsáveis por ela
 * para o método de base — não é determinação do método. O cálculo é declarado
 * abaixo, sem contagem de página aberta nem de tempo de tela.
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

// ------------------------------------------------ critérios de cada método

export type ChaveDeCriterio =
  | 'NOTA_MINIMA' | 'TENTATIVAS_MAXIMAS' | 'QUESTOES_POR_AVALIACAO'
  | 'PERCENTUAL_DE_APROVEITAMENTO' | 'EXIGE_APROVACAO_INSTRUTOR'
  | 'PRE_REQUISITO_DE_UNIDADES' | 'PESOS_DE_COMPETENCIA' | 'OUTRO';

export interface CriterioDoMetodo {
  chave: ChaveDeCriterio;
  valor: unknown;
  versao?: number;
}

export interface Criterios {
  percentualDeAproveitamento: number;
  notaMinima: number;
  questoesPorAvaliacao: number;
  tentativasMaximas: number;
  exigeAprovacaoDoInstrutor: boolean;
  pesosDeCompetencia: Record<string, number>;
  /** Quais vieram do método e quais caíram no padrão da plataforma. */
  origem: Record<string, 'metodo' | 'padrao'>;
}

/**
 * Padrão da plataforma, usado só quando o MÉTODO não declara o seu. Não é o
 * critério de nenhum método em particular: é o mínimo para a tela não quebrar
 * enquanto o responsável não configura.
 */
export const CRITERIOS_PADRAO: Omit<Criterios, 'origem'> = {
  percentualDeAproveitamento: 70,
  notaMinima: 70,
  questoesPorAvaliacao: 10,
  tentativasMaximas: 3,
  exigeAprovacaoDoInstrutor: true,
  pesosDeCompetencia: {},
};

const numeroDe = (valor: unknown, campo: string): number | null => {
  if (typeof valor === 'number') return valor;
  if (valor && typeof valor === 'object' && campo in valor) {
    const interno = (valor as Record<string, unknown>)[campo];
    if (typeof interno === 'number') return interno;
  }
  return null;
};

/**
 * Resolve os critérios de UM método. Cada método traz os seus; o que ele não
 * declarar cai no padrão da plataforma — nunca no critério de outro método.
 */
export function criteriosDoMetodo(configuracoes: CriterioDoMetodo[]): Criterios {
  const criterios: Criterios = { ...CRITERIOS_PADRAO, pesosDeCompetencia: {}, origem: {} };
  const marcar = (campo: keyof Criterios, de: 'metodo' | 'padrao') => { criterios.origem[campo] = de; };
  for (const campo of Object.keys(CRITERIOS_PADRAO) as (keyof typeof CRITERIOS_PADRAO)[]) marcar(campo, 'padrao');

  for (const configuracao of configuracoes) {
    switch (configuracao.chave) {
      case 'PERCENTUAL_DE_APROVEITAMENTO': {
        const valor = numeroDe(configuracao.valor, 'percentual');
        if (valor !== null) { criterios.percentualDeAproveitamento = valor; marcar('percentualDeAproveitamento', 'metodo'); }
        break;
      }
      case 'NOTA_MINIMA': {
        const valor = numeroDe(configuracao.valor, 'percentual');
        if (valor !== null) { criterios.notaMinima = valor; marcar('notaMinima', 'metodo'); }
        break;
      }
      case 'QUESTOES_POR_AVALIACAO': {
        const valor = numeroDe(configuracao.valor, 'quantidade');
        if (valor !== null) { criterios.questoesPorAvaliacao = valor; marcar('questoesPorAvaliacao', 'metodo'); }
        break;
      }
      case 'TENTATIVAS_MAXIMAS': {
        const valor = numeroDe(configuracao.valor, 'quantidade');
        if (valor !== null) { criterios.tentativasMaximas = valor; marcar('tentativasMaximas', 'metodo'); }
        break;
      }
      case 'EXIGE_APROVACAO_INSTRUTOR': {
        const bruto = configuracao.valor;
        const valor = typeof bruto === 'boolean' ? bruto
          : (bruto && typeof bruto === 'object' && typeof (bruto as { exige?: unknown }).exige === 'boolean')
            ? (bruto as { exige: boolean }).exige : null;
        if (valor !== null) { criterios.exigeAprovacaoDoInstrutor = valor; marcar('exigeAprovacaoDoInstrutor', 'metodo'); }
        break;
      }
      case 'PESOS_DE_COMPETENCIA': {
        if (configuracao.valor && typeof configuracao.valor === 'object') {
          criterios.pesosDeCompetencia = Object.fromEntries(
            Object.entries(configuracao.valor as Record<string, unknown>)
              .filter(([, peso]) => typeof peso === 'number') as [string, number][],
          );
          marcar('pesosDeCompetencia', 'metodo');
        }
        break;
      }
      default:
        break;
    }
  }
  return criterios;
}

// ---------------------------------------------------------------- regras

export interface UnidadeConcluida {
  /** Código da unidade NO CURRÍCULO DO MÉTODO — "1", "1.4", "N2/F1"… */
  codigo: string;
  estado: EstadoProgresso;
}

/**
 * Regra A: as unidades exigidas do método de base precisam estar APROVADAS,
 * não apenas vistas. Quais unidades e de qual método vem dos parâmetros da
 * regra, gravados em tabela.
 */
export function preRequisitoDeUnidades(unidades: UnidadeConcluida[], exigidas: string[]) {
  const aprovadas = new Set(unidades.filter((u) => u.estado === 'APROVADO').map((u) => u.codigo));
  const faltando = exigidas.filter((codigo) => !aprovadas.has(codigo));
  return { liberado: faltando.length === 0, faltando };
}

/**
 * Regra B: percentual mínimo de aproveitamento dentro do PRÓPRIO método para
 * liberar o repertório da etapa. O percentual vem da configuração do método.
 */
export function liberaRepertorio(unidades: UnidadeElegivel[], percentualExigido: number) {
  const aproveitamento = calcularAproveitamento(unidades, percentualExigido);
  return {
    liberado: aproveitamento.percentual >= percentualExigido,
    percentualExigido,
    ...aproveitamento,
  };
}

/**
 * Regra C: avanço de unidade — fase, módulo, nível, o que o método usar.
 * Exige pré-requisitos cumpridos e, quando o método assim configurar,
 * aprovação do instrutor. Tempo de estudo entra como indicador, nunca como
 * aprovação.
 */
export function podeAvancarDeUnidade(entrada: {
  licoesDaUnidade: UnidadeElegivel[];
  percentualExigido: number;
  exigeAprovacaoDoInstrutor?: boolean;
  aprovacaoDoInstrutor: boolean;
  preRequisitosCumpridos: boolean;
}) {
  const aproveitamento = calcularAproveitamento(entrada.licoesDaUnidade, entrada.percentualExigido);
  const exigeInstrutor = entrada.exigeAprovacaoDoInstrutor ?? true;
  const motivos: string[] = [];
  if (!entrada.preRequisitosCumpridos) motivos.push('pré-requisitos da unidade anterior não cumpridos');
  if (aproveitamento.percentual < entrada.percentualExigido) {
    motivos.push(`aproveitamento de ${aproveitamento.percentual}% abaixo dos ${entrada.percentualExigido}% exigidos`);
  }
  if (exigeInstrutor && !entrada.aprovacaoDoInstrutor) motivos.push('falta a aprovação do instrutor');
  return { liberado: motivos.length === 0, motivos, aproveitamento };
}

/**
 * Regra D: conclusão da jornada — todas as unidades obrigatórias do método,
 * as atividades e a validação final.
 */
export function podeConcluirJornada(entrada: {
  unidadesObrigatorias: UnidadeConcluida[];
  atividadesObrigatoriasPendentes: number;
  validacaoFinal: boolean;
}) {
  const motivos: string[] = [];
  const naoAprovadas = entrada.unidadesObrigatorias.filter((u) => u.estado !== 'APROVADO');
  if (naoAprovadas.length) motivos.push(`unidades pendentes: ${naoAprovadas.map((u) => u.codigo).join(', ')}`);
  if (entrada.atividadesObrigatoriasPendentes > 0) {
    motivos.push(`${entrada.atividadesObrigatoriasPendentes} atividade(s) obrigatória(s) sem aprovação`);
  }
  if (!entrada.validacaoFinal) motivos.push('falta a validação final do responsável');
  return { liberado: motivos.length === 0, motivos };
}

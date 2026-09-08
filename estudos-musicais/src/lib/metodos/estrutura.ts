/**
 * Estrutura pedagógica genérica.
 *
 * É o contrato entre "analisar um documento de método" e "gravar um currículo".
 * Nenhum método é privilegiado aqui: MSA, Melodia em Movimento ou um método de
 * violino produzem a MESMA forma, com profundidades diferentes. Quem quiser
 * adicionar um método novo escreve (ou reaproveita) um analisador, não mexe no
 * núcleo da aplicação.
 */

export type TipoDeUnidade = 'NIVEL' | 'FASE' | 'MODULO' | 'AULA' | 'TOPICO';
export type StatusConferencia = 'CONFERIDO' | 'PENDENTE_CONFERENCIA' | 'DIVERGENTE';
export type TipoDeItem =
  | 'LEITURA_METRICA' | 'LEITURA_RITMICA' | 'CONSTRUCAO_ESCALA'
  | 'HINO' | 'PREPARATORIO_RITMICO' | 'ATIVIDADE_APOIO' | 'TEORIA';
export type Clave = 'SOL' | 'DO' | 'FA';

/** Proveniência: de onde este pedaço do método veio. Nunca se perde. */
export interface Proveniencia {
  paginaInicio: number | null;
  paginaFim: number | null;
  referencia: string | null;
  fonte: string | null;
}

export interface VersaoSugerida extends Proveniencia {
  clave: Clave | null;
  criterioClave: string | null;
  paginaArquivoInicio: number | null;
  paginaArquivoFim: number | null;
  armadura: string | null;
  escalaReferencia: string | null;
  compassos: string[];
  tipoLeitura: string | null;
  observacoes: string | null;
  statusConferencia: StatusConferencia;
}

export interface ItemSugerido extends Proveniencia {
  numeroOriginal: string;
  variante: string;
  titulo: string;
  tipo: TipoDeItem;
  ordem: number;
  observacoes: string | null;
  pendencias: string[];
  statusConferencia: StatusConferencia;
  versoes: VersaoSugerida[];
  agrupamentos: { tipo: string; valor: string; rotulo: string }[];
}

export interface UnidadeSugerida extends Proveniencia {
  tipo: TipoDeUnidade;
  codigo: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  statusConferencia: StatusConferencia;
  filhas: UnidadeSugerida[];
  itens: ItemSugerido[];
}

export interface EstruturaSugerida {
  analisador: string;
  metodo: {
    nome?: string;
    codigo?: string;
    autor?: string;
    organizacao?: string;
    versao?: string;
    nivel?: string;
  };
  unidades: UnidadeSugerida[];
  avisos: { origem: string; mensagem: string }[];
  resumo: Record<string, unknown>;
}

export interface DocumentoParaAnalise {
  nomeArquivo: string;
  tipoArquivo: string;
  conteudo: Buffer;
}

export interface Analisador {
  id: string;
  nome: string;
  descricao: string;
  aceita(documento: DocumentoParaAnalise): boolean;
  analisar(documento: DocumentoParaAnalise, opcoes?: Record<string, unknown>): EstruturaSugerida;
}

// ---------------------------------------------------------------- contagens

export function contarEstrutura(estrutura: EstruturaSugerida) {
  const porTipo: Record<string, number> = {};
  const porConferencia: Record<string, number> = { CONFERIDO: 0, PENDENTE_CONFERENCIA: 0, DIVERGENTE: 0 };
  let itens = 0;
  let versoes = 0;
  let profundidadeMaxima = 0;

  const percorrer = (unidades: UnidadeSugerida[], profundidade: number) => {
    if (!unidades.length) return;
    profundidadeMaxima = Math.max(profundidadeMaxima, profundidade);
    for (const unidade of unidades) {
      porTipo[unidade.tipo] = (porTipo[unidade.tipo] ?? 0) + 1;
      for (const item of unidade.itens) {
        itens++;
        versoes += item.versoes.length;
        porConferencia[item.statusConferencia] = (porConferencia[item.statusConferencia] ?? 0) + 1;
      }
      percorrer(unidade.filhas, profundidade + 1);
    }
  };
  percorrer(estrutura.unidades, 1);

  return { unidadesPorTipo: porTipo, itens, versoes, porConferencia, profundidade: profundidadeMaxima };
}

/** Achata a árvore com o caminho materializado, na ordem de gravação. */
export function achatar(unidades: UnidadeSugerida[], caminhoDoPai = '', profundidade = 0)
  : { unidade: UnidadeSugerida; caminho: string; profundidade: number; caminhoDoPai: string }[] {
  const saida: { unidade: UnidadeSugerida; caminho: string; profundidade: number; caminhoDoPai: string }[] = [];
  for (const unidade of unidades) {
    const caminho = caminhoDoPai ? `${caminhoDoPai}/${unidade.codigo}` : unidade.codigo;
    saida.push({ unidade, caminho, profundidade, caminhoDoPai });
    saida.push(...achatar(unidade.filhas, caminho, profundidade + 1));
  }
  return saida;
}

/**
 * O código da unidade é único dentro do currículo (é por ele que a árvore é
 * endereçada). Quando dois ramos trazem o mesmo código, qualifica pelo pai e
 * devolve o aviso — mudar em silêncio esconderia um problema da fonte.
 */
export function garantirCodigosUnicos(unidades: UnidadeSugerida[]): string[] {
  const vistos = new Set<string>();
  const avisos: string[] = [];

  const percorrer = (lista: UnidadeSugerida[], codigoDoPai: string) => {
    for (const unidade of lista) {
      let codigo = unidade.codigo;
      if (vistos.has(codigo)) {
        const base = codigoDoPai ? `${codigoDoPai}.${unidade.codigo}` : unidade.codigo;
        codigo = base;
        for (let n = 2; vistos.has(codigo); n++) codigo = `${base}(${n})`;
        avisos.push(`código "${unidade.codigo}" aparece mais de uma vez no currículo; `
          + `esta ocorrência passou a "${codigo}" — conferir na fonte`);
        unidade.codigo = codigo;
      }
      vistos.add(codigo);
      percorrer(unidade.filhas, codigo);
    }
  };

  percorrer(unidades, '');
  return avisos;
}

/** Todos os itens da árvore, na ordem em que serão gravados. */
export function itensDaEstrutura(unidades: UnidadeSugerida[]): { unidade: UnidadeSugerida; item: ItemSugerido }[] {
  return achatar(unidades).flatMap(({ unidade }) => unidade.itens.map((item) => ({ unidade, item })));
}

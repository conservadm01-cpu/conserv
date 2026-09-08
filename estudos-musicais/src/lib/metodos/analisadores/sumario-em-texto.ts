/**
 * Analisador "sumário em texto".
 *
 * Existe para provar, na prática, o que o núcleo promete: cadastrar um método
 * novo é escrever (ou reaproveitar) um analisador, e mais nada. Este lê um
 * sumário digitado — o índice do método copiado do livro — e devolve a MESMA
 * `EstruturaSugerida` que o analisador de planilha devolve, com a
 * profundidade que o método tiver: dois níveis, quatro, ou um só.
 *
 * Convenção do arquivo (.txt ou .md):
 *
 *   :: nome: Melodia em Movimento
 *   :: codigo: MEM
 *   :: organizacao: —
 *
 *   # 1 – Iniciação            {NIVEL}
 *   ## 1.1 – Postura e respiração
 *   - 1 – Sustentação do som (Leitura métrica) [p. 12–13]
 *   - 2 – Notas longas [p. 14]
 *
 * Ou seja: `#` repetido dá a profundidade, `{TIPO}` (opcional) diz o tipo da
 * unidade, `-` marca item de estudo, `(...)` o tipo do item e `[p. …]` a
 * página impressa. O que não vier no arquivo fica ausente e pendente de
 * conferência — nunca suposto.
 */

import type {
  Analisador, DocumentoParaAnalise, EstruturaSugerida, ItemSugerido,
  StatusConferencia, TipoDeItem, TipoDeUnidade, UnidadeSugerida,
} from '../estrutura.ts';
import { garantirCodigosUnicos } from '../estrutura.ts';

/** Sem tipo declarado no sumário, a profundidade decide. */
const TIPOS_POR_PROFUNDIDADE: TipoDeUnidade[] = ['FASE', 'MODULO', 'AULA', 'TOPICO', 'TOPICO'];

const TIPOS_DE_UNIDADE = new Set<TipoDeUnidade>(['NIVEL', 'FASE', 'MODULO', 'AULA', 'TOPICO']);

const TIPOS_DE_ITEM: Record<string, TipoDeItem> = {
  'leitura métrica': 'LEITURA_METRICA', 'leitura metrica': 'LEITURA_METRICA', 'solfejo': 'LEITURA_METRICA',
  'leitura rítmica': 'LEITURA_RITMICA', 'leitura ritmica': 'LEITURA_RITMICA',
  'construção de escala': 'CONSTRUCAO_ESCALA', 'construcao de escala': 'CONSTRUCAO_ESCALA', 'escala': 'CONSTRUCAO_ESCALA',
  'hino': 'HINO',
  'preparatório rítmico': 'PREPARATORIO_RITMICO', 'preparatorio ritmico': 'PREPARATORIO_RITMICO',
  'atividade de apoio': 'ATIVIDADE_APOIO', 'apoio': 'ATIVIDADE_APOIO',
  'teoria': 'TEORIA',
};

const CHAVES_DO_METODO = new Set(['nome', 'codigo', 'autor', 'organizacao', 'versao', 'nivel']);

/** "1 – Nome", "1. Nome", "1 — Nome" e "Nome" — separa código de nome sem inventar. */
function separarCodigoENome(texto: string): { codigo: string | null; nome: string } {
  const comSeparador = texto.match(/^([\w.\-]+)\s*[–—-]\s*(.+)$/);
  if (comSeparador) return { codigo: comSeparador[1], nome: comSeparador[2].trim() };
  const comPonto = texto.match(/^([\d.]+)\.?\s+(.+)$/);
  if (comPonto) return { codigo: comPonto[1].replace(/\.$/, ''), nome: comPonto[2].trim() };
  return { codigo: null, nome: texto.trim() };
}

/** "[p. 12–13]", "[p. 12]", "[pág. 7]" → faixa de páginas impressas. */
function extrairPagina(texto: string): { inicio: number | null; fim: number | null; resto: string } {
  const achado = texto.match(/\[\s*p[áa]?g?\.?\s*(\d+)\s*(?:[–—-]\s*(\d+))?\s*\]/i);
  if (!achado) return { inicio: null, fim: null, resto: texto.trim() };
  const inicio = Number(achado[1]);
  const fim = achado[2] ? Number(achado[2]) : inicio;
  return { inicio, fim, resto: texto.replace(achado[0], '').trim() };
}

/** "(Leitura métrica)" no fim do rótulo diz o tipo do item. */
function extrairTipo(texto: string): { tipo: TipoDeItem; declarado: boolean; resto: string } {
  const achado = texto.match(/\(([^()]+)\)\s*$/);
  if (!achado) return { tipo: 'TEORIA', declarado: false, resto: texto.trim() };
  const encontrado = TIPOS_DE_ITEM[achado[1].trim().toLowerCase()];
  if (!encontrado) return { tipo: 'TEORIA', declarado: false, resto: texto.trim() };
  return { tipo: encontrado, declarado: true, resto: texto.replace(achado[0], '').trim() };
}

export interface OpcoesDoSumario {
  /** Tipo de unidade por profundidade, quando o sumário não declarar `{TIPO}`. */
  tiposPorProfundidade?: TipoDeUnidade[];
}

export function analisarSumario(fonte: string, opcoes: OpcoesDoSumario = {}): EstruturaSugerida {
  const tiposPorProfundidade = opcoes.tiposPorProfundidade ?? TIPOS_POR_PROFUNDIDADE;
  const metodo: EstruturaSugerida['metodo'] = {};
  const avisos: EstruturaSugerida['avisos'] = [];
  const raizes: UnidadeSugerida[] = [];
  /** Pilha de unidades abertas, uma posição por profundidade. */
  const abertas: UnidadeSugerida[] = [];
  let ordemPorProfundidade: number[] = [];
  let itensLidos = 0;

  fonte.split(/\r?\n/).forEach((bruta, indice) => {
    const linha = bruta.trim();
    const numero = indice + 1;
    if (!linha || linha.startsWith('//')) return;

    // ---- metadados do método
    if (linha.startsWith('::')) {
      const [chave, ...valor] = linha.slice(2).split(':');
      const nome = chave.trim().toLowerCase();
      if (!CHAVES_DO_METODO.has(nome)) {
        avisos.push({ origem: `linha ${numero}`, mensagem: `metadado "${chave.trim()}" ignorado: não é campo do método` });
        return;
      }
      const conteudo = valor.join(':').trim();
      if (conteudo && conteudo !== '—') metodo[nome as keyof typeof metodo] = conteudo;
      return;
    }

    // ---- unidade
    const cabecalho = linha.match(/^(#+)\s*(.+)$/);
    if (cabecalho) {
      const profundidade = cabecalho[1].length;
      let corpo = cabecalho[2].trim();

      let tipo: TipoDeUnidade | null = null;
      const marcador = corpo.match(/\{\s*([A-Za-zÁ-ú]+)\s*\}\s*$/);
      if (marcador) {
        const candidato = marcador[1].toUpperCase() as TipoDeUnidade;
        if (TIPOS_DE_UNIDADE.has(candidato)) tipo = candidato;
        else avisos.push({ origem: `linha ${numero}`, mensagem: `tipo de unidade "${marcador[1]}" não existe; a profundidade decidiu` });
        corpo = corpo.replace(marcador[0], '').trim();
      }

      const pagina = extrairPagina(corpo);
      const { codigo, nome } = separarCodigoENome(pagina.resto);
      if (profundidade > abertas.length + 1) {
        avisos.push({ origem: `linha ${numero}`, mensagem: `"${nome}" pula um nível do sumário; foi ligada ao nível imediatamente acima` });
      }
      const nivel = Math.min(profundidade, abertas.length + 1);
      ordemPorProfundidade = ordemPorProfundidade.slice(0, nivel);
      ordemPorProfundidade[nivel - 1] = (ordemPorProfundidade[nivel - 1] ?? 0) + 1;
      const ordem = ordemPorProfundidade[nivel - 1];

      if (!codigo) {
        avisos.push({ origem: `linha ${numero}`, mensagem: `"${nome}" não traz código no sumário; foi numerada pela ordem de leitura` });
      }

      const unidade: UnidadeSugerida = {
        tipo: tipo ?? tiposPorProfundidade[Math.min(nivel, tiposPorProfundidade.length) - 1],
        codigo: codigo ?? String(ordem),
        nome,
        descricao: null,
        ordem,
        paginaInicio: pagina.inicio,
        paginaFim: pagina.fim,
        referencia: null,
        fonte: null,
        statusConferencia: 'PENDENTE_CONFERENCIA',
        filhas: [],
        itens: [],
      };

      if (nivel === 1) raizes.push(unidade);
      else abertas[nivel - 2].filhas.push(unidade);
      abertas.length = nivel - 1;
      abertas.push(unidade);
      return;
    }

    // ---- item de estudo
    const marca = linha.match(/^[-*•]\s*(.+)$/);
    if (!marca) {
      avisos.push({ origem: `linha ${numero}`, mensagem: `linha não reconhecida e ignorada: “${linha.slice(0, 60)}”` });
      return;
    }
    const dona = abertas[abertas.length - 1];
    if (!dona) {
      avisos.push({ origem: `linha ${numero}`, mensagem: `item “${marca[1].slice(0, 40)}” aparece antes de qualquer unidade; ignorado` });
      return;
    }

    const pagina = extrairPagina(marca[1]);
    const tipoDoItem = extrairTipo(pagina.resto);
    const { codigo, nome } = separarCodigoENome(tipoDoItem.resto);

    const pendencias: string[] = [];
    if (pagina.inicio === null) pendencias.push('sem página impressa no sumário');
    if (!tipoDoItem.declarado) pendencias.push('tipo do item não declarado no sumário; registrado como teoria, a conferir');
    if (!codigo) pendencias.push('sem numeração original no sumário; numerado pela ordem de leitura');

    const statusConferencia: StatusConferencia = pendencias.length ? 'PENDENTE_CONFERENCIA' : 'CONFERIDO';
    const item: ItemSugerido = {
      numeroOriginal: codigo ?? String(dona.itens.length + 1),
      variante: '',
      titulo: nome,
      tipo: tipoDoItem.tipo,
      ordem: dona.itens.length + 1,
      observacoes: null,
      pendencias,
      statusConferencia,
      paginaInicio: pagina.inicio,
      paginaFim: pagina.fim,
      referencia: null,
      fonte: null,
      versoes: [],
      agrupamentos: [{ tipo: 'TIPO_LEITURA', valor: tipoDoItem.tipo, rotulo: tipoDoItem.tipo.replace(/_/g, ' ').toLowerCase() }],
    };

    const repetido = dona.itens.find((i) => i.numeroOriginal === item.numeroOriginal && i.variante === item.variante);
    if (repetido) {
      avisos.push({ origem: `linha ${numero}`, mensagem: `item "${item.numeroOriginal}" repetido em "${dona.nome}"; a segunda ocorrência ganhou variante` });
      item.variante = nome;
    }
    dona.itens.push(item);
    itensLidos++;
  });

  // A unidade herda a situação dos seus itens e das suas filhas.
  const consolidar = (unidades: UnidadeSugerida[]): StatusConferencia[] => unidades.map((unidade) => {
    const filhas = consolidar(unidade.filhas);
    const situacoes = [...filhas, ...unidade.itens.map((i) => i.statusConferencia)];
    unidade.statusConferencia = situacoes.includes('DIVERGENTE') ? 'DIVERGENTE'
      : situacoes.includes('PENDENTE_CONFERENCIA') || !situacoes.length ? 'PENDENTE_CONFERENCIA' : 'CONFERIDO';
    // A unidade cobre a faixa de páginas dos seus itens e das suas filhas.
    for (const dentro of [...unidade.filhas, ...unidade.itens]) {
      if (dentro.paginaInicio !== null && (unidade.paginaInicio === null || dentro.paginaInicio < unidade.paginaInicio)) {
        unidade.paginaInicio = dentro.paginaInicio;
      }
      if (dentro.paginaFim !== null && (unidade.paginaFim === null || dentro.paginaFim > unidade.paginaFim)) {
        unidade.paginaFim = dentro.paginaFim;
      }
    }
    return unidade.statusConferencia;
  });
  consolidar(raizes);

  avisos.push(...garantirCodigosUnicos(raizes).map((mensagem) => ({ origem: 'sumário', mensagem })));

  return {
    analisador: analisadorDeSumarioEmTexto.id,
    metodo,
    unidades: raizes,
    avisos,
    resumo: { itensLidos, unidadesRaiz: raizes.length },
  };
}

export const analisadorDeSumarioEmTexto: Analisador = {
  id: 'sumario-em-texto',
  nome: 'Sumário em texto',
  descricao: 'Sumário digitado (.txt ou .md), com "#" para as unidades e "-" para os itens. '
    + 'Aceita qualquer profundidade de hierarquia.',

  aceita: (documento) => documento.tipoArquivo === 'TXT'
    || /\.(txt|md|markdown)$/i.test(documento.nomeArquivo),

  analisar: (documento: DocumentoParaAnalise, opcoes: OpcoesDoSumario = {}) =>
    analisarSumario(documento.conteudo.toString('utf8'), opcoes),
};

/**
 * Analisador "índice em planilha".
 *
 * Lê uma planilha de índice — uma linha por item de estudo, com unidade,
 * subunidade, página, clave, compasso e armadura — e propõe a estrutura do
 * método. Serve a qualquer método que traga o seu índice nesse formato; o MSA
 * é apenas o primeiro que usou.
 *
 * Nada aqui pergunta QUAL método está sendo lido. O que varia de um para outro
 * entra como parâmetro:
 *   • os rótulos das colunas são resolvidos por sinônimo, não por nome fixo;
 *   • os limites do documento (páginas, último item) são declarados por quem
 *     importa, e o que passa deles vira DIVERGENTE em vez de ser "ajustado";
 *   • as demais abas são conferidas contra o índice pelo formato que têm, não
 *     por uma lista de nomes conhecidos.
 */

import type {
  Analisador, Clave, DocumentoParaAnalise, EstruturaSugerida, ItemSugerido,
  StatusConferencia, TipoDeItem, UnidadeSugerida, VersaoSugerida,
} from '../estrutura.ts';
import { garantirCodigosUnicos } from '../estrutura.ts';
import { lerXlsx, linhasComoObjetos } from '../../planilha/leitor.ts';

export interface LimitesDoDocumento {
  rotulo?: string;
  paginasArquivo?: number;
  paginaImpressaMaxima?: number;
  exercicioMaximo?: number;
}

/** Sem limites declarados, nada é considerado divergente por página. */
export const SEM_LIMITES: LimitesDoDocumento = {};

// ------------------------------------------------------------------ colunas

/**
 * Cada campo é procurado por uma lista de padrões. Assim uma planilha que
 * chame a coluna de "Tópico do MSA", "Módulo" ou "Unidade" é lida do mesmo
 * jeito, sem que o código conheça o método.
 */
const PADROES: Record<string, RegExp[]> = {
  unidadeMaior: [/^fase\b/i, /^n[íi]vel\b/i, /^etapa\b/i, /^volume\b/i],
  unidadeMenor: [/^t[óo]pico\b/i, /^m[óo]dulo\b/i, /^assunto\b/i, /^unidade\b/i, /^se[çc][ãa]o\b/i],
  item: [/^exerc[íi]cio\b/i, /^li[çc][ãa]o\b/i, /^item\b/i, /^n[úu]mero\b/i, /^estudo\b/i],
  tipo: [/^tipo\b/i, /^natureza\b/i],
  clave: [/^clave\b/i],
  escala: [/^escala\b/i, /^tonalidade\b/i, /^categoria\b/i],
  paginaImpressa: [/^p[áa]gina impressa/i, /^p[áa]gina do (m[ée]todo|livro)/i],
  paginaArquivo: [/^p[áa]gina (no |do )?(pdf|arquivo)/i],
  compasso: [/^compasso\b/i, /^f[óo]rmula\b/i],
  armadura: [/^armadura\b/i],
  criterioClave: [/^crit[ée]rio de clave/i],
  observacoes: [/^observa/i, /^nota\b/i],
  fonte: [/^fonte\b/i, /^refer[êe]ncia\b/i],
  listaDeItens: [/^exerc[íi]cios\b/i, /^li[çc][õo]es\b/i, /^itens\b/i],
};

export type MapaDeColunas = Partial<Record<keyof typeof PADROES, string>>;

/** Casa o cabeçalho da aba com os padrões acima. O que não casar fica de fora. */
export function reconhecerColunas(cabecalho: string[]): MapaDeColunas {
  const mapa: MapaDeColunas = {};
  for (const [campo, padroes] of Object.entries(PADROES)) {
    const encontrada = cabecalho.find((coluna) => padroes.some((p) => p.test(coluna.trim())));
    if (encontrada) mapa[campo as keyof typeof PADROES] = encontrada;
  }
  // "Exercícios de leitura" (lista) não pode ser confundido com "Exercício".
  if (mapa.item && mapa.item === mapa.listaDeItens) delete mapa.item;
  return mapa;
}

/** Uma aba serve de índice quando dá para dizer, linha a linha, qual item é. */
const ehIndice = (colunas: MapaDeColunas) => Boolean(colunas.unidadeMaior && colunas.item);

// ------------------------------------------------------------------ leitura

const texto = (valor: unknown): string | null => {
  if (valor === null || valor === undefined) return null;
  const limpo = String(typeof valor === 'object' && 'result' in (valor as object)
    ? (valor as { result: unknown }).result : valor).trim();
  return limpo === '' ? null : limpo;
};

const inteiro = (valor: unknown): number | null => {
  const t = texto(valor);
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && String(n) === t ? n : null;
};

/** "56–57" e "56-57" viram { inicio: 56, fim: 57 }; "42" vira { inicio: 42, fim: 42 }. */
export function faixaDePaginas(valor: unknown): { inicio: number | null; fim: number | null; textoOriginal: string | null } {
  const t = texto(valor);
  if (!t) return { inicio: null, fim: null, textoOriginal: null };
  const partes = t.split(/[–—-]/).map((p) => p.trim());
  const inicio = Number.parseInt(partes[0], 10);
  const fim = partes[1] ? Number.parseInt(partes[1], 10) : inicio;
  if (!Number.isFinite(inicio)) return { inicio: null, fim: null, textoOriginal: t };
  return { inicio, fim: Number.isFinite(fim) ? fim : inicio, textoOriginal: t };
}

const CLAVES: Record<string, Clave> = { 'Sol': 'SOL', 'Dó': 'DO', 'Do': 'DO', 'Fá': 'FA', 'Fa': 'FA' };

export const converterClave = (valor: unknown): Clave | null => {
  const t = texto(valor);
  return t ? (CLAVES[t] ?? null) : null;
};

const TIPOS: Record<string, TipoDeItem> = {
  'Leitura métrica / solfejo': 'LEITURA_METRICA',
  'Leitura rítmica': 'LEITURA_RITMICA',
  'Construção de escala': 'CONSTRUCAO_ESCALA',
  'Hino': 'HINO',
  'Preparatório rítmico': 'PREPARATORIO_RITMICO',
  'Atividade de apoio': 'ATIVIDADE_APOIO',
};

export const converterTipo = (valor: unknown): TipoDeItem => {
  const t = texto(valor);
  return (t && TIPOS[t]) || 'TEORIA';
};

/**
 * Formas de a planilha dizer "a fonte não informa". É padrão de escrita, não
 * vocabulário de um método: "Sem armadura", "Não indicada no MSA" e
 * "A conferir no Hinário" caem todas aqui.
 */
const SEM_INFORMACAO = /^(sem\b|n[ãa]o (se aplica|indicad|informad|h[áa])|a conferir|nenhum|conforme o enunciado)/i;

const informado = (valor: string | null) => Boolean(valor && !SEM_INFORMACAO.test(valor));

/** O que a fonte manda conferir em outro documento antes de usar. */
const aConferirEmOutraFonte = (valor: string | null) => Boolean(valor && /^a conferir/i.test(valor));

/** Só recebe tonalidade quem tem altura definida na fonte. */
const TIPOS_SEM_TONALIDADE = new Set<TipoDeItem>(['LEITURA_RITMICA', 'PREPARATORIO_RITMICO', 'ATIVIDADE_APOIO']);

/**
 * Item do índice, com o par de unidades a que pertence. É o formato de
 * trabalho do analisador; a árvore genérica sai daqui em `montarArvore`.
 */
export interface ItemDeIndice extends ItemSugerido {
  unidadeMaior: number;
  unidadeMenorCodigo: string;
  unidadeMenorNome: string;
}

export interface OcorrenciaDeLinha { chave: string; linha: number; motivo: string }

export function normalizarIndice(
  linhas: Record<string, unknown>[],
  limites: LimitesDoDocumento = SEM_LIMITES,
  colunas: MapaDeColunas = reconhecerColunas(Object.keys(linhas[0] ?? {})),
) {
  const porChave = new Map<string, ItemDeIndice>();
  const ocorrencias: OcorrenciaDeLinha[] = [];
  const campo = (linha: Record<string, unknown>, nome: keyof typeof PADROES) =>
    (colunas[nome] ? linha[colunas[nome] as string] : null);

  linhas.forEach((linha, indice) => {
    const numeroLinha = indice + 5; // as quatro primeiras linhas da aba são título e cabeçalho
    const maior = inteiro(campo(linha, 'unidadeMaior'));
    const menorBruta = texto(campo(linha, 'unidadeMenor'));
    const item = texto(campo(linha, 'item'));
    const tipo = converterTipo(campo(linha, 'tipo'));
    const clave = converterClave(campo(linha, 'clave'));
    const escala = texto(campo(linha, 'escala'));

    if (maior === null || !menorBruta || !item) {
      ocorrencias.push({ chave: `linha ${numeroLinha}`, linha: numeroLinha, motivo: 'linha sem unidade ou sem item' });
      return;
    }

    // "1.4 – Ligadura" vira código "1.4" e nome "Ligadura"; sem separador, o
    // texto inteiro serve de código e de nome.
    const [codigo, ...resto] = menorBruta.split('–');
    const menorCodigo = codigo.trim();
    const menorNome = resto.join('–').trim() || menorBruta;

    // Rótulo repetido dentro da subunidade (por exemplo "Exemplo de
    // construção", uma vez para cada escala) precisa de variante para não colidir.
    const ehNumerico = /^\d+$/.test(item);
    const variante = ehNumerico ? '' : (informado(escala) ? (escala as string) : '');
    const chave = `${maior}|${menorCodigo}|${item}|${variante}`;

    const impressa = faixaDePaginas(campo(linha, 'paginaImpressa'));
    const arquivo = faixaDePaginas(campo(linha, 'paginaArquivo'));
    const compasso = texto(campo(linha, 'compasso'));
    const armadura = texto(campo(linha, 'armadura'));
    const criterioClave = texto(campo(linha, 'criterioClave'));
    const observacoes = texto(campo(linha, 'observacoes'));
    const fonte = texto(campo(linha, 'fonte'));

    const pendencias: string[] = [];
    if (!clave) pendencias.push('clave não reconhecida na planilha');
    if (criterioClave && /adotad/i.test(criterioClave)) pendencias.push('clave adotada para organização, não escrita no método');
    if (!impressa.inicio) pendencias.push('sem página impressa numérica');
    if (!arquivo.inicio) pendencias.push('sem página correspondente no arquivo');
    if (!informado(compasso)) pendencias.push(`fórmula de compasso não informada na fonte (“${compasso ?? '—'}”)`);
    if (!informado(armadura)) pendencias.push(`armadura não informada na fonte (“${armadura ?? '—'}”)`);
    if (aConferirEmOutraFonte(escala)) pendencias.push(`dados musicais dependem de outra fonte (“${escala}”), ainda não disponibilizada`);

    // Limites do documento, quando declarados por quem importa: o que passar
    // disso é divergência a conferir, nunca um dado "corrigido" em silêncio.
    const divergencias: string[] = [];
    if (limites.paginaImpressaMaxima && impressa.fim && impressa.fim > limites.paginaImpressaMaxima) {
      divergencias.push(`página impressa ${impressa.textoOriginal} passa da última página informada `
        + `(${limites.paginaImpressaMaxima})`);
    }
    if (limites.paginasArquivo && arquivo.fim && arquivo.fim > limites.paginasArquivo) {
      divergencias.push(`página ${arquivo.textoOriginal} do arquivo passa das ${limites.paginasArquivo} páginas informadas`);
    }
    if (limites.exercicioMaximo && ehNumerico && Number(item) > limites.exercicioMaximo) {
      divergencias.push(`item ${item} passa do último item informado (${limites.exercicioMaximo})`);
    }

    const status: StatusConferencia = divergencias.length ? 'DIVERGENTE'
      : pendencias.length ? 'PENDENTE_CONFERENCIA' : 'CONFERIDO';

    const escalaReferencia = TIPOS_SEM_TONALIDADE.has(tipo) || !informado(escala) ? null : escala;
    // Sem clave escrita na fonte, Sol organiza a leitura — e a pendência acima
    // registra que ela foi adotada, não lida.
    const claveAdotada: Clave = clave ?? 'SOL';

    const versao: VersaoSugerida = {
      clave: claveAdotada,
      criterioClave,
      paginaInicio: impressa.inicio,
      paginaFim: impressa.fim,
      paginaArquivoInicio: arquivo.inicio,
      paginaArquivoFim: arquivo.fim,
      armadura,
      escalaReferencia,
      compassos: informado(compasso) ? [compasso as string] : [],
      tipoLeitura: texto(campo(linha, 'tipo')),
      observacoes,
      referencia: fonte,
      fonte,
      statusConferencia: status,
    };

    const existente = porChave.get(chave);
    if (!existente) {
      porChave.set(chave, {
        unidadeMaior: maior,
        unidadeMenorCodigo: menorCodigo,
        unidadeMenorNome: menorNome,
        numeroOriginal: item,
        variante,
        titulo: variante ? `${item} — ${variante}` : `Exercício ${item}`,
        tipo,
        ordem: ehNumerico ? Number(item) : indice,
        observacoes,
        fonte,
        paginaInicio: impressa.inicio,
        paginaFim: impressa.fim,
        referencia: fonte,
        statusConferencia: status,
        pendencias: [...pendencias, ...divergencias],
        versoes: [versao],
        agrupamentos: montarAgrupamentos({ escala: escalaReferencia, clave: claveAdotada, compassos: versao.compassos, tipo }),
      });
      return;
    }

    // Mesmo item em outra clave, ou a mesma clave com outro compasso
    // (compassos alternados, por exemplo) — funde sem duplicar a lição.
    const mesmaClave = existente.versoes.find((v) => v.clave === claveAdotada);
    if (mesmaClave) {
      for (const c of versao.compassos) if (!mesmaClave.compassos.includes(c)) mesmaClave.compassos.push(c);
      if (mesmaClave.compassos.length > 1) {
        mesmaClave.compassos.sort();
        ocorrencias.push({ chave, linha: numeroLinha, motivo: 'mesma clave com mais de um compasso — versões fundidas' });
      }
    } else {
      existente.versoes.push(versao);
    }
    for (const grupo of montarAgrupamentos({ escala: escalaReferencia, clave: claveAdotada, compassos: versao.compassos, tipo })) {
      if (!existente.agrupamentos.some((g) => g.tipo === grupo.tipo && g.valor === grupo.valor)) {
        existente.agrupamentos.push(grupo);
      }
    }
    const novasPendencias = [...pendencias, ...divergencias].filter((p) => !existente.pendencias.includes(p));
    existente.pendencias.push(...novasPendencias);
    if (status === 'DIVERGENTE') existente.statusConferencia = 'DIVERGENTE';
    else if (status === 'PENDENTE_CONFERENCIA' && existente.statusConferencia === 'CONFERIDO') {
      existente.statusConferencia = 'PENDENTE_CONFERENCIA';
    }
  });

  return { licoes: [...porChave.values()], ocorrencias };
}

const ROTULO_CLAVE: Record<Clave, string> = { SOL: 'Clave de Sol', DO: 'Clave de Dó', FA: 'Clave de Fá' };

function montarAgrupamentos(dados: { escala: string | null; clave: Clave; compassos: string[]; tipo: TipoDeItem }) {
  const grupos: ItemSugerido['agrupamentos'] = [
    { tipo: 'CLAVE', valor: dados.clave, rotulo: ROTULO_CLAVE[dados.clave] },
    { tipo: 'TIPO_LEITURA', valor: dados.tipo, rotulo: dados.tipo.replace(/_/g, ' ').toLowerCase() },
  ];
  if (dados.escala) grupos.push({ tipo: 'ESCALA', valor: dados.escala, rotulo: dados.escala });
  for (const compasso of dados.compassos) grupos.push({ tipo: 'COMPASSO', valor: compasso, rotulo: `Compasso ${compasso}` });
  return grupos;
}

// ------------------------------------------------------------------- árvore

const menorDe = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));
const maiorDe = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));

/** Pior situação vence: uma subunidade com item divergente é divergente. */
function piorSituacao(situacoes: StatusConferencia[]): StatusConferencia {
  if (situacoes.includes('DIVERGENTE')) return 'DIVERGENTE';
  if (situacoes.includes('PENDENTE_CONFERENCIA')) return 'PENDENTE_CONFERENCIA';
  return situacoes.length ? 'CONFERIDO' : 'PENDENTE_CONFERENCIA';
}

/**
 * Duas camadas: FASE (a unidade maior) → MODULO (a subunidade), com os itens
 * dentro do módulo. Quem tiver método de uma camada só usa outro analisador;
 * a forma de saída é a mesma.
 */
export function montarArvore(licoes: ItemDeIndice[], rotuloDaUnidadeMaior = 'Fase'): UnidadeSugerida[] {
  const fases = new Map<number, UnidadeSugerida>();
  const modulos = new Map<string, UnidadeSugerida>();

  for (const licao of [...licoes].sort((a, b) => a.unidadeMaior - b.unidadeMaior
    || a.unidadeMenorCodigo.localeCompare(b.unidadeMenorCodigo, 'pt-BR', { numeric: true })
    || a.ordem - b.ordem)) {
    let fase = fases.get(licao.unidadeMaior);
    if (!fase) {
      fase = {
        tipo: 'FASE',
        codigo: String(licao.unidadeMaior),
        // O nome vem do documento quando houver; até lá fica o número, sem inventar título.
        nome: `${rotuloDaUnidadeMaior} ${licao.unidadeMaior}`,
        descricao: null,
        ordem: licao.unidadeMaior,
        paginaInicio: null, paginaFim: null, referencia: null, fonte: null,
        statusConferencia: 'PENDENTE_CONFERENCIA',
        filhas: [], itens: [],
      };
      fases.set(licao.unidadeMaior, fase);
    }

    const chaveDoModulo = `${licao.unidadeMaior}|${licao.unidadeMenorCodigo}`;
    let modulo = modulos.get(chaveDoModulo);
    if (!modulo) {
      modulo = {
        tipo: 'MODULO',
        codigo: licao.unidadeMenorCodigo,
        nome: licao.unidadeMenorNome,
        descricao: null,
        ordem: fase.filhas.length + 1,
        paginaInicio: null, paginaFim: null, referencia: null, fonte: null,
        statusConferencia: 'PENDENTE_CONFERENCIA',
        filhas: [], itens: [],
      };
      modulos.set(chaveDoModulo, modulo);
      fase.filhas.push(modulo);
    }

    const { unidadeMaior, unidadeMenorCodigo, unidadeMenorNome, ...item } = licao;
    modulo.itens.push(item);
  }

  // Proveniência das unidades: a faixa de páginas que os seus itens cobrem.
  for (const fase of fases.values()) {
    for (const modulo of fase.filhas) {
      for (const item of modulo.itens) {
        modulo.paginaInicio = menorDe(modulo.paginaInicio, item.paginaInicio);
        modulo.paginaFim = maiorDe(modulo.paginaFim, item.paginaFim);
      }
      modulo.statusConferencia = piorSituacao(modulo.itens.map((i) => i.statusConferencia));
      fase.paginaInicio = menorDe(fase.paginaInicio, modulo.paginaInicio);
      fase.paginaFim = maiorDe(fase.paginaFim, modulo.paginaFim);
    }
    fase.statusConferencia = piorSituacao(fase.filhas.map((m) => m.statusConferencia));
  }

  return [...fases.values()].sort((a, b) => a.ordem - b.ordem);
}

// ------------------------------------------------------------- conferências

/**
 * Confere as demais abas contra o índice, sem corrigir nada sozinho.
 *
 * A escolha das abas é pelo FORMATO: quem tiver unidade e item é conferida
 * linha a linha; quem tiver uma coluna de lista ("Exercícios de leitura") tem
 * os números da lista cruzados; o que não for reconhecido vira aviso, para
 * ninguém achar que foi conferido.
 */
/**
 * "19 (p. 42); 24 (p. 43)" e "7–10, 14" viram [19, 24] e [7, 8, 9, 10, 14].
 * Anotação entre parênteses é comentário da fonte e não entra na conferência.
 */
export function numerosDaLista(lista: string): string[] {
  const numeros: string[] = [];
  for (const parte of lista.split(/[,;]/)) {
    const achado = parte.replace(/\([^)]*\)/g, ' ').trim().match(/^(\d+)(?:\s*[–—-]\s*(\d+))?$/);
    if (!achado) continue;
    const inicio = Number(achado[1]);
    const fim = achado[2] ? Number(achado[2]) : inicio;
    if (fim < inicio || fim - inicio > 200) { numeros.push(String(inicio)); continue; }
    for (let n = inicio; n <= fim; n++) numeros.push(String(n));
  }
  return numeros;
}

export function conferirCruzamentos(
  abas: Record<string, Record<string, unknown>[]>,
  licoes: ItemDeIndice[],
  abaDoIndice: string,
) {
  const achados: { aba: string; mensagem: string }[] = [];
  const porUnidadeItem = new Map<string, ItemDeIndice>();
  for (const l of licoes) porUnidadeItem.set(`${l.unidadeMaior}|${l.numeroOriginal}`, l);
  const existeItem = (numero: string) => licoes.some((l) => l.numeroOriginal === numero);

  for (const [aba, linhas] of Object.entries(abas)) {
    if (aba === abaDoIndice || !linhas.length) continue;
    const colunas = reconhecerColunas(Object.keys(linhas[0]));
    let conferida = false;

    // ---- uma linha por item: confere par a par com o índice
    if (ehIndice(colunas)) {
      conferida = true;
      for (const linha of linhas) {
        const maior = inteiro(linha[colunas.unidadeMaior as string]);
        const item = texto(linha[colunas.item as string]);
        if (maior === null || !item) continue;
        if (!porUnidadeItem.has(`${maior}|${item}`)) {
          achados.push({ aba, mensagem: `unidade ${maior}, item ${item} aparece aqui e não no índice detalhado` });
        }
      }
    }

    // ---- uma linha por rótulo, com a lista dos itens que lhe pertencem
    if (colunas.listaDeItens) {
      conferida = true;
      for (const linha of linhas) {
        const lista = texto(linha[colunas.listaDeItens as string]);
        if (!lista) continue;
        const rotulo = colunas.escala ? texto(linha[colunas.escala as string]) : null;
        const maior = colunas.unidadeMaior ? inteiro(linha[colunas.unidadeMaior as string]) : null;

        // A célula às vezes traz uma frase em vez de números — isso é anotação
        // da fonte, não divergência, e entra como observação.
        const numeros = numerosDaLista(lista);
        if (!numeros.length) {
          achados.push({ aba, mensagem: `${rotulo ?? `unidade ${maior ?? '—'}`}: a lista anota “${lista}” — sem item a cruzar` });
          continue;
        }

        for (const numero of numeros) {
          // Só cobra o pareamento com o rótulo quando o rótulo diz alguma
          // coisa: "Não se aplica" é ausência de dado, não vínculo a conferir.
          if (informado(rotulo)) {
            const encontrada = licoes.some((l) => l.numeroOriginal === numero
              && l.versoes.some((v) => v.escalaReferencia === rotulo));
            if (!encontrada) {
              achados.push({
                aba,
                mensagem: `${rotulo}: item ${numero} listado aqui sem correspondência com o mesmo rótulo no índice detalhado`,
              });
            }
            continue;
          }
          const encontrada = maior !== null ? porUnidadeItem.has(`${maior}|${numero}`) : existeItem(numero);
          if (!encontrada) {
            achados.push({
              aba,
              mensagem: maior !== null
                ? `unidade ${maior}, item ${numero} listado aqui e ausente do índice detalhado`
                : `item ${numero} listado aqui e ausente do índice detalhado`,
            });
          }
        }
      }
    }

    if (!conferida) {
      achados.push({ aba, mensagem: 'aba não conferida: as colunas não permitem identificar unidade e item' });
    }
  }
  return achados;
}

export function resumirAnalise(
  licoes: ItemDeIndice[],
  ocorrencias: OcorrenciaDeLinha[],
  cruzamentos: { aba: string; mensagem: string }[],
) {
  const porStatus: Record<string, number> = { CONFERIDO: 0, PENDENTE_CONFERENCIA: 0, DIVERGENTE: 0 };
  const contagemMotivos = new Map<string, number>();
  const divergencias: string[] = [];

  for (const licao of licoes) {
    porStatus[licao.statusConferencia] = (porStatus[licao.statusConferencia] ?? 0) + 1;
    for (const pendencia of licao.pendencias) {
      contagemMotivos.set(pendencia, (contagemMotivos.get(pendencia) ?? 0) + 1);
    }
    if (licao.statusConferencia === 'DIVERGENTE') {
      divergencias.push(`unidade ${licao.unidadeMaior}, ${licao.unidadeMenorCodigo}, item ${licao.numeroOriginal}: `
        + licao.pendencias.join('; '));
    }
  }

  return {
    licoes: licoes.length,
    versoes: licoes.reduce((soma, l) => soma + l.versoes.length, 0),
    porStatus,
    motivos: [...contagemMotivos.entries()].sort((a, b) => b[1] - a[1]),
    divergencias,
    ocorrencias,
    cruzamentos: cruzamentos.length,
  };
}

// ------------------------------------------------------------- o analisador

export interface OpcoesDoIndice {
  limites?: LimitesDoDocumento;
  aba?: string;
  rotuloDaUnidadeMaior?: string;
}

/** Lê a planilha inteira como listas de objetos, uma por aba. */
export function abasComoObjetos(conteudo: Buffer) {
  const saida: Record<string, Record<string, unknown>[]> = {};
  for (const [nome, matriz] of lerXlsx(conteudo)) saida[nome] = linhasComoObjetos(matriz).linhas;
  return saida;
}

/** A aba de índice é a que tem as colunas necessárias e o maior número de linhas. */
export function escolherAbaDeIndice(abas: Record<string, Record<string, unknown>[]>, preferida?: string) {
  if (preferida) {
    const linhas = abas[preferida];
    if (!linhas?.length) throw new Error(`A aba "${preferida}" não foi encontrada na planilha ou está vazia.`);
    return { aba: preferida, linhas, colunas: reconhecerColunas(Object.keys(linhas[0])) };
  }
  const candidatas = Object.entries(abas)
    .filter(([, linhas]) => linhas.length)
    .map(([aba, linhas]) => ({ aba, linhas, colunas: reconhecerColunas(Object.keys(linhas[0])) }))
    .filter(({ colunas }) => ehIndice(colunas))
    .sort((a, b) => b.linhas.length - a.linhas.length);
  if (!candidatas.length) {
    throw new Error('Nenhuma aba desta planilha traz, ao mesmo tempo, a unidade e o item de cada linha.');
  }
  return candidatas[0];
}

export const analisadorDeIndiceEmPlanilha: Analisador = {
  id: 'indice-em-planilha',
  nome: 'Índice em planilha',
  descricao: 'Planilha com uma linha por item de estudo: unidade, subunidade, página impressa, '
    + 'página no arquivo, clave, compasso e armadura. Propõe unidades em duas camadas.',

  aceita: (documento) => documento.tipoArquivo === 'XLSX' || /\.xlsx$/i.test(documento.nomeArquivo),

  analisar(documento: DocumentoParaAnalise, opcoes: OpcoesDoIndice = {}): EstruturaSugerida {
    const abas = abasComoObjetos(documento.conteudo);
    const { aba, linhas, colunas } = escolherAbaDeIndice(abas, opcoes.aba);
    const { licoes, ocorrencias } = normalizarIndice(linhas, opcoes.limites ?? SEM_LIMITES, colunas);
    const cruzamentos = conferirCruzamentos(abas, licoes, aba);
    const resumo = resumirAnalise(licoes, ocorrencias, cruzamentos);
    const unidades = montarArvore(licoes, opcoes.rotuloDaUnidadeMaior ?? 'Fase');

    const avisos = [
      ...ocorrencias.map((o) => ({ origem: `${aba}, linha ${o.linha}`, mensagem: o.motivo })),
      ...cruzamentos.map((c) => ({ origem: `aba ${c.aba}`, mensagem: c.mensagem })),
      ...garantirCodigosUnicos(unidades).map((m) => ({ origem: `aba ${aba}`, mensagem: m })),
    ];
    for (const campo of ['paginaImpressa', 'paginaArquivo', 'clave', 'compasso', 'armadura'] as const) {
      if (!colunas[campo]) {
        avisos.push({ origem: `aba ${aba}`, mensagem: `a planilha não traz coluna de ${campo}; o dado fica ausente, não suposto` });
      }
    }

    return {
      analisador: analisadorDeIndiceEmPlanilha.id,
      metodo: {},
      unidades,
      avisos,
      resumo: { ...resumo, aba, colunasReconhecidas: colunas, linhasLidas: linhas.length },
    };
  },
};

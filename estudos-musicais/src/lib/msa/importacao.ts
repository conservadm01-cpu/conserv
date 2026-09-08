/**
 * Normalização do índice do MSA.
 *
 * Aqui mora a decisão de fidelidade: o que a planilha traz vira registro; o
 * que ela não traz vira pendência declarada — nunca um dado inventado.
 * Este módulo é puro (não toca no banco), para poder ser testado sozinho.
 */

export const LIMITES_DA_EDICAO = {
  rotulo: '1ª edição, dezembro/2022',
  paginasArquivo: 150,
  paginaImpressaMaxima: 151,
  exercicioMaximo: 112,
} as const;

export type Clave = 'SOL' | 'DO' | 'FA';
export type TipoLicao =
  | 'LEITURA_METRICA' | 'LEITURA_RITMICA' | 'CONSTRUCAO_ESCALA'
  | 'HINO' | 'PREPARATORIO_RITMICO' | 'ATIVIDADE_APOIO' | 'TEORIA';
export type StatusConferencia = 'CONFERIDO' | 'PENDENTE_CONFERENCIA' | 'DIVERGENTE';
export type TipoAgrupamento = 'ESCALA' | 'CLAVE' | 'COMPASSO' | 'TIPO_LEITURA' | 'ASSUNTO';

export interface VersaoImportada {
  clave: Clave;
  criterioClave: string | null;
  paginaImpressaInicio: number | null;
  paginaImpressaFim: number | null;
  paginaArquivoInicio: number | null;
  paginaArquivoFim: number | null;
  armadura: string | null;
  escalaReferencia: string | null;
  compassos: string[];
  tipoLeitura: string | null;
  observacoes: string | null;
  fonte: string | null;
  statusConferencia: StatusConferencia;
}

export interface LicaoImportada {
  fase: number;
  topicoCodigo: string;
  topicoNome: string;
  numeroOriginal: string;
  variante: string;
  titulo: string;
  tipo: TipoLicao;
  ordem: number;
  observacoes: string | null;
  fonte: string | null;
  statusConferencia: StatusConferencia;
  pendencias: string[];
  linhaOrigem: number;
  versoes: VersaoImportada[];
  agrupamentos: { tipo: TipoAgrupamento; valor: string; rotulo: string; ordem: number }[];
}

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

const TIPOS: Record<string, TipoLicao> = {
  'Leitura métrica / solfejo': 'LEITURA_METRICA',
  'Leitura rítmica': 'LEITURA_RITMICA',
  'Construção de escala': 'CONSTRUCAO_ESCALA',
  'Hino': 'HINO',
  'Preparatório rítmico': 'PREPARATORIO_RITMICO',
  'Atividade de apoio': 'ATIVIDADE_APOIO',
};

export const converterTipo = (valor: unknown): TipoLicao => {
  const t = texto(valor);
  return (t && TIPOS[t]) || 'TEORIA';
};

/** Valores que a planilha usa para dizer "a fonte não informa". */
const SEM_INFORMACAO = new Set([
  'Sem escala definida', 'Não se aplica', 'A conferir no Hinário', 'Não indicada no MSA',
  'Sem fórmula indicada', 'Sem armadura', 'Conforme o enunciado', 'Nenhuma',
]);

const informado = (valor: string | null) => Boolean(valor && !SEM_INFORMACAO.has(valor));

/** Só recebe tonalidade quem tem altura definida na fonte. */
const TIPOS_SEM_TONALIDADE = new Set<TipoLicao>(['LEITURA_RITMICA', 'PREPARATORIO_RITMICO', 'ATIVIDADE_APOIO']);

export function normalizarIndice(linhas: Record<string, unknown>[]) {
  const porChave = new Map<string, LicaoImportada>();
  const ocorrencias: { chave: string; linha: number; motivo: string }[] = [];

  linhas.forEach((linha, indice) => {
    const numeroLinha = indice + 5; // as quatro primeiras linhas da aba são título e cabeçalho
    const fase = inteiro(linha['Fase']);
    const topicoBruto = texto(linha['Tópico do MSA']);
    const exercicio = texto(linha['Exercício']);
    const tipo = converterTipo(linha['Tipo']);
    const clave = converterClave(linha['Clave']);
    const escala = texto(linha['Escala / categoria']);

    if (fase === null || !topicoBruto || !exercicio) {
      ocorrencias.push({ chave: `linha ${numeroLinha}`, linha: numeroLinha, motivo: 'linha sem fase, tópico ou exercício' });
      return;
    }

    const [codigo, ...resto] = topicoBruto.split('–');
    const topicoCodigo = codigo.trim();
    const topicoNome = resto.join('–').trim() || topicoBruto;

    // Rótulo repetido dentro do tópico (por exemplo "Exemplo de construção",
    // uma vez para cada escala) precisa de variante para não colidir.
    const ehNumerico = /^\d+$/.test(exercicio);
    const variante = ehNumerico ? '' : (informado(escala) ? (escala as string) : '');
    const chave = `${fase}|${topicoCodigo}|${exercicio}|${variante}`;

    const impressa = faixaDePaginas(linha['Página impressa']);
    const arquivo = faixaDePaginas(linha['Página no PDF']);
    const compasso = texto(linha['Compasso']);
    const armadura = texto(linha['Armadura']);
    const criterioClave = texto(linha['Critério de clave']);
    const observacoes = texto(linha['Observações']);
    const fonte = texto(linha['Fonte']);

    const pendencias: string[] = [];
    if (!clave) pendencias.push('clave não reconhecida na planilha');
    if (criterioClave && /adotad/i.test(criterioClave)) pendencias.push('clave adotada para organização, não escrita no método');
    if (!impressa.inicio) pendencias.push('sem página impressa numérica');
    if (!arquivo.inicio) pendencias.push('sem página correspondente no arquivo');
    if (!informado(compasso)) pendencias.push(`fórmula de compasso não informada na fonte (“${compasso ?? '—'}”)`);
    if (!informado(armadura)) pendencias.push(`armadura não informada na fonte (“${armadura ?? '—'}”)`);
    if (escala === 'A conferir no Hinário') pendencias.push('dados musicais dependem do Hinário, ainda não disponibilizado');

    // Limites do arquivo informados pelo responsável: além disso, é divergência.
    const divergencias: string[] = [];
    if (impressa.inicio && impressa.fim && impressa.fim > LIMITES_DA_EDICAO.paginaImpressaMaxima) {
      divergencias.push(`página impressa ${impressa.textoOriginal} passa da última página informada `
        + `(${LIMITES_DA_EDICAO.paginaImpressaMaxima})`);
    }
    if (arquivo.fim && arquivo.fim > LIMITES_DA_EDICAO.paginasArquivo) {
      divergencias.push(`página ${arquivo.textoOriginal} do arquivo passa das ${LIMITES_DA_EDICAO.paginasArquivo} páginas informadas`);
    }
    if (ehNumerico && Number(exercicio) > LIMITES_DA_EDICAO.exercicioMaximo) {
      divergencias.push(`exercício ${exercicio} passa do último exercício informado (${LIMITES_DA_EDICAO.exercicioMaximo})`);
    }

    const status: StatusConferencia = divergencias.length ? 'DIVERGENTE'
      : pendencias.length ? 'PENDENTE_CONFERENCIA' : 'CONFERIDO';

    const escalaReferencia = TIPOS_SEM_TONALIDADE.has(tipo) || !informado(escala) ? null : escala;

    const versao: VersaoImportada = {
      clave: clave ?? 'SOL',
      criterioClave,
      paginaImpressaInicio: impressa.inicio,
      paginaImpressaFim: impressa.fim,
      paginaArquivoInicio: arquivo.inicio,
      paginaArquivoFim: arquivo.fim,
      armadura,
      escalaReferencia,
      compassos: informado(compasso) ? [compasso as string] : [],
      tipoLeitura: texto(linha['Tipo']),
      observacoes,
      fonte,
      statusConferencia: status,
    };

    const existente = porChave.get(chave);
    if (!existente) {
      porChave.set(chave, {
        fase,
        topicoCodigo,
        topicoNome,
        numeroOriginal: exercicio,
        variante,
        titulo: variante ? `${exercicio} — ${variante}` : `Exercício ${exercicio}`,
        tipo,
        ordem: ehNumerico ? Number(exercicio) : indice,
        observacoes,
        fonte,
        statusConferencia: status,
        pendencias: [...pendencias, ...divergencias],
        linhaOrigem: numeroLinha,
        versoes: [versao],
        agrupamentos: montarAgrupamentos({ escala: escalaReferencia, clave: versao.clave, compassos: versao.compassos, tipo }),
      });
      return;
    }

    // Mesma lição em outra clave, ou a mesma clave com outro compasso
    // (compassos alternados, por exemplo) — funde sem duplicar a lição.
    const mesmaClave = existente.versoes.find((v) => v.clave === versao.clave);
    if (mesmaClave) {
      for (const c of versao.compassos) if (!mesmaClave.compassos.includes(c)) mesmaClave.compassos.push(c);
      if (mesmaClave.compassos.length > 1) {
        mesmaClave.compassos.sort();
        ocorrencias.push({ chave, linha: numeroLinha, motivo: 'mesma clave com mais de um compasso — versões fundidas' });
      }
    } else {
      existente.versoes.push(versao);
    }
    for (const grupo of montarAgrupamentos({ escala: escalaReferencia, clave: versao.clave, compassos: versao.compassos, tipo })) {
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

function montarAgrupamentos(dados: { escala: string | null; clave: Clave; compassos: string[]; tipo: TipoLicao }) {
  const grupos: LicaoImportada['agrupamentos'] = [
    { tipo: 'CLAVE', valor: dados.clave, rotulo: ROTULO_CLAVE[dados.clave], ordem: 0 },
    { tipo: 'TIPO_LEITURA', valor: dados.tipo, rotulo: dados.tipo.replace(/_/g, ' ').toLowerCase(), ordem: 0 },
  ];
  if (dados.escala) grupos.push({ tipo: 'ESCALA', valor: dados.escala, rotulo: dados.escala, ordem: 0 });
  for (const compasso of dados.compassos) grupos.push({ tipo: 'COMPASSO', valor: compasso, rotulo: `Compasso ${compasso}`, ordem: 0 });
  return grupos;
}

/** Confere as demais abas contra o índice detalhado, sem corrigir nada sozinho. */
export function conferirCruzamentos(
  abas: Record<string, Record<string, unknown>[]>,
  licoes: LicaoImportada[],
) {
  const achados: { aba: string; mensagem: string }[] = [];
  const porFaseExercicio = new Map<string, LicaoImportada>();
  for (const l of licoes) porFaseExercicio.set(`${l.fase}|${l.numeroOriginal}`, l);

  const conferirLista = (aba: string, linhas: Record<string, unknown>[], colunaExercicio: string, colunaFase = 'Fase') => {
    for (const linha of linhas) {
      const fase = inteiro(linha[colunaFase]);
      const exercicio = texto(linha[colunaExercicio]);
      if (fase === null || !exercicio) continue;
      if (!porFaseExercicio.has(`${fase}|${exercicio}`)) {
        achados.push({ aba, mensagem: `fase ${fase}, exercício ${exercicio} aparece aqui e não no índice detalhado` });
      }
    }
  };

  conferirLista('Leitura ritmica', abas['Leitura ritmica'] ?? [], 'Exercício');
  conferirLista('Hinos', abas['Hinos'] ?? [], 'Exercício');
  conferirLista('Escalas fase 6', abas['Escalas fase 6'] ?? [], 'Exercício');

  // "Mapa das escalas" lista os exercícios de leitura de cada escala. A célula
  // às vezes traz uma frase em vez de números — isso é anotação da fonte, não
  // divergência, e entra como observação.
  for (const linha of abas['Mapa das escalas'] ?? []) {
    const escala = texto(linha['Escala maior']);
    const lista = texto(linha['Exercícios de leitura']);
    if (!escala || !lista) continue;
    const itens = lista.split(',').map((n) => n.trim()).filter(Boolean);
    const numeros = itens.filter((n) => /^\d+$/.test(n));
    if (!numeros.length) {
      achados.push({ aba: 'Mapa das escalas', mensagem: `${escala}: o mapa anota “${lista}” — sem exercício a cruzar` });
      continue;
    }
    for (const numero of numeros) {
      const encontrada = licoes.find((l) => l.numeroOriginal === numero
        && l.versoes.some((v) => v.escalaReferencia === escala));
      if (!encontrada) {
        achados.push({
          aba: 'Mapa das escalas',
          mensagem: `${escala}: exercício ${numero} listado no mapa sem correspondência com a mesma escala no índice detalhado`,
        });
      }
    }
  }
  return achados;
}

export function resumirImportacao(
  licoes: LicaoImportada[],
  ocorrencias: { chave: string; linha: number; motivo: string }[],
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
      divergencias.push(`fase ${licao.fase}, ${licao.topicoCodigo}, exercício ${licao.numeroOriginal}: `
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

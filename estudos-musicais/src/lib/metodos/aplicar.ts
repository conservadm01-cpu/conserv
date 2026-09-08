/**
 * De estrutura sugerida a currículo gravado.
 *
 * O caminho é sempre o mesmo, para qualquer método:
 *
 *   analisar → AnaliseDeMetodo (SUGERIDA)
 *            → revisão humana: CONFIRMAR, EDITAR ou REJEITAR
 *            → currículo em RASCUNHO, com toda a proveniência
 *            → publicação, que é outro ato, de outra pessoa
 *
 * Duas coisas que este módulo NÃO faz, de propósito: gravar currículo sem
 * passar por uma decisão humana registrada, e publicar o que gravou.
 */

import type { TransacaoPrisma } from '../banco.ts';
import type { EstruturaSugerida, ItemSugerido, UnidadeSugerida } from './estrutura.ts';
import { achatar, contarEstrutura, garantirCodigosUnicos } from './estrutura.ts';

/** Serve tanto ao cliente administrativo quanto a uma transação com usuário. */
type Cliente = TransacaoPrisma;

export type Decisao = 'CONFIRMAR' | 'EDITAR' | 'REJEITAR';

export interface DadosDaAnalise {
  metodoId: string;
  documentoId?: string | null;
  estrutura: EstruturaSugerida;
  origem?: string;
}

/**
 * Registra o que o analisador propôs. Fica em SUGERIDA: nada de currículo
 * ainda, nada visível para aluno. É a fila de revisão do responsável.
 */
export async function registrarAnalise(prisma: Cliente, dados: DadosDaAnalise) {
  const contagem = contarEstrutura(dados.estrutura);
  return prisma.analiseDeMetodo.create({
    data: {
      metodoId: dados.metodoId,
      documentoId: dados.documentoId ?? null,
      origem: dados.origem ?? dados.estrutura.analisador,
      estruturaSugerida: dados.estrutura as unknown as object,
      resumo: { ...dados.estrutura.resumo, ...contagem } as unknown as object,
      avisos: dados.estrutura.avisos as unknown as object,
      status: 'SUGERIDA',
    },
  });
}

export interface Revisao {
  analiseId: string;
  decisao: Decisao;
  revisorId: string;
  parecer?: string | null;
  /** Presente só em EDITAR: a estrutura como a pessoa a corrigiu. */
  estruturaEditada?: EstruturaSugerida;
  rotuloDoCurriculo?: string;
}

/**
 * A decisão humana. CONFIRMAR grava a estrutura como veio; EDITAR grava a
 * estrutura corrigida; REJEITAR não grava nada e diz por quê.
 *
 * Quem revisa fica registrado com nome e data, e o parecer é obrigatório
 * quando se rejeita ou se edita — a mudança precisa de justificativa legível.
 */
export async function revisarAnalise(prisma: Cliente, revisao: Revisao) {
  const analise = await prisma.analiseDeMetodo.findUnique({ where: { id: revisao.analiseId } });
  if (!analise) throw new Error(`Análise ${revisao.analiseId} não encontrada.`);
  if (analise.status !== 'SUGERIDA' && analise.status !== 'EM_REVISAO') {
    throw new Error(`Análise ${revisao.analiseId} já foi ${analise.status.toLowerCase()}; abra uma análise nova.`);
  }
  if (revisao.decisao !== 'CONFIRMAR' && !revisao.parecer?.trim()) {
    throw new Error('Editar ou rejeitar exige parecer: registre o motivo da decisão.');
  }

  if (revisao.decisao === 'REJEITAR') {
    return {
      analise: await prisma.analiseDeMetodo.update({
        where: { id: analise.id },
        data: { status: 'REJEITADA', revisadoPorId: revisao.revisorId, revisadoEm: new Date(), parecer: revisao.parecer },
      }),
      curriculo: null,
      gravado: null,
    };
  }

  const estrutura = (revisao.decisao === 'EDITAR' && revisao.estruturaEditada)
    ? revisao.estruturaEditada
    : (analise.estruturaSugerida as unknown as EstruturaSugerida);
  if (revisao.decisao === 'EDITAR' && !revisao.estruturaEditada) {
    throw new Error('EDITAR exige a estrutura corrigida; sem ela a decisão é CONFIRMAR.');
  }

  const gravado = await aplicarEstrutura(prisma, {
    metodoId: analise.metodoId,
    documentoId: analise.documentoId,
    estrutura,
    rotulo: revisao.rotuloDoCurriculo,
    analiseId: analise.id,
  });

  const atualizada = await prisma.analiseDeMetodo.update({
    where: { id: analise.id },
    data: {
      status: revisao.decisao === 'EDITAR' ? 'EDITADA' : 'CONFIRMADA',
      revisadoPorId: revisao.revisorId,
      revisadoEm: new Date(),
      parecer: revisao.parecer ?? null,
      curriculoId: gravado.curriculoId,
      ...(revisao.decisao === 'EDITAR' ? { estruturaSugerida: estrutura as unknown as object } : {}),
    },
  });

  return { analise: atualizada, curriculo: gravado.curriculoId, gravado };
}

export interface Aplicacao {
  metodoId: string;
  documentoId?: string | null;
  estrutura: EstruturaSugerida;
  rotulo?: string;
  analiseId?: string;
}

/**
 * Grava a árvore como um currículo NOVO, sempre em RASCUNHO.
 *
 * Currículo novo em vez de currículo reescrito: quem já estudou pela versão
 * anterior continua ligado a ela, com o progresso intacto.
 */
export async function aplicarEstrutura(prisma: Cliente, dados: Aplicacao) {
  const metodo = await prisma.metodo.findUnique({ where: { id: dados.metodoId } });
  if (!metodo) throw new Error(`Método ${dados.metodoId} não encontrado.`);

  const estrutura = dados.estrutura;
  // Reaplica a checagem de código único: a estrutura pode ter sido editada à mão.
  const renomeadas = garantirCodigosUnicos(estrutura.unidades);

  const ultima = await prisma.curriculo.findFirst({
    where: { metodoId: metodo.id },
    orderBy: { versao: 'desc' },
    select: { versao: true },
  });
  const versao = (ultima?.versao ?? 0) + 1;

  const curriculo = await prisma.curriculo.create({
    data: {
      metodoId: metodo.id,
      rotulo: dados.rotulo ?? `${metodo.nome} — estrutura ${versao}`,
      versao,
      descricao: `Gerado pelo analisador "${estrutura.analisador}"`
        + (dados.documentoId ? ' a partir do documento de origem.' : '.'),
      status: 'RASCUNHO',
      origemAnaliseId: dados.analiseId ?? null,
    },
  });

  const idPorCaminho = new Map<string, string>();
  const agrupamentosUsados = new Set<string>();
  let unidadesGravadas = 0;
  let licoesGravadas = 0;
  let versoesGravadas = 0;

  for (const { unidade, caminho, profundidade, caminhoDoPai } of achatar(estrutura.unidades)) {
    const criada = await prisma.unidadeCurricular.create({
      data: {
        curriculoId: curriculo.id,
        paiId: caminhoDoPai ? idPorCaminho.get(caminhoDoPai) ?? null : null,
        tipo: unidade.tipo,
        codigo: unidade.codigo,
        nome: unidade.nome,
        descricao: unidade.descricao,
        ordem: unidade.ordem,
        profundidade,
        caminho,
        documentoOrigemId: dados.documentoId ?? null,
        paginaOrigemInicio: unidade.paginaInicio,
        paginaOrigemFim: unidade.paginaFim,
        referenciaOrigem: unidade.referencia ?? unidade.fonte,
        statusConferencia: unidade.statusConferencia,
      },
    });
    idPorCaminho.set(caminho, criada.id);
    unidadesGravadas++;

    const gravadas = await gravarItens(prisma, {
      unidadeId: criada.id,
      metodoId: metodo.id,
      instrumentoId: metodo.instrumentoId,
      compartilhado: metodo.conteudoCompartilhado,
      documentoId: dados.documentoId ?? null,
      itens: unidade.itens,
    });
    licoesGravadas += gravadas.licoes;
    versoesGravadas += gravadas.versoes;
    for (const id of gravadas.agrupamentos) agrupamentosUsados.add(id);
  }

  return {
    curriculoId: curriculo.id,
    versao,
    unidades: unidadesGravadas,
    licoes: licoesGravadas,
    versoes: versoesGravadas,
    agrupamentos: agrupamentosUsados.size,
    renomeadas,
  };
}

/**
 * Itens de uma unidade. Toda lição nasce em RASCUNHO: importar não publica.
 * A proveniência (método, instrumento, unidade, documento, página, referência)
 * é gravada junto, não em anexo.
 */
async function gravarItens(prisma: Cliente, dados: {
  unidadeId: string;
  metodoId: string;
  instrumentoId: string | null;
  compartilhado: boolean;
  documentoId: string | null;
  itens: ItemSugerido[];
}) {
  let licoes = 0;
  let versoes = 0;
  const agrupamentos = new Set<string>();

  for (const item of dados.itens) {
    const licao = await prisma.licao.create({
      data: {
        unidadeId: dados.unidadeId,
        metodoId: dados.metodoId,
        instrumentoId: dados.instrumentoId,
        numeroOriginal: item.numeroOriginal,
        variante: item.variante,
        titulo: item.titulo,
        tipo: item.tipo,
        ordemPedagogica: item.ordem,
        compartilhado: dados.compartilhado,
        documentoOrigemId: dados.documentoId,
        paginaOrigemInicio: item.paginaInicio,
        paginaOrigemFim: item.paginaFim,
        referenciaOrigem: item.referencia,
        fonte: item.fonte,
        observacoes: [item.observacoes, ...item.pendencias].filter(Boolean).join(' | ') || null,
        statusConferencia: item.statusConferencia,
        statusPublicacao: 'RASCUNHO',
      },
    });
    licoes++;

    for (const versao of item.versoes) {
      await prisma.versaoLicao.create({
        data: {
          licaoId: licao.id,
          clave: versao.clave ?? 'SOL',
          criterioClave: versao.criterioClave,
          paginaImpressaInicio: versao.paginaInicio,
          paginaImpressaFim: versao.paginaFim,
          paginaArquivoInicio: versao.paginaArquivoInicio,
          paginaArquivoFim: versao.paginaArquivoFim,
          armadura: versao.armadura,
          escalaReferencia: versao.escalaReferencia,
          compassos: versao.compassos,
          tipoLeitura: versao.tipoLeitura,
          observacoes: versao.observacoes,
          fonte: versao.fonte,
          statusConferencia: versao.statusConferencia,
        },
      });
      versoes++;
    }

    for (const grupo of item.agrupamentos) {
      const agrupamento = await prisma.agrupamento.upsert({
        where: { tipo_valor: { tipo: grupo.tipo as never, valor: grupo.valor } },
        update: { rotulo: grupo.rotulo },
        create: { tipo: grupo.tipo as never, valor: grupo.valor, rotulo: grupo.rotulo },
      });
      agrupamentos.add(agrupamento.id);
      await prisma.licaoAgrupamento.create({ data: { licaoId: licao.id, agrupamentoId: agrupamento.id } });
    }
  }

  return { licoes, versoes, agrupamentos };
}

/**
 * Publicar é ato à parte, do responsável pedagógico. O que ainda está
 * DIVERGENTE nunca é publicado junto: fica em rascunho, listado no retorno.
 */
export async function publicarCurriculo(prisma: Cliente, curriculoId: string, opcoes: {
  publicarPendentes?: boolean;
} = {}) {
  const situacoesLiberadas = opcoes.publicarPendentes
    ? (['CONFERIDO', 'PENDENTE_CONFERENCIA'] as const)
    : (['CONFERIDO'] as const);

  const unidades = await prisma.unidadeCurricular.findMany({ where: { curriculoId }, select: { id: true } });
  const ids = unidades.map((u) => u.id);

  const publicadas = await prisma.licao.updateMany({
    where: { unidadeId: { in: ids }, statusConferencia: { in: [...situacoesLiberadas] } },
    data: { statusPublicacao: 'PUBLICADO' },
  });
  const retidas = await prisma.licao.count({
    where: { unidadeId: { in: ids }, statusPublicacao: 'RASCUNHO' },
  });

  await prisma.curriculo.update({
    where: { id: curriculoId },
    data: { status: 'PUBLICADO', vigenteDe: new Date() },
  });

  return { publicadas: publicadas.count, retidas };
}

/** A subárvore de uma unidade, numa consulta só, pelo caminho materializado. */
export async function subarvore(prisma: Cliente, unidade: { curriculoId: string; caminho: string }) {
  return prisma.unidadeCurricular.findMany({
    where: { curriculoId: unidade.curriculoId, caminho: { startsWith: `${unidade.caminho}/` } },
    orderBy: [{ profundidade: 'asc' }, { ordem: 'asc' }],
  });
}

/** Só para leitura em memória (prévia da importação, telas de revisão). */
export function resumirEstrutura(estrutura: EstruturaSugerida) {
  const contagem = contarEstrutura(estrutura);
  const primeiras = estrutura.unidades.slice(0, 3).map((u: UnidadeSugerida) =>
    `${u.tipo} ${u.codigo} — ${u.nome} (${u.filhas.length} subunidades, ${u.itens.length} itens)`);
  return { ...contagem, avisos: estrutura.avisos.length, amostra: primeiras };
}

/**
 * Isolamento pedagógico entre métodos.
 *
 * A regra, em uma frase: conteúdo de um método NÃO entra em outro. As duas
 * únicas exceções são explícitas e precisam existir juntas:
 *
 *   1. a lição está marcada como compartilhada (`compartilhado = true`), e
 *   2. o método de origem está autorizado para o instrumento em questão
 *      (uma linha em MetodoInstrumento).
 *
 * Sem as duas, o conteúdo não aparece — e é por isso que um exercício de um
 * método de violino nunca cai na jornada de quem estuda saxofone, e um
 * critério de avaliação de um método nunca é aplicado a outro.
 *
 * Nada aqui pergunta o nome do método. Tudo é dado.
 */

import type { TransacaoPrisma } from '../banco.ts';

/** Serve tanto ao cliente administrativo quanto a uma transação com usuário. */
type Cliente = TransacaoPrisma;

export interface Jornada {
  metodoId: string;
  instrumentoId: string | null;
}

export interface LicaoParaIsolamento {
  id: string;
  metodoId: string;
  instrumentoId: string | null;
  compartilhado: boolean;
}

export interface Autorizacao {
  metodoId: string;
  instrumentoId: string;
}

/**
 * Decide, em memória, se uma lição pode aparecer numa jornada — e diz por quê,
 * para a tela poder explicar em vez de sumir com o conteúdo em silêncio.
 */
export function podeAparecerNaJornada(
  licao: LicaoParaIsolamento,
  jornada: Jornada,
  autorizacoes: Autorizacao[],
): { permitido: boolean; motivo: string } {
  if (licao.metodoId === jornada.metodoId) {
    return { permitido: true, motivo: 'conteúdo do próprio método da jornada' };
  }
  if (!licao.compartilhado) {
    return { permitido: false, motivo: 'conteúdo de outro método, não marcado como compartilhado' };
  }
  if (!jornada.instrumentoId) {
    return { permitido: false, motivo: 'jornada sem instrumento: não há autorização a verificar' };
  }
  const autorizado = autorizacoes.some(
    (a) => a.metodoId === licao.metodoId && a.instrumentoId === jornada.instrumentoId,
  );
  if (!autorizado) {
    return { permitido: false, motivo: 'método de origem não autorizado para o instrumento desta jornada' };
  }
  if (licao.instrumentoId && licao.instrumentoId !== jornada.instrumentoId) {
    return { permitido: false, motivo: 'lição escrita para outro instrumento' };
  }
  return { permitido: true, motivo: 'conteúdo compartilhado, com autorização para este instrumento' };
}

/**
 * O filtro equivalente, para ir ao banco em vez de trazer tudo e peneirar:
 * ou é do método da jornada, ou é compartilhado de um método autorizado para
 * o instrumento dela.
 */
export async function filtroDeConteudo(prisma: Cliente, jornada: Jornada) {
  const autorizados = jornada.instrumentoId
    ? (await prisma.metodoInstrumento.findMany({
      where: { instrumentoId: jornada.instrumentoId },
      select: { metodoId: true },
    })).map((a) => a.metodoId)
    : [];

  const alcance = autorizados.filter((id) => id !== jornada.metodoId);

  return {
    OR: [
      { metodoId: jornada.metodoId },
      ...(alcance.length
        ? [{
          metodoId: { in: alcance },
          compartilhado: true,
          OR: [{ instrumentoId: null }, { instrumentoId: jornada.instrumentoId }],
        }]
        : []),
    ],
  };
}

/**
 * Os métodos que alcançam um instrumento: os que foram escritos para ele e os
 * transversais autorizados. É a lista que a central do instrutor usa para
 * oferecer "instrumento → método → turma → unidade".
 */
export async function metodosDoInstrumento(prisma: Cliente, instrumentoId: string) {
  return prisma.metodo.findMany({
    where: {
      status: { not: 'INATIVO' },
      OR: [
        { instrumentoId },
        { autorizacoes: { some: { instrumentoId } } },
      ],
    },
    orderBy: [{ escopo: 'asc' }, { nome: 'asc' }],
    include: {
      instrumento: { select: { nome: true } },
      curriculos: {
        where: { status: 'PUBLICADO' },
        orderBy: { versao: 'desc' },
        take: 1,
        select: { id: true, rotulo: true, versao: true },
      },
      _count: { select: { competencias: true } },
    },
  });
}

/**
 * Os critérios do método, como estão gravados. Quem chama resolve com
 * `criteriosDoMetodo` — e nunca busca a configuração "do outro método".
 */
export async function configuracoesDoMetodo(prisma: Cliente, metodoId: string) {
  const linhas = await prisma.configuracaoDoMetodo.findMany({
    where: { metodoId, vigenteAte: null },
    orderBy: { versao: 'desc' },
  });
  // Uma linha por chave: a versão mais recente vigente vence.
  const porChave = new Map<string, (typeof linhas)[number]>();
  for (const linha of linhas) if (!porChave.has(linha.chave)) porChave.set(linha.chave, linha);
  return [...porChave.values()].map((linha) => ({
    chave: linha.chave,
    valor: linha.valor as unknown,
    versao: linha.versao,
  }));
}

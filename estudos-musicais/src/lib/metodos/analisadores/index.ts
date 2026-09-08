/**
 * Registro de analisadores.
 *
 * É aqui que "cadastrar um método novo" deixa de ser mudança de arquitetura:
 * a plataforma escolhe o analisador pelo FORMATO do documento, nunca pelo
 * método. Um método novo com um formato já conhecido não exige linha de
 * código; um formato novo exige um analisador novo e uma linha nesta lista.
 */

import type { Analisador, DocumentoParaAnalise, EstruturaSugerida } from '../estrutura.ts';
import { analisadorDeIndiceEmPlanilha } from './indice-em-planilha.ts';
import { analisadorDeSumarioEmTexto } from './sumario-em-texto.ts';

export const ANALISADORES: Analisador[] = [
  analisadorDeIndiceEmPlanilha,
  analisadorDeSumarioEmTexto,
];

export function analisadorPorId(id: string): Analisador | undefined {
  return ANALISADORES.find((a) => a.id === id);
}

/** O primeiro analisador que aceita o documento. Nenhum aceita → erro claro. */
export function escolherAnalisador(documento: DocumentoParaAnalise): Analisador {
  const escolhido = ANALISADORES.find((a) => a.aceita(documento));
  if (!escolhido) {
    throw new Error(`Nenhum analisador lê "${documento.nomeArquivo}" (${documento.tipoArquivo}). `
      + `Disponíveis: ${ANALISADORES.map((a) => `${a.id} — ${a.descricao}`).join(' | ')}`);
  }
  return escolhido;
}

/**
 * Analisar é SEMPRE só propor. Quem grava currículo é `aplicar.ts`, e só
 * depois de uma pessoa confirmar a estrutura.
 */
export function analisarDocumento(
  documento: DocumentoParaAnalise,
  opcoes: Record<string, unknown> = {},
  analisador: Analisador = escolherAnalisador(documento),
): EstruturaSugerida {
  return analisador.analisar(documento, opcoes);
}

export { analisadorDeIndiceEmPlanilha, analisadorDeSumarioEmTexto };

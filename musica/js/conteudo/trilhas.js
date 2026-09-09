// As trilhas do aluno.
//
// Este arquivo era o lugar onde as fases nasciam: ele lia as listas do código
// e distribuía os identificadores. Hoje quem faz isso é o catálogo, que lê o
// cadastro — é o que permite um método de dezesseis fases existir sem que
// ninguém edite o programa.
//
// O arquivo continua aqui, com a mesma assinatura de sempre, porque as telas e
// os testes o chamam. Ele passou a ser um adaptador fino.

import * as catalogo from '../servicos/catalogo.js';
import { METODO_INSTRUMENTO, METODO_MSA } from '../dados/semente.js';

export function trilhasDoAluno(instrumentoId, opcoes = {}) {
  const catalogado = catalogo.trilhasDoAluno(instrumentoId, opcoes);
  const doMetodo = (id) => {
    const trilha = catalogado.trilhas.find((t) => t.metodo.id === id);
    return trilha ? trilha.fases : [];
  };
  return {
    ...catalogado,
    // Nomes antigos, mantidos para não quebrar quem já os usa. Código novo
    // deve percorrer `trilhas`, que não conhece método nenhum pelo nome.
    msa: doMetodo(METODO_MSA),
    instrumento: doMetodo(METODO_INSTRUMENTO),
    dadosDoInstrumento: catalogado.instrumento,
  };
}

export const faseporId = (id, instrumentoId, opcoes = {}) =>
  catalogo.faseDoAluno(id, instrumentoId, opcoes);

export const TOTAL_DE_FASES_MSA = () => catalogo.totalDeFases(METODO_MSA);
export const TOTAL_DE_FASES_INSTRUMENTO = () => catalogo.totalDeFases(METODO_INSTRUMENTO);

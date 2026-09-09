// Semente: transforma o conteúdo que já existe em js/conteudo/ nos registros
// das entidades do V2.
//
// O que muda e o que NÃO muda:
//
//   Muda   — o cadastro. Antes o aplicativo sabia "de cor" que existiam dez
//            fases do MSA e quatro do instrumento. Agora isso é dado: há uma
//            linha por método, por fase, por lição, por jogo e por avaliação,
//            e o aplicativo lê essas linhas. Um método com 16 ou 20 fases
//            entra sem tocar em uma linha de código.
//
//   Não muda — o conteúdo. O texto das lições, os geradores de questões e os
//            jogos continuam exatamente onde estavam. Nada foi reescrito,
//            resumido ou inventado aqui: cada registro aponta para o conteúdo
//            de origem por referência (conteudoRef).

import { FASES } from '../conteudo/fases.js';
import { FASES_INSTRUMENTO } from '../conteudo/fases-instrumento.js';
import { INSTRUMENTOS } from '../conteudo/instrumentos.js';
import { QUESTOES_POR_PROVA, NOTA_MINIMA } from '../quiz.js';

export const METODO_MSA = 'msa';
export const METODO_INSTRUMENTO = 'instrumento';

const FONTE_MSA = 'Método Simplificado de Aprendizagem Musical (MSA) — Congregação Cristã no Brasil, 1ª edição, dez/2022.';
// Registrado tal como está declarado em js/conteudo/instrumentos.js: o método
// impresso de cada instrumento não foi fornecido, e o conteúdo desta trilha é
// a técnica padrão do instrumento somada à teoria do MSA.
const FONTE_INSTRUMENTO = 'Técnica padrão do instrumento somada à teoria do MSA. O método impresso do instrumento não foi fornecido; este conteúdo não o substitui.';

export function instrumentosDaSemente() {
  return INSTRUMENTOS.map((i) => ({
    id: i.id,
    nome: i.nome,
    familia: i.familia,
    familiaNome: i.familiaNome,
    claves: [...i.claves],
    afinacao: i.afinacao || '',
    transposicao: i.transposicao ? { ...i.transposicao } : null,
    ativo: true,
  }));
}

export function metodosDaSemente() {
  return [
    {
      id: METODO_MSA,
      nome: 'Teoria — MSA',
      descricao: 'A teoria musical do MSA, fase a fase, na ordem dos assuntos do livro.',
      instrumentoIds: [],
      universal: true,      // vale para todo aluno, seja qual for o instrumento
      porInstrumento: false,
      ordem: 1,
      fonte: FONTE_MSA,
      ativo: true,
    },
    {
      id: METODO_INSTRUMENTO,
      nome: 'Método do instrumento',
      descricao: 'A trilha que corre ao lado do MSA e muda conforme o instrumento do aluno.',
      instrumentoIds: INSTRUMENTOS.map((i) => i.id),
      universal: false,
      porInstrumento: true, // o conteúdo é apresentado conforme o instrumento
      ordem: 2,
      fonte: FONTE_INSTRUMENTO,
      ativo: true,
    },
  ];
}

// As fases do MSA mantêm exatamente os identificadores que sempre tiveram
// ('1' a '10') e as do instrumento os seus ('inst1' a 'inst4'). É o que faz o
// progresso já gravado continuar valendo depois da atualização.
export function fasesDaSemente() {
  const doMsa = FASES.map((f, i) => ({
    id: String(f.numero),
    metodoId: METODO_MSA,
    ordem: f.numero,
    titulo: f.titulo,
    subtitulo: f.subtitulo || '',
    resumo: f.resumo || '',
    icone: f.icone || '',
    cor: f.cor || '',
    paginas: f.paginas || null,
    anteriorId: i > 0 ? String(FASES[i - 1].numero) : null,
    conteudoRef: f.id,
  }));
  const doInstrumento = FASES_INSTRUMENTO.map((f, i) => ({
    id: f.id,
    metodoId: METODO_INSTRUMENTO,
    ordem: f.ordem,
    titulo: f.titulo,
    subtitulo: f.subtitulo || '',
    resumo: f.resumo || '',
    icone: f.icone || '',
    cor: f.cor || '',
    paginas: null,
    anteriorId: i > 0 ? FASES_INSTRUMENTO[i - 1].id : null,
    conteudoRef: f.id,
  }));
  return [...doMsa, ...doInstrumento];
}

const licoesDe = (fase, faseId) => (fase.licoes || []).map((licao, i) => ({
  id: `${faseId}-l${i + 1}`,
  faseId,
  ordem: i + 1,
  titulo: licao.titulo,
  pagina: licao.pagina === undefined ? null : licao.pagina,
  conteudoRef: String(i),   // o índice da lição dentro da fase, em js/conteudo/
}));

const jogosDe = (fase, faseId) => (fase.jogos || []).map((jogo, i) => ({
  id: `${faseId}-j${i + 1}`,
  faseId,
  ordem: i + 1,
  tipo: jogo.tipo,
  modo: jogo.modo || '',
  baralho: jogo.baralho || '',
  titulo: jogo.titulo,
  descricao: jogo.descricao || '',
}));

export function licoesDaSemente() {
  return [
    ...FASES.flatMap((f) => licoesDe(f, String(f.numero))),
    ...FASES_INSTRUMENTO.flatMap((f) => licoesDe(f, f.id)),
  ];
}

export function jogosDaSemente() {
  return [
    ...FASES.flatMap((f) => jogosDe(f, String(f.numero))),
    ...FASES_INSTRUMENTO.flatMap((f) => jogosDe(f, f.id)),
  ];
}

// Uma avaliação por fase, com a regra que o aplicativo já aplicava: dez
// questões e nota mínima 70. Ficam aqui como dado, e não mais fixas no código,
// para que um método novo possa ter outra quantidade ou outra nota mínima.
export function avaliacoesDaSemente() {
  return fasesDaSemente().map((fase) => ({
    id: `av-${fase.id}`,
    faseId: fase.id,
    titulo: `Avaliação — ${fase.titulo}`,
    quantidadeDeQuestoes: QUESTOES_POR_PROVA,
    notaMinima: NOTA_MINIMA,
    geradorRef: fase.id,    // o universo de questões da fase, em js/conteudo/geradores.js
  }));
}

// Questões e exercícios ficam vazios de propósito.
//
// As questões da prova são geradas na hora pelos geradores da fase, com a
// regra de nunca repetir a mesma pergunta para o mesmo aluno — não há um banco
// fixo a semear, e inventar um seria criar conteúdo que não está nas fontes.
// A entidade existe para guardar questões escritas à mão no futuro, que
// entrarão com status "rascunho" até revisão humana.
export const questoesDaSemente = () => [];
export const exerciciosDaSemente = () => [];

// O catálogo completo, pronto para ser gravado.
export function semear() {
  return {
    instrumentos: instrumentosDaSemente(),
    metodos: metodosDaSemente(),
    fases: fasesDaSemente(),
    licoes: licoesDaSemente(),
    exercicios: exerciciosDaSemente(),
    jogos: jogosDaSemente(),
    avaliacoes: avaliacoesDaSemente(),
    questoes: questoesDaSemente(),
  };
}

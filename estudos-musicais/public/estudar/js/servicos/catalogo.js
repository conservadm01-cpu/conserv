// Catálogo: o que existe para estudar.
//
// Esta é a peça que tira as fases de dentro do código. Antes, o aplicativo
// sabia "de cor" que existiam dez fases do MSA e quatro do instrumento; para
// acrescentar um método era preciso editar o programa. Agora ele pergunta ao
// cadastro: quais métodos servem a este instrumento, quais fases essa versão
// tem, em que ordem. Dez, dezesseis ou vinte — a quantidade é dado.
//
// O TEXTO das lições continua onde sempre esteve, em js/conteudo/, porque é
// código que desenha pentagramas e monta tabelas. A fase cadastrada aponta
// para ele por `conteudoRef`. Um método importado por arquivo não tem código:
// as lições dele trazem o próprio corpo, e o catálogo entrega os dois do mesmo
// jeito para quem desenha a tela.

import * as R from '../dados/repositorios.js';
import { FASES } from '../conteudo/fases.js';
import { FASES_INSTRUMENTO } from '../conteudo/fases-instrumento.js';

// ---------------------------------------------------- índice do conteúdo

// Uma fase de código é encontrada pelo apelido que a fase cadastrada guarda.
const CONTEUDO = new Map();
for (const f of FASES) CONTEUDO.set(f.id, f);
for (const f of FASES_INSTRUMENTO) CONTEUDO.set(f.id, f);

export const temConteudoEmCodigo = (conteudoRef) => CONTEUDO.has(conteudoRef);

// Lição cujo corpo veio de um arquivo importado: o corpo é texto guardado, e
// entra na tela como parágrafos — nunca como HTML solto, que abriria a porta
// para um arquivo de método injetar script na página.
const paragrafos = (texto) => String(texto || '')
  .split(/\n{2,}/)
  .map((bloco) => bloco.trim())
  .filter(Boolean)
  .map((bloco) => `<p>${escaparTexto(bloco).replace(/\n/g, '<br>')}</p>`)
  .join('');

const escaparTexto = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------ montagem

function licoesDaFase(fase, doCodigo) {
  const cadastradas = R.licoesDaFase(fase.id);

  // Fase com conteúdo em código: o cadastro diz quais lições existem e em que
  // ordem; o código diz o que cada uma mostra.
  if (doCodigo && doCodigo.licoes) {
    if (!cadastradas.length) return doCodigo.licoes;
    return cadastradas.map((linha) => {
      const original = doCodigo.licoes[Number(linha.conteudoRef)] || {};
      return { ...original, titulo: linha.titulo || original.titulo, pagina: linha.pagina ?? original.pagina };
    });
  }

  // Fase de método importado: o corpo está no próprio cadastro.
  return cadastradas.map((linha) => ({
    titulo: linha.titulo,
    pagina: linha.pagina,
    corpo: () => paragrafos(linha.corpo),
  }));
}

function jogosDaFase(fase, doCodigo) {
  const cadastrados = R.jogosDaFase(fase.id);
  if (cadastrados.length) {
    return cadastrados.map((j) => ({
      tipo: j.tipo, modo: j.modo || undefined, baralho: j.baralho || undefined,
      titulo: j.titulo, descricao: j.descricao,
    }));
  }
  return (doCodigo && doCodigo.jogos) || [];
}

// A fase pronta para a tela: junta o cadastro, o conteúdo e o contexto do
// instrumento do aluno. É o formato que o aplicativo desenha.
export function montarFase(fase, { metodo, versao, instrumento = null, anterior = null }) {
  const doCodigo = CONTEUDO.get(fase.conteudoRef);
  const porInstrumento = Boolean(metodo && metodo.porInstrumento);
  const nomeDoMetodo = porInstrumento && instrumento
    ? `Método — ${instrumento.nome}`
    : (metodo ? metodo.nome : 'Método');

  return {
    ...(doCodigo || {}),
    id: fase.id,
    numero: fase.ordem,
    ordem: fase.ordem,
    titulo: fase.titulo,
    subtitulo: fase.subtitulo,
    resumo: fase.resumo,
    icone: fase.icone || '🎵',
    cor: fase.cor || '#2f9e6b',
    paginas: porInstrumento ? null : fase.paginas,
    notaMinima: fase.notaMinima || 0,
    anteriorId: anterior ? anterior.id : (fase.anteriorId || null),
    metodoId: fase.metodoId,
    versaoId: fase.versaoId || (versao ? versao.id : null),
    trilha: fase.metodoId,
    nomeTrilha: nomeDoMetodo,
    contexto: porInstrumento ? instrumento : null,
    instrumento: porInstrumento && instrumento ? instrumento.nome : null,
    licoes: licoesDaFase(fase, doCodigo),
    jogos: jogosDaFase(fase, doCodigo),
  };
}

// ------------------------------------------------------ trilhas do aluno

// Os métodos que servem a um instrumento, cada um com as suas fases prontas.
// `matriculas` restringe às matrículas do aluno quando elas existirem; sem
// matrícula nenhuma, mostram-se os métodos que servem ao instrumento — é o que
// mantém funcionando o aparelho que ainda não tem matrícula gravada.
export function trilhasDoAluno(instrumentoId, { matriculas = null } = {}) {
  const instrumento = instrumentoId ? R.instrumentos.buscar(instrumentoId) : null;
  const metodos = matriculas && matriculas.length
    ? matriculas.map((m) => R.metodos.buscar(m.metodoId)).filter(Boolean)
    : R.metodosDoInstrumento(instrumentoId || '');

  const vistos = new Set();
  const trilhas = [];

  for (const metodo of metodos) {
    if (!metodo || vistos.has(metodo.id)) continue;
    vistos.add(metodo.id);

    // O método do instrumento não abre sem instrumento escolhido.
    if (metodo.porInstrumento && !instrumento) continue;

    const matricula = matriculas ? matriculas.find((m) => m.metodoId === metodo.id) : null;
    const versao = matricula && matricula.versaoId
      ? R.versoes.buscar(matricula.versaoId) || R.versaoVigente(metodo.id)
      : R.versaoVigente(metodo.id);

    const cadastradas = (versao ? R.fasesDaVersao(versao.id) : R.fasesDoMetodo(metodo.id))
      .filter((f) => f.ativo !== false);

    const fases = cadastradas.map((fase, i) =>
      montarFase(fase, { metodo, versao, instrumento, anterior: i > 0 ? cadastradas[i - 1] : null }));

    trilhas.push({ metodo, versao, matricula, instrumento, fases });
  }

  return {
    instrumento,
    trilhas,
    todas: trilhas.flatMap((t) => t.fases),
  };
}

export function faseDoAluno(faseId, instrumentoId, { matriculas = null } = {}) {
  return trilhasDoAluno(instrumentoId, { matriculas }).todas.find((f) => f.id === String(faseId)) || null;
}

// Quantas fases tem um método hoje. Existe para que nenhuma tela precise
// contar "de cor": ela pergunta.
export const totalDeFases = (metodoId) => R.fasesDoMetodo(metodoId).filter((f) => f.ativo !== false).length;

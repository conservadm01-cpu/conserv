// Importação de métodos.
//
// Um método de ensino chega como arquivo e vira cadastro. O caminho é
// deliberadamente em quatro passos — validar, prever, confirmar, criar — e
// não em um só, por uma razão simples: um arquivo errado importado direto
// suja o cadastro de todo mundo, e desfazer isso depois é pior do que
// conferir antes.
//
// Duas garantias desta camada:
//
//   Nada é gravado antes da confirmação. `analisar()` não toca no depósito.
//
//   Erro tem endereço. Não adianta dizer "arquivo inválido": o retorno diz
//   "Fase 4 › Lição 2 › Questão 7 — sem alternativa correta", que é o que
//   permite a alguém corrigir o arquivo.

import * as R from '../dados/repositorios.js';
import * as auditoria from './auditoria.js';
import { novoId } from '../dados/ids.js';

const texto = (v) => String(v === undefined || v === null ? '' : v).trim();
const vazio = (v) => texto(v) === '';

const erro = (onde, mensagem) => ({ onde, mensagem, gravidade: 'impede' });
const aviso = (onde, mensagem) => ({ onde, mensagem, gravidade: 'aviso' });

// ---------------------------------------------------------------- análise

// Lê o arquivo e devolve o que ele criaria, o que está errado e onde.
// Função pura: não grava nada.
export function analisar(bruto) {
  const problemas = [];
  let dados = bruto;

  if (typeof bruto === 'string') {
    try {
      dados = JSON.parse(bruto);
    } catch (e) {
      return { valido: false, problemas: [erro('Arquivo', `Não é um JSON válido: ${e.message}`)], previa: null };
    }
  }
  if (!dados || typeof dados !== 'object') {
    return { valido: false, problemas: [erro('Arquivo', 'Conteúdo vazio ou em formato desconhecido.')], previa: null };
  }

  const metodo = dados.metodo || {};
  const instrumento = dados.instrumento || null;
  const fases = Array.isArray(dados.fases) ? dados.fases : [];
  const licoes = Array.isArray(dados.licoes) ? dados.licoes : [];
  const exercicios = Array.isArray(dados.exercicios) ? dados.exercicios : [];
  const jogos = Array.isArray(dados.jogos) ? dados.jogos : [];
  const avaliacoes = Array.isArray(dados.avaliacoes) ? dados.avaliacoes : [];

  // ------ método
  if (vazio(metodo.id)) problemas.push(erro('Método', 'Sem identificador (campo "id").'));
  if (vazio(metodo.nome)) problemas.push(erro('Método', 'Sem nome.'));
  if (!vazio(metodo.id) && R.metodos.buscar(texto(metodo.id))) {
    problemas.push(erro('Método', `Já existe um método com o identificador "${texto(metodo.id)}". Escolha outro ou publique uma versão nova do existente.`));
  }
  if (!vazio(metodo.nome) && R.metodos.listar().some((m) => m.nome.toLowerCase() === texto(metodo.nome).toLowerCase())) {
    problemas.push(erro('Método', `Já existe um método chamado "${texto(metodo.nome)}".`));
  }

  // ------ instrumentos atendidos
  const instrumentoIds = Array.isArray(metodo.instrumentoIds) ? metodo.instrumentoIds.map(texto) : [];
  const universal = Boolean(metodo.universal);
  if (instrumento && !vazio(instrumento.id)) instrumentoIds.push(texto(instrumento.id));

  if (!universal && !instrumentoIds.length) {
    problemas.push(erro('Método', 'Não diz a quem serve: informe "instrumentoIds" ou marque "universal".'));
  }
  for (const id of instrumentoIds) {
    const jaExiste = R.instrumentos.buscar(id);
    const vemNoArquivo = instrumento && texto(instrumento.id) === id;
    if (!jaExiste && !vemNoArquivo) {
      problemas.push(erro('Método', `Cita o instrumento "${id}", que não está cadastrado e não vem no arquivo.`));
    }
  }
  if (instrumento) {
    if (vazio(instrumento.nome)) problemas.push(erro('Instrumento', 'Sem nome.'));
    if (R.instrumentos.buscar(texto(instrumento.id))) {
      problemas.push(aviso('Instrumento', `"${texto(instrumento.id)}" já está cadastrado — o do arquivo será ignorado.`));
    }
  }

  // ------ fases
  if (!fases.length) problemas.push(erro('Fases', 'O método não traz nenhuma fase.'));
  const idsDeFase = new Set();
  const ordens = new Set();
  fases.forEach((fase, i) => {
    const onde = `Fase ${fase.ordem ?? i + 1}`;
    if (vazio(fase.id)) problemas.push(erro(onde, 'Sem identificador.'));
    else if (idsDeFase.has(texto(fase.id))) problemas.push(erro(onde, `Identificador "${texto(fase.id)}" repetido no arquivo.`));
    else if (R.fases.buscar(texto(fase.id))) problemas.push(erro(onde, `Já existe uma fase "${texto(fase.id)}" no cadastro.`));
    else idsDeFase.add(texto(fase.id));

    if (vazio(fase.titulo)) problemas.push(erro(onde, 'Sem título.'));
    const ordem = Number(fase.ordem);
    if (!Number.isInteger(ordem) || ordem < 1) problemas.push(erro(onde, 'Ordem ausente ou inválida (precisa ser 1, 2, 3…).'));
    else if (ordens.has(ordem)) problemas.push(erro(onde, `Duas fases com a ordem ${ordem}.`));
    else ordens.add(ordem);

    if (fase.notaMinima !== undefined) {
      const nota = Number(fase.notaMinima);
      if (!Number.isFinite(nota) || nota < 0 || nota > 100) problemas.push(erro(onde, 'Nota mínima fora de 0 a 100.'));
    }
  });

  const nomeDaFase = (faseId) => {
    const fase = fases.find((f) => texto(f.id) === texto(faseId));
    return fase ? `Fase ${fase.ordem}` : `Fase "${texto(faseId)}"`;
  };

  // ------ lições
  const licoesPorFase = new Map();
  licoes.forEach((licao, i) => {
    const onde = `${nomeDaFase(licao.faseId)} › Lição ${licao.ordem ?? i + 1}`;
    if (vazio(licao.faseId)) problemas.push(erro(onde, 'Lição sem fase.'));
    else if (!idsDeFase.has(texto(licao.faseId))) problemas.push(erro(onde, `Aponta para a fase "${texto(licao.faseId)}", que não está neste arquivo.`));
    if (vazio(licao.titulo)) problemas.push(erro(onde, 'Sem título.'));
    if (vazio(licao.corpo)) problemas.push(erro(onde, 'Sem conteúdo (campo "corpo").'));
    const lista = licoesPorFase.get(texto(licao.faseId)) || [];
    lista.push(licao);
    licoesPorFase.set(texto(licao.faseId), lista);
  });
  for (const faseId of idsDeFase) {
    if (!licoesPorFase.has(faseId)) problemas.push(aviso(nomeDaFase(faseId), 'Nenhuma lição — a fase entra vazia.'));
  }

  // ------ exercícios
  exercicios.forEach((exercicio, i) => {
    const onde = `${nomeDaFase(exercicio.faseId)} › Exercício ${exercicio.ordem ?? i + 1}`;
    const temPai = !vazio(exercicio.licaoId) || !vazio(exercicio.faseId);
    if (!temPai) problemas.push(erro(onde, 'Exercício sem lição nem fase.'));
    if (!vazio(exercicio.faseId) && !idsDeFase.has(texto(exercicio.faseId))) {
      problemas.push(erro(onde, `Aponta para a fase "${texto(exercicio.faseId)}", que não está neste arquivo.`));
    }
    if (vazio(exercicio.titulo)) problemas.push(erro(onde, 'Sem título.'));
  });

  // ------ jogos
  const TIPOS_DE_JOGO = ['ouvido', 'memoria', 'pentagrama', 'ritmo', 'pulso', 'teclado', 'armadura'];
  jogos.forEach((jogo, i) => {
    const onde = `${nomeDaFase(jogo.faseId)} › Jogo ${i + 1}`;
    if (!idsDeFase.has(texto(jogo.faseId))) problemas.push(erro(onde, `Aponta para a fase "${texto(jogo.faseId)}", que não está neste arquivo.`));
    if (!TIPOS_DE_JOGO.includes(texto(jogo.tipo))) {
      problemas.push(erro(onde, `Tipo de jogo "${texto(jogo.tipo)}" desconhecido. Os disponíveis são: ${TIPOS_DE_JOGO.join(', ')}.`));
    }
    if (vazio(jogo.titulo)) problemas.push(erro(onde, 'Sem título.'));
  });

  // ------ avaliações e questões
  let totalDeQuestoes = 0;
  avaliacoes.forEach((avaliacao, i) => {
    const onde = `${nomeDaFase(avaliacao.faseId)} › Avaliação`;
    if (!idsDeFase.has(texto(avaliacao.faseId))) {
      problemas.push(erro(onde, `Aponta para a fase "${texto(avaliacao.faseId)}", que não está neste arquivo.`));
    }
    const questoes = Array.isArray(avaliacao.questoes) ? avaliacao.questoes : [];
    if (!questoes.length) problemas.push(erro(onde, 'Avaliação sem questões.'));

    const quantidade = Number(avaliacao.quantidadeDeQuestoes || questoes.length);
    if (questoes.length && quantidade > questoes.length) {
      problemas.push(aviso(onde, `Pede ${quantidade} questões por prova mas traz ${questoes.length}: as perguntas vão se repetir.`));
    }

    questoes.forEach((questao, j) => {
      const ondeQ = `${nomeDaFase(avaliacao.faseId)} › Avaliação › Questão ${j + 1}`;
      totalDeQuestoes += 1;
      if (vazio(questao.enunciado)) problemas.push(erro(ondeQ, 'Sem enunciado.'));
      const alternativas = Array.isArray(questao.alternativas) ? questao.alternativas.map(texto) : [];
      if (alternativas.length < 2) problemas.push(erro(ondeQ, 'Precisa de pelo menos duas alternativas.'));
      if (new Set(alternativas).size !== alternativas.length) problemas.push(erro(ondeQ, 'Alternativas repetidas.'));
      if (vazio(questao.correta)) problemas.push(erro(ondeQ, 'Não diz qual é a resposta correta.'));
      else if (alternativas.length && !alternativas.includes(texto(questao.correta))) {
        problemas.push(erro(ondeQ, `A resposta correta ("${texto(questao.correta)}") não está entre as alternativas.`));
      }
    });
  });

  const impedimentos = problemas.filter((p) => p.gravidade === 'impede');

  return {
    valido: impedimentos.length === 0,
    problemas,
    impedimentos: impedimentos.length,
    avisos: problemas.length - impedimentos.length,
    previa: {
      metodo: { id: texto(metodo.id), nome: texto(metodo.nome), descricao: texto(metodo.descricao),
        universal, instrumentoIds: [...new Set(instrumentoIds)], fonte: texto(metodo.fonte) },
      versao: texto((dados.versao || {}).rotulo) || '1.0',
      instrumento: instrumento ? { id: texto(instrumento.id), nome: texto(instrumento.nome) } : null,
      fases: fases.length,
      licoes: licoes.length,
      exercicios: exercicios.length,
      jogos: jogos.length,
      avaliacoes: avaliacoes.length,
      questoes: totalDeQuestoes,
      listaDeFases: fases.map((f) => ({
        ordem: Number(f.ordem), titulo: texto(f.titulo),
        licoes: (licoesPorFase.get(texto(f.id)) || []).length,
        jogos: jogos.filter((j) => texto(j.faseId) === texto(f.id)).length,
        questoes: avaliacoes.filter((a) => texto(a.faseId) === texto(f.id))
          .reduce((s, a) => s + (Array.isArray(a.questoes) ? a.questoes.length : 0), 0),
      })).sort((a, b) => a.ordem - b.ordem),
    },
    dados,
  };
}

// ------------------------------------------------------------ importação

// Grava o que a análise aprovou. Recusa-se a rodar se a análise não passou —
// não existe "importar assim mesmo".
export function importar(bruto) {
  const analise = analisar(bruto);
  if (!analise.valido) {
    const erro = new Error('O arquivo tem problemas que impedem a importação.');
    erro.analise = analise;
    throw erro;
  }

  const dados = analise.dados;
  const metodo = dados.metodo;
  const criados = { instrumentos: 0, fases: 0, licoes: 0, exercicios: 0, jogos: 0, avaliacoes: 0, questoes: 0 };

  if (dados.instrumento && !R.instrumentos.buscar(texto(dados.instrumento.id))) {
    R.instrumentos.criar({ ...dados.instrumento, id: texto(dados.instrumento.id), ativo: true });
    criados.instrumentos += 1;
  }

  const metodoCriado = R.metodos.criar({
    id: texto(metodo.id),
    nome: texto(metodo.nome),
    descricao: texto(metodo.descricao),
    instrumentoIds: analise.previa.metodo.instrumentoIds,
    universal: analise.previa.metodo.universal,
    porInstrumento: Boolean(metodo.porInstrumento),
    ordem: Number(metodo.ordem) || (R.metodos.contar() + 1),
    fonte: texto(metodo.fonte),
    ativo: true,
  });

  const versao = R.versoes.criar({
    id: `${metodoCriado.id}-${analise.previa.versao}`,
    metodoId: metodoCriado.id,
    rotulo: analise.previa.versao,
    situacao: 'publicada',
    publicadaEm: new Date().toISOString(),
    notas: texto((dados.versao || {}).notas),
    ordem: 1,
  });

  const fasesOrdenadas = [...dados.fases].sort((a, b) => Number(a.ordem) - Number(b.ordem));
  fasesOrdenadas.forEach((fase, i) => {
    R.fases.criar({
      id: texto(fase.id),
      metodoId: metodoCriado.id,
      versaoId: versao.id,
      ordem: Number(fase.ordem),
      titulo: texto(fase.titulo),
      subtitulo: texto(fase.subtitulo),
      resumo: texto(fase.resumo),
      icone: texto(fase.icone) || '🎵',
      cor: texto(fase.cor) || '#2f9e6b',
      paginas: fase.paginas || null,
      anteriorId: i > 0 ? texto(fasesOrdenadas[i - 1].id) : null,
      conteudoRef: texto(fase.conteudoRef),
      notaMinima: Number(fase.notaMinima) || 0,
      ativo: true,
    });
    criados.fases += 1;
  });

  for (const [i, licao] of (dados.licoes || []).entries()) {
    R.licoes.criar({
      id: texto(licao.id) || `${texto(licao.faseId)}-l${i + 1}`,
      faseId: texto(licao.faseId),
      ordem: Number(licao.ordem) || i + 1,
      titulo: texto(licao.titulo),
      pagina: licao.pagina ?? null,
      corpo: texto(licao.corpo),
    });
    criados.licoes += 1;
  }

  for (const [i, exercicio] of (dados.exercicios || []).entries()) {
    R.exercicios.criar({
      id: texto(exercicio.id) || novoId('e'),
      licaoId: texto(exercicio.licaoId) || null,
      faseId: texto(exercicio.faseId) || null,
      ordem: Number(exercicio.ordem) || i + 1,
      titulo: texto(exercicio.titulo),
      enunciado: texto(exercicio.enunciado),
      tipo: texto(exercicio.tipo),
      corpo: texto(exercicio.corpo),
    });
    criados.exercicios += 1;
  }

  for (const [i, jogo] of (dados.jogos || []).entries()) {
    R.jogos.criar({
      id: texto(jogo.id) || `${texto(jogo.faseId)}-j${i + 1}`,
      faseId: texto(jogo.faseId),
      ordem: Number(jogo.ordem) || i + 1,
      tipo: texto(jogo.tipo),
      modo: texto(jogo.modo),
      baralho: texto(jogo.baralho),
      titulo: texto(jogo.titulo),
      descricao: texto(jogo.descricao),
    });
    criados.jogos += 1;
  }

  for (const avaliacao of (dados.avaliacoes || [])) {
    const questoes = Array.isArray(avaliacao.questoes) ? avaliacao.questoes : [];
    const criada = R.avaliacoes.criar({
      id: texto(avaliacao.id) || `av-${texto(avaliacao.faseId)}`,
      faseId: texto(avaliacao.faseId),
      titulo: texto(avaliacao.titulo) || 'Avaliação',
      quantidadeDeQuestoes: Number(avaliacao.quantidadeDeQuestoes) || questoes.length,
      notaMinima: Number(avaliacao.notaMinima) || 0,
      geradorRef: '',
    });
    criados.avaliacoes += 1;

    for (const [j, questao] of questoes.entries()) {
      R.questoes.criar({
        id: texto(questao.id) || `${criada.id}-q${j + 1}`,
        avaliacaoId: criada.id,
        enunciado: texto(questao.enunciado),
        alternativas: questao.alternativas.map(texto),
        correta: texto(questao.correta),
        explicacao: texto(questao.explicacao),
        origem: texto(questao.origem) || texto(metodo.fonte),
        // Questão importada entra valendo; questão gerada por máquina entraria
        // como rascunho, esperando revisão humana.
        status: texto(questao.status) || 'publicada',
      });
      criados.questoes += 1;
    }
  }

  auditoria.registrar({
    acao: 'metodo.importar', entidade: 'metodos', entidadeId: metodoCriado.id,
    dadosDepois: { nome: metodoCriado.nome, versao: versao.rotulo, ...criados },
  });

  return { metodo: metodoCriado, versao, criados, analise };
}

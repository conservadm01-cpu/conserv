// Avaliações.
//
// Duas mudanças de fundo em relação a como isto funcionava antes:
//
//   1. Toda tentativa fica guardada, e agora COM O DETALHE de cada questão:
//      qual gerador a produziu e se o aluno acertou. Sem esse detalhe é
//      impossível dizer a ele onde está errando — só dá para dizer que
//      errou. Guardamos o mínimo para a análise (gerador, assinatura, certo
//      ou errado), não o texto inteiro da prova.
//
//   2. A prova de uma fase sem geradores — um método importado por arquivo —
//      é montada a partir das questões cadastradas. Antes, uma fase assim
//      simplesmente não tinha avaliação.

import * as R from '../dados/repositorios.js';
import { corrigir as corrigirProva, montarProva } from '../quiz.js';
import { criarAleatorio, embaralhar, novaSemente } from '../aleatorio.js';
import { geradoresDaFase } from '../conteudo/geradores.js';
import { notaMinimaDaFase } from './progresso.js';
import * as eventos from './eventos.js';

export const temGeradores = (faseId, contexto = null) => geradoresDaFase(faseId, contexto).length > 0;

// Prova montada a partir das questões cadastradas. Serve para métodos que
// vieram de arquivo: não há código que gere perguntas, há um banco escrito.
function provaDeQuestoesCadastradas(fase, usadas, { quantidade, semente }) {
  const avaliacao = R.avaliacaoDaFase(fase.id);
  const banco = avaliacao ? R.questoesDaAvaliacao(avaliacao.id) : [];
  // Questão em rascunho não vai para prova: conteúdo gerado ou importado
  // espera revisão humana antes de valer nota.
  const aprovadas = banco.filter((q) => q.status !== 'rascunho');
  const rnd = criarAleatorio(semente);
  const jaVistas = new Set(usadas);

  let disponiveis = aprovadas.filter((q) => !jaVistas.has(q.id));
  let reciclou = false;
  if (disponiveis.length < quantidade) {
    reciclou = disponiveis.length < aprovadas.length;
    disponiveis = aprovadas;
  }

  const questoes = embaralhar(disponiveis, rnd).slice(0, quantidade).map((q, indice) => ({
    indice,
    assinatura: q.id,
    geradorId: `cadastrada:${fase.id}`,
    enunciado: q.enunciado,
    html: '',
    alternativas: embaralhar([...(q.alternativas || [])], rnd),
    correta: q.correta,
    explicacao: q.explicacao || '',
    referencia: q.origem || '',
  }));

  return {
    faseId: String(fase.id), semente, reciclou, questoes,
    ineditasRestantes: Math.max(0, aprovadas.length - jaVistas.size),
  };
}

// Monta a prova da fase, venha ela de gerador ou de banco cadastrado.
export function montar(fase, usadas = [], { quantidade = null, semente = novaSemente() } = {}) {
  const avaliacao = R.avaliacaoDaFase(fase.id);
  const quantas = quantidade || (avaliacao ? avaliacao.quantidadeDeQuestoes : 10);
  if (temGeradores(fase.id, fase.contexto)) {
    return montarProva(fase.id, usadas, { quantidade: quantas, semente, contexto: fase.contexto });
  }
  return provaDeQuestoesCadastradas(fase, usadas, { quantidade: quantas, semente });
}

export function corrigir(prova, respostas, fase = null) {
  const resultado = corrigirProva(prova, respostas);
  // A nota mínima é da fase, não do aplicativo: um método pode exigir mais.
  const minima = fase ? notaMinimaDaFase(fase) : 70;
  return { ...resultado, notaMinima: minima, aprovado: resultado.nota >= minima };
}

// O detalhe guardado por questão. Compacto de propósito: é o suficiente para
// dizer ao aluno onde ele erra, sem encher o armazenamento do aparelho com o
// texto de todas as provas que ele já fez.
const detalhePorQuestao = (resultado) => resultado.detalhes.map((d) => ({
  gerador: d.questao.geradorId || '',
  assinatura: d.questao.assinatura || '',
  certa: Boolean(d.certa),
}));

// Registra a tentativa: o resultado, o histórico de perguntas usadas, o
// progresso da fase e o evento da linha do tempo. Um lugar só, para que
// nenhuma tela precise lembrar de fazer as cinco coisas.
export function registrarTentativa({ alunoId, fase, prova, resultado, duracaoSegundos = 0, data = null }) {
  const matricula = R.matriculasDoAluno(alunoId).find((m) => m.metodoId === fase.metodoId) || null;
  // A data é a da tentativa, não a de quando o registro foi gravado. Importa
  // para o histórico: uma cópia importada meses depois não pode carimbar
  // todas as avaliações do aluno com a data da importação.
  const agora = data || new Date().toISOString();

  const registro = R.resultados.criar({
    alunoId,
    matriculaId: matricula ? matricula.id : null,
    faseId: String(fase.id),
    avaliacaoId: (R.avaliacaoDaFase(fase.id) || {}).id || `av-${fase.id}`,
    data: agora,
    nota: resultado.nota,
    acertos: resultado.acertos,
    total: resultado.total,
    aprovado: resultado.aprovado,
    respostas: detalhePorQuestao(resultado),
    duracaoSegundos,
  });

  const linha = R.progressoDoAluno(alunoId, fase.id);
  linha.matriculaId = linha.matriculaId || (matricula ? matricula.id : null);
  linha.usadas = [...linha.usadas, ...prova.questoes.map((q) => q.assinatura)];
  linha.melhorNota = Math.max(linha.melhorNota || 0, resultado.nota);
  linha.iniciadoEm = linha.iniciadoEm || agora;
  const primeiraAprovacao = resultado.aprovado && !linha.aprovadoEm;
  if (primeiraAprovacao) linha.aprovadoEm = agora;
  linha.xp = (linha.xp || 0) + resultado.acertos * 10 + (resultado.aprovado ? 50 : 0);
  linha.atualizadoEm = agora;
  R.progressos.salvar(linha);

  eventos.registrar({
    alunoId, matriculaId: linha.matriculaId, tipo: eventos.TIPOS.AVALIACAO,
    titulo: `Avaliação — Fase ${fase.numero}`,
    detalhe: `${resultado.nota}% · ${resultado.acertos} de ${resultado.total}`,
    faseId: fase.id, valor: resultado.nota, dataHora: agora,
  });

  if (primeiraAprovacao) {
    eventos.registrar({
      alunoId, matriculaId: linha.matriculaId, tipo: eventos.TIPOS.APROVACAO,
      titulo: `Aprovado na Fase ${fase.numero}`,
      detalhe: fase.titulo, faseId: fase.id, valor: resultado.nota, dataHora: agora,
    });
    avancarMatricula(matricula, fase);
  }

  return { registro, linha, primeiraAprovacao, matricula };
}

// Depois de aprovar uma fase, a matrícula aponta para a próxima. Quando não
// há próxima, ela se conclui — e é isso que faz um certificado de conclusão
// de método fazer sentido mais adiante.
function avancarMatricula(matricula, fase) {
  if (!matricula) return;
  const fases = R.fasesDoMetodo(matricula.metodoId).filter((f) => f.ativo !== false);
  const aprovadas = new Set(R.progressoDeTodasAsFases(matricula.alunoId)
    .filter((p) => p.aprovadoEm).map((p) => p.faseId));
  const pendente = fases.find((f) => !aprovadas.has(f.id));

  const mudancas = { faseAtualId: pendente ? pendente.id : fase.id };
  if (!pendente) {
    mudancas.situacao = 'concluida';
    mudancas.dataFim = new Date().toISOString();
  }
  R.matriculas.atualizar(matricula.id, mudancas);
}

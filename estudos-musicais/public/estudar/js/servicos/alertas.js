// Alertas do instrutor.
//
// O painel de um instrutor com trinta alunos é inútil se ele tiver que
// procurar quem precisa de ajuda. O que ele precisa é da lista curta: quem
// parou, quem está travado, quem concluiu.
//
// Duas decisões que evitam que isto vire ruído:
//
//   Todo alerta tem um número por trás. "Está há 12 dias sem estudar", e não
//   "parece desmotivado" — o instrutor confere e decide.
//
//   Alerta de aluno que nunca começou não se repete todo dia como se fosse
//   novidade: ele é do tipo "nunca começou", que é um fato, e não um atraso.

import * as R from '../dados/repositorios.js';
import * as eventos from './eventos.js';
import * as progresso from './progresso.js';
import * as desempenho from './desempenho.js';

export const DIAS_PARADO = 7;
export const TENTATIVAS_TRAVADO = 3;

const DIA = 86400000;
const diasDesde = (iso, agora) => (iso ? Math.floor((Date.parse(agora) - Date.parse(iso)) / DIA) : null);

export const GRAVIDADE = { ATENCAO: 'atencao', AVISO: 'aviso', BOA: 'boa' };

export function doAluno(alunoId, { agora = new Date().toISOString() } = {}) {
  const aluno = R.alunos.buscar(alunoId);
  if (!aluno) return [];
  const lista = [];
  const primeiroNome = String(aluno.nome).split(' ')[0];
  const ultima = eventos.ultimaAtividade(alunoId);

  // 1. Nunca começou.
  if (!ultima) {
    lista.push({
      alunoId, gravidade: GRAVIDADE.AVISO, chave: 'nunca-comecou',
      texto: `${primeiroNome} ainda não iniciou nenhuma atividade.`,
      desde: aluno.criadoEm,
    });
  } else {
    // 2. Parou de estudar.
    const dias = diasDesde(ultima, agora);
    if (dias >= DIAS_PARADO) {
      lista.push({
        alunoId, gravidade: dias >= DIAS_PARADO * 2 ? GRAVIDADE.ATENCAO : GRAVIDADE.AVISO,
        chave: 'parado',
        texto: `${primeiroNome} está há ${dias} dias sem estudar.`,
        desde: ultima, valor: dias,
      });
    }
  }

  // 3. Travado numa fase: tentou várias vezes e não passou.
  const situacao = progresso.situacaoDoAluno(alunoId);
  for (const matricula of situacao.matriculas) {
    const atual = matricula.situacaoDaFaseAtual;
    if (atual && !atual.aprovada && atual.tentativas >= TENTATIVAS_TRAVADO) {
      lista.push({
        alunoId, gravidade: GRAVIDADE.ATENCAO, chave: 'travado',
        texto: `${primeiroNome} tentou ${atual.tentativas} vezes a avaliação da Fase ${atual.fase.numero} (${atual.fase.titulo}); a melhor nota foi ${atual.melhorNota}%.`,
        faseId: atual.faseId, valor: atual.tentativas,
      });
    }
  }

  // 4. Dificuldade recorrente num assunto.
  for (const fraco of desempenho.pontos(alunoId).fracos) {
    lista.push({
      alunoId, gravidade: GRAVIDADE.ATENCAO, chave: 'dificuldade',
      texto: `${primeiroNome} acerta ${fraco.acerto}% em ${fraco.assunto} (${fraco.total} questões respondidas).`,
      faseId: fraco.faseId, valor: fraco.acerto,
    });
  }

  // 5. Notícia boa: concluiu uma fase nos últimos dias. O painel também
  //    serve para o instrutor saber quem parabenizar.
  for (const evento of R.eventosDoAluno(alunoId, 30)) {
    if (evento.tipo !== eventos.TIPOS.APROVACAO) continue;
    if (diasDesde(evento.dataHora, agora) > 7) continue;
    lista.push({
      alunoId, gravidade: GRAVIDADE.BOA, chave: 'concluiu',
      texto: `${primeiroNome} concluiu a ${evento.titulo.replace('Aprovado na ', '')} — ${evento.detalhe}.`,
      faseId: evento.faseId, desde: evento.dataHora,
    });
  }

  // 6. Ficha incompleta atrapalha o acompanhamento.
  if (!aluno.instrumentoId && !aluno.instrumento) {
    lista.push({
      alunoId, gravidade: GRAVIDADE.AVISO, chave: 'sem-instrumento',
      texto: `${primeiroNome} está sem instrumento definido — a trilha do método do instrumento não abre.`,
    });
  }

  return lista;
}

const ORDEM = { [GRAVIDADE.ATENCAO]: 0, [GRAVIDADE.AVISO]: 1, [GRAVIDADE.BOA]: 2 };

export function doInstrutor({ agora = new Date().toISOString(), limite = 20 } = {}) {
  return R.alunos.listar()
    .flatMap((a) => doAluno(a.id, { agora }))
    .sort((a, b) => ORDEM[a.gravidade] - ORDEM[b.gravidade])
    .slice(0, limite);
}

// A situação de um aluno em uma palavra, para a lista do painel. Nunca só por
// cor: quem não distingue as cores precisa da palavra.
export function situacaoDoAluno(alunoId, { agora = new Date().toISOString() } = {}) {
  const alertas = doAluno(alunoId, { agora });
  if (alertas.some((a) => a.gravidade === GRAVIDADE.ATENCAO)) {
    return { chave: 'atencao', texto: 'precisa de atenção', icone: '🔴' };
  }
  if (alertas.some((a) => a.gravidade === GRAVIDADE.AVISO)) {
    return { chave: 'aviso', texto: 'acompanhar', icone: '🟡' };
  }
  const ultima = eventos.ultimaAtividade(alunoId);
  if (!ultima) return { chave: 'aviso', texto: 'não começou', icone: '🟡' };
  return { chave: 'em-dia', texto: 'em dia', icone: '🟢' };
}

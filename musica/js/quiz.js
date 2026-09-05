// Motor da avaliação. A regra da casa: a mesma pergunta nunca cai duas vezes
// para o mesmo aluno. Cada pergunta gerada tem uma assinatura; as assinaturas
// já usadas ficam guardadas e são descontadas do sorteio seguinte.

import { criarAleatorio, embaralhar, novaSemente } from './aleatorio.js';
import { universoDaFase } from './conteudo/geradores.js';

export const QUESTOES_POR_PROVA = 10;
export const NOTA_MINIMA = 70;

export function perguntasIneditas(fase, usadas) {
  const jaVistas = new Set(usadas);
  return universoDaFase(fase).filter((item) => !jaVistas.has(item.assinatura)).length;
}

/**
 * Monta uma prova espalhando as perguntas entre os geradores da fase, para
 * que a avaliação cubra assuntos diferentes e não caia tudo no mesmo ponto.
 */
export function montarProva(fase, usadas = [], { quantidade = QUESTOES_POR_PROVA, semente = novaSemente() } = {}) {
  const rnd = criarAleatorio(semente);
  const universo = universoDaFase(fase);
  const jaVistas = new Set(usadas);
  let disponiveis = universo.filter((item) => !jaVistas.has(item.assinatura));
  let reciclou = false;

  // Só quando o aluno já esgotou o repertório inédito da fase é que voltamos
  // a usar as perguntas mais antigas — e o app avisa isso na tela.
  if (disponiveis.length < quantidade) {
    reciclou = true;
    const antigas = usadas.slice(0, Math.max(0, quantidade - disponiveis.length) + 20);
    const conjunto = new Set(antigas);
    disponiveis = disponiveis.concat(universo.filter((item) => conjunto.has(item.assinatura)));
  }

  // Agrupa por gerador e vai pegando um de cada, em rodadas.
  const porGerador = new Map();
  for (const item of embaralhar(disponiveis, rnd)) {
    if (!porGerador.has(item.gerador.id)) porGerador.set(item.gerador.id, []);
    porGerador.get(item.gerador.id).push(item);
  }
  const filas = embaralhar([...porGerador.values()], rnd);
  const escolhidos = [];
  let rodada = 0;
  while (escolhidos.length < quantidade && rodada < 200) {
    let pegouAlgum = false;
    for (const fila of filas) {
      if (escolhidos.length >= quantidade) break;
      if (fila.length > rodada) { escolhidos.push(fila[rodada]); pegouAlgum = true; }
    }
    if (!pegouAlgum) break;
    rodada++;
  }

  const questoes = embaralhar(escolhidos, rnd).slice(0, quantidade).map((item, indice) => {
    const montada = item.gerador.montar(item.variante, rnd);
    return {
      indice,
      assinatura: item.assinatura,
      geradorId: item.gerador.id,
      enunciado: montada.enunciado,
      html: montada.html || '',
      alternativas: montada.alternativas,
      correta: montada.correta,
      explicacao: montada.explicacao,
      referencia: montada.referencia,
    };
  });

  return { fase, semente, reciclou, questoes, ineditasRestantes: universo.length - jaVistas.size };
}

export function corrigir(prova, respostas) {
  const detalhes = prova.questoes.map((q, i) => ({
    questao: q,
    resposta: respostas[i] ?? null,
    certa: respostas[i] === q.correta,
  }));
  const acertos = detalhes.filter((d) => d.certa).length;
  const nota = Math.round((acertos / prova.questoes.length) * 100);
  return { detalhes, acertos, total: prova.questoes.length, nota, aprovado: nota >= NOTA_MINIMA };
}

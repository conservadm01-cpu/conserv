/**
 * MÓDULO INDUSTRIAL — ordens de produção
 *
 * Uma ordem de produção aqui não é uma linha só: é a cadeia inteira que a peça
 * percorre. Abrir uma ordem de 2.000 camisetas cria a ordem do corte, a da
 * estamparia, a da preparação, a da costura e a do acabamento — cada uma com
 * a sua dependência, porque a costura não começa antes de a gola existir.
 *
 * O que o ambiente entrega:
 *   abrirOrdem      valida a engenharia, explode, calcula e abre a cadeia
 *   resumoDaOrdem   o estado da ordem: etapas, faltas, custo e progresso
 *   cancelarOrdem   antes de produzir; depois disso, o caminho é encerrar
 *   encerrarOrdem   fecha a ordem e baixa a carteira
 */

import {
  prepararIndustrial, registrarHistorico, localDoDepartamento, disponivelEmProcesso,
  num, arredondar, uid, agoraISO, hojeISO, alerta,
} from './modelo.mjs';
import {
  consolidarCarteira, planoDeProducao, explodirBOM, calcularMRP, calcularCapacidade,
  wipDaCarteira, realizadoVersusBudget, liberarParaCostura,
} from './motores.mjs';
import { conferirEngenharia } from './cadastro.mjs';
import { novaLinhaCarteira } from './modelo.mjs';
import { reservarParaOrdem, liberarReservasDaOrdem, reservasDaOrdem } from './reservas.mjs';
import { gerarRequisicoes } from './compras.mjs';

const itemDaOrdem = (db, id) => (db.industrial.itens || []).find((i) => i.id === id) || null;
const setorDaOrdem = (db, id) => (db.departamentos || []).find((d) => d.id === id) || null;

/** Código da ordem: OP-2026-0001, contado por ano. */
function proximoCodigoOrdem(db) {
  const ano = hojeISO().slice(0, 4);
  const doAno = (db.industrial.consolidacoes || []).filter(
    (c) => String(c.codigoOrdem || '').startsWith(`OP-${ano}-`)
  );
  return `OP-${ano}-${String(doAno.length + 1).padStart(4, '0')}`;
}

/** Uma consolidação só não é ordem enquanto ninguém gerou o plano dela. */
const temPlano = (db, consolidacaoId) =>
  (db.industrial.demandas || []).some((d) => d.consolidacaoId === consolidacaoId);

/* ====================================================== abrir ordem */

/**
 * Abre uma ordem de produção para um produto acabado.
 *
 * A ordem não abre com engenharia pela metade: se algum item da árvore não
 * tem receita, setor, tempo ou custo, a recusa lista o que falta em vez de
 * deixar a fábrica descobrir no meio do lote.
 */
export function abrirOrdem(db, dados, usuario) {
  prepararIndustrial(db);
  const produto = itemDaOrdem(db, dados.itemId);
  if (!produto) return { erro: 'Escolha o produto.' };
  if (produto.tipo !== 'PRODUTO_ACABADO') {
    return { erro: `${produto.nome} não é produto acabado — ordem se abre para o que se vende.` };
  }
  const quantidade = num(dados.quantidade);
  if (!(quantidade > 0)) return { erro: 'Informe a quantidade a produzir.' };

  const conferencia = conferirEngenharia(db, produto.id);
  if (!conferencia.pronto) {
    return {
      erro: `A engenharia de ${produto.nome} está incompleta: ${conferencia.pendencias[0]}`,
      pendencias: conferencia.pendencias,
    };
  }

  /* a ordem nasce de uma linha de carteira: é o mesmo caminho do pedido que
     veio do comercial, e mantém a carteira como origem única da demanda */
  const linha = novaLinhaCarteira(db, {
    itemId: produto.id,
    clienteId: dados.clienteId || '',
    pedido: String(dados.pedido || '').trim(),
    quantidade,
    dataPrometida: dados.entrega || '',
    prioridade: num(dados.prioridade) || 5,
    observacao: String(dados.observacao || '').trim(),
    responsavelId: dados.responsavelId || '',
    centroCustoId: dados.centroCustoId || '',
    linhaProducao: String(dados.linhaProducao || '').trim(),
  });
  if (linha.erro) return linha;
  linha.registro.origem = 'ordem';

  return planejarLinhaDeCarteira(db, linha.registro, dados, usuario);
}

/**
 * O planejamento industrial de uma linha de carteira já existente: consolida,
 * gera o plano, reserva o material que existe e requisita o que falta.
 *
 * Fica separado de `abrirOrdem` porque a linha pode nascer de dois lugares —
 * aqui dentro, ou de uma ordem aberta no módulo Produção do sistema. O motor
 * é o mesmo; muda só quem pediu.
 */
export function planejarLinhaDeCarteira(db, registroLinha, dados, usuario) {
  prepararIndustrial(db);
  const produto = itemDaOrdem(db, registroLinha.itemId);
  if (!produto) return { erro: 'Produto da linha não encontrado.' };
  const quantidade = num(registroLinha.quantidade);
  const linha = { registro: registroLinha };

  const consolidacao = consolidarCarteira(db, {
    linhaIds: [linha.registro.id],
    nome: dados.nomeDaOrdem || `${produto.nome} · ${quantidade}`,
  });
  if (consolidacao.erro) return consolidacao;
  consolidacao.consolidacao.tipo = 'ordem';
  consolidacao.consolidacao.origem = 'ordem';
  /* uma ordem aberta no módulo Produção traz o próprio código (OP-0001): o
     industrial não inventa um segundo número para a mesma ordem */
  consolidacao.consolidacao.codigoOrdem = dados.codigoOrdem || proximoCodigoOrdem(db);
  consolidacao.consolidacao.ordemSistemaId = dados.ordemSistemaId || '';

  const plano = planoDeProducao(db, { consolidacaoId: consolidacao.consolidacao.id, usuario });
  if (plano.erro) return plano;
  if (!plano.planos[0] || plano.planos[0].demandas.length === 0) {
    return {
      erro: `Nada a produzir: a estrutura de ${produto.nome} não gerou etapa nenhuma. `
        + 'Confira as transformações do produto.',
    };
  }

  /* V2 §52 — a ordem reserva o material que existe assim que nasce. Sem isso,
     duas ordens contam com a mesma malha e a segunda descobre no corte. */
  const parametros = db.industrial.parametros || {};
  let reserva = { feitas: [], faltantes: [] };
  if (parametros.reservarAoAbrirOrdem !== false) {
    const mrp = plano.planos[0].mrp;
    reserva = reservarParaOrdem(db, consolidacao.consolidacao.id,
      mrp.linhas.filter((l) => l.materialId).map((l) => ({
        materialId: l.materialId, itemId: l.itemId, nome: l.nome, unidade: l.unidade,
        /* reserva o que a ordem vai consumir, limitado ao que existe */
        quantidade: arredondar(Math.min(num(l.bruta), num(l.fisico)), 4),
      })), usuario);
    consolidacao.consolidacao.status = reserva.faltantes.length === 0 ? 'reservada' : 'em_producao';
    for (const ordem of plano.planos[0].ordens) {
      ordem.reservaFeita = reserva.faltantes.length === 0;
      if (ordem.reservaFeita && ordem.status === 'planejada') ordem.status = 'reservada';
    }
  }

  /* V2 §7 — o que faltou vira requisição de compra, não atalho de recebimento */
  let requisicoes = { criadas: [], puladas: [] };
  if (dados.gerarRequisicoes !== false) {
    const mrp = plano.planos[0].mrp;
    const faltas = mrp.linhas.filter((l) => l.comprar > 0);
    if (faltas.length) {
      requisicoes = gerarRequisicoes(db, {
        linhas: faltas,
        consolidacaoId: consolidacao.consolidacao.id,
        dataNecessidade: dados.entrega || '',
        prioridade: num(dados.prioridade) || 5,
        origem: 'ordem',
      }, usuario);
      if (requisicoes.erro) requisicoes = { criadas: [], puladas: [], erro: requisicoes.erro };
    }
  }

  registrarHistorico(db, {
    tipo: 'ordem', itemId: produto.id, quantidade, usuario: usuario?.nome || '',
    motivo: `${consolidacao.consolidacao.codigoOrdem} aberta: ${quantidade} ${produto.nome}`
      + `${reserva.feitas.length ? ` · ${reserva.feitas.length} material(is) reservado(s)` : ''}`
      + `${requisicoes.criadas.length ? ` · ${requisicoes.criadas.length} requisição(ões)` : ''}`,
  });

  return {
    ordem: consolidacao.consolidacao,
    plano: plano.planos[0],
    alertas: plano.alertas,
    custoPlanejado: plano.custoPlanejado,
    reserva,
    requisicoes,
  };
}

/* ==================================================== estado da ordem */

/**
 * O estado da ordem, do jeito que o chão de fábrica pergunta: em que etapa
 * está, o que falta para a próxima começar e quanto já custou.
 */
export function resumoDaOrdem(db, consolidacaoId) {
  prepararIndustrial(db);
  const ordem = (db.industrial.consolidacoes || []).find((c) => c.id === consolidacaoId);
  if (!ordem) return { erro: 'Ordem não encontrada.' };

  const produto = itemDaOrdem(db, (ordem.produtos[0] || {}).itemId);
  const quantidade = num((ordem.produtos[0] || {}).quantidade);
  const linhas = (db.industrial.carteira || []).filter((l) => l.consolidacaoId === ordem.id);
  const cliente = (db.clientes || []).find((c) => c.id === (linhas[0] || {}).clienteId);

  const demandas = (db.industrial.demandas || [])
    .filter((d) => d.consolidacaoId === ordem.id)
    .sort((a, b) => b.nivel - a.nivel);

  /* Quem produz cada item dentro desta ordem — serve para separar a falta que
     é problema (material que não existe) da falta que é só sequência (a
     costura esperando o corte, o que é a vida normal de uma ordem). */
  const produzidoPor = new Map();
  for (const d of demandas) {
    for (const saida of d.saidas || []) {
      const dep = setorDaOrdem(db, d.departamentoId);
      produzidoPor.set(saida.itemId, dep ? dep.nome : '');
    }
  }

  const etapas = demandas.map((d) => {
    const processo = (db.industrial.ordens || []).find((o) => o.demandaId === d.id) || null;
    const dep = setorDaOrdem(db, d.departamentoId);
    const execucoes = (db.industrial.execucoes || []).filter((e) => e.demandaId === d.id);
    const faltas = [];
    for (const entrada of d.entradas || []) {
      const it = itemDaOrdem(db, entrada.itemId);
      if (!it || it.materialId) continue;      // material do almoxarifado tem tela própria
      const restante = Math.max(num(d.quantidade) - num(d.produzido), 0);
      if (!(restante > 0)) continue;
      const proporcao = num(d.quantidade) > 0 ? restante / num(d.quantidade) : 0;
      const precisa = arredondar(num(entrada.quantidade) * proporcao, 3);
      const tem = arredondar(disponivelEmProcesso(db, it.id), 3);
      if (tem + 0.0001 < precisa) {
        faltas.push({
          itemId: it.id, nome: it.nome, falta: arredondar(precisa - tem, 3),
          unidade: it.unidade, tem,
          /* vazio quando é falta de verdade; com o setor quando é só a fila */
          esperando: produzidoPor.get(it.id) || '',
        });
      }
    }
    return {
      demandaId: d.id,
      ordemId: processo ? processo.id : '',
      codigo: processo ? processo.codigo : '',
      departamentoId: d.departamentoId,
      departamento: dep ? dep.nome : '',
      item: (itemDaOrdem(db, d.itemId) || {}).nome || '',
      nivel: d.nivel,
      planejado: num(d.quantidade),
      produzido: num(d.produzido),
      saldo: arredondar(num(d.quantidade) - num(d.produzido), 3),
      percentual: num(d.quantidade) > 0 ? arredondar((num(d.produzido) / num(d.quantidade)) * 100, 1) : 0,
      minutosPrevistos: num(d.minutos),
      minutosReais: arredondar(execucoes.reduce((s, e) => s + num(e.minutos), 0), 1),
      execucoes: execucoes.length,
      status: d.status,
      faltas,
      podeComecar: faltas.length === 0 && d.status !== 'atendida',
      emEstoque: arredondar(disponivelEmProcesso(db, d.itemId, localDoDepartamento(dep)), 3),
    };
  });

  const comparacao = realizadoVersusBudget(db, ordem.id);
  const budget = (db.industrial.budgets || []).find((b) => b.consolidacaoId === ordem.id);
  const acabadas = etapas.length ? num(etapas[etapas.length - 1].produzido) : 0;
  const atrasada = !!(ordem.produtos[0] || {}).prazo
    && (ordem.produtos[0] || {}).prazo < hojeISO() && acabadas < quantidade;

  const alertas = [];
  for (const etapa of etapas) {
    for (const falta of etapa.faltas) {
      if (falta.esperando) continue;   // está na fila do setor anterior, não é falta
      alertas.push(alerta('componente_faltante',
        `${etapa.departamento}: faltam ${falta.falta} ${falta.nome}.`, { itemId: falta.itemId }));
    }
  }
  if (atrasada) {
    alertas.push(alerta('prazo_risco',
      `Entrega prometida para ${(ordem.produtos[0] || {}).prazo} e faltam `
      + `${arredondar(quantidade - acabadas, 0)} peças.`));
  }
  if (!comparacao.erro) alertas.push(...comparacao.alertas);

  const reservas = reservasDaOrdem(db, consolidacaoId);
  return {
    ordem,
    codigo: ordem.codigoOrdem || ordem.codigo,
    origem: ordem.origem === 'ordem' ? 'ordem' : 'carteira',
    reservas,
    materialReservado: arredondar(reservas.filter((r) => r.status === 'ativa')
      .reduce((s, r) => s + num(r.saldo), 0), 3),
    produto: produto ? produto.nome : '',
    produtoId: produto ? produto.id : '',
    quantidade,
    acabadas,
    percentual: quantidade > 0 ? arredondar((acabadas / quantidade) * 100, 1) : 0,
    cliente: cliente ? (cliente.nomeFantasia || cliente.nome) : '',
    pedido: (linhas[0] || {}).pedido || '',
    entrega: (ordem.produtos[0] || {}).prazo || '',
    atrasada,
    situacao: ordem.status,
    etapas,
    proxima: etapas.find((e) => e.status !== 'atendida' && e.podeComecar) || null,
    travada: etapas.find((e) => e.status !== 'atendida' && !e.podeComecar) || null,
    custoPlanejado: budget ? budget.custoIndustrial : 0,
    custoPorPecaPlanejado: budget ? budget.custoPorPeca : 0,
    custoReal: comparacao.erro ? 0 : comparacao.realizado,
    desvio: comparacao.erro ? 0 : comparacao.desvio,
    comparacao: comparacao.erro ? null : comparacao,
    alertas,
  };
}

/**
 * A lista do ambiente de ordens.
 *
 * Entra tudo o que virou plano: a ordem aberta aqui e a carteira consolidada
 * no ambiente industrial. São a mesma coisa para o chão de fábrica — muda só
 * de onde a demanda veio, e isso aparece na coluna de origem.
 */
export function ordensDeProducao(db, opcoes = {}) {
  prepararIndustrial(db);
  const todas = (db.industrial.consolidacoes || [])
    .filter((c) => c.codigoOrdem || c.tipo === 'ordem' || temPlano(db, c.id))
    .map((c) => resumoDaOrdem(db, c.id))
    .filter((r) => !r.erro);
  const abertas = todas.filter((r) => r.situacao !== 'concluida' && r.situacao !== 'cancelada');
  return {
    ordens: todas.sort((a, b) => String(b.codigo).localeCompare(String(a.codigo))),
    abertas: abertas.length,
    atrasadas: abertas.filter((r) => r.atrasada).length,
    pecasAbertas: arredondar(abertas.reduce((s, r) => s + (r.quantidade - r.acabadas), 0), 0),
    custoPlanejado: arredondar(abertas.reduce((s, r) => s + r.custoPlanejado, 0), 2),
  };
}

/* ================================================= cancelar e encerrar */

/** Cancelar só antes de produzir: depois disso, o caminho é encerrar. */
export function cancelarOrdem(db, consolidacaoId, motivo, usuario) {
  prepararIndustrial(db);
  const ordem = (db.industrial.consolidacoes || []).find((c) => c.id === consolidacaoId);
  if (!ordem) return { erro: 'Ordem não encontrada.' };
  if (ordem.status === 'cancelada') return { erro: 'Esta ordem já foi cancelada.' };
  if (!String(motivo || '').trim()) {
    return { erro: 'Informe o motivo — quem procurar esta ordem depois precisa saber por que ela parou.' };
  }
  const produziu = (db.industrial.execucoes || []).some((e) => e.consolidacaoId === consolidacaoId);
  if (produziu) {
    return {
      erro: 'Esta ordem já tem produção apontada. Cancelar apagaria uma história que aconteceu — '
        + 'encerre a ordem com o que foi produzido.',
    };
  }

  ordem.status = 'cancelada';
  ordem.canceladaEm = agoraISO();
  ordem.motivoCancelamento = String(motivo).trim();
  /* V2 §52 — cancelar devolve o material reservado ao estoque livre */
  const devolvido = liberarReservasDaOrdem(db, consolidacaoId, `Ordem cancelada: ${motivo}`, usuario);
  for (const d of db.industrial.demandas || []) {
    if (d.consolidacaoId === consolidacaoId) d.status = 'cancelada';
  }
  for (const o of db.industrial.ordens || []) {
    if (o.consolidacaoId === consolidacaoId) o.status = 'cancelada';
  }
  for (const l of db.industrial.carteira || []) {
    if (l.consolidacaoId === consolidacaoId) l.status = 'cancelada';
  }
  registrarHistorico(db, {
    tipo: 'ordem', usuario: usuario?.nome || '',
    valorAnterior: 'em produção', valorNovo: 'cancelada',
    motivo: `${ordem.codigoOrdem || ordem.codigo}: ${String(motivo).trim()}`
      + `${devolvido.reservas ? ` · ${devolvido.reservas} reserva(s) liberada(s)` : ''}`,
  });
  return { ordem, reservasLiberadas: devolvido.reservas, materialDevolvido: devolvido.liberado };
}

/**
 * Encerra a ordem com o que foi produzido. Fechar com saldo é decisão de
 * gestão, não erro — mas fica registrado quanto faltou.
 */
export function encerrarOrdem(db, consolidacaoId, dados, usuario) {
  prepararIndustrial(db);
  const resumo = resumoDaOrdem(db, consolidacaoId);
  if (resumo.erro) return resumo;
  const ordem = resumo.ordem;
  if (ordem.status === 'concluida') return { erro: 'Esta ordem já está encerrada.' };

  const saldo = arredondar(resumo.quantidade - resumo.acabadas, 3);
  if (saldo > 0 && !String((dados || {}).motivo || '').trim()) {
    return {
      erro: `Faltam ${saldo} peça(s) para completar a ordem. Para encerrar assim, informe o motivo.`,
      saldo,
    };
  }

  ordem.status = 'concluida';
  ordem.encerradaEm = agoraISO();
  ordem.saldoNaoProduzido = saldo;
  /* o que sobrou reservado volta a ser estoque livre */
  const devolvido = liberarReservasDaOrdem(db, consolidacaoId, 'Ordem encerrada', usuario);
  ordem.motivoEncerramento = String((dados || {}).motivo || '').trim();
  for (const l of db.industrial.carteira || []) {
    if (l.consolidacaoId === consolidacaoId) l.status = 'concluida';
  }
  for (const o of db.industrial.ordens || []) {
    if (o.consolidacaoId === consolidacaoId && o.status !== 'cancelada') o.status = 'concluida';
  }
  registrarHistorico(db, {
    tipo: 'ordem', quantidade: resumo.acabadas, usuario: usuario?.nome || '',
    valorAnterior: 'em produção', valorNovo: 'encerrada',
    motivo: `${resumo.codigo}: ${resumo.acabadas} de ${resumo.quantidade}`
      + `${saldo > 0 ? ` · saldo ${saldo} — ${ordem.motivoEncerramento}` : ''}`,
  });
  return { ordem, acabadas: resumo.acabadas, saldo,
    reservasLiberadas: devolvido.reservas, materialDevolvido: devolvido.liberado };
}

/** Conferência de componentes de uma etapa (§35), pelo id da ordem de processo. */
export function conferirComponentes(db, ordemProcessoId, usuario) {
  return liberarParaCostura(db, ordemProcessoId, usuario);
}

/** O que a ordem vai exigir do almoxarifado, e o que já existe (§25). */
export function materiaisDaOrdem(db, consolidacaoId) {
  prepararIndustrial(db);
  const ordem = (db.industrial.consolidacoes || []).find((c) => c.id === consolidacaoId);
  if (!ordem) return { erro: 'Ordem não encontrada.' };
  const produto = ordem.produtos[0] || {};
  const explosao = explodirBOM(db, produto.itemId, produto.quantidade);
  if (explosao.erro) return explosao;
  return calcularMRP(db, explosao, { consolidacaoId });
}

/** A carga que a ordem joga em cada setor (§27). */
export function capacidadeDaOrdem(db, consolidacaoId, opcoes = {}) {
  prepararIndustrial(db);
  const ordem = (db.industrial.consolidacoes || []).find((c) => c.id === consolidacaoId);
  if (!ordem) return { erro: 'Ordem não encontrada.' };
  const produto = ordem.produtos[0] || {};
  const explosao = explodirBOM(db, produto.itemId, produto.quantidade);
  if (explosao.erro) return explosao;
  return calcularCapacidade(db, explosao, { ...opcoes, quantidade: produto.quantidade });
}

/** O WIP da ordem, para o quadro de acompanhamento (§19). */
export function wipDaOrdem(db, consolidacaoId) {
  return wipDaCarteira(db, consolidacaoId);
}

/**
 * MÓDULO INDUSTRIAL V2 — reserva de material (§6, §51, §52)
 *
 * A regra que o V2 traz: estoque físico não é estoque disponível. O que já
 * está comprometido com uma ordem não pode ser prometido outra vez — senão
 * duas ordens contam com a mesma malha e a segunda descobre isso no corte.
 *
 *   físico        o que existe na prateleira
 *   reservado     o que já tem dono (uma ordem)
 *   disponível    físico − reservado, para quem não é o dono
 *   para a ordem  disponível + o que ela mesma reservou
 *
 * A reserva não move estoque: ela só declara dono. O movimento acontece no
 * consumo, e é lá que a reserva é baixada.
 */

import {
  prepararIndustrial, registrarHistorico, proximoCodigo,
  num, arredondar, uid, agoraISO, hojeISO,
} from './modelo.mjs';

const materialDaReserva = (db, id) => (db.materiais || []).find((m) => m.id === id) || null;
const itemIndustrial = (db, id) => (db.industrial.itens || []).find((i) => i.id === id) || null;

/** Todo o físico de um material no almoxarifado, somando os locais. */
export function estoqueFisico(db, materialId) {
  return arredondar((db.saldos || [])
    .filter((s) => s.materialId === materialId)
    .reduce((soma, s) => soma + num(s.fisico), 0), 4);
}

/** O que está reservado deste material, e para quem. */
export function saldoReservado(db, materialId, opcoes = {}) {
  prepararIndustrial(db);
  const ativas = (db.industrial.reservas || []).filter(
    (r) => r.materialId === materialId && r.status === 'ativa'
  );
  const total = ativas.reduce((s, r) => s + Math.max(num(r.quantidade) - num(r.atendido), 0), 0);
  const daOrdem = opcoes.consolidacaoId
    ? ativas.filter((r) => r.consolidacaoId === opcoes.consolidacaoId)
      .reduce((s, r) => s + Math.max(num(r.quantidade) - num(r.atendido), 0), 0)
    : 0;
  return {
    total: arredondar(total, 4),
    daOrdem: arredondar(daOrdem, 4),
    deOutras: arredondar(total - daOrdem, 4),
    reservas: ativas,
  };
}

/**
 * O que uma ordem pode contar como seu: o que está livre no almoxarifado mais
 * o que ela mesma já reservou. Sem `consolidacaoId`, é a visão de quem chega
 * agora — só o que está livre.
 */
export function disponivelParaOrdem(db, materialId, consolidacaoId) {
  const fisico = estoqueFisico(db, materialId);
  const reservado = saldoReservado(db, materialId, { consolidacaoId });
  return {
    fisico,
    reservado: reservado.total,
    reservadoDaOrdem: reservado.daOrdem,
    reservadoDeOutras: reservado.deOutras,
    livre: arredondar(Math.max(fisico - reservado.total, 0), 4),
    paraAOrdem: arredondar(Math.max(fisico - reservado.deOutras, 0), 4),
  };
}

/**
 * Reserva material para uma ordem. Reservar mais do que está livre é recusado
 * com o número na frente — é a informação que o PCP precisa para decidir se
 * compra, se espera ou se tira de outra ordem.
 */
export function reservarMaterial(db, dados, usuario) {
  prepararIndustrial(db);
  const mat = materialDaReserva(db, dados.materialId);
  if (!mat) return { erro: 'Material não encontrado.' };
  const quantidade = arredondar(num(dados.quantidade), 4);
  if (!(quantidade > 0)) return { erro: 'Quantidade inválida para reserva.' };

  const posicao = disponivelParaOrdem(db, mat.id, dados.consolidacaoId);
  if (quantidade > posicao.livre + 0.0001) {
    return {
      erro: `${mat.nome}: livre ${arredondar(posicao.livre, 3)} ${mat.unidadeEstoque} de `
        + `${arredondar(posicao.fisico, 3)} no estoque — ${arredondar(posicao.reservado, 3)} já `
        + 'está reservado para outra ordem.',
      posicao,
    };
  }

  const reserva = {
    id: uid(),
    codigo: proximoCodigo(db.industrial.reservas, 'RES', 5),
    materialId: mat.id,
    itemId: dados.itemId || '',
    quantidade,
    atendido: 0,
    unidade: mat.unidadeEstoque,
    consolidacaoId: dados.consolidacaoId || '',
    demandaId: dados.demandaId || '',
    ordemId: dados.ordemId || '',
    status: 'ativa',
    data: dados.data || hojeISO(),
    criadaEm: agoraISO(),
    usuario: usuario?.nome || '',
    observacao: String(dados.observacao || '').trim(),
  };
  db.industrial.reservas.push(reserva);
  registrarHistorico(db, {
    tipo: 'reserva', itemId: reserva.itemId, quantidade, usuario: usuario?.nome || '',
    motivo: `${reserva.codigo}: ${quantidade} ${mat.unidadeEstoque} de ${mat.nome}`,
  });
  return { reserva, posicao: disponivelParaOrdem(db, mat.id, dados.consolidacaoId) };
}

/** Devolve a reserva ao estoque livre. Cancelar ordem passa por aqui. */
export function cancelarReserva(db, reservaId, motivo, usuario) {
  prepararIndustrial(db);
  const reserva = (db.industrial.reservas || []).find((r) => r.id === reservaId);
  if (!reserva) return { erro: 'Reserva não encontrada.' };
  if (reserva.status !== 'ativa') return { erro: 'Esta reserva já foi encerrada.' };

  const restante = arredondar(num(reserva.quantidade) - num(reserva.atendido), 4);
  reserva.status = 'cancelada';
  reserva.encerradaEm = agoraISO();
  reserva.motivo = String(motivo || '').trim();
  registrarHistorico(db, {
    tipo: 'reserva', itemId: reserva.itemId, quantidade: restante, usuario: usuario?.nome || '',
    valorAnterior: 'ativa', valorNovo: 'cancelada',
    motivo: `${reserva.codigo} liberada${motivo ? `: ${motivo}` : ''}`,
  });
  return { reserva, liberado: restante };
}

/**
 * Baixa da reserva no consumo. O consumo real pode ser maior que o reservado
 * — e aí o excedente sai do estoque livre, o que é justamente o desvio que o
 * budget × realizado tem de mostrar.
 */
export function consumoDaReserva(db, dados, usuario) {
  prepararIndustrial(db);
  const quantidade = arredondar(num(dados.quantidade), 4);
  if (!(quantidade > 0)) return { erro: 'Quantidade inválida.' };

  const ativas = (db.industrial.reservas || []).filter(
    (r) => r.materialId === dados.materialId && r.status === 'ativa'
      && (!dados.consolidacaoId || r.consolidacaoId === dados.consolidacaoId)
  ).sort((a, b) => String(a.criadaEm).localeCompare(String(b.criadaEm)));

  let restante = quantidade;
  const baixadas = [];
  for (const reserva of ativas) {
    if (restante <= 0.0001) break;
    const saldo = arredondar(num(reserva.quantidade) - num(reserva.atendido), 4);
    if (!(saldo > 0)) continue;
    const usar = Math.min(saldo, restante);
    reserva.atendido = arredondar(num(reserva.atendido) + usar, 4);
    if (num(reserva.atendido) + 0.0001 >= num(reserva.quantidade)) {
      reserva.status = 'consumida';
      reserva.encerradaEm = agoraISO();
    }
    baixadas.push({ reservaId: reserva.id, codigo: reserva.codigo, quantidade: arredondar(usar, 4) });
    restante = arredondar(restante - usar, 4);
  }

  return {
    baixadas,
    daReserva: arredondar(quantidade - restante, 4),
    /* o que saiu sem reserva: consumo acima do planejado, ou material que
       ninguém reservou */
    doLivre: arredondar(restante, 4),
  };
}

/** As reservas de uma ordem, com o que já foi consumido. */
export function reservasDaOrdem(db, consolidacaoId) {
  prepararIndustrial(db);
  return (db.industrial.reservas || [])
    .filter((r) => r.consolidacaoId === consolidacaoId)
    .map((r) => {
      const mat = materialDaReserva(db, r.materialId);
      return {
        ...r,
        material: mat ? mat.nome : '',
        saldo: arredondar(num(r.quantidade) - num(r.atendido), 4),
      };
    });
}

/**
 * Reserva, de uma vez, o que a ordem precisa do almoxarifado. Reserva o que
 * dá: o que faltar volta na lista, para virar requisição de compra (§7).
 */
export function reservarParaOrdem(db, consolidacaoId, necessidades, usuario) {
  prepararIndustrial(db);
  const feitas = [];
  const faltantes = [];
  for (const linha of necessidades || []) {
    if (!linha.materialId || !(num(linha.quantidade) > 0)) continue;
    const posicao = disponivelParaOrdem(db, linha.materialId, consolidacaoId);
    const jaReservado = posicao.reservadoDaOrdem;
    const falta = arredondar(Math.max(num(linha.quantidade) - jaReservado, 0), 4);
    if (!(falta > 0)) continue;
    const possivel = arredondar(Math.min(falta, posicao.livre), 4);
    if (possivel > 0) {
      const r = reservarMaterial(db, {
        materialId: linha.materialId, itemId: linha.itemId || '',
        quantidade: possivel, consolidacaoId,
      }, usuario);
      if (r.erro) return r;
      feitas.push({ materialId: linha.materialId, nome: linha.nome || '', quantidade: possivel });
    }
    if (falta - possivel > 0.0001) {
      faltantes.push({
        materialId: linha.materialId, itemId: linha.itemId || '', nome: linha.nome || '',
        quantidade: arredondar(falta - possivel, 4), unidade: linha.unidade || '',
      });
    }
  }
  return { feitas, faltantes };
}

/** Libera tudo o que uma ordem tinha reservado — cancelamento e encerramento. */
export function liberarReservasDaOrdem(db, consolidacaoId, motivo, usuario) {
  prepararIndustrial(db);
  const ativas = (db.industrial.reservas || []).filter(
    (r) => r.consolidacaoId === consolidacaoId && r.status === 'ativa'
  );
  let liberado = 0;
  for (const reserva of ativas) {
    const r = cancelarReserva(db, reserva.id, motivo, usuario);
    if (!r.erro) liberado += num(r.liberado);
  }
  return { reservas: ativas.length, liberado: arredondar(liberado, 4) };
}

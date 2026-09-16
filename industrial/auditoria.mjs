/**
 * MÓDULO INDUSTRIAL V2 — auditoria e reconciliação (§33, §34)
 *
 * Um ERP industrial erra em silêncio: a estrutura aponta para um item que foi
 * apagado, a reserva fica maior que o estoque, um lote perde a origem. Nada
 * disso quebra a tela — só apodrece a conta. A auditoria existe para dizer
 * isso em voz alta, antes de o custo sair errado.
 *
 * A auditoria NÃO conserta nada sozinha (§34): ela relata. Corrigir dado real
 * é decisão de quem opera.
 */

import {
  prepararIndustrial, transformacaoQueProduz, estruturaDe, ehProduzido,
  num, arredondar, uid, agoraISO, hojeISO, TIPOS_TEMPO,
} from './modelo.mjs';
import { saldoReservado, estoqueFisico } from './reservas.mjs';

const achado = (nivel, tipo, mensagem, referencia = {}) => ({ nivel, tipo, mensagem, ...referencia });

/**
 * §33 — a varredura. Devolve erros (a conta está errada), alertas (vai dar
 * problema) e informações (vale saber).
 */
export function auditarIndustrial(db, opcoes = {}) {
  prepararIndustrial(db);
  const ind = db.industrial;
  const achados = [];
  const item = (id) => (ind.itens || []).find((i) => i.id === id) || null;

  /* ---- estrutura e engenharia ---- */
  for (const estrutura of ind.estruturas || []) {
    if (!estrutura.ativa) continue;
    const pai = item(estrutura.itemId);
    if (!pai) {
      achados.push(achado('erro', 'estrutura_quebrada',
        `Estrutura ${estrutura.codigo} aponta para um item que não existe mais.`,
        { estruturaId: estrutura.id }));
      continue;
    }
    for (const c of estrutura.componentes || []) {
      if (!item(c.itemId)) {
        achados.push(achado('erro', 'estrutura_quebrada',
          `A estrutura de ${pai.nome} tem um componente que foi removido do cadastro.`,
          { itemId: pai.id }));
      }
    }
  }

  for (const trf of ind.transformacoes || []) {
    if (trf.ativa === false) continue;
    if (!trf.departamentoId || !(db.departamentos || []).some((d) => d.id === trf.departamentoId)) {
      achados.push(achado('erro', 'transformacao_sem_setor',
        `A transformação ${trf.nome} não tem setor válido.`, { transformacaoId: trf.id }));
    }
    const minutos = (trf.operacoes || []).reduce(
      (s, o) => s + TIPOS_TEMPO.reduce((t, x) => t + num((o.tempos || {})[x.id]), 0), 0);
    if (!(minutos > 0)) {
      achados.push(achado('erro', 'transformacao_sem_tempo',
        `A transformação ${trf.nome} não tem nenhum tempo lançado — o custo de conversão sai zero.`,
        { transformacaoId: trf.id }));
    }
    for (const lado of ['entradas', 'saidas']) {
      for (const linha of trf[lado] || []) {
        if (!item(linha.itemId)) {
          achados.push(achado('erro', 'transformacao_quebrada',
            `A transformação ${trf.nome} usa um item que não existe mais (${lado}).`,
            { transformacaoId: trf.id }));
        }
      }
    }
    for (const op of trf.operacoes || []) {
      if (op.equipamentoId && !(db.equipamentos || []).some((e) => e.id === op.equipamentoId)) {
        achados.push(achado('alerta', 'maquina_inexistente',
          `${trf.nome} · ${op.nome}: a máquina apontada não está no cadastro.`,
          { transformacaoId: trf.id }));
      }
    }
  }

  /* ---- itens ---- */
  for (const i of ind.itens || []) {
    if (i.ativo === false) continue;
    if (ehProduzido(i)) {
      if (!transformacaoQueProduz(db, i.id) && !estruturaDe(db, i.id)) {
        achados.push(achado(i.tipo === 'PRODUTO_ACABADO' ? 'erro' : 'alerta', 'sem_receita',
          `${i.nome} é produzido mas não tem transformação nem estrutura.`, { itemId: i.id }));
      }
      if (levaASiMesmo(db, i.id)) {
        achados.push(achado('erro', 'dependencia_circular',
          `${i.nome} aparece dentro da própria árvore — a explosão entraria em laço.`,
          { itemId: i.id }));
      }
    } else {
      const material = i.materialId ? (db.materiais || []).find((m) => m.id === i.materialId) : null;
      const custo = num(material?.custoMedio) || num(i.custoPadrao);
      if (!(custo > 0)) {
        achados.push(achado('alerta', 'material_sem_custo',
          `${i.nome} não tem custo — todo budget que o usar sai incompleto.`, { itemId: i.id }));
      }
    }
  }

  /* ---- estoque ---- */
  for (const s of ind.estoques || []) {
    if (num(s.quantidade) < -0.0001) {
      achados.push(achado('erro', 'estoque_negativo',
        `${(item(s.itemId) || {}).nome || s.itemId} está negativo em ${s.local}.`,
        { itemId: s.itemId }));
    }
  }
  for (const saldo of db.saldos || []) {
    if (num(saldo.fisico) < -0.0001) {
      const m = (db.materiais || []).find((x) => x.id === saldo.materialId);
      achados.push(achado('erro', 'estoque_negativo',
        `${m ? m.nome : saldo.materialId} está com saldo físico negativo no almoxarifado.`,
        { materialId: saldo.materialId }));
    }
  }

  /* ---- reservas ---- */
  const materiaisReservados = [...new Set((ind.reservas || [])
    .filter((r) => r.status === 'ativa').map((r) => r.materialId))];
  for (const materialId of materiaisReservados) {
    const reservado = saldoReservado(db, materialId).total;
    const fisico = estoqueFisico(db, materialId);
    if (reservado > fisico + 0.0001) {
      const m = (db.materiais || []).find((x) => x.id === materialId);
      achados.push(achado('erro', 'reserva_maior_que_estoque',
        `${m ? m.nome : materialId}: ${arredondar(reservado, 3)} reservados para `
        + `${arredondar(fisico, 3)} em estoque.`, { materialId }));
    }
  }

  /* ---- lotes e execuções ---- */
  for (const lote of ind.lotes || []) {
    if (lote.origem === 'producao' && lote.execucaoId
      && !(ind.execucoes || []).some((e) => e.id === lote.execucaoId)) {
      achados.push(achado('erro', 'lote_sem_origem',
        `O lote ${lote.codigo} aponta para uma execução que não existe.`, { loteId: lote.id }));
    }
    if (!(num(lote.custoUnitario) > 0)) {
      achados.push(achado('alerta', 'custo_inconsistente',
        `O lote ${lote.codigo} está com custo unitário zero.`, { loteId: lote.id }));
    }
  }

  /* ---- ordens e demandas ---- */
  for (const demanda of ind.demandas || []) {
    if (!(ind.transformacoes || []).some((t) => t.id === demanda.transformacaoId)) {
      achados.push(achado('erro', 'demanda_sem_transformacao',
        `A demanda ${demanda.codigo} aponta para uma transformação que não existe.`,
        { demandaId: demanda.id }));
    }
    if ((demanda.entradas || []).length === 0) {
      achados.push(achado('alerta', 'ordem_sem_componentes',
        `A demanda ${demanda.codigo} não tem componente nenhum.`, { demandaId: demanda.id }));
    }
  }
  for (const ordem of ind.ordens || []) {
    if (!(ind.demandas || []).some((d) => d.id === ordem.demandaId)) {
      achados.push(achado('erro', 'ordem_sem_demanda',
        `A ordem ${ordem.codigo} não tem demanda ligada.`, { ordemId: ordem.id }));
    }
  }

  /* ---- compras ---- */
  for (const req of ind.requisicoesCompra || []) {
    if (req.status === 'pedida' && !(ind.pedidosCompra || []).some((p) => p.id === req.pedidoId)) {
      achados.push(achado('erro', 'requisicao_sem_pedido',
        `A requisição ${req.codigo} está como pedida, mas o pedido não existe.`,
        { requisicaoId: req.id }));
    }
    if (req.dataLimite && req.dataLimite < hojeISO() && !['recebida', 'cancelada'].includes(req.status)) {
      achados.push(achado('alerta', 'compra_atrasada',
        `${req.descricao}: compra atrasada para atendimento da produção (limite ${req.dataLimite}).`,
        { requisicaoId: req.id }));
    }
  }

  /* ---- informações ---- */
  achados.push(achado('info', 'resumo',
    `${(ind.itens || []).length} itens · ${(ind.transformacoes || []).length} transformações · `
    + `${(ind.consolidacoes || []).length} ordens · ${(ind.execucoes || []).length} execuções · `
    + `${(ind.lotes || []).length} lotes`));

  const erros = achados.filter((a) => a.nivel === 'erro');
  const alertas = achados.filter((a) => a.nivel === 'alerta');
  const informacoes = achados.filter((a) => a.nivel === 'info');

  const registro = {
    id: uid(),
    quando: agoraISO(),
    data: hojeISO(),
    usuario: opcoes.usuario?.nome || '',
    erros: erros.length,
    alertas: alertas.length,
    achados: achados.filter((a) => a.nivel !== 'info'),
  };
  if (opcoes.registrar !== false) {
    ind.auditorias = [...(ind.auditorias || []).slice(-19), registro];
  }

  return { erros, alertas, informacoes, achados, registro, limpo: erros.length === 0 };
}

/** O item aparece dentro da própria árvore? */
function levaASiMesmo(db, itemId, atual = itemId, profundidade = 0, vistos = new Set()) {
  if (profundidade > 20) return false;
  const filhos = new Set();
  const trf = transformacaoQueProduz(db, atual);
  for (const e of (trf || {}).entradas || []) filhos.add(e.itemId);
  const estrutura = estruturaDe(db, atual);
  for (const c of (estrutura || {}).componentes || []) filhos.add(c.itemId);
  for (const filho of filhos) {
    if (filho === itemId) return true;
    if (vistos.has(filho)) continue;
    vistos.add(filho);
    if (levaASiMesmo(db, itemId, filho, profundidade + 1, vistos)) return true;
  }
  return false;
}

/**
 * §34 — reconciliação: o saldo bate com o extrato?
 *
 * Confere o estoque de processo contra os movimentos, o almoxarifado contra
 * as movimentações e a reserva contra o físico. Não corrige nada: mostra a
 * diferença e deixa a decisão com quem opera.
 */
export function reconciliarEstoqueIndustrial(db) {
  prepararIndustrial(db);
  const ind = db.industrial;
  const divergencias = [];

  /* estoque entre processos × movimentos de processo */
  const porChave = new Map();
  for (const m of ind.movimentos || []) {
    const chave = `${m.itemId}|${m.local}|${m.loteId || ''}`;
    const sinal = m.sentido === 'saida' ? -1 : 1;
    porChave.set(chave, arredondar(num(porChave.get(chave)) + sinal * num(m.quantidade), 4));
  }
  for (const saldo of ind.estoques || []) {
    const chave = `${saldo.itemId}|${saldo.local}|${saldo.loteId || ''}`;
    const extrato = num(porChave.get(chave));
    if (Math.abs(extrato - num(saldo.quantidade)) > 0.0001) {
      const item = (ind.itens || []).find((i) => i.id === saldo.itemId);
      divergencias.push({
        onde: 'processo', item: item ? item.nome : saldo.itemId, local: saldo.local,
        saldo: num(saldo.quantidade), extrato, diferenca: arredondar(extrato - num(saldo.quantidade), 4),
      });
    }
    porChave.delete(chave);
  }
  for (const [chave, extrato] of porChave.entries()) {
    if (Math.abs(extrato) < 0.0001) continue;
    const [itemId, local] = chave.split('|');
    const item = (ind.itens || []).find((i) => i.id === itemId);
    divergencias.push({
      onde: 'processo', item: item ? item.nome : itemId, local,
      saldo: 0, extrato, diferenca: extrato,
    });
  }

  /* almoxarifado × movimentações do sistema */
  const porMaterial = new Map();
  for (const m of db.movimentacoes || []) {
    porMaterial.set(m.materialId,
      arredondar(num(porMaterial.get(m.materialId)) + num(m.sinal) * num(m.quantidade), 4));
  }
  for (const [materialId, extrato] of porMaterial.entries()) {
    const fisico = estoqueFisico(db, materialId);
    if (Math.abs(extrato - fisico) > 0.001) {
      const m = (db.materiais || []).find((x) => x.id === materialId);
      divergencias.push({
        onde: 'almoxarifado', item: m ? m.nome : materialId, local: 'almoxarifado',
        saldo: fisico, extrato, diferenca: arredondar(extrato - fisico, 4),
      });
    }
  }

  /* reserva × físico */
  const reservados = [...new Set((ind.reservas || [])
    .filter((r) => r.status === 'ativa').map((r) => r.materialId))];
  for (const materialId of reservados) {
    const reservado = saldoReservado(db, materialId).total;
    const fisico = estoqueFisico(db, materialId);
    if (reservado > fisico + 0.0001) {
      const m = (db.materiais || []).find((x) => x.id === materialId);
      divergencias.push({
        onde: 'reserva', item: m ? m.nome : materialId, local: 'almoxarifado',
        saldo: fisico, extrato: reservado, diferenca: arredondar(fisico - reservado, 4),
      });
    }
  }

  return {
    divergencias,
    conferido: divergencias.length === 0,
    verificadoEm: agoraISO(),
  };
}

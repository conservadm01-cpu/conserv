/**
 * MÓDULO INDUSTRIAL V2 — compras (§7, §8, §28)
 *
 * O MRP deixa de "receber material" por atalho. O caminho passa a ser o da
 * fábrica:
 *
 *   MRP → REQUISIÇÃO → PEDIDO → RECEBIMENTO → ESTOQUE → RESERVA
 *
 * Cada passo é um registro, com quem pediu, quando e por quê. E o lead time
 * entra na conta: comprar no dia da necessidade é comprar atrasado.
 */

import {
  prepararIndustrial, registrarHistorico, proximoCodigo,
  num, arredondar, uid, agoraISO, hojeISO, alerta, novoLote,
} from './modelo.mjs';
import { reservarMaterial, disponivelParaOrdem } from './reservas.mjs';

const materialDeCompra = (db, id) => (db.materiais || []).find((m) => m.id === id) || null;
const fornecedorDeCompra = (db, id) => (db.fornecedores || []).find((f) => f.id === id) || null;

const somarDias = (iso, dias) => {
  const base = new Date(`${String(iso || hojeISO()).slice(0, 10)}T00:00:00`);
  base.setDate(base.getDate() + num(dias));
  return base.toISOString().slice(0, 10);
};

/** §8 — data em que a compra precisa ser colocada para chegar a tempo. */
export function dataLimiteDeCompra(db, materialId, dataNecessidade) {
  prepararIndustrial(db);
  const mat = materialDeCompra(db, materialId);
  const lead = num(mat?.leadTimeDias) || num((db.industrial.parametros || {}).leadTimePadraoDias) || 0;
  const limite = somarDias(dataNecessidade || hojeISO(), -lead);
  return { leadTimeDias: lead, dataLimite: limite, atrasada: limite < hojeISO() };
}

/* ====================================================== entrada de estoque
   Uma porta só para material entrar: recebimento de compra, devolução ou
   ajuste passam por aqui, para o extrato do almoxarifado contar a mesma
   história que o industrial. */

export function entradaDeMaterial(db, dados, usuario) {
  const mat = materialDeCompra(db, dados.materialId);
  if (!mat) return { erro: 'Material não encontrado.' };
  const quantidade = arredondar(num(dados.quantidade), 4);
  if (!(quantidade > 0)) return { erro: 'Quantidade inválida.' };
  const estoque = (db.estoques || []).find((e) => e.padrao) || (db.estoques || [])[0];
  if (!estoque) return { erro: 'Nenhum local de estoque cadastrado.' };

  const custoUnitario = num(dados.custoUnitario) || num(mat.custoMedio);
  db.movimentacoes = db.movimentacoes || [];
  const movimento = {
    id: uid(),
    numero: `MOV-IND-${String((db.movimentacoes || []).length + 1).padStart(5, '0')}`,
    quando: agoraISO(),
    data: dados.data || hojeISO(),
    materialId: mat.id,
    estoqueId: estoque.id,
    tipo: dados.tipo || 'entrada_compra',
    sinal: 1,
    quantidade,
    unidade: mat.unidadeEstoque,
    custoUnitario,
    custoTotal: arredondar(custoUnitario * quantidade, 4),
    fornecedorId: dados.fornecedorId || mat.fornecedorPadraoId || '',
    origemTipo: dados.origemTipo || 'recebimento',
    origemId: dados.origemId || '',
    documento: dados.documento || '',
    observacao: dados.observacao || '',
    usuario: usuario?.nome || '',
  };
  db.movimentacoes.push(movimento);

  db.saldos = db.saldos || [];
  const saldo = db.saldos.find((s) => s.materialId === mat.id && s.estoqueId === estoque.id);
  if (saldo) saldo.fisico = arredondar(num(saldo.fisico) + quantidade, 4);
  else {
    db.saldos.push({
      id: uid(), materialId: mat.id, estoqueId: estoque.id,
      fisico: quantidade, reservado: 0, comprometido: 0, transito: 0,
    });
  }

  /* custo médio: entrada com preço diferente move a média do almoxarifado */
  if (custoUnitario > 0) {
    const anterior = num(mat.custoMedio);
    const saldoAnterior = arredondar((saldo ? num(saldo.fisico) : quantidade) - quantidade, 4);
    if (saldoAnterior > 0 && anterior > 0) {
      mat.custoMedio = arredondar(
        ((saldoAnterior * anterior) + (quantidade * custoUnitario)) / (saldoAnterior + quantidade), 4);
    } else {
      mat.custoMedio = arredondar(custoUnitario, 4);
    }
    mat.ultimoCusto = arredondar(custoUnitario, 4);
  }

  /* V3 §13 — receber não é somar um número no saldo. O que chegou vira lote:
     com fornecedor, documento, data, custo e saldo próprio. É esse registro
     que, meses depois, responde "de onde veio o tecido desta camiseta?". */
  prepararIndustrial(db);
  const lote = novoLote(db, {
    prefixo: 'LC',
    materialId: mat.id,
    quantidade,
    saldo: quantidade,
    unidade: mat.unidadeEstoque,
    origem: 'compra',
    origemId: movimento.origemId || movimento.id,
    movimentoId: movimento.id,
    fornecedorId: movimento.fornecedorId,
    documento: movimento.documento,
    custoUnitario,
    data: movimento.data,
  });
  if (lote.erro) return { erro: lote.erro };
  movimento.loteId = lote.registro.id;
  movimento.loteCodigo = lote.registro.codigo;

  return { movimento, lote: lote.registro };
}

/* ========================================================= requisições */

/**
 * §7 — transforma a falta que o MRP apontou em requisição de compra.
 * Material que já tem requisição aberta é pulado: empilhar pedido do mesmo
 * item é o jeito mais rápido de comprar duas vezes.
 */
export function gerarRequisicoes(db, dados, usuario) {
  prepararIndustrial(db);
  const linhas = (dados.linhas || []).filter((l) => l.materialId && num(l.comprar) > 0);
  if (linhas.length === 0) return { erro: 'Nada a requisitar: o MRP não apontou falta.' };

  const criadas = [];
  const puladas = [];
  for (const linha of linhas) {
    const aberta = (db.industrial.requisicoesCompra || []).find(
      (r) => r.materialId === linha.materialId
        && !['recebida', 'cancelada'].includes(r.status)
        && (!dados.consolidacaoId || r.consolidacaoId === dados.consolidacaoId)
    );
    if (aberta) { puladas.push({ nome: linha.nome, requisicao: aberta.codigo }); continue; }

    const mat = materialDeCompra(db, linha.materialId);
    const prazo = dataLimiteDeCompra(db, linha.materialId, dados.dataNecessidade);
    const requisicao = {
      id: uid(),
      codigo: proximoCodigo(db.industrial.requisicoesCompra, 'REQ', 5),
      origem: dados.origem || 'mrp',
      consolidacaoId: dados.consolidacaoId || '',
      materialId: linha.materialId,
      itemId: linha.itemId || '',
      descricao: linha.nome || (mat ? mat.nome : ''),
      quantidade: arredondar(num(linha.comprar), 4),
      atendido: 0,
      unidade: linha.unidade || (mat ? mat.unidadeEstoque : ''),
      necessidade: arredondar(num(linha.bruta ?? linha.comprar), 4),
      prioridade: num(dados.prioridade) || 5,
      dataNecessidade: dados.dataNecessidade || '',
      leadTimeDias: prazo.leadTimeDias,
      dataLimite: prazo.dataLimite,
      fornecedorId: linha.fornecedorId || (mat ? mat.fornecedorPadraoId : '') || '',
      custoUnitario: num(linha.custoUnitario) || num(mat?.custoMedio),
      valor: arredondar(num(linha.comprar) * (num(linha.custoUnitario) || num(mat?.custoMedio)), 2),
      status: 'pendente',
      pedidoId: '',
      criadaEm: agoraISO(),
      criadaPor: usuario?.nome || '',
    };
    db.industrial.requisicoesCompra.push(requisicao);
    criadas.push(requisicao);
  }

  if (criadas.length) {
    registrarHistorico(db, {
      tipo: 'compra', usuario: usuario?.nome || '',
      motivo: `${criadas.length} requisição(ões) geradas pelo MRP`
        + `${dados.consolidacaoId ? ' da ordem' : ''}`,
    });
  }
  return { criadas, puladas, total: arredondar(criadas.reduce((s, r) => s + r.valor, 0), 2) };
}

export function aprovarRequisicao(db, requisicaoId, usuario) {
  prepararIndustrial(db);
  const req = (db.industrial.requisicoesCompra || []).find((r) => r.id === requisicaoId);
  if (!req) return { erro: 'Requisição não encontrada.' };
  if (req.status !== 'pendente') return { erro: `A requisição ${req.codigo} não está pendente.` };
  req.status = 'aprovada';
  req.aprovadaEm = agoraISO();
  req.aprovadaPor = usuario?.nome || '';
  registrarHistorico(db, {
    tipo: 'compra', usuario: usuario?.nome || '',
    valorAnterior: 'pendente', valorNovo: 'aprovada', motivo: `${req.codigo} aprovada`,
  });
  return { requisicao: req };
}

export function cancelarRequisicao(db, requisicaoId, motivo, usuario) {
  prepararIndustrial(db);
  const req = (db.industrial.requisicoesCompra || []).find((r) => r.id === requisicaoId);
  if (!req) return { erro: 'Requisição não encontrada.' };
  if (['pedida', 'parcial', 'recebida'].includes(req.status)) {
    return { erro: `A requisição ${req.codigo} já virou pedido — cancele o pedido.` };
  }
  if (!String(motivo || '').trim()) return { erro: 'Informe o motivo do cancelamento.' };
  req.status = 'cancelada';
  req.canceladaEm = agoraISO();
  req.motivo = String(motivo).trim();
  registrarHistorico(db, {
    tipo: 'compra', usuario: usuario?.nome || '',
    valorAnterior: 'aberta', valorNovo: 'cancelada', motivo: `${req.codigo}: ${motivo}`,
  });
  return { requisicao: req };
}

/* ============================================================= pedidos */

/**
 * §7 — as requisições escolhidas viram pedido, agrupadas por fornecedor:
 * dois pedidos para o mesmo fornecedor no mesmo dia é frete pago duas vezes.
 */
export function criarPedidoCompra(db, dados, usuario) {
  prepararIndustrial(db);
  const requisicoes = (db.industrial.requisicoesCompra || []).filter(
    (r) => (dados.requisicaoIds || []).includes(r.id)
  );
  if (requisicoes.length === 0) return { erro: 'Escolha ao menos uma requisição.' };
  const pendente = requisicoes.find((r) => ['pedida', 'recebida', 'cancelada'].includes(r.status));
  if (pendente) return { erro: `A requisição ${pendente.codigo} já foi atendida ou cancelada.` };

  const porFornecedor = new Map();
  for (const req of requisicoes) {
    const chave = req.fornecedorId || 'sem-fornecedor';
    if (!porFornecedor.has(chave)) porFornecedor.set(chave, []);
    porFornecedor.get(chave).push(req);
  }

  const pedidos = [];
  for (const [fornecedorId, itens] of porFornecedor.entries()) {
    const forn = fornecedorDeCompra(db, fornecedorId);
    const ano = hojeISO().slice(0, 4);
    const doAno = (db.industrial.pedidosCompra || []).filter(
      (p) => String(p.codigo).startsWith(`PC-${ano}-`)
    );
    const prazoEntrega = Math.max(0, ...itens.map((r) => num(r.leadTimeDias)));
    const pedido = {
      id: uid(),
      codigo: `PC-${ano}-${String(doAno.length + 1).padStart(4, '0')}`,
      fornecedorId: fornecedorId === 'sem-fornecedor' ? '' : fornecedorId,
      fornecedor: forn ? (forn.nomeFantasia || forn.nome) : 'sem fornecedor definido',
      condicaoPagamento: dados.condicaoPagamento || (forn ? forn.condicaoPagamento : '') || '',
      prazoPagamentoDias: num(dados.prazoPagamentoDias)
        || prazoDoFornecedor(forn, db),
      previsaoEntrega: dados.previsaoEntrega || somarDias(hojeISO(), prazoEntrega),
      itens: itens.map((r) => ({
        id: uid(),
        requisicaoId: r.id,
        materialId: r.materialId,
        descricao: r.descricao,
        quantidade: num(r.quantidade),
        recebido: 0,
        unidade: r.unidade,
        custoUnitario: num(r.custoUnitario),
        valor: arredondar(num(r.quantidade) * num(r.custoUnitario), 2),
        consolidacaoId: r.consolidacaoId || '',
      })),
      status: 'enviado',
      observacao: String(dados.observacao || '').trim(),
      criadoEm: agoraISO(),
      criadoPor: usuario?.nome || '',
    };
    pedido.valor = arredondar(pedido.itens.reduce((s, i) => s + i.valor, 0), 2);
    db.industrial.pedidosCompra.push(pedido);
    for (const req of itens) {
      req.status = 'pedida';
      req.pedidoId = pedido.id;
    }
    pedidos.push(pedido);
  }

  registrarHistorico(db, {
    tipo: 'compra', usuario: usuario?.nome || '',
    motivo: `${pedidos.length} pedido(s) de compra: ${pedidos.map((p) => p.codigo).join(', ')}`,
  });
  return { pedidos, valor: arredondar(pedidos.reduce((s, p) => s + p.valor, 0), 2) };
}

function prazoDoFornecedor(forn, db) {
  const texto = String(forn?.condicaoPagamento || '');
  const achado = texto.match(/(\d+)/);
  if (achado) return num(achado[1]);
  return num((db.industrial.parametros || {}).prazoPagamentoPadraoDias) || 28;
}

/* ========================================================= recebimento */

/**
 * §7 — o que chegou entra no estoque e baixa o pedido. Recebimento parcial é
 * o caso normal, não a exceção: o pedido continua aberto pelo saldo.
 *
 * Quando o item do pedido nasceu da necessidade de uma ordem, o material
 * recebido já entra reservado para ela — senão a próxima ordem leva.
 */
export function receberPedido(db, dados, usuario) {
  prepararIndustrial(db);
  const pedido = (db.industrial.pedidosCompra || []).find((p) => p.id === dados.pedidoId);
  if (!pedido) return { erro: 'Pedido de compra não encontrado.' };
  if (pedido.status === 'cancelado') return { erro: 'Este pedido foi cancelado.' };

  const informados = dados.itens && dados.itens.length
    ? dados.itens
    : pedido.itens.map((i) => ({ itemId: i.id, quantidade: arredondar(num(i.quantidade) - num(i.recebido), 4) }));

  const entradas = [];
  for (const linha of informados) {
    const item = pedido.itens.find((i) => i.id === linha.itemId || i.materialId === linha.materialId);
    if (!item) continue;
    const quantidade = arredondar(num(linha.quantidade), 4);
    if (!(quantidade > 0)) continue;
    const saldo = arredondar(num(item.quantidade) - num(item.recebido), 4);
    if (quantidade > saldo + 0.0001) {
      return { erro: `${item.descricao}: o pedido tem ${saldo} ${item.unidade} em aberto.` };
    }

    const entrada = entradaDeMaterial(db, {
      materialId: item.materialId,
      quantidade,
      custoUnitario: num(linha.custoUnitario) || num(item.custoUnitario),
      fornecedorId: pedido.fornecedorId,
      documento: dados.documento || pedido.codigo,
      origemTipo: 'recebimento',
      origemId: pedido.id,
      observacao: `Recebimento do ${pedido.codigo}`,
      data: dados.data,
    }, usuario);
    if (entrada.erro) return entrada;

    item.recebido = arredondar(num(item.recebido) + quantidade, 4);
    const req = (db.industrial.requisicoesCompra || []).find((r) => r.id === item.requisicaoId);
    if (req) {
      req.atendido = arredondar(num(req.atendido) + quantidade, 4);
      req.status = num(req.atendido) + 0.0001 >= num(req.quantidade) ? 'recebida' : 'parcial';
    }

    /* o material chegou para uma ordem: entra reservado para ela */
    let reserva = null;
    if (item.consolidacaoId) {
      const r = reservarMaterial(db, {
        materialId: item.materialId, quantidade,
        consolidacaoId: item.consolidacaoId,
        observacao: `Recebido no ${pedido.codigo}`,
      }, usuario);
      if (!r.erro) reserva = r.reserva;
    }
    entradas.push({
      materialId: item.materialId, descricao: item.descricao, quantidade,
      reservaId: reserva ? reserva.id : '',
    });
  }

  if (entradas.length === 0) return { erro: 'Nada foi informado para recebimento.' };

  const recebimento = {
    id: uid(),
    codigo: proximoCodigo(db.industrial.recebimentosCompra, 'REC', 5),
    pedidoId: pedido.id,
    data: dados.data || hojeISO(),
    documento: dados.documento || '',
    itens: entradas,
    observacao: String(dados.observacao || '').trim(),
    criadoEm: agoraISO(),
    criadoPor: usuario?.nome || '',
  };
  db.industrial.recebimentosCompra.push(recebimento);

  const completo = pedido.itens.every((i) => num(i.recebido) + 0.0001 >= num(i.quantidade));
  pedido.status = completo ? 'recebido' : 'parcial';
  registrarHistorico(db, {
    tipo: 'compra', usuario: usuario?.nome || '',
    valorAnterior: 'pedido', valorNovo: pedido.status,
    motivo: `${recebimento.codigo}: ${entradas.length} item(ns) do ${pedido.codigo}`,
  });
  return { recebimento, pedido, entradas };
}

export function cancelarPedido(db, pedidoId, motivo, usuario) {
  prepararIndustrial(db);
  const pedido = (db.industrial.pedidosCompra || []).find((p) => p.id === pedidoId);
  if (!pedido) return { erro: 'Pedido não encontrado.' };
  if (pedido.itens.some((i) => num(i.recebido) > 0)) {
    return { erro: `O ${pedido.codigo} já teve recebimento — cancele só o saldo com o fornecedor.` };
  }
  if (!String(motivo || '').trim()) return { erro: 'Informe o motivo do cancelamento.' };
  pedido.status = 'cancelado';
  pedido.motivo = String(motivo).trim();
  pedido.canceladoEm = agoraISO();
  for (const item of pedido.itens) {
    const req = (db.industrial.requisicoesCompra || []).find((r) => r.id === item.requisicaoId);
    if (req && req.status === 'pedida') { req.status = 'aprovada'; req.pedidoId = ''; }
  }
  registrarHistorico(db, {
    tipo: 'compra', usuario: usuario?.nome || '',
    valorAnterior: pedido.status, valorNovo: 'cancelado', motivo: `${pedido.codigo}: ${motivo}`,
  });
  return { pedido };
}

/* ============================================ §28 painel e entradas programadas */

/** O que já está comprado e ainda não chegou — o MRP desconta isso. */
export function entradasProgramadasDe(db, materialId) {
  prepararIndustrial(db);
  return arredondar((db.industrial.pedidosCompra || [])
    .filter((p) => !['cancelado', 'recebido'].includes(p.status))
    .flatMap((p) => p.itens.filter((i) => i.materialId === materialId)
      .map((i) => num(i.quantidade) - num(i.recebido)))
    .reduce((s, q) => s + Math.max(q, 0), 0), 4);
}

/** §28 — a tela de compras: o que falta, para quando, de quem e por quanto. */
export function painelCompras(db, opcoes = {}) {
  prepararIndustrial(db);
  const requisicoes = (db.industrial.requisicoesCompra || [])
    .filter((r) => (opcoes.incluirEncerradas ? true : !['recebida', 'cancelada'].includes(r.status)))
    .map((r) => {
      const mat = materialDeCompra(db, r.materialId);
      const posicao = disponivelParaOrdem(db, r.materialId, r.consolidacaoId);
      const forn = fornecedorDeCompra(db, r.fornecedorId);
      return {
        ...r,
        material: mat ? mat.nome : r.descricao,
        fornecedorNome: forn ? (forn.nomeFantasia || forn.nome) : '',
        estoque: posicao.fisico,
        reservado: posicao.reservado,
        disponivel: posicao.livre,
        programado: entradasProgramadasDe(db, r.materialId),
        saldo: arredondar(num(r.quantidade) - num(r.atendido), 4),
        atrasada: r.dataLimite ? r.dataLimite < hojeISO() : false,
      };
    })
    /* §28: primeiro o que a produção precisa, depois o atraso, depois o valor */
    .sort((a, b) => (b.atrasada - a.atrasada)
      || String(a.dataLimite || '9999').localeCompare(String(b.dataLimite || '9999'))
      || (b.valor - a.valor));

  const pedidos = (db.industrial.pedidosCompra || [])
    .filter((p) => (opcoes.incluirEncerradas ? true : !['cancelado', 'recebido'].includes(p.status)))
    .map((p) => ({
      ...p,
      saldo: arredondar(p.itens.reduce((s, i) => s + Math.max(num(i.quantidade) - num(i.recebido), 0), 0), 4),
      valorAberto: arredondar(p.itens.reduce(
        (s, i) => s + Math.max(num(i.quantidade) - num(i.recebido), 0) * num(i.custoUnitario), 0), 2),
      vencimento: somarDias(p.previsaoEntrega, num(p.prazoPagamentoDias)),
    }));

  const alertas = [];
  for (const r of requisicoes) {
    if (r.atrasada) {
      alertas.push(alerta('material_insuficiente',
        `${r.material}: compra atrasada para atendimento da produção — limite era ${r.dataLimite}.`,
        { materialId: r.materialId }));
    }
  }

  return {
    requisicoes,
    pedidos,
    aRequisitar: requisicoes.filter((r) => r.status === 'pendente').length,
    emPedido: pedidos.length,
    valorRequisitado: arredondar(requisicoes.reduce((s, r) => s + num(r.valor), 0), 2),
    valorEmPedido: arredondar(pedidos.reduce((s, p) => s + num(p.valorAberto), 0), 2),
    atrasadas: requisicoes.filter((r) => r.atrasada).length,
    alertas,
  };
}

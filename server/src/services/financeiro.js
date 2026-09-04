import { getDb } from '../db/index.js';
import { badRequest, notFound, conflict } from '../lib/errors.js';
import { round2 } from '../lib/numbers.js';
import { hoje } from '../lib/dates.js';

/** Soma dias a uma data ISO, sem depender de fuso. */
function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Cria um título, opcionalmente dividido em parcelas.
 *
 * As parcelas são geradas de uma vez, com o mesmo documento e o intervalo
 * informado entre vencimentos. A diferença de arredondamento vai para a
 * última parcela, para a soma bater com o valor original ao centavo.
 */
export function criarTitulo(dados, db = getDb()) {
  const parcelas = Math.max(Number(dados.parcelas ?? 1), 1);
  const valor = Number(dados.valor);
  if (!(valor > 0)) throw badRequest('Informe um valor maior que zero');
  if (dados.tipo === 'RECEBER' && !dados.cliente_id) throw badRequest('Conta a receber precisa de cliente');
  if (dados.tipo === 'PAGAR' && !dados.fornecedor_id) throw badRequest('Conta a pagar precisa de fornecedor');

  const intervalo = Number(dados.intervalo_dias ?? 30);
  const base = round2(valor / parcelas);

  const inserir = db.prepare(
    `INSERT INTO titulos
       (tipo, descricao, categoria_id, cliente_id, fornecedor_id, pedido_id, documento,
        parcela, parcelas, valor, emissao, vencimento, observacao, usuario_id)
     VALUES (@tipo, @descricao, @categoria_id, @cliente_id, @fornecedor_id, @pedido_id, @documento,
        @parcela, @parcelas, @valor, @emissao, @vencimento, @observacao, @usuario_id)`
  );

  const tx = db.transaction(() => {
    const ids = [];
    for (let n = 1; n <= parcelas; n++) {
      const valorParcela = n === parcelas ? round2(valor - base * (parcelas - 1)) : base;
      const info = inserir.run({
        tipo: dados.tipo,
        descricao: parcelas > 1 ? `${dados.descricao} (${n}/${parcelas})` : dados.descricao,
        categoria_id: dados.categoria_id ?? null,
        cliente_id: dados.cliente_id ?? null,
        fornecedor_id: dados.fornecedor_id ?? null,
        pedido_id: dados.pedido_id ?? null,
        documento: dados.documento ?? null,
        parcela: n,
        parcelas,
        valor: valorParcela,
        emissao: dados.emissao || hoje(),
        vencimento: somarDias(dados.vencimento, intervalo * (n - 1)),
        observacao: dados.observacao ?? null,
        usuario_id: dados.usuario_id ?? null,
      });
      ids.push(info.lastInsertRowid);
    }
    return ids;
  });

  const ids = tx();
  return ids.map((id) => buscarTitulo(id, db));
}

export function buscarTitulo(id, db = getDb()) {
  const titulo = db.prepare(`SELECT * FROM vw_titulos WHERE id = ?`).get(id);
  if (!titulo) throw notFound('Título não encontrado');
  titulo.baixas = db
    .prepare(
      `SELECT b.*, cb.nome AS conta, u.nome AS usuario FROM baixas b
       LEFT JOIN contas_bancarias cb ON cb.id = b.conta_id
       LEFT JOIN usuarios u ON u.id = b.usuario_id
       WHERE b.titulo_id = ? ORDER BY b.data, b.id`
    )
    .all(id);
  return titulo;
}

/**
 * Registra um pagamento ou recebimento. A baixa não pode passar do saldo:
 * juros entram por fora e desconto abate, mas o principal fecha exatamente.
 */
export function registrarBaixa(dados, db = getDb()) {
  const titulo = db.prepare(`SELECT * FROM vw_titulos WHERE id = ?`).get(dados.titulo_id);
  if (!titulo) throw notFound('Título não encontrado');
  if (titulo.status === 'CANCELADO') throw conflict('Título cancelado não aceita baixa');

  const valor = Number(dados.valor);
  if (!(valor > 0)) throw badRequest('Informe um valor maior que zero');
  const juros = Number(dados.juros ?? 0);
  const desconto = Number(dados.desconto ?? 0);
  const abatido = round2(valor + juros - desconto);

  if (abatido > titulo.saldo + 0.005) {
    throw badRequest(
      `Baixa acima do saldo: restam ${round2(titulo.saldo)} e foram informados ${abatido}`
    );
  }

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO baixas (titulo_id, data, valor, juros, desconto, forma, conta_id, observacao, usuario_id)
         VALUES (@titulo_id, @data, @valor, @juros, @desconto, @forma, @conta_id, @observacao, @usuario_id)`
      )
      .run({
        titulo_id: titulo.id,
        data: dados.data || hoje(),
        valor, juros, desconto,
        forma: dados.forma || 'PIX',
        conta_id: dados.conta_id ?? null,
        observacao: dados.observacao ?? null,
        usuario_id: dados.usuario_id ?? null,
      });
    atualizarStatus(titulo.id, db);
    return info.lastInsertRowid;
  });

  tx();
  return buscarTitulo(titulo.id, db);
}

export function estornarBaixa(id, db = getDb()) {
  const baixa = db.prepare(`SELECT * FROM baixas WHERE id = ?`).get(id);
  if (!baixa) throw notFound('Baixa não encontrada');
  db.prepare(`DELETE FROM baixas WHERE id = ?`).run(id);
  atualizarStatus(baixa.titulo_id, db);
  return buscarTitulo(baixa.titulo_id, db);
}

/** O status do título é sempre derivado das baixas, nunca digitado. */
function atualizarStatus(tituloId, db) {
  const t = db.prepare(`SELECT valor, status FROM titulos WHERE id = ?`).get(tituloId);
  if (!t || t.status === 'CANCELADO') return;
  const { pago } = db
    .prepare(`SELECT COALESCE(SUM(valor + juros - desconto), 0) AS pago FROM baixas WHERE titulo_id = ?`)
    .get(tituloId);
  const status = pago <= 0.005 ? 'ABERTO' : pago >= t.valor - 0.005 ? 'QUITADO' : 'PARCIAL';
  db.prepare(`UPDATE titulos SET status = ? WHERE id = ?`).run(status, tituloId);
}

/**
 * Gera as contas a receber de um pedido a partir do valor dos seus itens,
 * usando o prazo e o parcelamento cadastrados no cliente quando não informados.
 */
export function faturarPedido(pedidoId, opcoes = {}, db = getDb()) {
  const pedido = db
    .prepare(
      `SELECT p.*, c.nome AS cliente, c.prazo_pagamento_dias
       FROM pedidos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?`
    )
    .get(pedidoId);
  if (!pedido) throw notFound('Pedido não encontrado');

  const jaExiste = db.prepare(`SELECT COUNT(*) AS n FROM titulos WHERE pedido_id = ?`).get(pedidoId).n;
  if (jaExiste > 0 && !opcoes.forcar) {
    throw conflict('Este pedido já gerou contas a receber', { titulos: jaExiste });
  }

  const { total } = db
    .prepare(`SELECT COALESCE(SUM(quantidade * preco_unitario), 0) AS total FROM pedido_itens WHERE pedido_id = ?`)
    .get(pedidoId);
  if (!(total > 0)) throw badRequest('Pedido sem valor para faturar');

  const prazo = Number(opcoes.prazo_dias ?? pedido.prazo_pagamento_dias ?? 0);
  const titulos = criarTitulo(
    {
      tipo: 'RECEBER',
      descricao: `Pedido ${pedido.numero} — ${pedido.cliente}`,
      cliente_id: pedido.cliente_id,
      pedido_id: pedido.id,
      documento: opcoes.documento ?? pedido.nota_fiscal ?? null,
      categoria_id: opcoes.categoria_id ?? categoriaPadrao('RECEBER', db),
      valor: round2(total),
      parcelas: Number(opcoes.parcelas ?? 1),
      intervalo_dias: Number(opcoes.intervalo_dias ?? 30),
      emissao: opcoes.emissao || hoje(),
      vencimento: opcoes.vencimento || somarDias(opcoes.emissao || hoje(), prazo),
      usuario_id: opcoes.usuario_id ?? null,
    },
    db
  );

  db.prepare(`UPDATE pedidos SET situacao = 'FATURADO' WHERE id = ? AND situacao = 'ABERTO'`).run(pedidoId);
  return titulos;
}

function categoriaPadrao(tipo, db) {
  return db.prepare(`SELECT id FROM categorias_financeiras WHERE tipo = ? AND ativo = 1 ORDER BY id LIMIT 1`)
    .get(tipo)?.id ?? null;
}

/* ==========================================================================
   INDICADORES
   ========================================================================== */

/** Posição de um lado do financeiro: aberto, vencido e o que cai nos próximos dias. */
export function posicao(tipo, db = getDb()) {
  const r = db
    .prepare(
      `SELECT
         COUNT(*)                                                             AS titulos,
         COALESCE(SUM(saldo), 0)                                              AS aberto,
         COALESCE(SUM(CASE WHEN dias_atraso > 0 THEN saldo ELSE 0 END), 0)    AS vencido,
         COALESCE(SUM(CASE WHEN vencimento BETWEEN date('now') AND date('now','+7 day')
                           THEN saldo ELSE 0 END), 0)                         AS proximos_7,
         COALESCE(SUM(CASE WHEN vencimento BETWEEN date('now') AND date('now','+30 day')
                           THEN saldo ELSE 0 END), 0)                         AS proximos_30,
         SUM(CASE WHEN dias_atraso > 0 THEN 1 ELSE 0 END)                     AS titulos_vencidos
       FROM vw_titulos WHERE tipo = ? AND status IN ('ABERTO','PARCIAL')`
    )
    .get(tipo);
  return {
    tipo,
    titulos: r.titulos,
    aberto: round2(r.aberto),
    vencido: round2(r.vencido),
    proximos_7: round2(r.proximos_7),
    proximos_30: round2(r.proximos_30),
    titulos_vencidos: r.titulos_vencidos,
  };
}

/** Aging: há quanto tempo o título está vencido. */
export function aging(tipo, db = getDb()) {
  const faixas = [
    ['A vencer', 'dias_atraso = 0'],
    ['1 a 30 dias', 'dias_atraso BETWEEN 1 AND 30'],
    ['31 a 60 dias', 'dias_atraso BETWEEN 31 AND 60'],
    ['61 a 90 dias', 'dias_atraso BETWEEN 61 AND 90'],
    ['Mais de 90 dias', 'dias_atraso > 90'],
  ];
  return faixas.map(([nome, condicao]) => {
    const r = db
      .prepare(
        `SELECT COUNT(*) AS titulos, COALESCE(SUM(saldo), 0) AS valor
         FROM vw_titulos WHERE tipo = ? AND status IN ('ABERTO','PARCIAL') AND ${condicao}`
      )
      .get(tipo);
    return { faixa: nome, titulos: r.titulos, valor: round2(r.valor) };
  });
}

/**
 * Fluxo de caixa previsto por semana: o que entra menos o que sai, acumulado.
 * Títulos já vencidos entram na primeira semana — são caixa que já deveria ter
 * acontecido e continua pesando.
 */
export function fluxoPrevisto({ semanas = 12 } = {}, db = getDb()) {
  const linhas = db
    .prepare(
      `SELECT tipo,
              CASE WHEN vencimento < date('now') THEN date('now') ELSE vencimento END AS quando,
              saldo
       FROM vw_titulos
       WHERE status IN ('ABERTO','PARCIAL')
         AND (CASE WHEN vencimento < date('now') THEN date('now') ELSE vencimento END)
             <= date('now', '+' || ? || ' day')`
    )
    .all(semanas * 7);

  const baldes = new Map();
  for (const l of linhas) {
    const semana = Math.floor(
      (new Date(`${l.quando}T00:00:00Z`) - new Date(`${hoje()}T00:00:00Z`)) / (7 * 86400000)
    );
    const b = baldes.get(semana) ?? { semana, entradas: 0, saidas: 0 };
    if (l.tipo === 'RECEBER') b.entradas += l.saldo;
    else b.saidas += l.saldo;
    baldes.set(semana, b);
  }

  let acumulado = 0;
  return Array.from({ length: semanas }, (_, i) => {
    const b = baldes.get(i) ?? { semana: i, entradas: 0, saidas: 0 };
    const saldo = b.entradas - b.saidas;
    acumulado += saldo;
    return {
      semana: i,
      inicio: somarDias(hoje(), i * 7),
      fim: somarDias(hoje(), i * 7 + 6),
      entradas: round2(b.entradas),
      saidas: round2(b.saidas),
      saldo: round2(saldo),
      acumulado: round2(acumulado),
    };
  });
}

/** Realizado do mês: o que efetivamente entrou e saiu do caixa. */
export function realizadoPorMes(ano, db = getDb()) {
  const linhas = db
    .prepare(
      `SELECT strftime('%m', b.data) AS mes, t.tipo,
              ROUND(SUM(b.valor + b.juros - b.desconto), 2) AS valor
       FROM baixas b JOIN titulos t ON t.id = b.titulo_id
       WHERE strftime('%Y', b.data) = ?
       GROUP BY mes, t.tipo ORDER BY mes`
    )
    .all(String(ano));

  return Array.from({ length: 12 }, (_, i) => {
    const mes = String(i + 1).padStart(2, '0');
    const recebido = linhas.find((l) => l.mes === mes && l.tipo === 'RECEBER')?.valor ?? 0;
    const pago = linhas.find((l) => l.mes === mes && l.tipo === 'PAGAR')?.valor ?? 0;
    return { mes, recebido, pago, resultado: round2(recebido - pago) };
  });
}

/** Quem mais deve (a receber) ou a quem mais se deve (a pagar). */
export function ranking(tipo, limite = 20, db = getDb()) {
  return db
    .prepare(
      `SELECT COALESCE(parte, 'Sem cadastro') AS parte,
              COUNT(*) AS titulos,
              ROUND(SUM(saldo), 2) AS aberto,
              ROUND(SUM(CASE WHEN dias_atraso > 0 THEN saldo ELSE 0 END), 2) AS vencido,
              MAX(dias_atraso) AS maior_atraso
       FROM vw_titulos
       WHERE tipo = ? AND status IN ('ABERTO','PARCIAL')
       GROUP BY parte ORDER BY aberto DESC LIMIT ?`
    )
    .all(tipo, limite);
}

export function resumo(ano = new Date().getFullYear(), db = getDb()) {
  return {
    referencia: hoje(),
    receber: posicao('RECEBER', db),
    pagar: posicao('PAGAR', db),
    aging_receber: aging('RECEBER', db),
    aging_pagar: aging('PAGAR', db),
    fluxo: fluxoPrevisto({ semanas: 12 }, db),
    realizado: realizadoPorMes(ano, db),
    maiores_devedores: ranking('RECEBER', 8, db),
    maiores_credores: ranking('PAGAR', 8, db),
  };
}

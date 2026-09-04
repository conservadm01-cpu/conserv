import { getDb } from '../db/index.js';
import { badRequest, notFound, conflict } from '../lib/errors.js';
import { round2 } from '../lib/numbers.js';
import { hoje } from '../lib/dates.js';
import { custoCompletoProduto, taxaCustoIndireto } from './custeio.js';
import { abrirOrdem } from './producao.js';

const arred = (n, casas = 4) => Number(Number(n).toFixed(casas));

/* ==========================================================================
   CRM — funil de oportunidades
   ========================================================================== */

export function buscarOportunidade(id, db = getDb()) {
  const oportunidade = db
    .prepare(
      `SELECT o.*, COALESCE(c.nome, o.prospect) AS parte, c.nome AS cliente,
              v.nome AS vendedor, e.nome AS etapa, e.ordem AS etapa_ordem,
              e.tipo AS etapa_tipo, e.probabilidade AS probabilidade_etapa
       FROM oportunidades o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN vendedores v ON v.id = o.vendedor_id
       JOIN etapas_funil e ON e.id = o.etapa_id
       WHERE o.id = ?`
    )
    .get(id);
  if (!oportunidade) throw notFound('Oportunidade não encontrada');

  oportunidade.interacoes = db
    .prepare(
      `SELECT i.*, u.nome AS usuario FROM interacoes i
       LEFT JOIN usuarios u ON u.id = i.usuario_id
       WHERE i.oportunidade_id = ? ORDER BY i.data DESC, i.id DESC`
    )
    .all(id);

  oportunidade.orcamentos = db
    .prepare(`SELECT * FROM vw_orcamentos WHERE oportunidade_id = ? ORDER BY data DESC`)
    .all(id);

  return oportunidade;
}

/**
 * Move a oportunidade de etapa. Ganhar ou perder carimba a data de fechamento
 * e volta a limpá-la se o negócio for reaberto — o funil não guarda meia-verdade.
 */
export function moverEtapa(id, etapaId, dados = {}, db = getDb()) {
  const oportunidade = db.prepare(`SELECT * FROM oportunidades WHERE id = ?`).get(id);
  if (!oportunidade) throw notFound('Oportunidade não encontrada');

  const etapa = db.prepare(`SELECT * FROM etapas_funil WHERE id = ?`).get(etapaId);
  if (!etapa) throw notFound('Etapa do funil não encontrada');
  if (etapa.tipo === 'PERDIDA' && !dados.motivo_perda && !oportunidade.motivo_perda) {
    throw badRequest('Informe o motivo da perda ao mover para esta etapa');
  }

  const fechada = etapa.tipo !== 'ABERTA';
  db.prepare(
    `UPDATE oportunidades
     SET etapa_id = ?, motivo_perda = ?, fechada_em = ?, atualizado_em = datetime('now')
     WHERE id = ?`
  ).run(
    etapaId,
    etapa.tipo === 'PERDIDA' ? (dados.motivo_perda ?? oportunidade.motivo_perda) : null,
    fechada ? (oportunidade.fechada_em ?? hoje()) : null,
    id
  );

  return buscarOportunidade(id, db);
}

export function registrarInteracao(dados, db = getDb()) {
  if (!dados.oportunidade_id && !dados.cliente_id) {
    throw badRequest('Vincule a interação a uma oportunidade ou a um cliente');
  }
  const info = db
    .prepare(
      `INSERT INTO interacoes (oportunidade_id, cliente_id, tipo, data, resumo, proximo_passo, proxima_data, concluida, usuario_id)
       VALUES (@oportunidade_id, @cliente_id, @tipo, @data, @resumo, @proximo_passo, @proxima_data, @concluida, @usuario_id)`
    )
    .run({
      oportunidade_id: dados.oportunidade_id ?? null,
      cliente_id: dados.cliente_id ?? null,
      tipo: dados.tipo || 'LIGACAO',
      data: dados.data || hoje(),
      resumo: dados.resumo,
      proximo_passo: dados.proximo_passo ?? null,
      proxima_data: dados.proxima_data ?? null,
      concluida: dados.concluida === false ? 0 : 1,
      usuario_id: dados.usuario_id ?? null,
    });

  if (dados.oportunidade_id) {
    db.prepare(`UPDATE oportunidades SET atualizado_em = datetime('now') WHERE id = ?`)
      .run(dados.oportunidade_id);
  }
  return db.prepare(`SELECT * FROM interacoes WHERE id = ?`).get(info.lastInsertRowid);
}

/** O funil em colunas, com o valor ponderado pela probabilidade de cada etapa. */
export function funil({ vendedor_id = null } = {}, db = getDb()) {
  const etapas = db.prepare(`SELECT * FROM etapas_funil WHERE ativo = 1 ORDER BY ordem`).all();
  const oportunidades = db
    .prepare(
      `SELECT o.*, COALESCE(c.nome, o.prospect) AS parte, v.nome AS vendedor,
              e.probabilidade AS probabilidade_etapa,
              CAST(julianday('now') - julianday(o.atualizado_em) AS INTEGER) AS dias_parada,
              (SELECT MIN(i.proxima_data) FROM interacoes i
                WHERE i.oportunidade_id = o.id AND i.proxima_data >= date('now')) AS proximo_contato
       FROM oportunidades o
       LEFT JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN vendedores v ON v.id = o.vendedor_id
       JOIN etapas_funil e ON e.id = o.etapa_id
       WHERE (? IS NULL OR o.vendedor_id = ?)
       ORDER BY o.previsao_fechamento IS NULL, o.previsao_fechamento`
    )
    .all(vendedor_id, vendedor_id);

  return etapas.map((etapa) => {
    const desta = oportunidades.filter((o) => o.etapa_id === etapa.id);
    const valor = desta.reduce((s, o) => s + o.valor_estimado, 0);
    return {
      etapa,
      oportunidades: desta.map((o) => ({
        ...o,
        probabilidade: o.probabilidade ?? o.probabilidade_etapa,
      })),
      total: desta.length,
      valor: round2(valor),
      valor_ponderado: round2(
        desta.reduce((s, o) => s + o.valor_estimado * ((o.probabilidade ?? o.probabilidade_etapa) / 100), 0)
      ),
    };
  });
}

/**
 * Indicadores do comercial. A taxa de conversão olha só o que já fechou —
 * negócio em aberto ainda não é vitória nem derrota.
 */
export function resumoComercial({ vendedor_id = null } = {}, db = getDb()) {
  const colunas = funil({ vendedor_id }, db);
  const abertas = colunas.filter((c) => c.etapa.tipo === 'ABERTA');
  const ganhas = colunas.find((c) => c.etapa.tipo === 'GANHA');
  const perdidas = colunas.find((c) => c.etapa.tipo === 'PERDIDA');

  const fechadas = (ganhas?.total ?? 0) + (perdidas?.total ?? 0);

  const paradas = abertas
    .flatMap((c) => c.oportunidades)
    .filter((o) => o.dias_parada >= 14)
    .sort((a, b) => b.dias_parada - a.dias_parada);

  const motivos = db
    .prepare(
      `SELECT motivo_perda AS motivo, COUNT(*) AS total, ROUND(SUM(valor_estimado), 2) AS valor
       FROM oportunidades o JOIN etapas_funil e ON e.id = o.etapa_id
       WHERE e.tipo = 'PERDIDA' AND motivo_perda IS NOT NULL
       GROUP BY motivo_perda ORDER BY total DESC LIMIT 8`
    )
    .all();

  return {
    funil: colunas,
    abertas: abertas.reduce((s, c) => s + c.total, 0),
    valor_aberto: round2(abertas.reduce((s, c) => s + c.valor, 0)),
    valor_ponderado: round2(abertas.reduce((s, c) => s + c.valor_ponderado, 0)),
    ganhas: ganhas?.total ?? 0,
    valor_ganho: ganhas?.valor ?? 0,
    perdidas: perdidas?.total ?? 0,
    valor_perdido: perdidas?.valor ?? 0,
    conversao: fechadas > 0 ? round2(((ganhas?.total ?? 0) / fechadas) * 100) : 0,
    paradas: paradas.slice(0, 10),
    motivos_perda: motivos,
    agenda: db
      .prepare(
        `SELECT i.*, o.titulo AS oportunidade, COALESCE(c.nome, o.prospect) AS parte
         FROM interacoes i
         LEFT JOIN oportunidades o ON o.id = i.oportunidade_id
         LEFT JOIN clientes c ON c.id = o.cliente_id
         WHERE i.proxima_data IS NOT NULL AND i.proxima_data <= date('now', '+14 day')
         ORDER BY i.proxima_data LIMIT 20`
      )
      .all(),
  };
}

/* ==========================================================================
   ORÇAMENTOS
   ========================================================================== */

export function proximoNumeroOrcamento(db = getDb(), ano = new Date().getFullYear()) {
  const prefixo = `ORC-${ano}-`;
  const ultimo = db
    .prepare(`SELECT numero FROM orcamentos WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1`)
    .get(`${prefixo}%`);
  const seq = ultimo ? Number(ultimo.numero.slice(prefixo.length)) + 1 : 1;
  return `${prefixo}${String(seq).padStart(4, '0')}`;
}

/**
 * Preço sugerido de um produto a partir do custo formado.
 *
 * O markup é aplicado sobre o custo; a margem é o que sobra do preço. São
 * contas diferentes e confundi-las custa dinheiro: 50% de markup sobre R$ 10
 * dá R$ 15, com margem de 33% — não de 50%.
 */
export function precificar(produtoId, { markup = null, margem = null, quantidade = 1 } = {}, db = getDb()) {
  const custo = custoCompletoProduto(produtoId, db);
  const unitario = custo.total;

  let sugerido = custo.produto.preco_padrao;
  let base = 'preço de tabela';

  if (margem !== null && margem >= 0 && margem < 100) {
    sugerido = unitario / (1 - margem / 100);
    base = `margem de ${margem}%`;
  } else if (markup !== null && markup >= 0) {
    sugerido = unitario * (1 + markup / 100);
    base = `markup de ${markup}%`;
  }

  return {
    produto_id: produtoId,
    produto: custo.produto.descricao,
    quantidade,
    custo_unitario: arred(unitario),
    custo_total: arred(unitario * quantidade, 2),
    material: custo.material,
    mao_de_obra: custo.mao_de_obra,
    indireto: custo.indireto,
    minutos_por_peca: custo.minutos_por_peca,
    preco_tabela: custo.produto.preco_padrao,
    preco_sugerido: round2(sugerido),
    base,
    margem_no_sugerido: sugerido > 0 ? round2(((sugerido - unitario) / sugerido) * 100) : 0,
    margem_no_tabela: custo.produto.preco_padrao > 0
      ? round2(((custo.produto.preco_padrao - unitario) / custo.produto.preco_padrao) * 100)
      : 0,
    completo: custo.completo,
    avisos: custo.avisos,
  };
}

/** Cria o orçamento e congela o custo de cada item no momento da proposta. */
export function criarOrcamento(dados, db = getDb()) {
  if (!dados.cliente_id && !dados.prospect) throw badRequest('Informe o cliente ou o nome do prospect');
  if (!dados.itens?.length) throw badRequest('O orçamento precisa de ao menos um item');

  const tx = db.transaction(() => {
    const numero = dados.numero || proximoNumeroOrcamento(db);
    const info = db
      .prepare(
        `INSERT INTO orcamentos
           (numero, cliente_id, prospect, oportunidade_id, vendedor_id, data, validade,
            prazo_entrega_dias, condicao_pagamento, desconto_percentual, frete, status, observacao, usuario_id)
         VALUES (@numero, @cliente_id, @prospect, @oportunidade_id, @vendedor_id, @data, @validade,
            @prazo_entrega_dias, @condicao_pagamento, @desconto_percentual, @frete, @status, @observacao, @usuario_id)`
      )
      .run({
        numero,
        cliente_id: dados.cliente_id ?? null,
        prospect: dados.prospect ?? null,
        oportunidade_id: dados.oportunidade_id ?? null,
        vendedor_id: dados.vendedor_id ?? null,
        data: dados.data || hoje(),
        validade: dados.validade ?? null,
        prazo_entrega_dias: dados.prazo_entrega_dias ?? 0,
        condicao_pagamento: dados.condicao_pagamento ?? null,
        desconto_percentual: dados.desconto_percentual ?? 0,
        frete: dados.frete ?? 0,
        status: dados.status ?? 'RASCUNHO',
        observacao: dados.observacao ?? null,
        usuario_id: dados.usuario_id ?? null,
      });

    gravarItens(info.lastInsertRowid, dados.itens, db);
    return info.lastInsertRowid;
  });

  return buscarOrcamento(tx(), db);
}

function gravarItens(orcamentoId, itens, db) {
  db.prepare(`DELETE FROM orcamento_itens WHERE orcamento_id = ?`).run(orcamentoId);
  const inserir = db.prepare(
    `INSERT INTO orcamento_itens (orcamento_id, produto_id, descricao, quantidade, preco_unitario, custo_unitario, sequencia)
     VALUES (@orcamento_id, @produto_id, @descricao, @quantidade, @preco_unitario, @custo_unitario, @sequencia)`
  );
  itens.forEach((item, i) => {
    // O custo vai congelado: a proposta guarda a margem do dia em que foi feita.
    const custo = item.custo_unitario ?? custoCompletoProduto(item.produto_id, db).total;
    inserir.run({
      orcamento_id: orcamentoId,
      produto_id: item.produto_id,
      descricao: item.descricao ?? null,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario ?? 0,
      custo_unitario: arred(custo),
      sequencia: item.sequencia ?? i + 1,
    });
  });
}

export function atualizarOrcamento(id, dados, db = getDb()) {
  const atual = db.prepare(`SELECT * FROM orcamentos WHERE id = ?`).get(id);
  if (!atual) throw notFound('Orçamento não encontrado');
  if (atual.pedido_id) throw conflict('Orçamento já convertido em pedido não pode ser alterado');

  const campos = ['cliente_id', 'prospect', 'oportunidade_id', 'vendedor_id', 'data', 'validade',
                  'prazo_entrega_dias', 'condicao_pagamento', 'desconto_percentual', 'frete',
                  'status', 'motivo_recusa', 'observacao'].filter((c) => dados[c] !== undefined);

  const tx = db.transaction(() => {
    if (campos.length) {
      db.prepare(`UPDATE orcamentos SET ${campos.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`)
        .run({ ...Object.fromEntries(campos.map((c) => [c, dados[c] ?? null])), id });
    }
    if (dados.itens) gravarItens(id, dados.itens, db);
  });
  tx();
  return buscarOrcamento(id, db);
}

export function buscarOrcamento(id, db = getDb()) {
  const orcamento = db.prepare(`SELECT * FROM vw_orcamentos WHERE id = ?`).get(id);
  if (!orcamento) throw notFound('Orçamento não encontrado');

  orcamento.linhas = db
    .prepare(
      `SELECT oi.*, p.descricao AS produto, g.nome AS grupo, p.linha,
              ROUND(oi.quantidade * oi.preco_unitario, 2) AS total,
              ROUND(oi.quantidade * oi.custo_unitario, 2) AS custo,
              CASE WHEN oi.preco_unitario > 0
                   THEN ROUND((oi.preco_unitario - oi.custo_unitario) / oi.preco_unitario * 100, 2)
                   ELSE 0 END AS margem_percentual
       FROM orcamento_itens oi
       JOIN produtos p ON p.id = oi.produto_id
       LEFT JOIN grupos_produto g ON g.id = p.grupo_id
       WHERE oi.orcamento_id = ? ORDER BY oi.sequencia, oi.id`
    )
    .all(id);

  const desconto = round2(orcamento.valor_bruto * (orcamento.desconto_percentual / 100));
  orcamento.desconto = desconto;
  orcamento.margem = round2(orcamento.valor_total - orcamento.frete - orcamento.custo_total);
  orcamento.margem_percentual = orcamento.valor_total - orcamento.frete > 0
    ? round2((orcamento.margem / (orcamento.valor_total - orcamento.frete)) * 100)
    : 0;
  orcamento.minutos_fabrica = round2(
    orcamento.linhas.reduce((s, l) => {
      const processo = db
        .prepare(`SELECT COALESCE(SUM(tempo_por_peca_min), 0) AS m FROM produto_processo WHERE produto_id = ?`)
        .get(l.produto_id).m;
      return s + processo * l.quantidade;
    }, 0)
  );
  return orcamento;
}

/**
 * Aprova o orçamento e o transforma em pedido: cria o pedido com os itens,
 * abre as ordens de produção e devolve o negócio como ganho no funil.
 */
export function converterEmPedido(id, opcoes = {}, db = getDb()) {
  const orcamento = buscarOrcamento(id, db);
  if (orcamento.pedido_id) throw conflict('Este orçamento já virou pedido', { pedido_id: orcamento.pedido_id });
  if (orcamento.status === 'RECUSADO') throw badRequest('Orçamento recusado não vira pedido');
  if (!orcamento.cliente_id) {
    throw badRequest('Cadastre o prospect como cliente antes de converter o orçamento em pedido');
  }
  if (orcamento.linhas.length === 0) throw badRequest('Orçamento sem itens');

  const entrega = opcoes.data_entrega
    ?? somarDias(hoje(), orcamento.prazo_entrega_dias || 0);

  const tx = db.transaction(() => {
    const numero = String(opcoes.numero ?? orcamento.numero.replace('ORC-', ''));
    const info = db
      .prepare(
        `INSERT INTO pedidos (numero, cliente_id, vendedor_id, data_pedido, data_entrega,
                              situacao, observacao, orcamento_id, oportunidade_id, condicao_pagamento)
         VALUES (?, ?, ?, ?, ?, 'ABERTO', ?, ?, ?, ?)`
      )
      .run(
        numero, orcamento.cliente_id, orcamento.vendedor_id, hoje(), entrega,
        orcamento.observacao, orcamento.id, orcamento.oportunidade_id, orcamento.condicao_pagamento
      );
    const pedidoId = info.lastInsertRowid;

    // O desconto do cabeçalho entra rateado no preço de cada item, para o
    // pedido carregar o valor que o cliente realmente aceitou.
    const fator = 1 - orcamento.desconto_percentual / 100;
    const inserirItem = db.prepare(
      `INSERT INTO pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, data_entrega)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const linha of orcamento.linhas) {
      inserirItem.run(pedidoId, linha.produto_id, linha.descricao,
                      linha.quantidade, arred(linha.preco_unitario * fator), entrega);
    }

    if (opcoes.abrir_ordens !== false) {
      for (const item of db.prepare(`SELECT id FROM pedido_itens WHERE pedido_id = ?`).all(pedidoId)) {
        abrirOrdem(item.id, { dataPrevista: entrega }, db);
      }
    }

    db.prepare(`UPDATE orcamentos SET status = 'APROVADO', pedido_id = ? WHERE id = ?`).run(pedidoId, orcamento.id);

    if (orcamento.oportunidade_id) {
      const ganha = db.prepare(`SELECT id FROM etapas_funil WHERE tipo = 'GANHA' ORDER BY ordem LIMIT 1`).get();
      if (ganha) moverEtapa(orcamento.oportunidade_id, ganha.id, {}, db);
    }
    return pedidoId;
  });

  const pedidoId = tx();
  return { pedido_id: pedidoId, orcamento: buscarOrcamento(id, db) };
}

function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
}

/** Desempenho dos orçamentos: quanto virou pedido e quanto se perdeu. */
export function desempenhoOrcamentos({ de = null, ate = null } = {}, db = getDb()) {
  const linhas = db
    .prepare(
      `SELECT status, COUNT(*) AS total, ROUND(SUM(valor_total), 2) AS valor
       FROM vw_orcamentos
       WHERE (? IS NULL OR data >= ?) AND (? IS NULL OR data <= ?)
       GROUP BY status`
    )
    .all(de, de, ate, ate);

  const porStatus = Object.fromEntries(linhas.map((l) => [l.status, l]));
  const aprovados = porStatus.APROVADO?.total ?? 0;
  const recusados = porStatus.RECUSADO?.total ?? 0;
  const decididos = aprovados + recusados;

  return {
    por_status: linhas,
    total: linhas.reduce((s, l) => s + l.total, 0),
    valor_total: round2(linhas.reduce((s, l) => s + l.valor, 0)),
    aprovados,
    valor_aprovado: porStatus.APROVADO?.valor ?? 0,
    recusados,
    conversao: decididos > 0 ? round2((aprovados / decididos) * 100) : 0,
    ticket_medio: aprovados > 0 ? round2((porStatus.APROVADO?.valor ?? 0) / aprovados) : 0,
    por_vendedor: db
      .prepare(
        `SELECT COALESCE(vendedor, 'Sem vendedor') AS vendedor,
                COUNT(*) AS orcamentos,
                SUM(CASE WHEN status = 'APROVADO' THEN 1 ELSE 0 END) AS aprovados,
                ROUND(SUM(CASE WHEN status = 'APROVADO' THEN valor_total ELSE 0 END), 2) AS valor_aprovado,
                ROUND(SUM(valor_total), 2) AS valor_total
         FROM vw_orcamentos
         WHERE (? IS NULL OR data >= ?) AND (? IS NULL OR data <= ?)
         GROUP BY vendedor ORDER BY valor_aprovado DESC`
      )
      .all(de, de, ate, ate),
    taxa_indireta: taxaCustoIndireto(db).por_minuto,
  };
}

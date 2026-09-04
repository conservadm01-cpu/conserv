import { getDb } from '../db/index.js';
import { badRequest, notFound, conflict } from '../lib/errors.js';
import { round2 } from '../lib/numbers.js';
import { hoje } from '../lib/dates.js';
import { registrarMovimento, necessidadeMateriais } from './estoque.js';
import { criarTitulo } from './financeiro.js';

const arred = (n, casas = 3) => Number(Number(n).toFixed(casas));

function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(dias || 0));
  return d.toISOString().slice(0, 10);
}

/* ==========================================================================
   REQUISIÇÕES
   ========================================================================== */

export function criarRequisicao(dados, db = getDb()) {
  const material = db.prepare(`SELECT * FROM materiais WHERE id = ?`).get(dados.material_id);
  if (!material) throw notFound('Material não encontrado');
  if (!(Number(dados.quantidade) > 0)) throw badRequest('Quantidade deve ser maior que zero');

  const info = db
    .prepare(
      `INSERT INTO requisicoes_compra
         (material_id, quantidade, urgencia, necessidade_em, origem, ordem_id, justificativa, usuario_id)
       VALUES (@material_id, @quantidade, @urgencia, @necessidade_em, @origem, @ordem_id, @justificativa, @usuario_id)`
    )
    .run({
      material_id: material.id,
      quantidade: Number(dados.quantidade),
      urgencia: dados.urgencia || 'NORMAL',
      necessidade_em: dados.necessidade_em ?? null,
      origem: dados.origem || 'MANUAL',
      ordem_id: dados.ordem_id ?? null,
      justificativa: dados.justificativa ?? null,
      usuario_id: dados.usuario_id ?? null,
    });
  return buscarRequisicao(info.lastInsertRowid, db);
}

export function buscarRequisicao(id, db = getDb()) {
  const r = db
    .prepare(
      `SELECT rc.*, m.descricao AS material, m.codigo, m.unidade, m.custo_unitario,
              f.nome AS fornecedor, f.id AS fornecedor_id, ve.saldo,
              ROUND(rc.quantidade - rc.atendida, 3) AS pendente
       FROM requisicoes_compra rc
       JOIN materiais m ON m.id = rc.material_id
       JOIN vw_estoque ve ON ve.id = m.id
       LEFT JOIN fornecedores f ON f.id = m.fornecedor_id
       WHERE rc.id = ?`
    )
    .get(id);
  if (!r) throw notFound('Requisição não encontrada');
  return r;
}

/**
 * Gera requisições a partir do MRP: o que as ordens em aberto vão exigir e o
 * estoque não cobre. Materiais que já têm requisição aberta são pulados — a
 * ideia é preencher a lacuna, não empilhar pedidos do mesmo item.
 */
export function gerarRequisicoesDoMrp({ ate = null, usuario_id = null } = {}, db = getDb()) {
  const necessidade = necessidadeMateriais({ ate }, db).filter((n) => n.comprar > 0);
  const jaAberta = db.prepare(
    `SELECT COUNT(*) AS n FROM requisicoes_compra
     WHERE material_id = ? AND status IN ('ABERTA','PARCIAL')`
  );

  const criadas = [];
  const puladas = [];
  const tx = db.transaction(() => {
    for (const linha of necessidade) {
      if (jaAberta.get(linha.id).n > 0) {
        puladas.push({ material: linha.descricao, motivo: 'já existe requisição em aberto' });
        continue;
      }
      criadas.push(
        criarRequisicao(
          {
            material_id: linha.id,
            quantidade: linha.comprar,
            origem: 'MRP',
            necessidade_em: linha.primeira_entrega,
            urgencia: linha.saldo <= 0 ? 'ALTA' : 'NORMAL',
            justificativa: `Necessidade de ${linha.necessidade} ${linha.unidade} em ${linha.ordens} ordens; saldo de ${linha.saldo}.`,
            usuario_id,
          },
          db
        )
      );
    }
  });
  tx();
  return { criadas, puladas };
}

/** Requisições de materiais cujo saldo caiu abaixo do mínimo cadastrado. */
export function gerarRequisicoesDoMinimo({ usuario_id = null } = {}, db = getDb()) {
  const abaixo = db
    .prepare(
      `SELECT ve.id, ve.descricao, ve.unidade, ve.saldo, ve.estoque_min
       FROM vw_estoque ve
       WHERE ve.ativo = 1 AND ve.estoque_min > 0 AND ve.saldo <= ve.estoque_min
         AND NOT EXISTS (SELECT 1 FROM requisicoes_compra rc
                         WHERE rc.material_id = ve.id AND rc.status IN ('ABERTA','PARCIAL'))`
    )
    .all();

  const criadas = [];
  db.transaction(() => {
    for (const m of abaixo) {
      // Repõe até o dobro do mínimo: abastecer só até o mínimo faz o alerta
      // voltar na primeira saída.
      const quantidade = arred(m.estoque_min * 2 - m.saldo);
      if (quantidade <= 0) continue;
      criadas.push(
        criarRequisicao(
          {
            material_id: m.id,
            quantidade,
            origem: 'ESTOQUE_MINIMO',
            urgencia: m.saldo <= 0 ? 'URGENTE' : 'ALTA',
            justificativa: `Saldo de ${m.saldo} ${m.unidade} contra mínimo de ${m.estoque_min}.`,
            usuario_id,
          },
          db
        )
      );
    }
  })();
  return { criadas };
}

/* ==========================================================================
   PEDIDOS DE COMPRA
   ========================================================================== */

export function proximoNumeroCompra(db = getDb(), ano = new Date().getFullYear()) {
  const prefixo = `PC-${ano}-`;
  const ultimo = db
    .prepare(`SELECT numero FROM pedidos_compra WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1`)
    .get(`${prefixo}%`);
  const seq = ultimo ? Number(ultimo.numero.slice(prefixo.length)) + 1 : 1;
  return `${prefixo}${String(seq).padStart(4, '0')}`;
}

export function criarPedidoCompra(dados, db = getDb()) {
  const fornecedor = db.prepare(`SELECT * FROM fornecedores WHERE id = ?`).get(dados.fornecedor_id);
  if (!fornecedor) throw notFound('Fornecedor não encontrado');
  if (!dados.itens?.length) throw badRequest('O pedido de compra precisa de ao menos um item');

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO pedidos_compra
           (numero, fornecedor_id, data, previsao_entrega, condicao_pagamento,
            prazo_pagamento_dias, frete, desconto, status, observacao, usuario_id)
         VALUES (@numero, @fornecedor_id, @data, @previsao_entrega, @condicao_pagamento,
            @prazo_pagamento_dias, @frete, @desconto, @status, @observacao, @usuario_id)`
      )
      .run({
        numero: dados.numero || proximoNumeroCompra(db),
        fornecedor_id: fornecedor.id,
        data: dados.data || hoje(),
        previsao_entrega: dados.previsao_entrega
          ?? somarDias(dados.data || hoje(), fornecedor.prazo_entrega_dias || 0),
        condicao_pagamento: dados.condicao_pagamento ?? fornecedor.condicao_pagamento ?? null,
        prazo_pagamento_dias: dados.prazo_pagamento_dias ?? 30,
        frete: dados.frete ?? 0,
        desconto: dados.desconto ?? 0,
        status: dados.status ?? 'RASCUNHO',
        observacao: dados.observacao ?? null,
        usuario_id: dados.usuario_id ?? null,
      });

    gravarItensCompra(info.lastInsertRowid, dados.itens, db);
    return info.lastInsertRowid;
  });

  return buscarPedidoCompra(tx(), db);
}

function gravarItensCompra(pedidoId, itens, db) {
  const jaRecebido = db
    .prepare(`SELECT COALESCE(SUM(recebido), 0) AS n FROM pedido_compra_itens WHERE pedido_compra_id = ?`)
    .get(pedidoId).n;
  if (jaRecebido > 0) throw conflict('Pedido com recebimento não pode ter os itens trocados');

  db.prepare(`DELETE FROM pedido_compra_itens WHERE pedido_compra_id = ?`).run(pedidoId);
  const inserir = db.prepare(
    `INSERT INTO pedido_compra_itens (pedido_compra_id, material_id, requisicao_id, quantidade, preco_unitario, observacao)
     VALUES (@pedido_compra_id, @material_id, @requisicao_id, @quantidade, @preco_unitario, @observacao)`
  );
  for (const item of itens) {
    if (!(Number(item.quantidade) > 0)) throw badRequest('Quantidade do item deve ser maior que zero');
    const material = db.prepare(`SELECT custo_unitario FROM materiais WHERE id = ?`).get(item.material_id);
    if (!material) throw notFound(`Material ${item.material_id} não encontrado`);
    inserir.run({
      pedido_compra_id: pedidoId,
      material_id: item.material_id,
      requisicao_id: item.requisicao_id ?? null,
      quantidade: Number(item.quantidade),
      preco_unitario: item.preco_unitario ?? material.custo_unitario,
      observacao: item.observacao ?? null,
    });
  }
}

export function atualizarPedidoCompra(id, dados, db = getDb()) {
  const atual = db.prepare(`SELECT * FROM pedidos_compra WHERE id = ?`).get(id);
  if (!atual) throw notFound('Pedido de compra não encontrado');
  if (atual.status === 'RECEBIDO') throw conflict('Pedido já recebido não pode ser alterado');

  const campos = ['fornecedor_id', 'data', 'previsao_entrega', 'condicao_pagamento',
                  'prazo_pagamento_dias', 'frete', 'desconto', 'status', 'observacao']
    .filter((c) => dados[c] !== undefined);

  db.transaction(() => {
    if (campos.length) {
      db.prepare(`UPDATE pedidos_compra SET ${campos.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`)
        .run({ ...Object.fromEntries(campos.map((c) => [c, dados[c] ?? null])), id });
    }
    if (dados.itens) gravarItensCompra(id, dados.itens, db);
  })();

  return buscarPedidoCompra(id, db);
}

export function buscarPedidoCompra(id, db = getDb()) {
  const pedido = db.prepare(`SELECT * FROM vw_pedidos_compra WHERE id = ?`).get(id);
  if (!pedido) throw notFound('Pedido de compra não encontrado');

  pedido.linhas = db
    .prepare(
      `SELECT pci.*, m.descricao AS material, m.codigo, m.unidade, ve.saldo,
              ROUND(pci.quantidade * pci.preco_unitario, 2) AS total,
              ROUND(pci.quantidade - pci.recebido, 3) AS pendente
       FROM pedido_compra_itens pci
       JOIN materiais m ON m.id = pci.material_id
       JOIN vw_estoque ve ON ve.id = m.id
       WHERE pci.pedido_compra_id = ? ORDER BY pci.id`
    )
    .all(id);

  pedido.recebimentos = db
    .prepare(
      `SELECT r.*, l.nome AS local, u.nome AS usuario,
              (SELECT COUNT(*) FROM recebimento_itens ri WHERE ri.recebimento_id = r.id) AS itens,
              (SELECT ROUND(SUM(ri.quantidade * ri.preco_unitario), 2)
                 FROM recebimento_itens ri WHERE ri.recebimento_id = r.id) AS valor
       FROM recebimentos r
       LEFT JOIN locais_estoque l ON l.id = r.local_id
       LEFT JOIN usuarios u ON u.id = r.usuario_id
       WHERE r.pedido_compra_id = ? ORDER BY r.data, r.id`
    )
    .all(id);

  return pedido;
}

/**
 * Monta um pedido de compra a partir de requisições em aberto, agrupando por
 * fornecedor. Requisições do mesmo material entram somadas numa linha só.
 */
export function pedidosAPartirDeRequisicoes(ids, { usuario_id = null } = {}, db = getDb()) {
  const requisicoes = ids.map((id) => buscarRequisicao(id, db)).filter((r) => r.pendente > 0);
  if (requisicoes.length === 0) throw badRequest('Nenhuma requisição pendente entre as informadas');

  const porFornecedor = new Map();
  for (const r of requisicoes) {
    const chave = r.fornecedor_id ?? 0;
    if (!porFornecedor.has(chave)) porFornecedor.set(chave, []);
    porFornecedor.get(chave).push(r);
  }

  const semFornecedor = porFornecedor.get(0);
  if (semFornecedor) {
    throw badRequest(
      `Sem fornecedor no cadastro do material: ${semFornecedor.map((r) => r.material).join(', ')}`
    );
  }

  const criados = [];
  db.transaction(() => {
    for (const [fornecedorId, lista] of porFornecedor) {
      const porMaterial = new Map();
      for (const r of lista) {
        const atual = porMaterial.get(r.material_id) ?? {
          material_id: r.material_id, quantidade: 0, preco_unitario: r.custo_unitario, requisicao_id: r.id,
        };
        atual.quantidade = arred(atual.quantidade + r.pendente);
        porMaterial.set(r.material_id, atual);
      }
      const pedido = criarPedidoCompra(
        { fornecedor_id: fornecedorId, itens: [...porMaterial.values()], usuario_id },
        db
      );
      // As requisições ficam atendidas na emissão; o recebimento cuida do estoque.
      for (const r of lista) {
        db.prepare(
          `UPDATE requisicoes_compra SET atendida = quantidade, status = 'ATENDIDA' WHERE id = ?`
        ).run(r.id);
      }
      criados.push(pedido);
    }
  })();

  return criados;
}

/* ==========================================================================
   RECEBIMENTO
   ========================================================================== */

/**
 * Recebe (total ou parcialmente) um pedido de compra: entra material no
 * estoque, atualiza o status do pedido e, quando pedido, gera a conta a pagar
 * pelo prazo combinado.
 */
export function receber(pedidoId, dados = {}, db = getDb()) {
  const pedido = db.prepare(`SELECT * FROM vw_pedidos_compra WHERE id = ?`).get(pedidoId);
  if (!pedido) throw notFound('Pedido de compra não encontrado');
  if (pedido.status === 'CANCELADO') throw conflict('Pedido cancelado não recebe material');
  if (pedido.status === 'RECEBIDO') throw conflict('Pedido já foi totalmente recebido');

  const itens = db
    .prepare(`SELECT * FROM pedido_compra_itens WHERE pedido_compra_id = ?`)
    .all(pedidoId);
  const solicitados = new Map((dados.itens ?? []).map((i) => [Number(i.item_id), i]));

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO recebimentos (pedido_compra_id, data, nota_fiscal, local_id, observacao, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        pedidoId,
        dados.data || hoje(),
        dados.nota_fiscal ?? null,
        dados.local_id ?? null,
        dados.observacao ?? null,
        dados.usuario_id ?? null
      );
    const recebimentoId = info.lastInsertRowid;

    const inserirItem = db.prepare(
      `INSERT INTO recebimento_itens (recebimento_id, item_id, material_id, quantidade, preco_unitario, movimento_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    let valor = 0;
    let recebeuAlgo = false;

    for (const item of itens) {
      const pendente = arred(item.quantidade - item.recebido);
      if (pendente <= 0) continue;

      const pedidoDoItem = solicitados.size ? solicitados.get(item.id) : { quantidade: pendente };
      if (!pedidoDoItem) continue;
      const quantidade = Number(pedidoDoItem.quantidade ?? pendente);
      if (quantidade <= 0) continue;
      if (quantidade > pendente + 1e-6) {
        const m = db.prepare(`SELECT descricao FROM materiais WHERE id = ?`).get(item.material_id);
        throw badRequest(
          `Recebimento acima do pedido para "${m.descricao}": faltam ${pendente} e foram informados ${quantidade}`
        );
      }

      const preco = Number(pedidoDoItem.preco_unitario ?? item.preco_unitario);
      const movimento = registrarMovimento(
        {
          material_id: item.material_id,
          tipo: 'ENTRADA',
          quantidade,
          custo_unitario: preco,
          data: dados.data || hoje(),
          documento: dados.nota_fiscal ?? pedido.numero,
          fornecedor_id: pedido.fornecedor_id,
          local_id: dados.local_id ?? null,
          usuario_id: dados.usuario_id ?? null,
          observacao: `Recebimento do pedido ${pedido.numero}`,
        },
        db
      );

      inserirItem.run(recebimentoId, item.id, item.material_id, quantidade, preco, movimento.id);
      db.prepare(`UPDATE pedido_compra_itens SET recebido = recebido + ? WHERE id = ?`)
        .run(quantidade, item.id);

      valor += quantidade * preco;
      recebeuAlgo = true;
    }

    if (!recebeuAlgo) throw badRequest('Nenhuma quantidade pendente para receber');

    atualizarStatusCompra(pedidoId, db);

    // O título a pagar nasce do recebimento — é o que a nota fiscal cobra.
    if (dados.gerar_titulo !== false) {
      const categoria = db
        .prepare(`SELECT id FROM categorias_financeiras WHERE tipo = 'PAGAR' AND nome LIKE 'Compra%' ORDER BY id LIMIT 1`)
        .get()?.id ?? null;
      const [titulo] = criarTitulo(
        {
          tipo: 'PAGAR',
          descricao: `${pedido.numero} — ${pedido.fornecedor}`,
          fornecedor_id: pedido.fornecedor_id,
          categoria_id: categoria,
          documento: dados.nota_fiscal ?? pedido.numero,
          valor: round2(valor),
          vencimento: somarDias(dados.data || hoje(), pedido.prazo_pagamento_dias || 0),
          emissao: dados.data || hoje(),
          usuario_id: dados.usuario_id ?? null,
        },
        db
      );
      db.prepare(`UPDATE recebimentos SET titulo_id = ? WHERE id = ?`).run(titulo.id, recebimentoId);
    }

    return recebimentoId;
  });

  const recebimentoId = tx();
  return { recebimento_id: recebimentoId, pedido: buscarPedidoCompra(pedidoId, db) };
}

/** O status do pedido de compra é derivado do que já entrou. */
function atualizarStatusCompra(pedidoId, db) {
  const { total, recebido } = db
    .prepare(
      `SELECT COALESCE(SUM(quantidade), 0) AS total, COALESCE(SUM(recebido), 0) AS recebido
       FROM pedido_compra_itens WHERE pedido_compra_id = ?`
    )
    .get(pedidoId);
  const status = recebido <= 0 ? 'CONFIRMADO' : recebido >= total - 1e-6 ? 'RECEBIDO' : 'PARCIAL';
  db.prepare(`UPDATE pedidos_compra SET status = ? WHERE id = ? AND status <> 'CANCELADO'`)
    .run(status, pedidoId);
}

/** Estorna um recebimento inteiro: desfaz a entrada e cancela o título gerado. */
export function estornarRecebimento(id, db = getDb()) {
  const recebimento = db.prepare(`SELECT * FROM recebimentos WHERE id = ?`).get(id);
  if (!recebimento) throw notFound('Recebimento não encontrado');

  const itens = db.prepare(`SELECT * FROM recebimento_itens WHERE recebimento_id = ?`).all(id);

  db.transaction(() => {
    for (const item of itens) {
      // Estornar a entrada é uma saída: se o material já foi consumido, o
      // saldo não cobre e a operação é recusada — como tem de ser.
      registrarMovimento(
        {
          material_id: item.material_id,
          tipo: 'SAIDA',
          quantidade: item.quantidade,
          custo_unitario: item.preco_unitario,
          documento: `ESTORNO ${recebimento.nota_fiscal ?? id}`,
          observacao: 'Estorno de recebimento',
        },
        db
      );
      db.prepare(`UPDATE pedido_compra_itens SET recebido = recebido - ? WHERE id = ?`)
        .run(item.quantidade, item.item_id);
    }
    if (recebimento.titulo_id) {
      const pago = db
        .prepare(`SELECT COALESCE(SUM(valor), 0) AS n FROM baixas WHERE titulo_id = ?`)
        .get(recebimento.titulo_id).n;
      if (pago > 0) throw conflict('O título deste recebimento já tem baixa — estorne a baixa primeiro');
      db.prepare(`DELETE FROM titulos WHERE id = ?`).run(recebimento.titulo_id);
    }
    db.prepare(`DELETE FROM recebimentos WHERE id = ?`).run(id);
    atualizarStatusCompra(recebimento.pedido_compra_id, db);
  })();

  return buscarPedidoCompra(recebimento.pedido_compra_id, db);
}

/* ==========================================================================
   INVENTÁRIO
   ========================================================================== */

/** Abre a contagem congelando o saldo que o sistema acredita ter. */
export function abrirInventario(dados, db = getDb()) {
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO inventarios (descricao, data, local_id, observacao, usuario_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(dados.descricao, dados.data || hoje(), dados.local_id ?? null,
           dados.observacao ?? null, dados.usuario_id ?? null);
    const inventarioId = info.lastInsertRowid;

    const materiais = dados.materiais?.length
      ? db.prepare(
          `SELECT id, saldo FROM vw_estoque WHERE id IN (${dados.materiais.map(() => '?').join(',')})`
        ).all(...dados.materiais)
      : db.prepare(`SELECT id, saldo FROM vw_estoque WHERE ativo = 1`).all();

    const inserir = db.prepare(
      `INSERT INTO inventario_itens (inventario_id, material_id, saldo_sistema) VALUES (?, ?, ?)`
    );
    for (const m of materiais) inserir.run(inventarioId, m.id, m.saldo);
    return inventarioId;
  });
  return buscarInventario(tx(), db);
}

export function buscarInventario(id, db = getDb()) {
  const inventario = db
    .prepare(
      `SELECT i.*, l.nome AS local, u.nome AS usuario FROM inventarios i
       LEFT JOIN locais_estoque l ON l.id = i.local_id
       LEFT JOIN usuarios u ON u.id = i.usuario_id WHERE i.id = ?`
    )
    .get(id);
  if (!inventario) throw notFound('Inventário não encontrado');

  inventario.linhas = db
    .prepare(
      `SELECT ii.*, m.descricao AS material, m.codigo, m.unidade, m.custo_unitario,
              CASE WHEN ii.contado IS NULL THEN NULL
                   ELSE ROUND(ii.contado - ii.saldo_sistema, 3) END AS diferenca,
              CASE WHEN ii.contado IS NULL THEN NULL
                   ELSE ROUND((ii.contado - ii.saldo_sistema) * m.custo_unitario, 2) END AS valor_diferenca
       FROM inventario_itens ii
       JOIN materiais m ON m.id = ii.material_id
       WHERE ii.inventario_id = ? ORDER BY m.descricao`
    )
    .all(id);

  const contados = inventario.linhas.filter((l) => l.contado !== null);
  inventario.contados = contados.length;
  inventario.pendentes = inventario.linhas.length - contados.length;
  inventario.divergencias = contados.filter((l) => Math.abs(l.diferenca) > 1e-6).length;
  inventario.valor_divergencia = round2(contados.reduce((s, l) => s + (l.valor_diferenca ?? 0), 0));
  return inventario;
}

export function contar(inventarioId, materialId, contado, db = getDb()) {
  const inventario = db.prepare(`SELECT * FROM inventarios WHERE id = ?`).get(inventarioId);
  if (!inventario) throw notFound('Inventário não encontrado');
  if (inventario.status !== 'ABERTO') throw conflict('Inventário fechado não aceita contagem');
  if (Number(contado) < 0) throw badRequest('A contagem não pode ser negativa');

  const info = db
    .prepare(`UPDATE inventario_itens SET contado = ? WHERE inventario_id = ? AND material_id = ?`)
    .run(Number(contado), inventarioId, materialId);
  if (info.changes === 0) throw notFound('Material não faz parte deste inventário');
  return buscarInventario(inventarioId, db);
}

/**
 * Fecha o inventário lançando um ajuste para cada divergência. O ajuste sobe
 * ou desce o saldo até o que foi contado — a prateleira é a verdade.
 */
export function fecharInventario(id, { usuario_id = null } = {}, db = getDb()) {
  const inventario = buscarInventario(id, db);
  if (inventario.status !== 'ABERTO') throw conflict('Inventário já foi fechado');
  if (inventario.contados === 0) throw badRequest('Nenhum material foi contado');

  const ajustes = [];
  db.transaction(() => {
    for (const linha of inventario.linhas) {
      if (linha.contado === null || Math.abs(linha.diferenca) <= 1e-6) continue;
      const movimento = registrarMovimento(
        {
          material_id: linha.material_id,
          tipo: linha.diferenca > 0 ? 'AJUSTE' : 'SAIDA',
          quantidade: Math.abs(linha.diferenca),
          custo_unitario: linha.custo_unitario,
          data: inventario.data,
          documento: `INVENTARIO ${id}`,
          local_id: inventario.local_id,
          usuario_id,
          observacao: `Contagem ${linha.contado} contra saldo ${linha.saldo_sistema}`,
        },
        db
      );
      db.prepare(`UPDATE inventario_itens SET movimento_id = ? WHERE id = ?`).run(movimento.id, linha.id);
      ajustes.push({ material: linha.material, diferenca: linha.diferenca });
    }
    db.prepare(`UPDATE inventarios SET status = 'FECHADO', fechado_em = datetime('now') WHERE id = ?`).run(id);
  })();

  return { inventario: buscarInventario(id, db), ajustes };
}

/* ==========================================================================
   INDICADORES
   ========================================================================== */

export function resumoCompras(db = getDb()) {
  const requisicoes = db
    .prepare(
      `SELECT COUNT(*) AS abertas,
              COALESCE(SUM((rc.quantidade - rc.atendida) * m.custo_unitario), 0) AS valor,
              SUM(CASE WHEN rc.urgencia IN ('ALTA','URGENTE') THEN 1 ELSE 0 END) AS urgentes
       FROM requisicoes_compra rc JOIN materiais m ON m.id = rc.material_id
       WHERE rc.status IN ('ABERTA','PARCIAL')`
    )
    .get();

  const pedidos = db
    .prepare(
      `SELECT COUNT(*) AS abertos,
              COALESCE(SUM(valor_total), 0) AS valor,
              SUM(CASE WHEN dias_atraso > 0 THEN 1 ELSE 0 END) AS atrasados
       FROM vw_pedidos_compra WHERE status IN ('RASCUNHO','ENVIADO','CONFIRMADO','PARCIAL')`
    )
    .get();

  return {
    requisicoes_abertas: requisicoes.abertas,
    valor_requisitado: round2(requisicoes.valor),
    requisicoes_urgentes: requisicoes.urgentes ?? 0,
    pedidos_abertos: pedidos.abertos,
    valor_em_pedido: round2(pedidos.valor),
    pedidos_atrasados: pedidos.atrasados ?? 0,
    por_fornecedor: db
      .prepare(
        `SELECT fornecedor, COUNT(*) AS pedidos, ROUND(SUM(valor_total), 2) AS valor,
                SUM(CASE WHEN dias_atraso > 0 THEN 1 ELSE 0 END) AS atrasados
         FROM vw_pedidos_compra WHERE status <> 'CANCELADO'
         GROUP BY fornecedor ORDER BY valor DESC LIMIT 10`
      )
      .all(),
    entregas_previstas: db
      .prepare(
        `SELECT * FROM vw_pedidos_compra
         WHERE status IN ('ENVIADO','CONFIRMADO','PARCIAL') AND previsao_entrega IS NOT NULL
         ORDER BY previsao_entrega LIMIT 15`
      )
      .all(),
  };
}

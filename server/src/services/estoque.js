import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { round2 } from '../lib/numbers.js';
import { hoje } from '../lib/dates.js';

/** Saldo atual de um material (entradas + ajustes − saídas). */
export function saldo(materialId, db = getDb()) {
  const row = db.prepare(`SELECT saldo FROM vw_estoque WHERE id = ?`).get(materialId);
  if (!row) throw notFound('Material não encontrado');
  return row.saldo;
}

/**
 * Registra um movimento de estoque. Saídas não podem deixar o saldo negativo:
 * o almoxarifado precisa refletir o que existe fisicamente.
 */
export function registrarMovimento(dados, db = getDb()) {
  const material = db.prepare(`SELECT * FROM materiais WHERE id = ?`).get(dados.material_id);
  if (!material) throw notFound('Material não encontrado');

  const quantidade = Number(dados.quantidade);
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw badRequest('Quantidade deve ser maior que zero');
  }
  if (dados.tipo === 'SAIDA') {
    const disponivel = saldo(material.id, db);
    if (quantidade > disponivel + 1e-9) {
      throw badRequest(
        `Saldo insuficiente de "${material.descricao}": disponível ${round2(disponivel)} ${material.unidade}, solicitado ${round2(quantidade)} ${material.unidade}`
      );
    }
  }

  const info = db
    .prepare(
      `INSERT INTO movimentos_estoque
         (material_id, tipo, quantidade, custo_unitario, data, documento, ordem_id, fornecedor_id, usuario_id, observacao, local_id)
       VALUES (@material_id, @tipo, @quantidade, @custo_unitario, @data, @documento, @ordem_id, @fornecedor_id, @usuario_id, @observacao, @local_id)`
    )
    .run({
      material_id: material.id,
      tipo: dados.tipo,
      quantidade,
      custo_unitario: Number(dados.custo_unitario ?? material.custo_unitario ?? 0),
      data: dados.data || hoje(),
      documento: dados.documento || null,
      ordem_id: dados.ordem_id || null,
      fornecedor_id: dados.fornecedor_id || null,
      usuario_id: dados.usuario_id || null,
      observacao: dados.observacao || null,
      local_id: dados.local_id ?? material.local_padrao_id ?? null,
    });

  // Entrada com custo informado atualiza o custo de referência do material.
  if (dados.tipo === 'ENTRADA' && Number(dados.custo_unitario) > 0) {
    db.prepare(`UPDATE materiais SET custo_unitario = ? WHERE id = ?`)
      .run(Number(dados.custo_unitario), material.id);
  }

  return db.prepare(`SELECT * FROM movimentos_estoque WHERE id = ?`).get(info.lastInsertRowid);
}

/**
 * Baixa na ordem de produção o material ainda pendente da ficha técnica.
 * Tudo em uma transação: ou baixa o conjunto, ou não baixa nada.
 */
export function baixarMateriaisDaOrdem(ordemId, { usuarioId = null, itens = null } = {}, db = getDb()) {
  const ordem = db.prepare(`SELECT * FROM ordens_producao WHERE id = ?`).get(ordemId);
  if (!ordem) throw notFound('Ordem de produção não encontrada');

  const previstos = db.prepare(`SELECT * FROM ordem_materiais WHERE ordem_id = ?`).all(ordemId);
  if (previstos.length === 0) {
    throw badRequest('Esta ordem não tem ficha técnica cadastrada — nada a baixar');
  }

  const solicitados = new Map((itens || []).map((i) => [Number(i.material_id), Number(i.quantidade)]));

  const tx = db.transaction(() => {
    const movimentos = [];
    for (const prev of previstos) {
      const pendente = round2(prev.quantidade_prevista - prev.quantidade_baixada);
      const qtd = solicitados.size ? (solicitados.get(prev.material_id) ?? 0) : pendente;
      if (qtd <= 0) continue;
      if (qtd > pendente + 1e-9) {
        const mat = db.prepare(`SELECT descricao FROM materiais WHERE id = ?`).get(prev.material_id);
        throw badRequest(`Baixa acima do previsto para "${mat.descricao}": pendente ${pendente}, solicitado ${qtd}`);
      }
      movimentos.push(
        registrarMovimento(
          {
            material_id: prev.material_id,
            tipo: 'SAIDA',
            quantidade: qtd,
            documento: ordem.numero,
            ordem_id: ordemId,
            usuario_id: usuarioId,
            observacao: 'Baixa de material para produção',
          },
          db
        )
      );
      db.prepare(`UPDATE ordem_materiais SET quantidade_baixada = quantidade_baixada + ? WHERE id = ?`)
        .run(qtd, prev.id);
    }
    if (movimentos.length === 0) throw badRequest('Nenhuma quantidade pendente para baixar');
    return movimentos;
  });

  return tx();
}

/**
 * MRP simplificado: necessidade líquida de materiais das ordens ainda não concluídas.
 * necessidade = Σ(previsto − baixado) por material; a comprar = necessidade − saldo.
 */
export function necessidadeMateriais({ ate = null } = {}, db = getDb()) {
  return db
    .prepare(
      `SELECT
         m.id, m.codigo, m.descricao, m.unidade, m.custo_unitario, m.estoque_min,
         f.nome AS fornecedor,
         ve.saldo,
         ROUND(SUM(om.quantidade_prevista - om.quantidade_baixada), 2) AS necessidade,
         ROUND(MAX(SUM(om.quantidade_prevista - om.quantidade_baixada) - ve.saldo, 0), 2) AS comprar,
         MIN(o.data_prevista) AS primeira_entrega,
         COUNT(DISTINCT o.id) AS ordens
       FROM ordem_materiais om
       JOIN ordens_producao o ON o.id = om.ordem_id
       JOIN materiais m ON m.id = om.material_id
       JOIN vw_estoque ve ON ve.id = m.id
       LEFT JOIN fornecedores f ON f.id = m.fornecedor_id
       WHERE o.status IN ('ABERTA','EM_PRODUCAO')
         AND om.quantidade_prevista > om.quantidade_baixada
         AND (? IS NULL OR o.data_prevista <= ?)
       GROUP BY m.id
       ORDER BY comprar DESC, m.descricao`
    )
    .all(ate, ate)
    .map((r) => ({ ...r, valor_compra: round2((r.comprar || 0) * r.custo_unitario) }));
}

import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { asyncHandler, notFound, badRequest } from '../lib/errors.js';
import { round2 } from '../lib/numbers.js';
import { semanaISO } from '../lib/dates.js';
import { abrirOrdem } from '../services/producao.js';
import { exigir } from '../middleware/auth.js';
import { montarFiltros, montarOrdem, limitar } from '../lib/filtros.js';

export const router = Router();
const podeEditar = exigir('pedidos.editar');

const itemSchema = z.object({
  id: z.number().int().optional(),
  produto_id: z.number().int(),
  descricao: z.string().trim().nullish(),
  quantidade: z.number().positive(),
  preco_unitario: z.number().min(0).default(0),
  liquidacao: z.number().min(0).default(0),
  data_entrega: z.string().trim().nullish(),
});

const pedidoSchema = z.object({
  numero: z.string().trim().min(1),
  cliente_id: z.number().int(),
  vendedor_id: z.number().int().nullish(),
  data_pedido: z.string().trim(),
  data_entrega: z.string().trim().nullish(),
  situacao: z.enum(['ABERTO', 'FATURADO', 'ENTREGUE', 'CANCELADO']).optional(),
  nota_fiscal: z.string().trim().nullish(),
  observacao: z.string().trim().nullish(),
  itens: z.array(itemSchema).min(1, 'Informe ao menos um item'),
});

/** Filtros aceitos pela listagem de pedidos. */
const FILTROS_PEDIDO = {
  busca: { tipo: 'busca', colunas: ['p.numero', 'c.nome', 'p.observacao', 'p.nota_fiscal'] },
  situacao: { tipo: 'igual', coluna: 'p.situacao' },
  cliente_id: { tipo: 'igual', coluna: 'p.cliente_id', numero: true },
  vendedor_id: { tipo: 'igual', coluna: 'p.vendedor_id', numero: true },
  categoria: { tipo: 'igual', coluna: 'cc.nome' },
  de: { tipo: 'de', coluna: 'p.data_pedido' },
  ate: { tipo: 'ate', coluna: 'p.data_pedido' },
  entrega_de: { tipo: 'de', coluna: 'p.data_entrega' },
  entrega_ate: { tipo: 'ate', coluna: 'p.data_entrega' },
  atrasados: {
    tipo: 'booleano',
    quandoVerdadeiro: `p.data_entrega < date('now') AND p.situacao IN ('ABERTO','FATURADO')`,
  },
};

/** Lista de pedidos com totais agregados dos itens. */
router.get(
  '/',
  asyncHandler((req, res) => {
    const f = montarFiltros(req.query, FILTROS_PEDIDO);
    const where = f.where;
    const params = f.params;
    const limite = limitar(req.query, 200, 2000);
    const ordem = montarOrdem(
      req.query,
      ['p.numero', 'p.data_pedido', 'p.data_entrega', 'c.nome', 'total', 'pecas'],
      'p.data_pedido DESC, p.id DESC'
    );
    res.json(
      getDb()
        .prepare(
          `SELECT p.*, c.nome AS cliente, cc.nome AS categoria, v.nome AS vendedor,
                  COUNT(i.id) AS itens,
                  COALESCE(SUM(i.quantidade), 0) AS pecas,
                  ROUND(COALESCE(SUM(i.quantidade * i.preco_unitario), 0), 2) AS total,
                  ROUND(COALESCE(SUM(i.liquidacao), 0), 2) AS liquidacao,
                  CASE WHEN p.data_entrega < date('now') AND p.situacao IN ('ABERTO','FATURADO')
                       THEN 1 ELSE 0 END AS atrasado
           FROM pedidos p
           JOIN clientes c ON c.id = p.cliente_id
           LEFT JOIN categorias_cliente cc ON cc.id = c.categoria_id
           LEFT JOIN vendedores v ON v.id = p.vendedor_id
           LEFT JOIN pedido_itens i ON i.pedido_id = p.id
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           GROUP BY p.id
           ORDER BY ${ordem}
           LIMIT ?`
        )
        .all(...params, limite)
    );
  })
);

const FILTROS_CARTEIRA = {
  busca: { tipo: 'busca', colunas: ['v.cliente', 'v.produto', 'v.pedido_numero'] },
  grupo: { tipo: 'igual', coluna: 'v.grupo' },
  linha: { tipo: 'igual', coluna: 'v.linha' },
  categoria: { tipo: 'igual', coluna: 'v.categoria' },
  cliente_id: { tipo: 'igual', coluna: 'v.cliente_id', numero: true },
  vendedor: { tipo: 'igual', coluna: 'v.vendedor' },
  situacao: { tipo: 'igual', coluna: 'v.situacao' },
  ordem_status: { tipo: 'igual', coluna: 'v.ordem_status' },
  de: { tipo: 'de', coluna: 'v.data_pedido' },
  ate: { tipo: 'ate', coluna: 'v.data_pedido' },
  entrega_de: { tipo: 'de', coluna: 'v.data_entrega' },
  entrega_ate: { tipo: 'ate', coluna: 'v.data_entrega' },
  atrasados: { tipo: 'booleano', quandoVerdadeiro: `v.data_entrega < date('now')` },
};

/** Carteira em nível de item — a visão equivalente à planilha "PCP + MO". */
router.get(
  '/itens/carteira',
  asyncHandler((req, res) => {
    const f = montarFiltros(req.query, FILTROS_CARTEIRA);
    const where = [...f.where];
    if (req.query.somente_abertos !== 'false') {
      where.push(`v.situacao IN ('ABERTO','FATURADO')`);
      where.push(`(v.ordem_status IS NULL OR v.ordem_status NOT IN ('ENTREGUE','CANCELADA'))`);
    }
    const ordem = montarOrdem(
      req.query,
      ['v.data_entrega', 'v.data_pedido', 'v.cliente', 'v.produto', 'v.total', 'v.quantidade'],
      'v.data_entrega IS NULL, v.data_entrega ASC'
    );
    const linhas = getDb()
      .prepare(
        `SELECT v.*, CAST(julianday('now') - julianday(v.data_entrega) AS INTEGER) AS dias_atraso
         FROM vw_itens v ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY ${ordem} LIMIT ?`
      )
      .all(...f.params, limitar(req.query, 500, 5000));
    res.json(linhas.map((l) => ({ ...l, semana_entrega: semanaISO(l.data_entrega) })));
  })
);

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const db = getDb();
    const pedido = db
      .prepare(
        `SELECT p.*, c.nome AS cliente, cc.nome AS categoria, v.nome AS vendedor
         FROM pedidos p
         JOIN clientes c ON c.id = p.cliente_id
         LEFT JOIN categorias_cliente cc ON cc.id = c.categoria_id
         LEFT JOIN vendedores v ON v.id = p.vendedor_id
         WHERE p.id = ?`
      )
      .get(req.params.id);
    if (!pedido) throw notFound('Pedido não encontrado');

    pedido.itens = db
      .prepare(
        `SELECT i.*, ROUND(i.quantidade * i.preco_unitario, 2) AS total,
                COALESCE(i.descricao, pr.descricao) AS produto, pr.linha, g.nome AS grupo,
                o.id AS ordem_id, o.numero AS ordem_numero, o.status AS ordem_status
         FROM pedido_itens i
         JOIN produtos pr ON pr.id = i.produto_id
         LEFT JOIN grupos_produto g ON g.id = pr.grupo_id
         LEFT JOIN ordens_producao o ON o.pedido_item_id = i.id
         WHERE i.pedido_id = ? ORDER BY i.id`
      )
      .all(req.params.id);

    pedido.total = round2(pedido.itens.reduce((s, i) => s + i.total, 0));
    pedido.pecas = pedido.itens.reduce((s, i) => s + i.quantidade, 0);
    pedido.liquidacao = round2(pedido.itens.reduce((s, i) => s + i.liquidacao, 0));
    pedido.semana_pedido = semanaISO(pedido.data_pedido);
    pedido.semana_entrega = semanaISO(pedido.data_entrega);
    res.json(pedido);
  })
);

router.post(
  '/',
  podeEditar,
  asyncHandler((req, res) => {
    const dados = pedidoSchema.parse(req.body);
    const db = getDb();
    const abrirOPs = req.query.abrir_ordens !== 'false';

    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO pedidos (numero, cliente_id, vendedor_id, data_pedido, data_entrega, situacao, nota_fiscal, observacao)
           VALUES (@numero, @cliente_id, @vendedor_id, @data_pedido, @data_entrega, @situacao, @nota_fiscal, @observacao)`
        )
        .run({
          numero: dados.numero,
          cliente_id: dados.cliente_id,
          data_pedido: dados.data_pedido,
          vendedor_id: dados.vendedor_id ?? null,
          data_entrega: dados.data_entrega ?? null,
          situacao: dados.situacao ?? 'ABERTO',
          nota_fiscal: dados.nota_fiscal ?? null,
          observacao: dados.observacao ?? null,
        });
      const pedidoId = info.lastInsertRowid;
      inserirItens(db, pedidoId, dados.itens);
      if (abrirOPs) {
        for (const item of db.prepare(`SELECT id FROM pedido_itens WHERE pedido_id = ?`).all(pedidoId)) {
          abrirOrdem(item.id, {}, db);
        }
      }
      return pedidoId;
    })();

    res.status(201).json({ id });
  })
);

router.put(
  '/:id',
  podeEditar,
  asyncHandler((req, res) => {
    const db = getDb();
    const pedido = db.prepare(`SELECT * FROM pedidos WHERE id = ?`).get(req.params.id);
    if (!pedido) throw notFound('Pedido não encontrado');
    const dados = pedidoSchema.partial().parse(req.body);

    db.transaction(() => {
      const campos = ['numero', 'cliente_id', 'vendedor_id', 'data_pedido', 'data_entrega', 'situacao', 'nota_fiscal', 'observacao']
        .filter((c) => dados[c] !== undefined);
      if (campos.length) {
        const valores = Object.fromEntries(campos.map((c) => [c, dados[c] ?? null]));
        db.prepare(`UPDATE pedidos SET ${campos.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`)
          .run({ ...valores, id: Number(req.params.id) });
      }
      if (dados.itens) {
        const manter = dados.itens.filter((i) => i.id).map((i) => i.id);
        const placeholders = manter.length ? manter.map(() => '?').join(',') : 'NULL';
        // Itens removidos só saem se ainda não entraram em produção.
        const comOP = db
          .prepare(
            `SELECT i.id FROM pedido_itens i JOIN ordens_producao o ON o.pedido_item_id = i.id
             WHERE i.pedido_id = ? AND i.id NOT IN (${placeholders}) AND o.status <> 'ABERTA'`
          )
          .all(req.params.id, ...manter);
        if (comOP.length) {
          throw badRequest('Não é possível remover itens que já estão em produção');
        }
        db.prepare(`DELETE FROM pedido_itens WHERE pedido_id = ? AND id NOT IN (${placeholders})`)
          .run(req.params.id, ...manter);

        const atualizar = db.prepare(
          `UPDATE pedido_itens SET produto_id = @produto_id, descricao = @descricao, quantidade = @quantidade,
                  preco_unitario = @preco_unitario, liquidacao = @liquidacao, data_entrega = @data_entrega
           WHERE id = @id AND pedido_id = @pedido_id`
        );
        for (const item of dados.itens.filter((i) => i.id)) {
          atualizar.run(normalizarItem(item, req.params.id));
        }
        inserirItens(db, Number(req.params.id), dados.itens.filter((i) => !i.id));
      }
    })();

    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  podeEditar,
  asyncHandler((req, res) => {
    const db = getDb();
    const emProducao = db
      .prepare(
        `SELECT COUNT(*) AS n FROM pedido_itens i JOIN ordens_producao o ON o.pedido_item_id = i.id
         WHERE i.pedido_id = ? AND o.status NOT IN ('ABERTA','CANCELADA')`
      )
      .get(req.params.id);
    if (emProducao.n > 0) {
      // Pedido com produção iniciada tem histórico: cancela em vez de apagar.
      db.prepare(`UPDATE pedidos SET situacao = 'CANCELADO' WHERE id = ?`).run(req.params.id);
      return res.json({ ok: true, cancelado: true });
    }
    const info = db.prepare(`DELETE FROM pedidos WHERE id = ?`).run(req.params.id);
    if (info.changes === 0) throw notFound('Pedido não encontrado');
    res.json({ ok: true, removido: true });
  })
);

function normalizarItem(item, pedidoId) {
  return {
    id: item.id ?? null,
    pedido_id: Number(pedidoId),
    produto_id: item.produto_id,
    descricao: item.descricao ?? null,
    quantidade: item.quantidade,
    preco_unitario: item.preco_unitario ?? 0,
    liquidacao: item.liquidacao ?? 0,
    data_entrega: item.data_entrega ?? null,
  };
}

function inserirItens(db, pedidoId, itens) {
  const stmt = db.prepare(
    `INSERT INTO pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, liquidacao, data_entrega)
     VALUES (@pedido_id, @produto_id, @descricao, @quantidade, @preco_unitario, @liquidacao, @data_entrega)`
  );
  for (const item of itens) {
    const { id: _ignorado, ...dados } = normalizarItem(item, pedidoId);
    stmt.run(dados);
  }
}

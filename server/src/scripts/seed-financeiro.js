/**
 * Gera o financeiro a partir do que já existe: contas a receber dos pedidos
 * faturados e a pagar dos custos fixos e das compras de material.
 *
 * É o mesmo caminho que o dia a dia percorre — só que de uma vez, para a tela
 * abrir com movimento em vez de vazia.
 */
import { migrate, getDb } from '../db/index.js';
import { criarTitulo, registrarBaixa, posicao } from '../services/financeiro.js';
import { round2 } from '../lib/numbers.js';

const db = migrate(getDb());

if (db.prepare(`SELECT COUNT(*) AS n FROM titulos`).get().n > 0) {
  console.log('Já existem títulos lançados — nada a fazer.');
  process.exit(0);
}

const categoria = (nome) => db.prepare(`SELECT id FROM categorias_financeiras WHERE nome = ?`).get(nome)?.id ?? null;
const caixa = db.prepare(`SELECT id FROM contas_bancarias LIMIT 1`).get()?.id ?? null;

const somarDias = (iso, dias) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/* ---- A receber: um título por pedido, com o prazo de 28 dias da casa ---- */
const pedidos = db
  .prepare(
    `SELECT p.id, p.numero, p.data_pedido, p.situacao, c.nome AS cliente,
            ROUND(SUM(i.quantidade * i.preco_unitario), 2) AS total
     FROM pedidos p
     JOIN clientes c ON c.id = p.cliente_id
     JOIN pedido_itens i ON i.pedido_id = p.id
     WHERE p.situacao <> 'CANCELADO' AND p.data_pedido >= date('now', '-14 month')
     GROUP BY p.id HAVING total > 0
     ORDER BY p.data_pedido DESC LIMIT 260`
  )
  .all();

let receber = 0;
let recebido = 0;
db.transaction(() => {
  for (const p of pedidos) {
    // Pedidos maiores costumam sair parcelados; os menores, à vista com prazo.
    const parcelas = p.total >= 20000 ? 3 : p.total >= 6000 ? 2 : 1;
    const titulos = criarTitulo(
      {
        tipo: 'RECEBER',
        descricao: `Pedido ${p.numero} — ${p.cliente}`,
        cliente_id: db.prepare(`SELECT cliente_id FROM pedidos WHERE id = ?`).get(p.id).cliente_id,
        pedido_id: p.id,
        categoria_id: categoria('Venda de produção'),
        valor: p.total,
        parcelas,
        intervalo_dias: 30,
        emissao: p.data_pedido,
        vencimento: somarDias(p.data_pedido, 28),
      },
      db
    );
    receber += titulos.length;

    // Pedido entregue com vencimento passado normalmente já foi pago.
    if (p.situacao === 'ENTREGUE') {
      for (const t of titulos) {
        if (t.vencimento >= new Date().toISOString().slice(0, 10)) continue;
        registrarBaixa(
          { titulo_id: t.id, data: somarDias(t.vencimento, 2), valor: t.valor, forma: 'PIX', conta_id: caixa },
          db
        );
        recebido++;
      }
    }
  }
})();

/* ---- A pagar: custos fixos dos últimos meses e as compras de material ---- */
const fixos = db.prepare(`SELECT descricao, tipo, valor_mensal FROM custos_fixos WHERE ativo = 1`).all();
const CATEGORIA_DO_FIXO = {
  ALUGUEL: 'Aluguel e condomínio', ENERGIA: 'Energia, água e internet',
  AGUA: 'Energia, água e internet', SOFTWARE: 'Energia, água e internet',
  MANUTENCAO: 'Manutenção de máquinas', ADMINISTRATIVO: 'Outras despesas',
  IMPOSTO: 'Impostos e taxas', SEGURO: 'Outras despesas', DEPRECIACAO: 'Outras despesas',
};

const fornecedores = db.prepare(`SELECT id, nome FROM fornecedores WHERE ativo = 1`).all();
let pagar = 0;
let pago = 0;

db.transaction(() => {
  const hoje = new Date().toISOString().slice(0, 10);
  for (let mes = 3; mes >= 0; mes--) {
    const vencimento = somarDias(hoje.slice(0, 8) + '10', -30 * mes);
    for (const f of fixos) {
      const [titulo] = criarTitulo(
        {
          tipo: 'PAGAR',
          descricao: `${f.descricao} — competência ${vencimento.slice(0, 7)}`,
          fornecedor_id: fornecedores[0]?.id ?? null,
          categoria_id: categoria(CATEGORIA_DO_FIXO[f.tipo] ?? 'Outras despesas'),
          valor: f.valor_mensal,
          vencimento,
          emissao: somarDias(vencimento, -10),
        },
        db
      );
      pagar++;
      if (vencimento < hoje) {
        registrarBaixa({ titulo_id: titulo.id, data: vencimento, valor: titulo.valor, forma: 'BOLETO', conta_id: caixa }, db);
        pago++;
      }
    }
  }

  // Entradas de material que ainda não têm título viram contas a pagar.
  const compras = db
    .prepare(
      `SELECT mv.id, mv.data, mv.documento, m.descricao, m.fornecedor_id,
              ROUND(mv.quantidade * mv.custo_unitario, 2) AS valor
       FROM movimentos_estoque mv JOIN materiais m ON m.id = mv.material_id
       WHERE mv.tipo = 'ENTRADA' AND mv.quantidade * mv.custo_unitario > 0`
    )
    .all();
  for (const c of compras) {
    criarTitulo(
      {
        tipo: 'PAGAR',
        descricao: `Compra de ${c.descricao}`,
        fornecedor_id: c.fornecedor_id ?? fornecedores[0]?.id ?? null,
        categoria_id: categoria('Compra de tecido'),
        documento: c.documento,
        valor: round2(c.valor),
        vencimento: somarDias(c.data, 30),
        emissao: c.data,
      },
      db
    );
    pagar++;
  }
})();

console.log(`A receber: ${receber} títulos (${recebido} já recebidos).`);
console.log(`A pagar:   ${pagar} títulos (${pago} já pagos).`);
console.log('Posição a receber:', posicao('RECEBER', db));
console.log('Posição a pagar:  ', posicao('PAGAR', db));

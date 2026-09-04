/**
 * Abre o módulo de compras com movimento: gera as requisições que o MRP
 * aponta, emite os pedidos por fornecedor e recebe parte deles.
 */
import { migrate, getDb } from '../db/index.js';
import {
  gerarRequisicoesDoMrp, gerarRequisicoesDoMinimo, pedidosAPartirDeRequisicoes,
  receber, resumoCompras,
} from '../services/compras.js';

const db = migrate(getDb());

if (db.prepare(`SELECT COUNT(*) AS n FROM requisicoes_compra`).get().n > 0) {
  console.log('Compras já tem movimento — nada a fazer.');
  process.exit(0);
}

const mrp = gerarRequisicoesDoMrp({}, db);
const minimo = gerarRequisicoesDoMinimo({}, db);
console.log(`Requisições: ${mrp.criadas.length} do MRP, ${minimo.criadas.length} por estoque mínimo.`);

const abertas = db.prepare(`SELECT id FROM requisicoes_compra WHERE status = 'ABERTA'`).all().map((r) => r.id);
if (abertas.length === 0) {
  console.log('Nenhuma requisição em aberto — o estoque cobre a carteira.');
  process.exit(0);
}

const pedidos = pedidosAPartirDeRequisicoes(abertas, {}, db);
console.log(`Pedidos de compra emitidos: ${pedidos.length}.`);

// O primeiro pedido chega inteiro; o segundo, pela metade — para a tela ter
// os dois casos que o almoxarifado encontra no dia a dia.
if (pedidos[0]) {
  db.prepare(`UPDATE pedidos_compra SET status = 'CONFIRMADO' WHERE id = ?`).run(pedidos[0].id);
  receber(pedidos[0].id, { nota_fiscal: 'NF 10241' }, db);
  console.log(`  ${pedidos[0].numero}: recebido por inteiro.`);
}
if (pedidos[1]) {
  db.prepare(`UPDATE pedidos_compra SET status = 'CONFIRMADO' WHERE id = ?`).run(pedidos[1].id);
  const itens = db
    .prepare(`SELECT id, quantidade FROM pedido_compra_itens WHERE pedido_compra_id = ?`)
    .all(pedidos[1].id)
    .map((i) => ({ item_id: i.id, quantidade: Math.round(i.quantidade / 2) }))
    .filter((i) => i.quantidade > 0);
  if (itens.length) {
    receber(pedidos[1].id, { nota_fiscal: 'NF 10242', itens }, db);
    console.log(`  ${pedidos[1].numero}: recebido pela metade.`);
  }
}
for (const p of pedidos.slice(2)) {
  db.prepare(`UPDATE pedidos_compra SET status = 'ENVIADO' WHERE id = ?`).run(p.id);
}

console.log('\nResumo:', resumoCompras(db));

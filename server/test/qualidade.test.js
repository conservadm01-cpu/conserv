import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conserv-qualidade-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');

const { getDb, migrate } = await import('../src/db/index.js');
const {
  chaveEstrita, nucleo, distancia, duplicatasClientes, mesclarClientes,
  nomesSuspeitos, corrigirNome, pedidosParados, encerrarPedidos,
  datasInvertidas, corrigirEntrega, pedidosDuplicados, cancelarPedidos,
} = await import('../src/services/qualidade.js');
const { abrirOrdem, buscarOrdem, atualizarEtapa } = await import('../src/services/producao.js');

const db = migrate(getDb());

const novoCliente = (nome) =>
  db.prepare(`INSERT INTO clientes (nome) VALUES (?)`).run(nome).lastInsertRowid;

/** Datas do teste andam com o relógio: fixá-las faria o teste apodrecer sozinho. */
const diasAtras = (n) =>
  db.prepare(`SELECT date('now', ?) AS d`).get(`-${n} day`).d;

const novoProduto = () =>
  db.prepare(`INSERT INTO produtos (descricao, preco_padrao) VALUES (?, 10)`)
    .run(`P ${Math.random()}`).lastInsertRowid;

function novoPedido(clienteId, { numero = String(Math.floor(Math.random() * 1e6)),
                                dataPedido = '2026-01-10', entrega = '2026-02-10',
                                quantidade = 10, preco = 20 } = {}) {
  const pedido = db
    .prepare(`INSERT INTO pedidos (numero, cliente_id, data_pedido, data_entrega) VALUES (?, ?, ?, ?)`)
    .run(numero, clienteId, dataPedido, entrega).lastInsertRowid;
  const item = db
    .prepare(`INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario)
              VALUES (?, ?, ?, ?)`)
    .run(pedido, novoProduto(), quantidade, preco).lastInsertRowid;
  return { pedido, item };
}

/* ------------------------------------------------------------ normalização */

test('a chave estrita ignora acento, ponto e espaço — e nada mais', () => {
  assert.equal(chaveEstrita('M.D BOSO (PROHALL)'), chaveEstrita('M D BOSO PROHALL'));
  assert.equal(chaveEstrita('CAFÉ E DOCES'), chaveEstrita('CAFE E DOCES'));
  assert.equal(chaveEstrita("VITTA FLOW'S"), chaveEstrita('VITTA FLOW´S'));
  // Palavra a mais é outro nome: a chave estrita não perdoa.
  assert.notEqual(chaveEstrita('TAPIS'), chaveEstrita('TAPIS COMERCIO'));
});

test('o núcleo derruba sufixo societário e parêntese', () => {
  assert.equal(nucleo('PATAGONIA CAFÉ LTDA'), nucleo('PATAGONIA CAFE'));
  assert.equal(nucleo('DUO (KPRO)'), nucleo('DUO INDUSTRIA (KPRO)'));
});

test('a distância corta cedo quando os nomes são muito diferentes', () => {
  assert.equal(distancia('BOSO', 'BOZO'), 1);
  assert.equal(distancia('AGILISE', 'A GILISE'.replace(' ', '')), 0);
  assert.ok(distancia('JL ALIMENTOS', 'ZF ALIMENTOS', 2) <= 2);
  assert.ok(distancia('ABACAXI', 'MELANCIA', 2) > 2);
});

/* --------------------------------------------------------------- detecção */

test('duplicatas separam o que é fato do que é palpite', () => {
  const identicoA = novoCliente('DETEC CAFÉ');
  const identicoB = novoCliente('DETEC CAFE');
  const nucleoA = novoCliente('DETEC SEGUNDA COISA LTDA');
  const nucleoB = novoCliente('DETEC SEGUNDA COISA');
  const parecidoA = novoCliente('DETEC TERCEIRA MARCA');
  const parecidoB = novoCliente('DETEC TERCEIRA MARCO');

  const grupos = duplicatasClientes();
  const de = (id) => grupos.find((g) => g.membros.some((m) => m.id === id));

  assert.equal(de(identicoA).confianca, 'identico');
  assert.ok(de(identicoA).membros.some((m) => m.id === identicoB));
  assert.equal(de(nucleoA).confianca, 'nucleo');
  assert.ok(de(nucleoA).membros.some((m) => m.id === nucleoB));
  assert.equal(de(parecidoA).confianca, 'parecido');
  assert.ok(de(parecidoA).membros.some((m) => m.id === parecidoB));

  // Cada cadastro entra em um grupo só, no nível mais confiável em que couber.
  const vezes = grupos.flatMap((g) => g.membros.map((m) => m.id));
  assert.equal(new Set(vezes).size, vezes.length);
});

test('o sugerido para ficar é o cadastro com mais história', () => {
  const magro = novoCliente('HISTORIA VAZIA');
  const cheio = novoCliente('HISTORIA VAZIÁ');
  novoPedido(cheio);

  const grupo = duplicatasClientes().find((g) => g.membros.some((m) => m.id === cheio));
  assert.equal(grupo.manter, cheio);
  assert.equal(grupo.membros[0].id, cheio, 'o primeiro da lista é o sugerido');
  assert.equal(grupo.membros.find((m) => m.id === magro).pedidos, 0);
});

/* ----------------------------------------------------------------- junção */

test('juntar cadastros move pedidos, orçamentos, títulos e interações', () => {
  const fica = novoCliente('JUNTA DESTINO');
  const sai = novoCliente('JUNTA ORIGEM');
  db.prepare(`UPDATE clientes SET cnpj = '11.111.111/0001-11', cidade = 'Itajaí' WHERE id = ?`).run(sai);

  const { pedido } = novoPedido(sai);
  const orcamento = db.prepare(`INSERT INTO orcamentos (numero, cliente_id, data) VALUES (?, ?, date('now'))`)
    .run(`ORC-${Math.random()}`, sai).lastInsertRowid;
  const titulo = db.prepare(
    `INSERT INTO titulos (tipo, descricao, valor, emissao, vencimento, cliente_id)
     VALUES ('RECEBER', 'x', 100, date('now'), date('now'), ?)`
  ).run(sai).lastInsertRowid;
  const etapa = db.prepare(`SELECT id FROM etapas_funil WHERE tipo = 'ABERTA' ORDER BY ordem LIMIT 1`).get();
  const oportunidade = db.prepare(
    `INSERT INTO oportunidades (titulo, cliente_id, etapa_id) VALUES ('x', ?, ?)`
  ).run(sai, etapa.id).lastInsertRowid;
  db.prepare(`INSERT INTO interacoes (cliente_id, resumo) VALUES (?, 'ligou')`).run(sai);

  const r = mesclarClientes(fica, [sai]);

  assert.equal(r.movidos.pedidos, 1);
  assert.equal(r.movidos.orcamentos, 1);
  assert.equal(r.movidos.titulos, 1);
  assert.equal(r.movidos.oportunidades, 1);
  assert.equal(r.movidos.interacoes, 1);

  const dono = (tabela, id) =>
    db.prepare(`SELECT cliente_id FROM ${tabela} WHERE id = ?`).get(id).cliente_id;
  assert.equal(dono('pedidos', pedido), fica);
  assert.equal(dono('orcamentos', orcamento), fica);
  assert.equal(dono('titulos', titulo), fica);
  assert.equal(dono('oportunidades', oportunidade), fica);

  // O cadastro que sai fica inativo, com a pista de para onde foi.
  const antigo = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(sai);
  assert.equal(antigo.ativo, 0);
  assert.match(antigo.observacao, /JUNTA DESTINO/);

  // E o que faltava no destino foi aproveitado do que saiu.
  assert.equal(r.destino.cnpj, '11.111.111/0001-11');
  assert.equal(r.destino.cidade, 'Itajaí');
  assert.equal(antigo.mesclado_em, fica, 'a marca aponta para onde o cadastro foi');
});

test('cadastro já juntado não reaparece como duplicata', () => {
  const fica = novoCliente('SUME DA LISTA');
  const sai = novoCliente('SUME DÁ LISTA');
  assert.ok(duplicatasClientes().some((g) => g.membros.some((m) => m.id === sai)));

  mesclarClientes(fica, [sai]);
  assert.equal(duplicatasClientes().some((g) => g.membros.some((m) => m.id === sai)), false);
});

test('juntar não apaga o pedido do destino quando os números batem', () => {
  const fica = novoCliente('COLISAO DESTINO');
  const sai = novoCliente('COLISAO ORIGEM');
  const doDestino = novoPedido(fica, { numero: '900', dataPedido: '2026-03-01' });
  const daOrigem = novoPedido(sai, { numero: '900', dataPedido: '2026-03-01' });

  const r = mesclarClientes(fica, [sai]);

  assert.equal(r.renumerados.length, 1);
  assert.equal(r.renumerados[0].de, '900');
  assert.equal(r.renumerados[0].para, '900-2');
  assert.equal(db.prepare(`SELECT numero FROM pedidos WHERE id = ?`).get(doDestino.pedido).numero, '900');
  assert.equal(db.prepare(`SELECT numero FROM pedidos WHERE id = ?`).get(daOrigem.pedido).numero, '900-2');
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM pedidos WHERE cliente_id = ?`).get(fica).n, 2);
});

test('juntar recusa lista vazia e ignora o próprio destino', () => {
  const c = novoCliente('SOZINHO');
  assert.throws(() => mesclarClientes(c, [c]), /ao menos um cliente/i);
  assert.throws(() => mesclarClientes(c, []), /ao menos um cliente/i);
  assert.throws(() => mesclarClientes(999999, [c]), /não encontrado/i);
});

/* ------------------------------------------------------------------ nomes */

test('número colado no início do nome é apontado com a sugestão limpa', () => {
  const id = novoCliente('69PATAGONIA CAFETERIA');
  const achado = nomesSuspeitos().find((n) => n.id === id);
  assert.equal(achado.sugestao, 'PATAGONIA CAFETERIA');
  assert.match(achado.motivos[0], /69/);

  corrigirNome(id, achado.sugestao);
  assert.equal(db.prepare(`SELECT nome FROM clientes WHERE id = ?`).get(id).nome, 'PATAGONIA CAFETERIA');
});

test('nome de empresa que começa com número de verdade não é mexido', () => {
  const id = novoCliente('3A VAREJO BIO');
  assert.equal(nomesSuspeitos().find((n) => n.id === id), undefined);
});

test('renomear para um nome já ocupado vira caso de junção, não de renomear', () => {
  novoCliente('OCUPADO SA');
  const outro = novoCliente('  OCUPADO SA  ');
  assert.throws(() => corrigirNome(outro, 'OCUPADO SA'), /Junte os dois/i);
});

/* ------------------------------------------------------- pedidos parados  */

test('pedido antigo em aberto aparece com a ordem que ficou viva', () => {
  const cliente = novoCliente('PARADO ANTIGO');
  const { pedido, item } = novoPedido(cliente,
    { dataPedido: diasAtras(960), entrega: diasAtras(930) });
  abrirOrdem(item);

  const linha = pedidosParados().find((p) => p.id === pedido);
  assert.ok(linha, 'o pedido antigo precisa aparecer');
  assert.ok(linha.dias_atraso > 900);
  assert.equal(linha.ordens_abertas, 1);
  assert.equal(linha.valor, 200);

  // A janela é o corte: "dias" maior olha mais para trás e devolve menos.
  const recente = novoPedido(novoCliente('PARADO RECENTE'), { entrega: diasAtras(3) });
  assert.equal(pedidosParados({ dias: 1 }).some((p) => p.id === recente.pedido), true);
  assert.equal(pedidosParados({ dias: 180 }).some((p) => p.id === recente.pedido), false);
  assert.equal(pedidosParados({ dias: 1 }).some((p) => p.id === pedido), true);
});

test('encerrar baixa o pedido e fecha a ordem que sobrou aberta', () => {
  const cliente = novoCliente('ENCERRA');
  const { pedido, item } = novoPedido(cliente,
    { dataPedido: diasAtras(700), entrega: diasAtras(670) });
  const ordem = abrirOrdem(item);

  const r = encerrarPedidos([pedido]);
  assert.equal(r.pedidos, 1);
  assert.equal(r.ordens, 1);
  assert.equal(db.prepare(`SELECT situacao FROM pedidos WHERE id = ?`).get(pedido).situacao, 'ENTREGUE');
  assert.equal(buscarOrdem(ordem.id).status, 'ENTREGUE');
  assert.equal(pedidosParados().some((p) => p.id === pedido), false);

  // Repetir não conta de novo nem mexe em quem já estava fechado.
  assert.deepEqual(encerrarPedidos([pedido]), { pedidos: 0, ordens: 0 });
});

/* --------------------------------------------------------------- datas    */

test('entrega anterior ao pedido é apontada com o ano corrigido', () => {
  const cliente = novoCliente('DATA TROCADA');
  const { item } = novoPedido(cliente, { dataPedido: '2024-12-16', entrega: '2024-01-17' });
  db.prepare(`UPDATE pedido_itens SET data_entrega = '2024-01-17' WHERE id = ?`).run(item);

  const achado = datasInvertidas().find((d) => d.item_id === item);
  assert.equal(achado.sugestao, '2025-01-17');
  assert.ok(achado.dias > 300);

  corrigirEntrega(item, achado.sugestao);
  assert.equal(db.prepare(`SELECT data_entrega FROM pedido_itens WHERE id = ?`).get(item).data_entrega,
               '2025-01-17');
  assert.equal(datasInvertidas().some((d) => d.item_id === item), false);
});

test('corrigir entrega recusa data anterior ao pedido e data malformada', () => {
  const { item } = novoPedido(novoCliente('DATA GUARDA'), { dataPedido: '2026-05-10', entrega: '2026-06-10' });
  assert.throws(() => corrigirEntrega(item, '2026-01-01'), /anterior à data do pedido/i);
  assert.throws(() => corrigirEntrega(item, '10/05/2026'), /inválida/i);
});

/* -------------------------------------------------- pedidos repetidos ---- */

test('mesmo cliente, data e número é venda repetida; só o valor igual é suspeita', () => {
  const cliente = novoCliente('REPETE');
  const a = novoPedido(cliente, { numero: 'R-500', dataPedido: '2026-04-01', preco: 30 });
  const b = novoPedido(cliente, { numero: 'R-500-2', dataPedido: '2026-04-01', preco: 30 });

  // Dois números diferentes, mesmo valor: pode ser a segunda compra do dia.
  const outro = novoCliente('MESMO VALOR');
  const c = novoPedido(outro, { numero: 'V-1', dataPedido: '2026-04-02', quantidade: 5, preco: 40 });
  const d = novoPedido(outro, { numero: 'V-2', dataPedido: '2026-04-02', quantidade: 5, preco: 40 });

  const grupos = pedidosDuplicados();
  const forte = grupos.find((g) => g.membros.some((m) => m.id === a.pedido));
  assert.equal(forte.confianca, 'repetido');
  assert.ok(forte.membros.some((m) => m.id === b.pedido));

  const fraco = grupos.find((g) => g.membros.some((m) => m.id === c.pedido));
  assert.equal(fraco.confianca, 'confira');
  assert.ok(fraco.membros.some((m) => m.id === d.pedido));

  // Sem produção nem título, fica o lançamento mais completo.
  const rico = novoCliente('MAIS COMPLETO');
  const magro = novoPedido(rico, { numero: 'M-1', dataPedido: '2026-04-03', quantidade: 1, preco: 10 });
  const gordo = novoPedido(rico, { numero: 'M-1-2', dataPedido: '2026-04-03', quantidade: 1, preco: 10 });
  db.prepare(`INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario)
              VALUES (?, ?, 4, 25)`).run(gordo.pedido, novoProduto());
  const completo = pedidosDuplicados().find((g) => g.membros.some((m) => m.id === gordo.pedido));
  assert.equal(completo.manter, gordo.pedido);
  assert.ok(completo.membros.some((m) => m.id === magro.pedido));

  // Datas diferentes não formam grupo, por mais que o valor bata.
  const solto = novoPedido(outro, { numero: 'V-3', dataPedido: '2026-04-09', quantidade: 5, preco: 40 });
  assert.equal(grupos.some((g) => g.membros.some((m) => m.id === solto.pedido)), false);
});

test('cancelar a cópia baixa as ordens, e recusa o pedido que já produziu', () => {
  const cliente = novoCliente('CANCELA COPIA');
  const original = novoPedido(cliente, { numero: 'C-9', dataPedido: '2026-04-05' });
  const copia = novoPedido(cliente, { numero: 'C-9-2', dataPedido: '2026-04-05' });
  const ordemCopia = abrirOrdem(copia.item);

  const r = cancelarPedidos([copia.pedido]);
  assert.equal(r.cancelados, 1);
  assert.equal(r.ordens, 1);
  assert.equal(r.recusados.length, 0);
  assert.equal(db.prepare(`SELECT situacao FROM pedidos WHERE id = ?`).get(copia.pedido).situacao, 'CANCELADO');
  assert.equal(buscarOrdem(ordemCopia.id).status, 'CANCELADA');
  // Cancelado sai da lista: o grupo deixa de existir.
  assert.equal(pedidosDuplicados().some((g) => g.membros.some((m) => m.id === copia.pedido)), false);

  // Produção apontada é trabalho feito: cancelar apagaria o registro dele.
  const ordemOriginal = abrirOrdem(original.item);
  const etapa = buscarOrdem(ordemOriginal.id).etapas[0];
  atualizarEtapa(ordemOriginal.id, etapa.etapa_id, { status: 'CONCLUIDA', quantidade_ok: 5 });
  db.prepare(
    `INSERT INTO apontamentos (ordem_id, etapa_id, data, quantidade) VALUES (?, ?, date('now'), 5)`
  ).run(ordemOriginal.id, etapa.etapa_id);

  const recusa = cancelarPedidos([original.pedido]);
  assert.equal(recusa.cancelados, 0);
  assert.equal(recusa.recusados.length, 1);
  assert.match(recusa.recusados[0].motivo, /apontamento/i);
  assert.equal(db.prepare(`SELECT situacao FROM pedidos WHERE id = ?`).get(original.pedido).situacao, 'ABERTO');
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

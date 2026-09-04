import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// O banco é escolhido na importação do módulo de config, então definimos antes.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conserv-test-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');

const { getDb, migrate } = await import('../src/db/index.js');
const { abrirOrdem, atualizarEtapa, buscarOrdem, explodirFichaTecnica, recalcularCustosMO } =
  await import('../src/services/producao.js');
const { registrarMovimento, baixarMateriaisDaOrdem, necessidadeMateriais, saldo } =
  await import('../src/services/estoque.js');
const { resumoCarteira } = await import('../src/services/indicadores.js');
const { toISODate, semanaISO, diasAtraso } = await import('../src/lib/dates.js');
const { toNumber } = await import('../src/lib/numbers.js');
const { chave } = await import('../src/lib/text.js');

const db = migrate(getDb());

/** Cria um cenário mínimo: produto com ficha técnica, custo de MO e um pedido. */
function cenario({ quantidade = 100, consumo = 1.5, perda = 10, estoqueInicial = 500 } = {}) {
  const grupo = db.prepare(`INSERT INTO grupos_produto (nome) VALUES (?)`).run(`G${Date.now()}${Math.random()}`);
  const produto = db
    .prepare(`INSERT INTO produtos (descricao, grupo_id, linha, preco_padrao) VALUES (?, ?, 'LEVE', 20)`)
    .run(`PRODUTO ${Math.random()}`, grupo.lastInsertRowid);
  const material = db
    .prepare(`INSERT INTO materiais (descricao, tipo, unidade, custo_unitario, estoque_min) VALUES (?, 'TECIDO', 'MT', 10, 50)`)
    .run(`MATERIAL ${Math.random()}`);
  db.prepare(`INSERT INTO ficha_tecnica (produto_id, material_id, consumo_por_peca, perda_percentual) VALUES (?, ?, ?, ?)`)
    .run(produto.lastInsertRowid, material.lastInsertRowid, consumo, perda);

  const corte = db.prepare(`SELECT id FROM etapas WHERE codigo = 'CORTE'`).get();
  db.prepare(`INSERT INTO custos_processo (produto_id, etapa_id, custo_por_peca) VALUES (?, ?, 0.5)`)
    .run(produto.lastInsertRowid, corte.id);

  const cliente = db.prepare(`INSERT INTO clientes (nome) VALUES (?)`).run(`CLIENTE ${Math.random()}`);
  const pedido = db
    .prepare(`INSERT INTO pedidos (numero, cliente_id, data_pedido, data_entrega) VALUES (?, ?, date('now'), date('now','+10 day'))`)
    .run(String(Math.floor(Math.random() * 100000)), cliente.lastInsertRowid);
  const item = db
    .prepare(`INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario, liquidacao) VALUES (?, ?, ?, 20, 12)`)
    .run(pedido.lastInsertRowid, produto.lastInsertRowid, quantidade);

  if (estoqueInicial > 0) {
    registrarMovimento(
      { material_id: material.lastInsertRowid, tipo: 'ENTRADA', quantidade: estoqueInicial, custo_unitario: 10 },
      db
    );
  }
  return {
    produtoId: produto.lastInsertRowid,
    materialId: material.lastInsertRowid,
    itemId: item.lastInsertRowid,
    pedidoId: pedido.lastInsertRowid,
    corteId: corte.id,
  };
}

test('toNumber entende os formatos que saem da planilha', () => {
  assert.equal(toNumber('R$ 1.234,50'), 1234.5);
  assert.equal(toNumber('26,5'), 26.5);
  assert.equal(toNumber(58750), 58750);
  assert.equal(toNumber('#REF!'), null);
  assert.equal(toNumber(''), null);
});

test('toISODate cobre Date, texto BR e serial do Excel', () => {
  assert.equal(toISODate(new Date('2026-03-15T00:00:00Z')), '2026-03-15');
  assert.equal(toISODate('15/03/2026'), '2026-03-15');
  assert.equal(toISODate(45000), '2023-03-15');
  assert.equal(toISODate(null), null);
});

test('semanaISO e diasAtraso', () => {
  assert.equal(semanaISO('2026-01-05'), 2);
  assert.equal(diasAtraso('2026-01-01', '2026-01-11'), 10);
  assert.equal(diasAtraso('2026-01-20', '2026-01-11'), 0);
});

test('chave normaliza acento, caixa e pontuação para deduplicar cadastros', () => {
  assert.equal(chave('  M.D  Bôso (PROHALL) '), chave('m.d boso prohall'));
  assert.equal(chave('COSMÉTICO '), chave('cosmetico'));
  assert.notEqual(chave('AVENTAL'), chave('AVENTAL LONGO'));
});

test('abrir ordem cria o roteiro completo e explode a ficha técnica', () => {
  const { itemId, materialId } = cenario({ quantidade: 100, consumo: 1.5, perda: 10 });
  const ordem = abrirOrdem(itemId, {}, db);

  assert.equal(ordem.status, 'ABERTA');
  assert.equal(ordem.etapas.length, 7);
  assert.ok(ordem.etapas.every((e) => e.status === 'PENDENTE'));

  const previsto = ordem.materiais.find((m) => m.material_id === materialId);
  assert.equal(previsto.quantidade_prevista, 165); // 100 pçs × 1,5 × 1,10 de perda
  assert.equal(ordem.custo_mo_total, 50); // 100 pçs × R$ 0,50 no corte
});

test('um item não pode ter duas ordens', () => {
  const { itemId } = cenario();
  abrirOrdem(itemId, {}, db);
  assert.throws(() => abrirOrdem(itemId, {}, db), /já possui ordem/i);
});

test('status da ordem acompanha o avanço das etapas', () => {
  const { itemId } = cenario();
  const ordem = abrirOrdem(itemId, {}, db);
  const etapas = ordem.etapas;

  let atual = atualizarEtapa(ordem.id, etapas[1].etapa_id, { status: 'EM_ANDAMENTO' }, db);
  assert.equal(atual.status, 'EM_PRODUCAO');

  for (const e of etapas.filter((x) => x.codigo !== 'ENTREGA')) {
    atual = atualizarEtapa(ordem.id, e.etapa_id, { status: 'CONCLUIDA' }, db);
  }
  assert.equal(atual.status, 'EM_PRODUCAO');

  const entrega = etapas.find((e) => e.codigo === 'ENTREGA');
  atual = atualizarEtapa(ordem.id, entrega.etapa_id, { status: 'CONCLUIDA' }, db);
  assert.equal(atual.status, 'ENTREGUE');
  assert.ok(atual.data_conclusao);
});

test('pedido é marcado como entregue quando todas as ordens entregam', () => {
  const { itemId, pedidoId } = cenario();
  const ordem = abrirOrdem(itemId, {}, db);
  const entrega = ordem.etapas.find((e) => e.codigo === 'ENTREGA');
  atualizarEtapa(ordem.id, entrega.etapa_id, { status: 'CONCLUIDA' }, db);
  assert.equal(db.prepare(`SELECT situacao FROM pedidos WHERE id = ?`).get(pedidoId).situacao, 'ENTREGUE');
});

test('baixa de material gera saída e não permite baixar duas vezes', () => {
  const { itemId, materialId } = cenario({ quantidade: 100, consumo: 1.5, perda: 10, estoqueInicial: 500 });
  const ordem = abrirOrdem(itemId, {}, db);

  const movimentos = baixarMateriaisDaOrdem(ordem.id, {}, db);
  assert.equal(movimentos.length, 1);
  assert.equal(saldo(materialId, db), 335); // 500 − 165
  assert.throws(() => baixarMateriaisDaOrdem(ordem.id, {}, db), /Nenhuma quantidade pendente/i);
});

test('saída maior que o saldo é recusada', () => {
  const { materialId } = cenario({ estoqueInicial: 10 });
  assert.throws(
    () => registrarMovimento({ material_id: materialId, tipo: 'SAIDA', quantidade: 999 }, db),
    /Saldo insuficiente/i
  );
});

test('baixa parcial respeita o previsto e mantém o restante pendente', () => {
  const { itemId, materialId } = cenario({ quantidade: 100, consumo: 1.5, perda: 10 });
  const ordem = abrirOrdem(itemId, {}, db);

  baixarMateriaisDaOrdem(ordem.id, { itens: [{ material_id: materialId, quantidade: 65 }] }, db);
  const depois = buscarOrdem(ordem.id, db);
  assert.equal(depois.materiais[0].quantidade_baixada, 65);

  assert.throws(
    () => baixarMateriaisDaOrdem(ordem.id, { itens: [{ material_id: materialId, quantidade: 500 }] }, db),
    /acima do previsto/i
  );
});

test('MRP calcula a necessidade líquida das ordens em aberto', () => {
  const { itemId, materialId } = cenario({ quantidade: 200, consumo: 2, perda: 0, estoqueInicial: 100 });
  abrirOrdem(itemId, {}, db);

  const linha = necessidadeMateriais({}, db).find((l) => l.id === materialId);
  assert.equal(linha.necessidade, 400);
  assert.equal(linha.saldo, 100);
  assert.equal(linha.comprar, 300);
  assert.equal(linha.valor_compra, 3000);
});

test('ordem entregue sai da necessidade de compra', () => {
  const { itemId, materialId } = cenario({ quantidade: 50, consumo: 1, perda: 0, estoqueInicial: 0 });
  const ordem = abrirOrdem(itemId, {}, db);
  assert.ok(necessidadeMateriais({}, db).some((l) => l.id === materialId));

  const entrega = ordem.etapas.find((e) => e.codigo === 'ENTREGA');
  atualizarEtapa(ordem.id, entrega.etapa_id, { status: 'CONCLUIDA' }, db);
  assert.ok(!necessidadeMateriais({}, db).some((l) => l.id === materialId));
});

test('alterar a ficha técnica e recalcular atualiza a ordem já aberta', () => {
  const { itemId, produtoId, materialId } = cenario({ quantidade: 100, consumo: 1, perda: 0 });
  const ordem = abrirOrdem(itemId, {}, db);
  assert.equal(ordem.materiais[0].quantidade_prevista, 100);

  db.prepare(`UPDATE ficha_tecnica SET consumo_por_peca = 2 WHERE produto_id = ? AND material_id = ?`)
    .run(produtoId, materialId);
  explodirFichaTecnica(ordem.id, db);
  assert.equal(buscarOrdem(ordem.id, db).materiais[0].quantidade_prevista, 200);

  const corte = db.prepare(`SELECT id FROM etapas WHERE codigo = 'CORTE'`).get();
  db.prepare(`UPDATE custos_processo SET custo_por_peca = 1.25 WHERE produto_id = ? AND etapa_id = ?`)
    .run(produtoId, corte.id);
  recalcularCustosMO(ordem.id, db);
  assert.equal(buscarOrdem(ordem.id, db).custo_mo_total, 125);
});

test('resumo da carteira soma apenas o que ainda não foi entregue', () => {
  const antes = resumoCarteira(db);
  const { itemId } = cenario({ quantidade: 10 });
  abrirOrdem(itemId, {}, db);
  const depois = resumoCarteira(db);
  assert.equal(depois.pecas, antes.pecas + 10);
  assert.equal(depois.faturar, Math.round((antes.faturar + 200) * 100) / 100);
});

test('o filtro ?ativo= funciona nas listagens que apelidam a tabela', async () => {
  // O CRUD monta "WHERE <tabela>.ativo = ?"; com join a tabela vira "p", "e", "c"…
  // e a consulta quebrava. Aqui percorremos as listagens que usam apelido.
  const { criarApp } = await import('../src/index.js');
  const bcrypt = (await import('bcryptjs')).default;
  const app = criarApp();

  db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('T','t@t','x','ADMIN')
              ON CONFLICT(email) DO NOTHING`).run();
  db.prepare(`UPDATE usuarios SET senha_hash = ? WHERE email = 't@t'`).run(bcrypt.hashSync('teste123', 4));

  const servidor = app.listen(0);
  const porta = servidor.address().port;
  const base = `http://127.0.0.1:${porta}/api`;
  try {
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 't@t', senha: 'teste123' }),
    }).then((r) => r.json());
    const headers = { Authorization: `Bearer ${login.token}` };

    for (const rota of ['/produtos', '/clientes', '/materiais', '/colaboradores',
                        '/engenharia/equipamentos', '/engenharia/departamentos']) {
      const r = await fetch(`${base}${rota}?ativo=true`, { headers });
      assert.equal(r.status, 200, `${rota} devolveu ${r.status}`);
      assert.ok(Array.isArray(await r.json()), `${rota} não devolveu lista`);
    }
  } finally {
    servidor.close();
  }
});

test('ordem sem apontamento é excluída; com histórico, apenas cancelada', async () => {
  const { criarApp } = await import('../src/index.js');
  const bcrypt = (await import('bcryptjs')).default;
  const app = criarApp();

  db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('O','o@o','x','ADMIN')
              ON CONFLICT(email) DO NOTHING`).run();
  db.prepare(`UPDATE usuarios SET senha_hash = ? WHERE email = 'o@o'`).run(bcrypt.hashSync('teste123', 4));

  const limpa = abrirOrdem(cenario().itemId);
  const usada = abrirOrdem(cenario().itemId);
  // A segunda ordem baixa material: passa a ter histórico e não pode sumir.
  baixarMateriaisDaOrdem(usada.id);

  const servidor = app.listen(0);
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  try {
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'o@o', senha: 'teste123' }),
    }).then((r) => r.json());
    const headers = { Authorization: `Bearer ${login.token}` };

    const semUso = await fetch(`${base}/ordens/${limpa.id}`, { method: 'DELETE', headers }).then((r) => r.json());
    assert.equal(semUso.removida, true);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ordens_producao WHERE id = ?`).get(limpa.id).n, 0);

    const comUso = await fetch(`${base}/ordens/${usada.id}`, { method: 'DELETE', headers }).then((r) => r.json());
    assert.equal(comUso.cancelada, true);
    assert.equal(buscarOrdem(usada.id).status, 'CANCELADA');
  } finally {
    servidor.close();
  }
});

/**
 * Cada tela do sistema passou a filtrar pela própria lista de campos. Um filtro
 * escrito com a coluna errada só aparece como erro 500 na hora do uso — este
 * teste percorre todas as listagens com os filtros que as telas mandam.
 */
test('todas as listagens aceitam os filtros que a interface envia', async () => {
  const { criarApp } = await import('../src/index.js');
  const bcrypt = (await import('bcryptjs')).default;
  const app = criarApp();

  db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('F','f@f','x','ADMIN')
              ON CONFLICT(email) DO NOTHING`).run();
  db.prepare(`UPDATE usuarios SET senha_hash = ? WHERE email = 'f@f'`).run(bcrypt.hashSync('teste123', 4));

  const rotas = [
    '/pedidos?busca=a&status=ABERTO&de=2020-01-01&ate=2030-01-01&valor_min=1&atrasados=true',
    '/pedidos/itens/carteira?busca=a&situacao=EM_ABERTO&linha=LEVE&entrega_de=2020-01-01'
      + '&entrega_ate=2030-01-01&atrasados=true&somente_abertos=true&limite=10',
    '/ordens?busca=a&status=ABERTA&etapa=CORTE&atrasadas=true&limite=10',
    '/materiais?busca=a&tipo=TECIDO&unidade=MT&ativo=true',
    '/materiais/estoque/posicao?busca=a',
    '/clientes?busca=a&uf=SP&ativo=true',
    '/produtos?busca=a&linha=LEVE&preco_min=0&sem_ficha=true&ativo=true',
    '/fornecedores?busca=a&uf=SP&ativo=true',
    '/colaboradores?busca=a&status=ATIVO&produtivo=1&ativo=true',
    '/engenharia/departamentos?busca=a&produtivo=1&ativo=true',
    '/engenharia/equipamentos?busca=a&status=ATIVO&ativo=true',
    '/engenharia/custos-fixos?busca=a&tipo=ALUGUEL&ativo=true',
    '/apontamentos?busca=a&de=2020-01-01&ate=2030-01-01&com_refugo=true&limite=10',
    '/financeiro/titulos?tipo=RECEBER&status=ABERTO&de=2020-01-01&ate=2030-01-01&vencidos=true',
    '/financeiro/categorias?busca=a&tipo=PAGAR&ativo=true',
    '/crm/oportunidades?busca=a&abertas=true&paradas=true&valor_min=0&limite=10',
    '/orcamentos?busca=a&abertos=true&vencidos=true&valor_min=0',
    '/compras/requisicoes?busca=a&status=ABERTA&urgencia=ALTA&origem=MRP&abertas=true',
    '/compras/pedidos?busca=a&status=ENVIADO&abertos=true&atrasados=true&valor_min=0',
    '/compras/inventarios?busca=a&status=ABERTO',
    '/canal/manifestacoes?busca=a&status=ABERTA&tipo=RISCO&anonimas=true',
  ];

  const servidor = app.listen(0);
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  try {
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'f@f', senha: 'teste123' }),
    }).then((r) => r.json());
    const headers = { Authorization: `Bearer ${login.token}` };

    for (const rota of rotas) {
      const r = await fetch(`${base}${rota}`, { headers });
      const corpo = await r.text();
      assert.equal(r.status, 200, `${rota} devolveu ${r.status}: ${corpo}`);
      assert.ok(Array.isArray(JSON.parse(corpo)), `${rota} não devolveu lista`);
    }
  } finally {
    servidor.close();
  }
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

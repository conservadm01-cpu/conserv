import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conserv-nucleo-'));
process.env.NUCLEO_DB_PATH = path.join(tmp, 'nucleo.db');

const { getDb, migrar } = await import('../src/nucleo/db.js');
const { novoId, proximoCodigo, aplicarMascara, codigoDeMaterial, codigoDeProduto } =
  await import('../src/nucleo/codigos.js');
const { registrarCriacao, registrarAlteracao, registrarBaixa, historico } =
  await import('../src/nucleo/auditoria.js');
const { semear } = await import('../src/nucleo/semente.js');
const { assinatura, sugerirMapa, aprenderMapa, previa, importarCarteira, DESTINOS } =
  await import('../src/nucleo/importador.js');

const db = migrar(getDb());
semear(db);

const PLANILHA = path.join(
  '/tmp/claude-0/-home-user-conserv/a9ad93f3-adb0-5399-a6fc-b459d271fec8/scratchpad',
  'planilha0926.xlsx'
);
const temPlanilha = fs.existsSync(PLANILHA);

/* ============================================================== schema === */

test('o schema cria as 74 tabelas do núcleo', () => {
  const tabelas = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all();
  assert.equal(tabelas.length, 74);
});

test('chave estrangeira inválida é recusada pelo banco, não só pelo código', () => {
  assert.throws(
    () => db.prepare(`INSERT INTO pedido_itens (id, pedido_id, quantidade) VALUES (?, ?, 1)`)
      .run(novoId(), 'pedido-que-nao-existe'),
    /FOREIGN KEY/
  );
});

test('só uma versão de ficha técnica fica ativa por produto', () => {
  const grupo = novoId();
  db.prepare(`INSERT INTO grupos_produto (id, codigo, nome) VALUES (?, 'TST', 'Teste')`).run(grupo);
  const produto = novoId();
  db.prepare(`INSERT INTO produtos (id, codigo, descricao, grupo_id) VALUES (?, 'TST-000001', 'Peça teste', ?)`)
    .run(produto, grupo);

  const versao = (n, status) => {
    const id = novoId();
    db.prepare(
      `INSERT INTO produto_versoes (id, codigo, produto_id, versao, status) VALUES (?, ?, ?, ?, ?)`
    ).run(id, `FT-TST-v${n}`, produto, n, status);
    return id;
  };

  versao(1, 'SUBSTITUIDA');
  versao(2, 'ATIVA');
  // A segunda ativa é o erro que o índice parcial existe para impedir.
  assert.throws(() => versao(3, 'ATIVA'), /UNIQUE/);
  versao(3, 'RASCUNHO');  // rascunho convive com a ativa, sem conflito
});

test('o banco recusa receber mais do que foi comprado', () => {
  const fornecedor = novoId();
  db.prepare(`INSERT INTO fornecedores (id, codigo, razao_social) VALUES (?, 'FOR-X', 'Fornecedor X')`)
    .run(fornecedor);
  const material = novoId();
  db.prepare(`INSERT INTO materiais (id, codigo, descricao) VALUES (?, 'TEC-TST-001', 'Tecido teste')`)
    .run(material);
  const pedido = novoId();
  db.prepare(`INSERT INTO pedidos_compra (id, codigo, fornecedor_id) VALUES (?, 'PC-TST', ?)`)
    .run(pedido, fornecedor);

  assert.throws(
    () => db.prepare(
      `INSERT INTO pedido_compra_itens (id, pedido_compra_id, material_id, quantidade, recebido)
       VALUES (?, ?, ?, 100, 150)`
    ).run(novoId(), pedido, material),
    /CHECK/
  );
});

test('o banco recusa baixar mais do que o título vale', () => {
  assert.throws(
    () => db.prepare(
      `INSERT INTO titulos (id, codigo, tipo, descricao, valor, pago, vencimento)
       VALUES (?, 'TIT-TST', 'RECEBER', 'Teste', 100, 150, '2026-01-01')`
    ).run(novoId()),
    /CHECK/
  );
});

/* ============================================================ códigos === */

test('a máscara monta o código humano com ano e sequência', () => {
  assert.equal(aplicarMascara('PED-{ANO}-{SEQ:6}', 42, '2026'), 'PED-2026-000042');
  assert.equal(aplicarMascara('MOV-{SEQ:8}', 7, '2026'), 'MOV-00000007');
});

test('a sequência anual reinicia por ano e a global corre direto', () => {
  const a1 = proximoCodigo('pedido', { db, data: new Date('2026-03-01') });
  const a2 = proximoCodigo('pedido', { db, data: new Date('2026-07-01') });
  const b1 = proximoCodigo('pedido', { db, data: new Date('2027-01-01') });

  assert.match(a1, /^PED-2026-\d{6}$/);
  assert.equal(Number(a2.slice(-6)), Number(a1.slice(-6)) + 1);
  assert.equal(Number(b1.slice(-6)), 1, 'ano novo, sequência nova');

  // Sem {ANO} na máscara, o ano não separa escopo.
  const m1 = proximoCodigo('movimento', { db, data: new Date('2026-01-01') });
  const m2 = proximoCodigo('movimento', { db, data: new Date('2027-01-01') });
  assert.equal(Number(m2.slice(-8)), Number(m1.slice(-8)) + 1);
});

test('o código de material se lê sem consultar ninguém', () => {
  const primeiro = codigoDeMaterial({ grupo: 'TEC', tipo: 'MAL', caracteristica: 'PV' }, db);
  assert.equal(primeiro, 'TEC-MAL-PV-001');

  db.prepare(`INSERT INTO materiais (id, codigo, descricao) VALUES (?, ?, 'Malha PV')`)
    .run(novoId(), primeiro);
  assert.equal(codigoDeMaterial({ grupo: 'TEC', tipo: 'MAL', caracteristica: 'PV' }, db),
               'TEC-MAL-PV-002');

  // Sequência por combinação: o primeiro algodão é 001 mesmo com PV cadastrado.
  assert.equal(codigoDeMaterial({ grupo: 'TEC', tipo: 'MAL', caracteristica: 'ALG' }, db),
               'TEC-MAL-ALG-001');
  // Acento e espaço não entram no código.
  assert.equal(codigoDeMaterial({ grupo: 'Inspeção', tipo: 'etq' }, db), 'INSPEC-ETQ-001');
});

test('o código de produto carrega o prefixo do grupo', () => {
  const c = codigoDeProduto('AVE', db);
  assert.match(c, /^AVE-\d{6}$/);
});

/* ========================================================== auditoria === */

test('a auditoria grava só o que mudou, campo a campo', () => {
  const registro = { id: novoId(), codigo: 'PED-2026-000999', quantidade: 500, preco: 10 };
  const autor = { id: null, nome: 'Renato Monteiro' };

  registrarCriacao({ entidade: 'pedidos', registro, autor }, db);

  const alterados = registrarAlteracao({
    entidade: 'pedidos',
    antes: registro,
    depois: { ...registro, quantidade: 600 },
    autor,
  }, db);

  assert.deepEqual(alterados.map((a) => a.campo), ['quantidade']);

  const linhas = historico('pedidos', registro.id, {}, db);
  assert.equal(linhas.length, 2);
  const mudanca = linhas.find((l) => l.acao === 'ALTERACAO');
  assert.equal(mudanca.campo, 'quantidade');
  assert.equal(mudanca.valor_anterior, '500');
  assert.equal(mudanca.valor_novo, '600');
  assert.equal(mudanca.usuario_nome, 'Renato Monteiro');
  assert.equal(mudanca.codigo, 'PED-2026-000999');
});

test('UPDATE que não muda nada não vira história, e a senha nunca entra', () => {
  const registro = { id: novoId(), codigo: 'X', nome: 'Igual', senha_hash: '$2b$10$antigo' };
  assert.deepEqual(
    registrarAlteracao({ entidade: 'usuarios', antes: registro, depois: { ...registro } }, db),
    []
  );
  assert.equal(historico('usuarios', registro.id, {}, db).length, 0);

  // O hash muda, mas é campo ignorado: continua fora da trilha.
  const alterados = registrarAlteracao({
    entidade: 'usuarios',
    antes: registro,
    depois: { ...registro, senha_hash: '$2b$10$novo', nome: 'Outro' },
  }, db);
  assert.deepEqual(alterados.map((a) => a.campo), ['nome']);
});

test('o nome de quem fez fica congelado na linha', () => {
  const registro = { id: novoId(), codigo: 'OP-TST' };
  registrarBaixa({
    entidade: 'ordens_producao', registro, acao: 'CANCELAMENTO',
    motivo: 'cliente desistiu', autor: { id: null, nome: 'Fulano que saiu' },
  }, db);

  const [linha] = historico('ordens_producao', registro.id, {}, db);
  assert.equal(linha.acao, 'CANCELAMENTO');
  assert.equal(linha.valor_novo, 'cliente desistiu');
  assert.equal(linha.usuario_nome, 'Fulano que saiu');
});

/* ============================================================ semente === */

test('a semente cria os perfis do §36 e não duplica ao rodar de novo', () => {
  const antes = db.prepare(`SELECT COUNT(*) AS n FROM perfis`).get().n;
  assert.equal(antes, 14);

  semear(db);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM perfis`).get().n, antes);

  // O costureiro aponta produção e não enxerga financeiro.
  const costura = db.prepare(`SELECT id FROM perfis WHERE codigo = 'COSTURA'`).get();
  const modulos = db.prepare(`SELECT DISTINCT modulo FROM permissoes WHERE perfil_id = ?`)
    .all(costura.id).map((p) => p.modulo);
  assert.ok(modulos.includes('PRODUCAO'));
  assert.equal(modulos.includes('FINANCEIRO'), false);
});

test('corte e embalagem já nascem com o custo por peça que a Conserv pratica', () => {
  const corte = db.prepare(`SELECT * FROM operacoes WHERE codigo = 'CORTE'`).get();
  const embalagem = db.prepare(`SELECT * FROM operacoes WHERE codigo = 'EMBALAGEM'`).get();
  assert.equal(Number(corte.custo_por_peca), 0.25);
  assert.equal(Number(embalagem.custo_por_peca), 0.5);

  // Silk e costura variam por produto: quem define é o roteiro, não o catálogo.
  const costura = db.prepare(`SELECT * FROM operacoes WHERE codigo = 'COSTURA'`).get();
  assert.equal(Number(costura.custo_por_peca), 0);
});

/* ========================================================= importador === */

test('a assinatura reconhece a planilha pelos cabeçalhos, não pelo nome', () => {
  const a = assinatura(['VENDEDOR', 'PEDIDO', 'CLIENTE']);
  assert.equal(a, assinatura(['pedido', 'vendedor ', 'CLIENTE']), 'ordem e caixa não importam');
  assert.notEqual(a, assinatura(['VENDEDOR', 'PEDIDO']));
});

test('o mapa é sugerido por nome e depois aprendido', () => {
  const cabecalhos = ['VENDEDOR', 'PEDIDO', 'CLIENTE', 'PRODUTO', 'QTD', 'COLUNA ESTRANHA'];
  const sugerido = sugerirMapa('carteira', cabecalhos, db);
  assert.equal(sugerido.origem, 'sugerido');
  assert.equal(sugerido.mapa.cliente, 2);
  assert.equal(sugerido.mapa.quantidade, 4);
  assert.equal(sugerido.mapa.colunaEstranha, undefined);

  // Depois de confirmado, volta como aprendido — inclusive um mapa corrigido à mão.
  aprenderMapa('carteira', cabecalhos, { ...sugerido.mapa, liquidacao: 5 }, db);
  const aprendido = sugerirMapa('carteira', cabecalhos, db);
  assert.equal(aprendido.origem, 'aprendido');
  assert.equal(aprendido.mapa.liquidacao, 5);
});

test('destino desconhecido é recusado antes de ler o arquivo', () => {
  assert.throws(() => sugerirMapa('inexistente', ['A'], db), /Destino desconhecido/);
  assert.ok(DESTINOS.carteira.campos.cliente.exigido);
});

test('a prévia não escreve nada no banco', { skip: !temPlanilha }, async () => {
  const antes = db.prepare(`SELECT COUNT(*) AS n FROM pedidos`).get().n;
  const p = await previa({ caminho: PLANILHA, aba: 'CARTEIRA' }, db);

  assert.equal(p.aba, 'CARTEIRA');
  assert.equal(p.linhas_lidas, 1623);
  assert.deepEqual(p.exigidos_faltando, []);
  assert.ok(p.amostra.length > 0);
  // As colunas de fórmula da planilha aparecem para quem decide, não somem.
  assert.ok(p.colunas_nao_reconhecidas.some((c) => /SEMANA/i.test(c.cabecalho)));
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM pedidos`).get().n, antes);
});

test('a carteira real importa com o valor batendo centavo a centavo', { skip: !temPlanilha }, async () => {
  const r = await importarCarteira({ caminho: PLANILHA, aba: 'CARTEIRA' }, db);

  assert.equal(r.linhas_lidas, 1623);
  assert.equal(r.itens, 1621);
  // As duas linhas recusadas são o rodapé de SUBTOTAL da própria planilha.
  assert.equal(r.linhas_erro, 2);

  const total = db.prepare(
    `SELECT ROUND(SUM(quantidade * preco_unitario), 2) AS valor, ROUND(SUM(quantidade), 0) AS pecas
     FROM pedido_itens WHERE origem_linha IS NOT NULL`
  ).get();
  assert.equal(total.valor, 6026593.37);
  assert.equal(total.pecas, 344696);

  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM clientes`).get().n, 387);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM produtos WHERE codigo LIKE '%-%'`).get().n >= 288, true);
});

test('reimportar a mesma planilha atualiza e não duplica', { skip: !temPlanilha }, async () => {
  const antes = db.prepare(
    `SELECT COUNT(*) AS itens, ROUND(SUM(quantidade * preco_unitario), 2) AS valor FROM pedido_itens`
  ).get();

  const r = await importarCarteira({ caminho: PLANILHA, aba: 'CARTEIRA' }, db);
  assert.equal(r.itens, 0, 'nenhum item novo');
  assert.equal(r.atualizados, 1621, 'todos casaram com o que já existia');

  const depois = db.prepare(
    `SELECT COUNT(*) AS itens, ROUND(SUM(quantidade * preco_unitario), 2) AS valor FROM pedido_itens`
  ).get();
  assert.deepEqual(depois, antes);
});

test('linha repetida de verdade na planilha vira dois itens, não um', { skip: !temPlanilha }, async () => {
  // O pedido 1117 do CAFÉ DEL PLATA traz a mesma baby look quatro vezes.
  const itens = db.prepare(
    `SELECT pi.quantidade, pi.preco_unitario FROM pedido_itens pi
     JOIN pedidos p ON p.id = pi.pedido_id
     JOIN produtos pr ON pr.id = pi.produto_id
     WHERE p.numero_cliente = '1117' AND pr.descricao LIKE 'BABY LOOK%'`
  ).all();
  assert.equal(itens.length, 4, 'as quatro linhas continuam existindo');
});

test('a situação do pedido sai dos fatos, não da coluna STATUS', { skip: !temPlanilha }, () => {
  const situacoes = db.prepare(`SELECT status, COUNT(*) AS n FROM pedidos GROUP BY status`).all();
  const mapa = Object.fromEntries(situacoes.map((s) => [s.status, s.n]));

  // A planilha diz ATRASO em quase tudo; o que informa é ENTREGUE e a nota.
  assert.ok(mapa.ENTREGUE > 800);
  assert.equal(mapa.ATRASO, undefined);
  const total = situacoes.reduce((s, x) => s + x.n, 0);
  assert.equal(total, db.prepare(`SELECT COUNT(*) AS n FROM pedidos`).get().n);
});

test('a mão de obra da planilha vira custo por peça por grupo e operação', { skip: !temPlanilha }, async () => {
  const r = await importarCarteira({ caminho: PLANILHA, aba: 'CARTEIRA' }, db);
  const achar = (grupo, operacao) =>
    r.mao_de_obra.find((m) => m.grupo === grupo && m.operacao === operacao)?.custo_por_peca;

  // Corte e embalagem são fixos em toda peça; costura é o que separa os produtos.
  assert.equal(achar('AVENTAL', 'CORTE'), 0.25);
  assert.equal(achar('AVENTAL', 'EMBALAGEM'), 0.5);
  assert.equal(achar('SACO', 'COSTURA'), 0.8);
  assert.equal(achar('KIMONO', 'COSTURA'), 5.2);
  assert.ok(achar('JALECO', 'COSTURA') > 7);
});

test('a importação fica registrada com o relatório do que aconteceu', { skip: !temPlanilha }, () => {
  const ultima = db.prepare(
    `SELECT * FROM importacoes ORDER BY criado_em DESC, rowid DESC LIMIT 1`
  ).get();
  assert.equal(ultima.status, 'IMPORTADA');
  assert.equal(ultima.destino, 'carteira');
  assert.equal(ultima.linhas_lidas, 1623);
  const relatorio = JSON.parse(ultima.relatorio);
  assert.equal(relatorio.erros.length, 2);
});

test('o item guarda de qual linha da planilha veio', { skip: !temPlanilha }, () => {
  const item = db.prepare(
    `SELECT * FROM pedido_itens WHERE origem_linha IS NOT NULL ORDER BY origem_linha LIMIT 1`
  ).get();
  assert.equal(item.origem_linha, 2, 'a primeira linha de dados da planilha');
  assert.ok(item.importacao_id, 'e de qual importação');
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

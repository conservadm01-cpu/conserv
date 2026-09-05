/**
 * Base de demonstração do CSVSIST — o sistema inteiro cheio, num comando.
 *
 * Monta em sequência tudo o que um ERP precisa para ser avaliado de verdade:
 * usuário administrador, a carteira da planilha `docs/PEDIDOS_EM_CARTEIRA.xlsx`,
 * materiais com ficha técnica, estrutura de fábrica e custo por minuto,
 * financeiro, funil comercial e compras. No fim, prepara o que é próprio da
 * ficha de produção — grade de tamanhos, arte, instruções de setor e horários
 * apontados — e deixa uma ordem-vitrine com o dossiê completo, do jeito que a
 * fábrica imprime.
 *
 * É base de teste, não de produção: os números de custo, folha e aluguel são
 * plausíveis para uma confecção deste porte, mas são exemplo. Por isso o script
 * se recusa a rodar sobre um banco que já tem pedidos, a não ser com
 * `--recriar`, que apaga o arquivo e começa do zero.
 *
 *   npm run db:demo              # monta a base de demonstração
 *   npm run db:demo -- --recriar # apaga o banco atual e monta de novo
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config, rootDir } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const recriar = process.argv.includes('--recriar');
const planilha = path.join(rootDir, 'docs', 'PEDIDOS_EM_CARTEIRA.xlsx');

/* ---------------------------------------------------------------- preparo */

function bancoTemMovimento() {
  if (!fs.existsSync(config.dbPath)) return false;
  // A abertura fica isolada num processo à parte: o script principal só liga no
  // banco depois de decidir se vai apagá-lo.
  const saida = execFileSync(process.execPath, ['-e', `
    const Database = require('better-sqlite3');
    const db = new Database(process.argv[1], { readonly: true, fileMustExist: true });
    const existe = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pedidos'").get();
    console.log(existe ? db.prepare('SELECT COUNT(*) n FROM pedidos').get().n : 0);
  `, config.dbPath], { encoding: 'utf8', cwd: rootDir });
  return Number(saida.trim()) > 0;
}

if (fs.existsSync(config.dbPath) && bancoTemMovimento() && !recriar) {
  console.error(
    `\nO banco ${config.dbPath} já tem pedidos lançados.\n\n` +
      `Para não passar por cima de dado de verdade, a demonstração não roda sobre ele. Escolha:\n` +
      `  • montar a demonstração em outro arquivo:  DB_PATH=./data/demo.db npm run db:demo\n` +
      `  • apagar este banco e recriar do zero:     npm run db:demo -- --recriar\n`
  );
  process.exit(1);
}

if (recriar) {
  for (const sufixo of ['', '-shm', '-wal']) {
    const arquivo = `${config.dbPath}${sufixo}`;
    if (fs.existsSync(arquivo)) fs.rmSync(arquivo);
  }
  console.log(`Banco anterior apagado: ${config.dbPath}`);
}

/* ------------------------------------------------------- etapas do preparo */

const etapa = (titulo, script, args = []) => {
  console.log(`\n=== ${titulo} ===`);
  execFileSync(process.execPath, [path.join(__dirname, script), ...args], {
    stdio: 'inherit',
    cwd: rootDir,
    env: { ...process.env, DB_PATH: config.dbPath },
  });
};

etapa('Banco, administrador e plano de contas', 'init-db.js');
if (fs.existsSync(planilha)) {
  etapa('Carteira de pedidos (planilha de origem)', 'import-xlsx.js', [planilha]);
} else {
  console.log(`\n! Planilha ${planilha} não encontrada — a base sai sem carteira.`);
}
etapa('Materiais, ficha técnica e estoque', 'seed.js');
etapa('Fábrica: equipe, máquinas, custo fixo e tempo padrão', 'seed-fabrica.js');
etapa('Financeiro: contas a pagar e a receber', 'seed-financeiro.js');
etapa('Comercial: funil, oportunidades e orçamentos', 'seed-comercial.js');
etapa('Compras: requisições, pedidos e recebimentos', 'seed-compras.js');

/* ------------------------------------------- o que é próprio da ficha */

console.log('\n=== Fichas de produção ===');

const { getDb, migrate } = await import('../db/index.js');
const { abrirOrdem, atualizarEtapa } = await import('../services/producao.js');
const { salvarGrade, salvarArte, garantirOperacoes } = await import('../services/fichas.js');
const { registrarApontamento } = await import('../services/apontamento.js');

const db = migrate(getDb());

const idDe = (sql, ...params) => db.prepare(sql).get(...params)?.id ?? null;

/** Cria a linha e devolve o id, ou devolve o id de quem já existe. */
function garantir(insert, busca, valores, chaves) {
  const existente = db.prepare(busca).get(...chaves);
  if (existente) return existente.id;
  return db.prepare(insert).run(valores).lastInsertRowid;
}

/*
 * Imagem de exemplo da ficha.
 *
 * É um desenho vetorial gerado aqui — nada de logo de cliente no repositório.
 * Serve para mostrar como a via impressa fica com amostra, e para ser
 * substituída pela foto real do produto.
 */
const AMOSTRA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260">
  <rect width="200" height="260" fill="#f5f5f5"/>
  <path d="M70 30h60l-6 18 22 14c8 5 12 14 12 23v152c0 6-5 11-11 11H53c-6 0-11-5-11-11V85c0-9 4-18 12-23l22-14z"
        fill="#2b2b2b"/>
  <path d="M76 30c0-14 11-24 24-24s24 10 24 24" fill="none" stroke="#2b2b2b" stroke-width="6"/>
  <rect x="86" y="96" width="28" height="20" rx="3" fill="#c9922f"/>
  <text x="100" y="150" font-family="Arial" font-size="11" fill="#c9922f" text-anchor="middle">AMOSTRA</text>
</svg>`;
const AMOSTRA = `data:image/svg+xml;base64,${Buffer.from(AMOSTRA_SVG).toString('base64')}`;

/* --- Ordem-vitrine: o dossiê completo, como o modelo impresso da fábrica --- */

const grupoAvental = garantir(
  `INSERT INTO grupos_produto (nome) VALUES (@nome)`,
  `SELECT id FROM grupos_produto WHERE nome = ?`,
  { nome: 'AVENTAL' },
  ['AVENTAL']
);

const produtoId = garantir(
  `INSERT INTO produtos (descricao, grupo_id, linha, preco_padrao)
   VALUES (@descricao, @grupo_id, 'LEVE', @preco_padrao)`,
  `SELECT id FROM produtos WHERE descricao = ?`,
  { descricao: 'AVENTAL NY EMBORRACHADO PRETO MODELO DEMONSTRAÇÃO', grupo_id: grupoAvental, preco_padrao: 25 },
  ['AVENTAL NY EMBORRACHADO PRETO MODELO DEMONSTRAÇÃO']
);

const fornecedorId =
  idDe(`SELECT id FROM fornecedores WHERE nome = ?`, 'TECELAGEM SANTA CLARA') ??
  idDe(`SELECT id FROM fornecedores ORDER BY id LIMIT 1`);

/**
 * Ficha técnica da peça-vitrine.
 *
 * O setor é o que faz a via impressa ficar útil: o corte recebe só o tecido, o
 * silk só a tinta e a embalagem só o que embala. A observação é a regra de
 * acondicionamento, que é onde a embalagem erra quando não está escrita.
 */
const MATERIAIS_VITRINE = [
  ['NYLON EMBORRACHADO PRETO', 'TECIDO', 'MT', 18.4, 0.6, 'CORTE', null],
  ['QUADRO PLASTICO 25MM COR PRETO', 'AVIAMENTO', 'UN', 0.9, 1, 'PREPARACAO', null],
  ['REGULADOR PLASTICO 25MM COR PRETO', 'AVIAMENTO', 'UN', 0.8, 1, 'PREPARACAO', null],
  ['ETIQUETA 100% POLIESTER TAM UNICO', 'ETIQUETA', 'UN', 0.28, 1, 'PREPARACAO', 'No meio do peito, no avesso'],
  ['SAQUINHO PP 24X32', 'EMBALAGEM', 'UN', 0.18, 1, 'EMBALAGEM', '1 avental por saco PP 24x32'],
  ['SACO GRANDE 40X60', 'EMBALAGEM', 'UN', 0.9, 0.04, 'EMBALAGEM', '25 por saco'],
  ['CAIXA PAPELAO 40X30X25', 'EMBALAGEM', 'UN', 3.9, 0.00667, 'EMBALAGEM', '6 sacos grandes por caixa'],
];

for (const [descricao, tipo, unidade, custo, consumo, setor, observacao] of MATERIAIS_VITRINE) {
  const materialId = garantir(
    `INSERT INTO materiais (descricao, tipo, unidade, custo_unitario, estoque_min, fornecedor_id)
     VALUES (@descricao, @tipo, @unidade, @custo_unitario, 0, @fornecedor_id)`,
    `SELECT id FROM materiais WHERE descricao = ?`,
    { descricao, tipo, unidade, custo_unitario: custo, fornecedor_id: fornecedorId },
    [descricao]
  );
  db.prepare(
    `INSERT INTO ficha_tecnica (produto_id, material_id, consumo_por_peca, perda_percentual, observacao, setor)
     VALUES (?, ?, ?, 0, ?, ?)
     ON CONFLICT(produto_id, material_id) DO UPDATE SET
       consumo_por_peca = excluded.consumo_por_peca, observacao = excluded.observacao, setor = excluded.setor`
  ).run(produtoId, materialId, consumo, observacao, setor);
}

for (const [codigo, custoPorPeca] of [['CORTE', 0.25], ['SILK', 0.7], ['COSTURA', 1.84], ['EMBALAGEM', 0.25]]) {
  const etapaId = idDe(`SELECT id FROM etapas WHERE codigo = ?`, codigo);
  db.prepare(
    `INSERT INTO custos_processo (produto_id, etapa_id, custo_por_peca) VALUES (?, ?, ?)
     ON CONFLICT(produto_id, etapa_id) DO UPDATE SET custo_por_peca = excluded.custo_por_peca`
  ).run(produtoId, etapaId, custoPorPeca);
}

const clienteId = garantir(
  `INSERT INTO clientes (nome, contato, cidade, uf, prazo_pagamento_dias)
   VALUES (@nome, @contato, @cidade, @uf, 28)`,
  `SELECT id FROM clientes WHERE nome = ?`,
  { nome: 'CLIENTE DEMONSTRAÇÃO (PET)', contato: 'Compras', cidade: 'São Paulo', uf: 'SP' },
  ['CLIENTE DEMONSTRAÇÃO (PET)']
);
const vendedorId =
  idDe(`SELECT id FROM vendedores WHERE nome = ?`, 'LETICIA') ??
  garantir(`INSERT INTO vendedores (nome) VALUES (@nome)`, `SELECT id FROM vendedores WHERE nome = ?`,
           { nome: 'LETICIA' }, ['LETICIA']);

const hoje = new Date();
const emDias = (n) => new Date(hoje.getTime() + n * 86400000).toISOString().slice(0, 10);

const pedidoId = garantir(
  `INSERT INTO pedidos (numero, cliente_id, vendedor_id, data_pedido, data_entrega, condicao_pagamento)
   VALUES (@numero, @cliente_id, @vendedor_id, @data_pedido, @data_entrega, '28 dias')`,
  `SELECT id FROM pedidos WHERE numero = ? AND cliente_id = ?`,
  {
    numero: 'DEMO-238', cliente_id: clienteId, vendedor_id: vendedorId,
    data_pedido: emDias(-12), data_entrega: emDias(18),
  },
  ['DEMO-238', clienteId]
);

const itemId = garantir(
  `INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario, liquidacao, data_entrega)
   VALUES (@pedido_id, @produto_id, 3000, 25, 0, @data_entrega)`,
  `SELECT id FROM pedido_itens WHERE pedido_id = ? AND produto_id = ?`,
  { pedido_id: pedidoId, produto_id: produtoId, data_entrega: emDias(18) },
  [pedidoId, produtoId]
);

const ordemVitrine =
  db.prepare(`SELECT id FROM ordens_producao WHERE pedido_item_id = ?`).get(itemId)?.id ??
  abrirOrdem(itemId, { observacao: 'Ordem de demonstração — dossiê completo para conferir a impressão.' }).id;

// Grade real: 3.000 peças em tamanho único, como sai o avental.
salvarGrade(itemId, [{ tamanho: 'ÚNICO', quantidade: 3000 }]);

salvarArte(produtoId, {
  personalizacao: 'SILK',
  origem_arte: 'VETOR',
  base_tinta: 'AGUA',
  tinta_pronta: true,
  observacao: 'Todas as artes são centralizadas de acordo com o tamanho especificado pelo layout.',
});

db.prepare(`DELETE FROM arte_logos WHERE produto_id = ?`).run(produtoId);
const insLogo = db.prepare(
  `INSERT INTO arte_logos (produto_id, descricao, posicao, largura_cm, altura_cm, cor, cor_hex, ordem)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
insLogo.run(produtoId, 'LOGO PEITO', 'Peito — 10 cm abaixo da gola', 6, 7, 'DOURADO', '#c9922f', 1);
insLogo.run(produtoId, 'LOGO FRENTE', 'Frente inferior, centralizado', 12, 17, 'DOURADO', '#c9922f', 2);

db.prepare(`DELETE FROM arte_cores WHERE produto_id = ?`).run(produtoId);
db.prepare(
  `INSERT INTO arte_cores (produto_id, sequencia, nome, referencia, hex) VALUES (?, 1, 'DOURADO', 'PANTONE 872C', '#c9922f')`
).run(produtoId);

db.prepare(`DELETE FROM produto_instrucoes WHERE produto_id = ?`).run(produtoId);
const insInstrucao = db.prepare(
  `INSERT INTO produto_instrucoes (produto_id, setor, texto, destaque, ordem) VALUES (?, ?, ?, ?, ?)`
);
for (const [setor, texto, destaque, ordem] of [
  ['PREPARACAO', 'CORTAR 9000 ALÇAS COM 65 CM', 1, 1],
  ['PREPARACAO', 'CORTAR 3000 ALÇAS COM 13 CM', 1, 2],
  ['CORTE', 'Largura do tecido 1,50 m — comprimento da peça 96,5 cm', 0, 1],
  ['SILK', 'TINTA JÁ PRONTA — NÃO MISTURAR', 1, 1],
  ['MODELAGEM', 'Dobra 2x (1,5 cm + 1,0 cm) na barra e no pé de máquina', 0, 1],
  ['MODELAGEM', 'Etiqueta no meio do peito, no avesso', 0, 2],
  ['EMBALAGEM', 'Conferir a quantidade por saco antes de fechar a caixa', 0, 1],
]) insInstrucao.run(produtoId, setor, texto, destaque, ordem);

db.prepare(`DELETE FROM produto_imagens WHERE produto_id = ?`).run(produtoId);
const insImagem = db.prepare(
  `INSERT INTO produto_imagens (produto_id, setor, titulo, arquivo, ordem) VALUES (?, ?, ?, ?, 1)`
);
for (const [setor, titulo] of [
  ['PRODUCAO', 'Amostra virtual'],
  ['PREPARACAO', 'Peça montada'],
  ['MODELAGEM', 'Molde aberto'],
  ['SILK', 'Aplicação do logo'],
]) insImagem.run(produtoId, setor, titulo, AMOSTRA);

// A ordem-vitrine já passou pelo corte: a via sai com horário e operador preenchidos.
garantirOperacoes(ordemVitrine, db);
const marcarOperacao = db.prepare(
  `UPDATE ordem_operacoes SET inicio = ?, termino = ?, operador = ? WHERE ordem_id = ? AND setor = 'CORTE' AND sequencia = ?`
);
for (const [sequencia, inicio, termino, operador] of [
  [1, `${emDias(-3)}T07:30`, `${emDias(-3)}T09:10`, 'MARIA'],
  [2, `${emDias(-3)}T09:15`, `${emDias(-3)}T09:40`, 'MARIA'],
  [3, `${emDias(-3)}T09:45`, `${emDias(-2)}T11:20`, 'JOSÉ'],
  [4, `${emDias(-2)}T11:30`, `${emDias(-2)}T16:05`, 'JOSÉ'],
]) marcarOperacao.run(inicio, termino, operador, ordemVitrine, sequencia);

for (const [codigo, status, responsavel] of [
  ['MATERIA_PRIMA', 'CONCLUIDA', 'Almoxarifado'],
  ['CORTE', 'CONCLUIDA', 'José'],
  ['SILK', 'EM_ANDAMENTO', 'Serigrafia'],
]) {
  atualizarEtapa(ordemVitrine, idDe(`SELECT id FROM etapas WHERE codigo = ?`, codigo), { status, responsavel }, db);
}

/*
 * Apontamento do que já foi produzido na ordem-vitrine.
 *
 * Sem apontamento, as telas de produtividade e de custo real ficam vazias e
 * quem avalia o sistema não vê a conta fechar. O custo de mão de obra é
 * congelado no lançamento, então estes números seguem a folha de hoje.
 */
const colaboradores = db
  .prepare(`SELECT c.id, c.nome, d.nome AS setor FROM colaboradores c
            LEFT JOIN departamentos d ON d.id = c.departamento_id WHERE c.ativo = 1`)
  .all();
const doSetor = (setor) => colaboradores.find((c) => c.setor === setor) || colaboradores[0];

let apontados = 0;
for (const [codigo, setor, quantidade, refugo, minutos, dias] of [
  // Peças boas + refugo não podem passar da ordem: o serviço recusa, e com razão.
  ['CORTE', 'CORTE', 2988, 12, 480, -3],
  ['SILK', 'SILK', 1775, 25, 420, -2],
]) {
  const pessoa = doSetor(setor);
  if (!pessoa) continue;
  const etapaId = idDe(`SELECT id FROM etapas WHERE codigo = ?`, codigo);
  const jaTem = db
    .prepare(`SELECT 1 FROM apontamentos WHERE ordem_id = ? AND etapa_id = ?`)
    .get(ordemVitrine, etapaId);
  if (jaTem) continue;
  try {
    registrarApontamento(
      {
        ordem_id: ordemVitrine, etapa_id: etapaId, colaborador_id: pessoa.id,
        quantidade, refugo, minutos, data: emDias(dias),
        observacao: 'Apontamento da base de demonstração',
      },
      db
    );
    apontados += 1;
  } catch (erro) {
    console.log(`  ! apontamento de ${codigo} não lançado: ${erro.message}`);
  }
}

/* --- Grade e apontamento em algumas ordens vindas da planilha --- */

const ordensImportadas = db
  .prepare(
    `SELECT o.id, o.pedido_item_id, o.quantidade
     FROM ordens_producao o
     WHERE o.status IN ('ABERTA','EM_PRODUCAO') AND o.id <> ?
       AND NOT EXISTS (SELECT 1 FROM item_grade g WHERE g.item_id = o.pedido_item_id)
     ORDER BY o.id LIMIT 12`
  )
  .all(ordemVitrine);

/** Reparte a quantidade numa grade P/M/G/GG plausível, sem sobrar peça. */
function repartir(quantidade) {
  const proporcoes = [
    ['P', 0.15], ['M', 0.3], ['G', 0.3], ['GG', 0.15], ['XG', 0.1],
  ];
  const linhas = proporcoes.map(([tamanho, fracao]) => ({
    tamanho,
    quantidade: Math.floor(quantidade * fracao),
  }));
  const sobra = quantidade - linhas.reduce((s, l) => s + l.quantidade, 0);
  linhas[1].quantidade += sobra; // a sobra vai para o M, o tamanho que mais sai
  return linhas.filter((l) => l.quantidade > 0);
}

let comGrade = 0;
for (const ordem of ordensImportadas) {
  // Grade só faz sentido em quantidade que dá para repartir.
  if (ordem.quantidade < 20) continue;
  try {
    salvarGrade(ordem.pedido_item_id, repartir(ordem.quantidade), db);
    comGrade += 1;
  } catch {
    // Item com quantidade fracionada: fica sem grade, sai como tamanho único.
  }
}

/* ------------------------------------------------------------- resumo */

const conta = (sql) => db.prepare(sql).get().n;
const numero = (n) => n.toLocaleString('pt-BR');

console.log('\n=== Base de demonstração pronta ===');
console.log(`Banco:        ${config.dbPath}`);
console.log(`Pedidos:      ${numero(conta('SELECT COUNT(*) n FROM pedidos'))}`);
console.log(`Itens:        ${numero(conta('SELECT COUNT(*) n FROM pedido_itens'))}`);
console.log(`Ordens:       ${numero(conta('SELECT COUNT(*) n FROM ordens_producao'))}`);
console.log(`Clientes:     ${numero(conta('SELECT COUNT(*) n FROM clientes'))}`);
console.log(`Produtos:     ${numero(conta('SELECT COUNT(*) n FROM produtos'))}`);
console.log(`Materiais:    ${numero(conta('SELECT COUNT(*) n FROM materiais'))}`);
console.log(`Títulos:      ${numero(conta('SELECT COUNT(*) n FROM titulos'))}`);
console.log(`Grades:       ${comGrade + 1} ordens com grade de tamanhos`);
console.log(`Apontamentos: ${numero(conta('SELECT COUNT(*) n FROM apontamentos'))}`);
console.log(
  `\nOrdem-vitrine com o dossiê completo: ` +
    `${db.prepare('SELECT numero FROM ordens_producao WHERE id = ?').get(ordemVitrine).numero} ` +
    `(pedido DEMO-238)\n` +
    `Abra em Produção (PCP) → a ordem → aba "Ficha de produção" → Abrir ficha para impressão.\n`
);
console.log('Suba o sistema com "npm run build && npm start" e entre em http://localhost:3333');

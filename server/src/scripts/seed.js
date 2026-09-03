/**
 * Popula materiais, fichas técnicas e custos de MO de exemplo para os grupos
 * mais frequentes da Conserv — serve para conhecer o fluxo de materiais/MRP
 * antes de cadastrar a ficha técnica real de cada produto.
 */
import { migrate, getDb } from '../db/index.js';
import { registrarMovimento } from '../services/estoque.js';
import { explodirFichaTecnica, recalcularCustosMO } from '../services/producao.js';

const db = migrate(getDb());

const FORNECEDORES = [
  { nome: 'TECELAGEM SANTA CLARA', prazo_entrega_dias: 10 },
  { nome: 'AVIAMENTOS SP', prazo_entrega_dias: 5 },
  { nome: 'EMBALAGENS RAPIDAS', prazo_entrega_dias: 7 },
];

const MATERIAIS = [
  { codigo: 'TEC-001', descricao: 'TECIDO GABARDINE', tipo: 'TECIDO', unidade: 'MT', custo_unitario: 12.9, estoque_min: 200, fornecedor: 'TECELAGEM SANTA CLARA', entrada: 800 },
  { codigo: 'TEC-002', descricao: 'MALHA PV', tipo: 'TECIDO', unidade: 'KG', custo_unitario: 38.5, estoque_min: 80, fornecedor: 'TECELAGEM SANTA CLARA', entrada: 300 },
  { codigo: 'TEC-003', descricao: 'MALHA 100% ALGODAO', tipo: 'TECIDO', unidade: 'KG', custo_unitario: 42.0, estoque_min: 80, fornecedor: 'TECELAGEM SANTA CLARA', entrada: 250 },
  { codigo: 'TEC-004', descricao: 'NYLON EMBORRACHADO', tipo: 'TECIDO', unidade: 'MT', custo_unitario: 18.4, estoque_min: 150, fornecedor: 'TECELAGEM SANTA CLARA', entrada: 600 },
  { codigo: 'TEC-005', descricao: 'CETIM', tipo: 'TECIDO', unidade: 'MT', custo_unitario: 15.2, estoque_min: 100, fornecedor: 'TECELAGEM SANTA CLARA', entrada: 400 },
  { codigo: 'TEC-006', descricao: 'MICROFIBRA', tipo: 'TECIDO', unidade: 'MT', custo_unitario: 16.8, estoque_min: 120, fornecedor: 'TECELAGEM SANTA CLARA', entrada: 500 },
  { codigo: 'TEC-007', descricao: 'LONITA', tipo: 'TECIDO', unidade: 'MT', custo_unitario: 21.0, estoque_min: 80, fornecedor: 'TECELAGEM SANTA CLARA', entrada: 300 },
  { codigo: 'AVI-001', descricao: 'LINHA DE COSTURA', tipo: 'AVIAMENTO', unidade: 'UN', custo_unitario: 4.5, estoque_min: 100, fornecedor: 'AVIAMENTOS SP', entrada: 400 },
  { codigo: 'AVI-002', descricao: 'VIES', tipo: 'AVIAMENTO', unidade: 'MT', custo_unitario: 0.9, estoque_min: 500, fornecedor: 'AVIAMENTOS SP', entrada: 3000 },
  { codigo: 'AVI-003', descricao: 'ELASTICO 2CM', tipo: 'AVIAMENTO', unidade: 'MT', custo_unitario: 1.2, estoque_min: 400, fornecedor: 'AVIAMENTOS SP', entrada: 2000 },
  { codigo: 'AVI-004', descricao: 'BOTAO DE PRESSAO', tipo: 'AVIAMENTO', unidade: 'UN', custo_unitario: 0.35, estoque_min: 1000, fornecedor: 'AVIAMENTOS SP', entrada: 8000 },
  { codigo: 'ETQ-001', descricao: 'ETIQUETA BORDADA', tipo: 'ETIQUETA', unidade: 'UN', custo_unitario: 0.28, estoque_min: 2000, fornecedor: 'AVIAMENTOS SP', entrada: 12000 },
  { codigo: 'TIN-001', descricao: 'TINTA PLASTISOL', tipo: 'TINTA', unidade: 'KG', custo_unitario: 68.0, estoque_min: 10, fornecedor: 'AVIAMENTOS SP', entrada: 40 },
  { codigo: 'EMB-001', descricao: 'SACO PLASTICO 30X40', tipo: 'EMBALAGEM', unidade: 'UN', custo_unitario: 0.22, estoque_min: 3000, fornecedor: 'EMBALAGENS RAPIDAS', entrada: 20000 },
  { codigo: 'EMB-002', descricao: 'CAIXA PAPELAO 40X30X25', tipo: 'EMBALAGEM', unidade: 'UN', custo_unitario: 3.9, estoque_min: 200, fornecedor: 'EMBALAGENS RAPIDAS', entrada: 900 },
];

/** Ficha técnica por GRUPO de produto: consumo médio por peça. */
const FICHAS_POR_GRUPO = {
  AVENTAL: [
    ['TECIDO GABARDINE', 1.4, 5], ['LINHA DE COSTURA', 0.02, 0], ['VIES', 3.2, 5],
    ['ETIQUETA BORDADA', 1, 0], ['SACO PLASTICO 30X40', 1, 2],
  ],
  CAMISETA: [
    ['MALHA 100% ALGODAO', 0.22, 6], ['LINHA DE COSTURA', 0.015, 0], ['ETIQUETA BORDADA', 1, 0],
    ['TINTA PLASTISOL', 0.008, 10], ['SACO PLASTICO 30X40', 1, 2],
  ],
  JALECO: [
    ['MICROFIBRA', 1.8, 5], ['LINHA DE COSTURA', 0.03, 0], ['BOTAO DE PRESSAO', 6, 3],
    ['ETIQUETA BORDADA', 1, 0], ['SACO PLASTICO 30X40', 1, 2],
  ],
  KIMONO: [
    ['CETIM', 2.1, 6], ['LINHA DE COSTURA', 0.025, 0], ['VIES', 4.0, 5],
    ['ETIQUETA BORDADA', 1, 0], ['SACO PLASTICO 30X40', 1, 2],
  ],
  SACOLA: [
    ['LONITA', 0.75, 8], ['LINHA DE COSTURA', 0.02, 0], ['ETIQUETA BORDADA', 1, 0],
  ],
  CAPA: [
    ['CETIM', 1.6, 5], ['LINHA DE COSTURA', 0.02, 0], ['ELASTICO 2CM', 1.2, 4],
  ],
  NECESSAIRE: [
    ['NYLON EMBORRACHADO', 0.4, 8], ['LINHA DE COSTURA', 0.015, 0], ['ETIQUETA BORDADA', 1, 0],
  ],
};

/** Custo de MO por peça e etapa, por grupo (R$/peça). */
const MO_POR_GRUPO = {
  AVENTAL:    { CORTE: 0.25, SILK: 0.70, COSTURA: 1.20, EMBALAGEM: 0.50 },
  CAMISETA:   { CORTE: 0.25, SILK: 1.50, COSTURA: 1.50, EMBALAGEM: 0.50 },
  JALECO:     { CORTE: 0.25, SILK: 2.00, COSTURA: 10.00, EMBALAGEM: 0.50 },
  KIMONO:     { CORTE: 0.30, SILK: 1.50, COSTURA: 6.00, EMBALAGEM: 0.50 },
  SACOLA:     { CORTE: 0.20, SILK: 1.00, COSTURA: 2.50, EMBALAGEM: 0.40 },
  CAPA:       { CORTE: 0.20, SILK: 0.80, COSTURA: 2.00, EMBALAGEM: 0.40 },
  NECESSAIRE: { CORTE: 0.20, SILK: 0.90, COSTURA: 2.20, EMBALAGEM: 0.40 },
};

const upsertFornecedor = db.prepare(
  `INSERT INTO fornecedores (nome, prazo_entrega_dias) VALUES (?, ?)
   ON CONFLICT(nome) DO UPDATE SET prazo_entrega_dias = excluded.prazo_entrega_dias`
);
const upsertMaterial = db.prepare(
  `INSERT INTO materiais (codigo, descricao, tipo, unidade, custo_unitario, estoque_min, fornecedor_id)
   VALUES (@codigo, @descricao, @tipo, @unidade, @custo_unitario, @estoque_min, @fornecedor_id)
   ON CONFLICT(descricao) DO UPDATE SET
     codigo = excluded.codigo, tipo = excluded.tipo, unidade = excluded.unidade,
     custo_unitario = excluded.custo_unitario, estoque_min = excluded.estoque_min,
     fornecedor_id = excluded.fornecedor_id`
);

db.transaction(() => {
  for (const f of FORNECEDORES) upsertFornecedor.run(f.nome, f.prazo_entrega_dias);
  for (const m of MATERIAIS) {
    const fornecedor = db.prepare(`SELECT id FROM fornecedores WHERE nome = ?`).get(m.fornecedor);
    upsertMaterial.run({ ...m, fornecedor_id: fornecedor.id });
  }
})();

// Estoque inicial (só na primeira execução — não duplica entradas).
const jaTemMovimento = db.prepare(`SELECT COUNT(*) AS n FROM movimentos_estoque`).get().n > 0;
if (!jaTemMovimento) {
  for (const m of MATERIAIS) {
    const material = db.prepare(`SELECT id FROM materiais WHERE descricao = ?`).get(m.descricao);
    registrarMovimento(
      {
        material_id: material.id, tipo: 'ENTRADA', quantidade: m.entrada,
        custo_unitario: m.custo_unitario, documento: 'ESTOQUE INICIAL',
        observacao: 'Carga inicial de estoque (seed)',
      },
      db
    );
  }
  console.log(`Estoque inicial lançado para ${MATERIAIS.length} materiais.`);
}

// Ficha técnica e custos de MO aplicados a todos os produtos do grupo.
const upsertFicha = db.prepare(
  `INSERT INTO ficha_tecnica (produto_id, material_id, consumo_por_peca, perda_percentual)
   VALUES (?, ?, ?, ?) ON CONFLICT(produto_id, material_id) DO NOTHING`
);
const upsertCusto = db.prepare(
  `INSERT INTO custos_processo (produto_id, etapa_id, custo_por_peca) VALUES (?, ?, ?)
   ON CONFLICT(produto_id, etapa_id) DO UPDATE SET custo_por_peca = excluded.custo_por_peca`
);

let fichas = 0;
let custos = 0;
db.transaction(() => {
  for (const [grupo, itens] of Object.entries(FICHAS_POR_GRUPO)) {
    const produtos = db
      .prepare(`SELECT p.id FROM produtos p JOIN grupos_produto g ON g.id = p.grupo_id WHERE g.nome = ?`)
      .all(grupo);
    for (const produto of produtos) {
      for (const [descricao, consumo, perda] of itens) {
        const material = db.prepare(`SELECT id FROM materiais WHERE descricao = ?`).get(descricao);
        if (material) {
          upsertFicha.run(produto.id, material.id, consumo, perda);
          fichas++;
        }
      }
      for (const [codigo, custo] of Object.entries(MO_POR_GRUPO[grupo] ?? {})) {
        const etapa = db.prepare(`SELECT id FROM etapas WHERE codigo = ?`).get(codigo);
        if (etapa) {
          upsertCusto.run(produto.id, etapa.id, custo);
          custos++;
        }
      }
    }
  }
})();

// Ordens já abertas passam a ter necessidade de material e custo de MO.
const ordens = db.prepare(`SELECT id FROM ordens_producao WHERE status IN ('ABERTA','EM_PRODUCAO')`).all();
db.transaction(() => {
  for (const o of ordens) {
    explodirFichaTecnica(o.id, db);
    recalcularCustosMO(o.id, db);
  }
})();

console.log(`Ficha técnica: ${fichas} vínculos. Custos de processo: ${custos} registros.`);
console.log(`Necessidade recalculada para ${ordens.length} ordens em aberto.`);

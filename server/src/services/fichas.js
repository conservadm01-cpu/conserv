/**
 * Fichas de produção — o dossiê que desce para o chão de fábrica.
 *
 * Uma ordem de produção rende um conjunto de vias, cada uma escrita para quem
 * vai executá-la: a capa (ordem de produção), a preparação, o corte, o silk, a
 * modelagem, a costura e a embalagem. O modelo é o dossiê que a Conserv já
 * imprime hoje; aqui ele deixa de ser planilha copiada à mão e passa a sair do
 * pedido, da ficha técnica e do custo de processo que já estão no sistema.
 *
 * Duas decisões que valem explicação:
 *
 * - A via de cada setor mostra **só o material daquele setor**. O corte não
 *   precisa saber de saco plástico e a embalagem não precisa saber de tecido;
 *   uma lista completa em toda via é o caminho mais curto para a pessoa
 *   conferir a linha errada. O setor vem da ficha técnica quando está lançado
 *   e, quando não está, é deduzido do tipo do material.
 *
 * - A sequência operacional é **copiada** para a ordem na primeira impressão.
 *   Mudar o roteiro padrão amanhã não pode reescrever a via que a fábrica
 *   assinou ontem.
 */
import { getDb } from '../db/index.js';
import { notFound, badRequest } from '../lib/errors.js';
import { round2 } from '../lib/numbers.js';

/** Colunas da grade de tamanhos, na ordem em que aparecem impressas. */
export const TAMANHOS = ['ÚNICO', 'P', 'M', 'G', 'GG', 'XG', 'G1', 'G2'];

/** Vias que a ordem pode gerar, na ordem do dossiê. */
export const VIAS = [
  { id: 'PRODUCAO', titulo: 'Ordem de produção' },
  { id: 'PREPARACAO', titulo: 'Ficha: preparação' },
  { id: 'CORTE', titulo: 'Layout: setor corte' },
  { id: 'SILK', titulo: 'Layout: setor silkscreen' },
  { id: 'MODELAGEM', titulo: 'Layout: setor modelagem' },
  { id: 'COSTURA', titulo: 'Layout: setor costura' },
  { id: 'EMBALAGEM', titulo: 'Layout: setor embalagem' },
];

const IDS_VIAS = new Set(VIAS.map((v) => v.id));

/** Setores que aceitam instrução, imagem e sequência operacional. */
export const SETORES = VIAS.map((v) => v.id);

/**
 * Onde cada tipo de material é consumido, quando a ficha técnica não diz.
 * Tecido é do corte, tinta é do silk, embalagem é da embalagem e o resto
 * (aviamento, etiqueta) chega pela preparação.
 */
const SETOR_POR_TIPO = {
  TECIDO: 'CORTE',
  TINTA: 'SILK',
  EMBALAGEM: 'EMBALAGEM',
  ETIQUETA: 'PREPARACAO',
  AVIAMENTO: 'PREPARACAO',
  SERVICO: 'PREPARACAO',
  OUTRO: 'PREPARACAO',
};

/**
 * Material que cada via lista.
 *
 * A capa e a preparação mostram o dossiê inteiro — são as vias de conferência.
 * A modelagem vê o que vira peça (tudo menos tinta e embalagem), porque é ela
 * que confere se o molde fecha com o aviamento comprado.
 */
const MATERIAL_DA_VIA = {
  PRODUCAO: () => true,
  PREPARACAO: () => true,
  CORTE: (m) => m.setor === 'CORTE',
  SILK: (m) => m.setor === 'SILK',
  MODELAGEM: (m) => m.setor !== 'EMBALAGEM' && m.setor !== 'SILK',
  COSTURA: (m) => m.setor === 'PREPARACAO' || m.setor === 'COSTURA',
  EMBALAGEM: (m) => m.setor === 'EMBALAGEM',
};

/** Assinaturas de conferência impressas no rodapé de cada via. */
const ASSINATURAS = {
  PRODUCAO: ['Aprovado venda / assinatura', 'Conferência assinatura', 'Conferência assinatura'],
  PREPARACAO: ['Conferência final preparador', 'Conferência final ajudante'],
  CORTE: ['Conferência final cortador', 'Conferência final ajudante'],
  SILK: ['Conferência final estampador', 'Conferência final ajudante'],
  MODELAGEM: ['Conferência modelagem'],
  COSTURA: ['Conferência final costura', 'Conferência final ajudante'],
  EMBALAGEM: ['Conferência final embalagem', 'Conferência final ajudante'],
};

export const setorValido = (setor) => IDS_VIAS.has(String(setor || '').toUpperCase());

function exigirSetor(setor) {
  const s = String(setor || '').toUpperCase();
  if (!IDS_VIAS.has(s)) throw badRequest(`Setor inválido: ${setor}`, { aceitos: SETORES });
  return s;
}

/** Cabeçalho da ordem: pedido, cliente, vendedor, produto e datas. */
function cabecalho(ordemId, db) {
  const row = db
    .prepare(
      `SELECT o.id, o.numero, o.quantidade, o.status, o.data_abertura, o.data_prevista,
              o.data_conclusao, o.observacao,
              i.id AS item_id, i.preco_unitario, i.descricao AS item_descricao,
              p.id AS pedido_id, p.numero AS pedido_numero, p.data_pedido, p.data_entrega,
              p.nota_fiscal, p.data_nota_fiscal, p.condicao_pagamento, p.situacao,
              c.nome AS cliente, c.contato AS cliente_contato, c.cidade, c.uf,
              cc.nome AS categoria,
              COALESCE(vd.nome, '') AS vendedor,
              pr.id AS produto_id, pr.codigo AS produto_codigo, pr.descricao AS produto,
              pr.linha, g.nome AS grupo
       FROM ordens_producao o
       JOIN pedido_itens i ON i.id = o.pedido_item_id
       JOIN pedidos p ON p.id = i.pedido_id
       JOIN clientes c ON c.id = p.cliente_id
       LEFT JOIN categorias_cliente cc ON cc.id = c.categoria_id
       LEFT JOIN vendedores vd ON vd.id = p.vendedor_id
       JOIN produtos pr ON pr.id = i.produto_id
       LEFT JOIN grupos_produto g ON g.id = pr.grupo_id
       WHERE o.id = ?`
    )
    .get(ordemId);
  if (!row) throw notFound('Ordem de produção não encontrada');
  return row;
}

/**
 * Grade de tamanhos do item.
 *
 * Sem grade lançada, a peça é tamanho único — é assim que a fábrica trata
 * avental, sacola e necessaire, que são a maior parte da carteira.
 */
export function gradeDoItem(itemId, quantidade, db = getDb()) {
  const linhas = db
    .prepare(`SELECT tamanho, quantidade FROM item_grade WHERE item_id = ?`)
    .all(itemId);
  const mapa = new Map(linhas.map((l) => [l.tamanho, l.quantidade]));
  if (mapa.size === 0) mapa.set('ÚNICO', quantidade);
  const grade = TAMANHOS.map((tamanho) => ({ tamanho, quantidade: mapa.get(tamanho) ?? null }));
  const total = grade.reduce((s, g) => s + (g.quantidade || 0), 0);
  return { grade, total: round2(total), lancada: linhas.length > 0 };
}

/** Substitui a grade do item. Uma grade que não fecha com o item é recusada. */
export function salvarGrade(itemId, linhas, db = getDb()) {
  const item = db.prepare(`SELECT id, quantidade FROM pedido_itens WHERE id = ?`).get(itemId);
  if (!item) throw notFound('Item de pedido não encontrado');

  const limpas = (linhas || [])
    .map((l) => ({ tamanho: String(l.tamanho || '').toUpperCase(), quantidade: Number(l.quantidade) || 0 }))
    .filter((l) => l.quantidade > 0);
  for (const l of limpas) {
    if (!TAMANHOS.includes(l.tamanho)) throw badRequest(`Tamanho inválido: ${l.tamanho}`, { aceitos: TAMANHOS });
  }
  const total = round2(limpas.reduce((s, l) => s + l.quantidade, 0));
  if (limpas.length > 0 && total !== round2(item.quantidade)) {
    throw badRequest(
      `A grade soma ${total} peças e o item tem ${round2(item.quantidade)}. Ajuste a grade ou a quantidade do item.`,
      { total_grade: total, quantidade_item: round2(item.quantidade) }
    );
  }

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM item_grade WHERE item_id = ?`).run(itemId);
    const ins = db.prepare(`INSERT INTO item_grade (item_id, tamanho, quantidade) VALUES (?, ?, ?)`);
    for (const l of limpas) ins.run(itemId, l.tamanho, l.quantidade);
  });
  tx();
  return gradeDoItem(itemId, item.quantidade, db);
}

/**
 * Materiais da ordem com o consumo por peça, o setor que consome e a situação
 * de compra — o "Nº PEDIDO / FORNECEDOR / DATA DE ENTREGA" da via impressa sai
 * do último pedido de compra em aberto daquele material.
 */
function materiaisDaOrdem(ordem, db) {
  const linhas = db
    .prepare(
      `SELECT m.id, m.codigo, m.descricao, m.tipo, m.unidade, m.custo_unitario,
              om.quantidade_prevista, om.quantidade_baixada,
              ft.consumo_por_peca, ft.perda_percentual, ft.observacao, ft.setor,
              f.nome AS fornecedor,
              (SELECT pc.numero FROM pedido_compra_itens pci
                 JOIN pedidos_compra pc ON pc.id = pci.pedido_compra_id
                WHERE pci.material_id = m.id AND pc.status NOT IN ('CANCELADO','RASCUNHO')
                ORDER BY pc.id DESC LIMIT 1) AS pedido_compra,
              (SELECT pc.previsao_entrega FROM pedido_compra_itens pci
                 JOIN pedidos_compra pc ON pc.id = pci.pedido_compra_id
                WHERE pci.material_id = m.id AND pc.status NOT IN ('CANCELADO','RASCUNHO')
                ORDER BY pc.id DESC LIMIT 1) AS entrega_compra
       FROM ordem_materiais om
       JOIN materiais m ON m.id = om.material_id
       LEFT JOIN ficha_tecnica ft ON ft.material_id = m.id AND ft.produto_id = ?
       LEFT JOIN fornecedores f ON f.id = m.fornecedor_id
       WHERE om.ordem_id = ?
       ORDER BY CASE m.tipo WHEN 'TECIDO' THEN 1 WHEN 'AVIAMENTO' THEN 2 WHEN 'ETIQUETA' THEN 3
                            WHEN 'TINTA' THEN 4 WHEN 'EMBALAGEM' THEN 5 ELSE 6 END, m.descricao`
    )
    .all(ordem.produto_id, ordem.id);

  return linhas.map((l) => ({
    ...l,
    setor: l.setor || SETOR_POR_TIPO[l.tipo] || 'PREPARACAO',
    consumo_por_peca: l.consumo_por_peca ?? (ordem.quantidade > 0 ? round2(l.quantidade_prevista / ordem.quantidade) : 0),
    quantidade_total: round2(l.quantidade_prevista),
    custo_previsto: round2(l.quantidade_prevista * l.custo_unitario),
  }));
}

/** Valor da operação: custo de MO por etapa, como a capa da ficha imprime. */
function operacoesDeCusto(ordem, db) {
  const etapas = db
    .prepare(
      `SELECT e.codigo, e.nome, e.ordem AS sequencia, oe.custo_mo, oe.status,
              oe.responsavel, oe.iniciado_em, oe.concluido_em
       FROM ordem_etapas oe JOIN etapas e ON e.id = oe.etapa_id
       WHERE oe.ordem_id = ? ORDER BY e.ordem`
    )
    .all(ordem.id);

  const operacoes = etapas
    .filter((e) => e.custo_mo > 0)
    .map((e, i) => ({
      numero: i + 1,
      etapa: e.nome,
      codigo: e.codigo,
      quantidade: round2(ordem.quantidade),
      custo_unitario: ordem.quantidade > 0 ? round2(e.custo_mo / ordem.quantidade) : 0,
      custo_total: round2(e.custo_mo),
    }));

  return {
    operacoes,
    total_mo: round2(operacoes.reduce((s, o) => s + o.custo_total, 0)),
    controle: etapas.map((e) => ({
      etapa: e.nome,
      codigo: e.codigo,
      status: e.status,
      responsavel: e.responsavel,
      iniciado_em: e.iniciado_em,
      concluido_em: e.concluido_em,
    })),
  };
}

/**
 * Copia a sequência operacional padrão para a ordem, se ainda não foi copiada.
 * Idempotente: rodar de novo não duplica nem apaga o que a fábrica preencheu.
 */
export function garantirOperacoes(ordemId, db = getDb()) {
  const padrao = db
    .prepare(`SELECT setor, sequencia, nome, maquina FROM operacoes_setor WHERE ativo = 1 ORDER BY setor, sequencia`)
    .all();
  const ins = db.prepare(
    `INSERT INTO ordem_operacoes (ordem_id, setor, sequencia, nome, maquina) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ordem_id, setor, nome) DO NOTHING`
  );
  const tx = db.transaction(() => {
    for (const o of padrao) ins.run(ordemId, o.setor, o.sequencia, o.nome, o.maquina);
  });
  tx();
  return db
    .prepare(`SELECT * FROM ordem_operacoes WHERE ordem_id = ? ORDER BY setor, sequencia`)
    .all(ordemId);
}

/** Anota início, término ou operador de uma operação da ordem. */
export function apontarOperacao(operacaoId, dados, db = getDb()) {
  const atual = db.prepare(`SELECT * FROM ordem_operacoes WHERE id = ?`).get(operacaoId);
  if (!atual) throw notFound('Operação da ordem não encontrada');
  const campos = ['inicio', 'termino', 'operador', 'maquina', 'observacao'];
  const alvo = { ...atual };
  for (const c of campos) if (c in dados) alvo[c] = dados[c] === '' ? null : dados[c];
  db.prepare(
    `UPDATE ordem_operacoes SET inicio = ?, termino = ?, operador = ?, maquina = ?, observacao = ? WHERE id = ?`
  ).run(alvo.inicio, alvo.termino, alvo.operador, alvo.maquina, alvo.observacao, operacaoId);
  return db.prepare(`SELECT * FROM ordem_operacoes WHERE id = ?`).get(operacaoId);
}

/** Arte do produto: personalização, logos e receita de tintas. */
export function arteDoProduto(produtoId, db = getDb()) {
  const arte = db.prepare(`SELECT * FROM produto_arte WHERE produto_id = ?`).get(produtoId) || {
    produto_id: produtoId,
    personalizacao: 'SILK',
    origem_arte: 'VETOR',
    base_tinta: null,
    tinta_pronta: 0,
    observacao: null,
  };
  return {
    ...arte,
    logos: db
      .prepare(`SELECT * FROM arte_logos WHERE produto_id = ? ORDER BY ordem, id`)
      .all(produtoId),
    cores: db
      .prepare(`SELECT * FROM arte_cores WHERE produto_id = ? ORDER BY sequencia`)
      .all(produtoId),
  };
}

/** Grava a personalização do produto (a linha é única por produto). */
export function salvarArte(produtoId, dados, db = getDb()) {
  const produto = db.prepare(`SELECT id FROM produtos WHERE id = ?`).get(produtoId);
  if (!produto) throw notFound('Produto não encontrado');
  db.prepare(
    `INSERT INTO produto_arte (produto_id, personalizacao, origem_arte, base_tinta, tinta_pronta, observacao)
     VALUES (@produto_id, @personalizacao, @origem_arte, @base_tinta, @tinta_pronta, @observacao)
     ON CONFLICT(produto_id) DO UPDATE SET
       personalizacao = excluded.personalizacao, origem_arte = excluded.origem_arte,
       base_tinta = excluded.base_tinta, tinta_pronta = excluded.tinta_pronta,
       observacao = excluded.observacao`
  ).run({
    produto_id: produtoId,
    personalizacao: dados.personalizacao || 'SILK',
    origem_arte: dados.origem_arte || 'VETOR',
    base_tinta: dados.base_tinta || null,
    tinta_pronta: dados.tinta_pronta ? 1 : 0,
    observacao: dados.observacao || null,
  });
  return arteDoProduto(produtoId, db);
}

/** Instruções impressas na via de cada setor. */
export function instrucoesDoProduto(produtoId, db = getDb()) {
  const linhas = db
    .prepare(`SELECT * FROM produto_instrucoes WHERE produto_id = ? ORDER BY setor, ordem, id`)
    .all(produtoId);
  return agruparPorSetor(linhas);
}

/** Imagens da ficha, agrupadas pelo setor que as recebe. */
export function imagensDoProduto(produtoId, db = getDb()) {
  const linhas = db
    .prepare(`SELECT * FROM produto_imagens WHERE produto_id = ? ORDER BY setor, ordem, id`)
    .all(produtoId);
  return agruparPorSetor(linhas);
}

function agruparPorSetor(linhas) {
  const mapa = Object.fromEntries(SETORES.map((s) => [s, []]));
  for (const l of linhas) (mapa[l.setor] ||= []).push(l);
  return mapa;
}

/**
 * Monta o dossiê inteiro da ordem.
 *
 * Devolve tudo de uma vez — capa, vias por setor, arte e assinaturas — porque
 * quem imprime, imprime o conjunto: uma via de corte sem a capa não diz para
 * qual pedido ela é.
 */
export function montarFicha(ordemId, { vias = null } = {}, db = getDb()) {
  const ordem = cabecalho(ordemId, db);
  garantirOperacoes(ordemId, db);

  const { grade, total: totalGrade, lancada } = gradeDoItem(ordem.item_id, ordem.quantidade, db);
  const materiais = materiaisDaOrdem(ordem, db);
  const { operacoes, total_mo, controle } = operacoesDeCusto(ordem, db);
  const arte = arteDoProduto(ordem.produto_id, db);
  const instrucoes = instrucoesDoProduto(ordem.produto_id, db);
  const imagens = imagensDoProduto(ordem.produto_id, db);

  const sequencias = {};
  for (const o of db
    .prepare(`SELECT * FROM ordem_operacoes WHERE ordem_id = ? ORDER BY setor, sequencia`)
    .all(ordemId)) {
    (sequencias[o.setor] ||= []).push(o);
  }

  const selecionadas = vias && vias.length ? vias.map(exigirSetor) : SETORES;
  const documentos = VIAS.filter((v) => selecionadas.includes(v.id)).map((v) => ({
    setor: v.id,
    titulo: v.titulo,
    materiais: materiais.filter(MATERIAL_DA_VIA[v.id]),
    sequencia: sequencias[v.id] || [],
    instrucoes: instrucoes[v.id] || [],
    imagens: imagens[v.id] || [],
    assinaturas: ASSINATURAS[v.id] || [],
  }));

  return {
    sistema: 'CSVSIST',
    emitido_em: new Date().toISOString(),
    ordem: {
      id: ordem.id,
      numero: ordem.numero,
      quantidade: round2(ordem.quantidade),
      status: ordem.status,
      data_abertura: ordem.data_abertura,
      data_prevista: ordem.data_prevista,
      data_conclusao: ordem.data_conclusao,
      observacao: ordem.observacao,
    },
    pedido: {
      id: ordem.pedido_id,
      numero: ordem.pedido_numero,
      data_pedido: ordem.data_pedido,
      data_entrega: ordem.data_entrega,
      nota_fiscal: ordem.nota_fiscal,
      data_nota_fiscal: ordem.data_nota_fiscal,
      condicao_pagamento: ordem.condicao_pagamento,
      situacao: ordem.situacao,
      preco_unitario: round2(ordem.preco_unitario),
      valor_total: round2(ordem.preco_unitario * ordem.quantidade),
    },
    cliente: {
      nome: ordem.cliente,
      contato: ordem.cliente_contato,
      cidade: ordem.cidade,
      uf: ordem.uf,
      categoria: ordem.categoria,
    },
    vendedor: ordem.vendedor,
    produto: {
      id: ordem.produto_id,
      codigo: ordem.produto_codigo,
      descricao: ordem.item_descricao || ordem.produto,
      grupo: ordem.grupo,
      linha: ordem.linha,
    },
    grade,
    total_grade: totalGrade,
    grade_lancada: lancada,
    materiais,
    operacoes,
    total_mo,
    controle,
    arte,
    documentos,
  };
}

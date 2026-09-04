import { getDb } from '../db/index.js';
import { round2 } from '../lib/numbers.js';
import { notFound } from '../lib/errors.js';

const arred = (n, casas = 6) => Number(Number(n).toFixed(casas));

const minutosDaHora = (hhmm) => {
  const [h = 0, m = 0] = String(hhmm ?? '').split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
};

/** Parâmetros da fábrica (linha única). */
export function parametros(db = getDb()) {
  return db.prepare(`SELECT * FROM parametros WHERE id = 1`).get();
}

/**
 * Jornada em minutos: o dia bruto menos os intervalos é o que a fábrica
 * realmente produz. É o denominador de todo o custeio.
 */
export function jornada(db = getDb()) {
  const p = parametros(db);
  const bruto = Math.max(minutosDaHora(p.jornada_fim) - minutosDaHora(p.jornada_inicio), 0);
  const produtivo = Math.max(bruto - p.intervalo_min, 0);
  const extensao = p.extensao_fim
    ? Math.max(minutosDaHora(p.extensao_fim) - minutosDaHora(p.jornada_fim), 0)
    : 0;
  const sabado = p.sabado_inicio && p.sabado_fim
    ? Math.max(minutosDaHora(p.sabado_fim) - minutosDaHora(p.sabado_inicio), 0)
    : 0;
  return {
    ...p,
    minutos_brutos: bruto,
    minutos_produtivos: produtivo,
    minutos_extensao: extensao,
    minutos_sabado: sabado,
    minutos_mes: produtivo * p.dias_uteis_mes,
    horas_dia: round2(produtivo / 60),
  };
}

/**
 * Custo do minuto de cada setor: a folha da equipe (salário + encargos +
 * vale-transporte) dividida pelos minutos que aquele setor produz no mês.
 *
 * Quem está sem salário cadastrado fica fora da média — senão o custo sai
 * artificialmente baixo — e a resposta sinaliza isso em `incompleto`.
 */
export function custoMinutoDepartamento(departamentoId, db = getDb()) {
  const j = jornada(db);
  const depto = db.prepare(`SELECT * FROM departamentos WHERE id = ?`).get(departamentoId);

  const equipe = db
    .prepare(
      `SELECT salario, vale_transporte FROM colaboradores
       WHERE departamento_id = ? AND status = 'ATIVO' AND ativo = 1`
    )
    .all(departamentoId);
  const comSalario = equipe.filter((c) => c.salario > 0);

  const base = {
    departamento_id: departamentoId,
    departamento: depto?.nome ?? null,
    pessoas: equipe.length,
    com_salario: comSalario.length,
    encargos_percentual: j.encargos_percentual,
    dias_uteis_mes: j.dias_uteis_mes,
    minutos_mes: j.minutos_mes,
    incompleto: comSalario.length < equipe.length,
  };

  if (comSalario.length === 0 || j.minutos_mes === 0) {
    return { ...base, salario_medio: 0, folha_por_pessoa: 0, custo_minuto: 0, custo_hora: 0, sem_salario: true };
  }

  const salarioMedio = comSalario.reduce((s, c) => s + c.salario, 0) / comSalario.length;
  const vtMedio = comSalario.reduce((s, c) => s + c.vale_transporte, 0) / comSalario.length;
  const folhaPorPessoa = salarioMedio * (1 + j.encargos_percentual / 100) + vtMedio;

  return {
    ...base,
    salario_medio: round2(salarioMedio),
    vale_transporte_medio: round2(vtMedio),
    folha_por_pessoa: round2(folhaPorPessoa),
    custo_minuto: arred(folhaPorPessoa / j.minutos_mes),
    custo_hora: round2(folhaPorPessoa / (j.minutos_mes / 60)),
    sem_salario: false,
  };
}

/** Mapa etapa → custo/minuto do setor dela, calculado uma vez por consulta. */
function custoMinutoPorEtapa(db) {
  const etapas = db.prepare(`SELECT id, departamento_id FROM etapas`).all();
  const cache = new Map();
  const mapa = new Map();
  for (const e of etapas) {
    if (!e.departamento_id) {
      mapa.set(e.id, 0);
      continue;
    }
    if (!cache.has(e.departamento_id)) {
      cache.set(e.departamento_id, custoMinutoDepartamento(e.departamento_id, db).custo_minuto);
    }
    mapa.set(e.id, cache.get(e.departamento_id));
  }
  return mapa;
}

/**
 * Capacidade produtiva do mês: só quem produz entra na conta.
 * Supervisão e administrativo já são custo indireto — contá-los como
 * capacidade seria contar duas vezes e baratear o minuto artificialmente.
 */
export function capacidadeProdutivaMes(db = getDb()) {
  const j = jornada(db);
  const { n: diretos } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM colaboradores
       WHERE status = 'ATIVO' AND ativo = 1 AND produtivo = 1 AND departamento_id IS NOT NULL`
    )
    .get();

  const teoricos = diretos * j.minutos_produtivos * j.dias_uteis_mes;
  const reais = Math.round(teoricos * (j.ocupacao_percentual / 100));
  return {
    pessoas: diretos,
    minutos_dia: j.minutos_produtivos,
    dias_uteis_mes: j.dias_uteis_mes,
    ocupacao_percentual: j.ocupacao_percentual,
    minutos_teoricos: teoricos,
    minutos_reais: reais,
    horas_mes: round2(reais / 60),
    vazia: diretos === 0,
  };
}

/** Quanto custa cada minuto de fábrica além de quem está costurando. */
export function taxaCustoIndireto(db = getDb()) {
  const lista = db.prepare(`SELECT * FROM custos_fixos WHERE ativo = 1 ORDER BY valor_mensal DESC`).all();
  const total = lista.reduce((s, c) => s + c.valor_mensal, 0);
  const capacidade = capacidadeProdutivaMes(db);

  const avisos = [];
  if (lista.length === 0) {
    avisos.push(
      'Nenhum custo fixo cadastrado. Aluguel, energia e manutenção existem mesmo sem aparecer ' +
      'na conta — quem forma preço sem eles trabalha com margem menor do que imagina.'
    );
  }
  if (capacidade.vazia) {
    avisos.push('Nenhum colaborador de produção cadastrado — sem base para ratear o custo fixo.');
  }
  if (capacidade.ocupacao_percentual >= 100) {
    avisos.push('Ocupação em 100% supõe que a fábrica nunca para; o custo por peça sai menor que o real.');
  }

  return {
    itens: lista,
    total: round2(total),
    por_tipo: Object.entries(
      lista.reduce((acc, c) => ({ ...acc, [c.tipo]: (acc[c.tipo] ?? 0) + c.valor_mensal }), {})
    )
      .map(([tipo, valor]) => ({ tipo, valor: round2(valor) }))
      .sort((a, b) => b.valor - a.valor),
    capacidade,
    por_minuto: capacidade.minutos_reais > 0 ? arred(total / capacidade.minutos_reais) : 0,
    por_hora: capacidade.minutos_reais > 0 ? round2(total / (capacidade.minutos_reais / 60)) : 0,
    avisos,
    configurado: lista.length > 0 && !capacidade.vazia,
  };
}

/** O roteiro do produto com tempo, setor e custo de MO de cada etapa. */
export function processoDoProduto(produtoId, db = getDb()) {
  const custos = custoMinutoPorEtapa(db);
  return db
    .prepare(
      `SELECT pp.*, e.codigo, e.nome AS etapa, e.ordem AS ordem_etapa,
              d.id AS departamento_id, d.nome AS departamento,
              eq.nome AS equipamento
       FROM produto_processo pp
       JOIN etapas e ON e.id = pp.etapa_id
       LEFT JOIN departamentos d ON d.id = e.departamento_id
       LEFT JOIN equipamentos eq ON eq.id = pp.equipamento_id
       WHERE pp.produto_id = ?
       ORDER BY pp.sequencia, e.ordem`
    )
    .all(produtoId)
    .map((linha) => {
      const custoMinuto = custos.get(linha.etapa_id) ?? 0;
      return {
        ...linha,
        custo_minuto: custoMinuto,
        custo_por_peca: arred(linha.tempo_por_peca_min * custoMinuto, 4),
        pecas_por_hora: linha.tempo_por_peca_min > 0 ? round2(60 / linha.tempo_por_peca_min) : 0,
      };
    });
}

/**
 * A conta completa da peça: material + mão de obra + indireto.
 *
 * O tempo que ocupa a fábrica (base do indireto) é o de relógio, o mesmo do
 * roteiro — duas pessoas na mesma operação usam uma bancada, não duas.
 */
export function custoCompletoProduto(produtoId, db = getDb()) {
  const produto = db
    .prepare(
      `SELECT p.*, g.nome AS grupo FROM produtos p
       LEFT JOIN grupos_produto g ON g.id = p.grupo_id WHERE p.id = ?`
    )
    .get(produtoId);
  if (!produto) throw notFound('Produto não encontrado');

  const ficha = db
    .prepare(
      `SELECT f.*, m.descricao AS material, m.unidade, m.custo_unitario,
              ROUND(f.consumo_por_peca * (1 + f.perda_percentual / 100.0) * m.custo_unitario, 6) AS custo_por_peca
       FROM ficha_tecnica f JOIN materiais m ON m.id = f.material_id
       WHERE f.produto_id = ? ORDER BY m.descricao`
    )
    .all(produtoId);

  const processo = processoDoProduto(produtoId, db);
  const indireto = taxaCustoIndireto(db);

  const material = arred(ficha.reduce((s, f) => s + f.custo_por_peca, 0), 4);
  const maoDeObra = arred(processo.reduce((s, e) => s + e.custo_por_peca, 0), 4);
  const minutosOcupados = arred(processo.reduce((s, e) => s + e.tempo_por_peca_min, 0), 4);
  const custoIndireto = arred(minutosOcupados * indireto.por_minuto, 4);
  const total = arred(material + maoDeObra + custoIndireto, 4);

  const avisos = [...indireto.avisos];
  if (ficha.length === 0) avisos.push('Produto sem ficha técnica: o custo de material está zerado.');
  if (processo.length === 0) avisos.push('Produto sem processo produtivo: mão de obra e indireto estão zerados.');
  if (processo.some((e) => e.custo_minuto === 0)) {
    avisos.push('Há etapas em setores sem salário cadastrado — a mão de obra dessas etapas conta como zero.');
  }

  const preco = produto.preco_padrao;
  return {
    produto: { id: produto.id, descricao: produto.descricao, grupo: produto.grupo, preco_padrao: preco, linha: produto.linha },
    material,
    mao_de_obra: maoDeObra,
    indireto: custoIndireto,
    total,
    minutos_por_peca: minutosOcupados,
    margem: round2(preco - total),
    margem_percentual: preco > 0 ? round2(((preco - total) / preco) * 100) : 0,
    fatias: [
      { nome: 'Material', valor: material },
      { nome: 'Mão de obra', valor: maoDeObra },
      { nome: 'Custo indireto', valor: custoIndireto },
    ],
    detalhe_material: ficha,
    detalhe_processo: processo,
    detalhe_indireto: { por_minuto: indireto.por_minuto, por_hora: indireto.por_hora, capacidade: indireto.capacidade },
    completo: ficha.length > 0 && processo.length > 0 && indireto.configurado,
    avisos,
  };
}

/**
 * Custo realizado de uma ordem: material que saiu do estoque, mão de obra
 * apontada e o indireto pelos minutos efetivamente gastos.
 */
export function custoRealOrdem(ordemId, db = getDb()) {
  const ordem = db
    .prepare(
      `SELECT o.*, v.total AS receita, v.produto, v.cliente, v.pedido_numero
       FROM ordens_producao o JOIN vw_itens v ON v.item_id = o.pedido_item_id WHERE o.id = ?`
    )
    .get(ordemId);
  if (!ordem) throw notFound('Ordem de produção não encontrada');

  const material = db
    .prepare(
      `SELECT COALESCE(SUM(quantidade * custo_unitario), 0) AS v
       FROM movimentos_estoque WHERE ordem_id = ? AND tipo = 'SAIDA'`
    )
    .get(ordemId).v;

  const apont = db
    .prepare(
      `SELECT COALESCE(SUM(custo_mo), 0) AS custo, COALESCE(SUM(minutos), 0) AS minutos,
              COALESCE(SUM(quantidade), 0) AS produzido, COALESCE(SUM(refugo), 0) AS refugo
       FROM apontamentos WHERE ordem_id = ?`
    )
    .get(ordemId);

  const taxa = taxaCustoIndireto(db);
  const indireto = arred(apont.minutos * taxa.por_minuto, 4);
  const total = round2(material + apont.custo + indireto);

  return {
    ordem_id: ordemId,
    numero: ordem.numero,
    produto: ordem.produto,
    cliente: ordem.cliente,
    quantidade: ordem.quantidade,
    produzido: apont.produzido,
    refugo: apont.refugo,
    minutos_apontados: round2(apont.minutos),
    receita: round2(ordem.receita),
    custo_material: round2(material),
    custo_mao_de_obra: round2(apont.custo),
    custo_indireto: indireto,
    custo_total: total,
    custo_por_peca: ordem.quantidade > 0 ? arred(total / ordem.quantidade, 4) : 0,
    margem: round2(ordem.receita - total),
    margem_percentual: ordem.receita > 0 ? round2(((ordem.receita - total) / ordem.receita) * 100) : 0,
  };
}

/**
 * MÓDULO INDUSTRIAL V3 — integração (§4, §9, §21, §27, §30, §31)
 *
 * A cadeia MATERIAL → ENGENHARIA → INDUSTRIAL tem de ser uma só, ligada por
 * id. Este arquivo é a costura:
 *
 *   resolverMaterialIndustrial   a ponte item ↔ material, usada por todo mundo
 *   custoVigenteDoMaterial       qual custo vale, e por quê
 *   converterUnidadeMaterial     rolo → metro sem duplicar cadastro
 *   auditarIntegracao…           onde a cadeia está partida
 *   indicadoresDeIntegracao      a saúde da engenharia industrial, em número
 *   mapaDaCadeia                 a cadeia inteira com contagem e pendência
 *
 * Nada aqui recalcula o que os motores já calculam: é ligação e conferência.
 */

import {
  prepararIndustrial, transformacaoQueProduz, estruturaDe, ehProduzido, converter,
  num, arredondar, normalizar, agoraISO, hojeISO, uid, TIPOS_TEMPO,
} from './modelo.mjs';
import { disponivelParaOrdem, saldoReservado, estoqueFisico } from './reservas.mjs';
import { entradasProgramadasDe } from './compras.mjs';

/* ============================================ §4 a ponte item ↔ material */

/**
 * §4 — a regra de ouro: um só lugar sabe qual material físico está por trás
 * de um item industrial, qual custo usar, qual unidade e quanto existe.
 *
 * Quem precisa de qualquer um desses números chama isto. Espalhar
 * `db.materiais.find(...)` por dez telas é como o cadastro se divide em dois.
 */
export function resolverMaterialIndustrial(db, itemId, opcoes = {}) {
  prepararIndustrial(db);
  const item = (db.industrial.itens || []).find((i) => i.id === itemId) || null;
  if (!item) {
    return {
      itemId, materialId: '', item: null, material: null,
      unidade: '', custo: 0, estoque: 0, disponivel: 0, reservado: 0,
      vinculado: false, erro: 'Item industrial não encontrado.',
    };
  }

  const produzido = ehProduzido(item) && !item.materialId;
  const material = item.materialId
    ? (db.materiais || []).find((m) => m.id === item.materialId) || null
    : null;

  /* item comprado sem material é pendência de cadastro, não motivo para
     inventar um material (§37) */
  if (!produzido && !material) {
    return {
      itemId, materialId: item.materialId || '', item, material: null,
      unidade: item.unidade, custo: num(item.custoPadrao),
      estoque: 0, disponivel: 0, reservado: 0,
      vinculado: false,
      erro: item.materialId
        ? 'O material vinculado a este item não existe mais no almoxarifado.'
        : 'Item comprado sem material do almoxarifado vinculado.',
    };
  }

  if (produzido) {
    /* item produzido: o "estoque" dele é o estoque de processo */
    const emProcesso = (db.industrial.estoques || [])
      .filter((s) => s.itemId === item.id)
      .reduce((soma, s) => soma + num(s.quantidade), 0);
    const trf = transformacaoQueProduz(db, item.id);
    return {
      itemId, materialId: '', item, material: null,
      transformacaoId: trf ? trf.id : '',
      unidade: item.unidade,
      custo: custoDoItemProduzido(db, item),
      origemCusto: 'processo',
      estoque: arredondar(emProcesso, 4),
      disponivel: arredondar(emProcesso, 4),
      reservado: 0,
      emProcesso: arredondar(emProcesso, 4),
      produzido: true,
      vinculado: !!trf,
      erro: trf ? '' : 'Item produzido sem transformação que o gere.',
    };
  }

  const posicao = disponivelParaOrdem(db, material.id, opcoes.consolidacaoId);
  const custo = custoVigenteDoMaterial(db, material.id, opcoes.contexto);
  return {
    itemId,
    materialId: material.id,
    item,
    material,
    unidade: material.unidadeEstoque || item.unidade,
    unidadeItem: item.unidade,
    custo: custo.valor,
    origemCusto: custo.origem,
    estoque: posicao.fisico,
    disponivel: opcoes.consolidacaoId ? posicao.paraAOrdem : posicao.livre,
    reservado: posicao.reservado,
    reservadoDaOrdem: posicao.reservadoDaOrdem,
    reservadoDeOutras: posicao.reservadoDeOutras,
    programado: entradasProgramadasDe(db, material.id),
    estoqueMinimo: num(material.estoqueMinimo),
    leadTimeDias: num(material.leadTimeDias),
    fornecedorId: material.fornecedorPadraoId || '',
    produzido: false,
    vinculado: true,
    /* unidade do item e do material precisam falar a mesma língua (§9) */
    unidadeDivergente: !!item.unidade && !!material.unidadeEstoque
      && normalizar(item.unidade) !== normalizar(material.unidadeEstoque),
    erro: '',
  };
}

/** O custo de um item produzido: o último lote dele, ou o custo padrão. */
function custoDoItemProduzido(db, item) {
  const lotes = (db.industrial.lotes || [])
    .filter((l) => l.itemId === item.id && num(l.custoUnitario) > 0);
  if (lotes.length) return num(lotes[lotes.length - 1].custoUnitario);
  return num(item.custoPadrao);
}

/**
 * §21 — qual custo vale.
 *
 *   médio     o que o almoxarifado acumulou — é o que o MRP e o budget usam
 *   último    o da última entrada — serve para ver tendência de preço
 *   padrão    o do cadastro do item, quando não há movimento nenhum
 *
 * Uma tela não escolhe custo por conta própria: pede aqui e recebe o valor
 * com a origem anotada.
 */
export function custoVigenteDoMaterial(db, materialId, contexto = 'padrao') {
  const material = (db.materiais || []).find((m) => m.id === materialId);
  if (!material) return { valor: 0, origem: 'inexistente' };

  const medio = num(material.custoMedio);
  const ultimo = num(material.ultimoCusto);
  const compra = num(material.precoCompra);

  if (contexto === 'reposicao') {
    /* para comprar, o que importa é o preço de hoje, não a média histórica */
    if (ultimo > 0) return { valor: ultimo, origem: 'ultimo' };
    if (compra > 0) return { valor: compra, origem: 'preco_compra' };
  }
  if (medio > 0) return { valor: medio, origem: 'medio' };
  if (ultimo > 0) return { valor: ultimo, origem: 'ultimo' };
  if (compra > 0) return { valor: compra, origem: 'preco_compra' };
  return { valor: 0, origem: 'sem_custo' };
}

/* ======================================================= §9 conversões */

/**
 * §9 — converte quantidade de um material entre unidades, usando as
 * conversões do cadastro (1 rolo = 50 m) antes das gerais (1 kg = 1000 g).
 * Comprar em rolo e consumir em metro é o mesmo material, não dois.
 */
export function converterUnidadeMaterial(db, dados) {
  const material = (db.materiais || []).find((m) => m.id === dados.materialId);
  if (!material) return { erro: 'Material não encontrado.' };
  const de = String(dados.de || material.unidadeCompra || material.unidadeEstoque).toUpperCase();
  const para = String(dados.para || material.unidadeEstoque).toUpperCase();
  const quantidade = num(dados.quantidade);

  const convertida = converter(quantidade, de, para, db.conversoes || [], material.id);
  if (convertida === null) {
    return {
      erro: `Não há conversão cadastrada de ${de} para ${para} em ${material.nome}.`,
      de, para,
    };
  }
  const fator = quantidade > 0 ? arredondar(convertida / quantidade, 6) : 0;
  return {
    materialId: material.id,
    material: material.nome,
    origem: { unidade: de, quantidade: arredondar(quantidade, 4) },
    destino: { unidade: para, quantidade: arredondar(convertida, 4) },
    fator,
    quando: agoraISO(),
  };
}

/* ============================================= §27 auditoria de integração */

const registro = (nivel, tipo, mensagem, referencia = {}) => ({ nivel, tipo, mensagem, ...referencia });

/**
 * §27 — a varredura da cadeia: onde MATERIAL, ENGENHARIA e INDUSTRIAL
 * deixaram de ser a mesma coisa.
 *
 * Diferente da auditoria do V2 (que olha consistência interna do industrial),
 * esta olha as LIGAÇÕES: item sem material, unidade divergente, dois itens
 * para o mesmo material, lote sem origem, consumo sem lote, demanda sem
 * engenharia.
 */
export function auditarIntegracaoMateriaisEngenhariaIndustrial(db) {
  prepararIndustrial(db);
  const ind = db.industrial;
  const erros = [];
  const alertas = [];
  const inconsistencias = [];
  const orfaos = [];
  const duplicidades = [];
  const sugestoes = [];

  /* ---------------- MATERIAL ---------------- */
  const porMaterial = new Map();
  for (const item of ind.itens || []) {
    if (item.ativo === false) continue;
    const r = resolverMaterialIndustrial(db, item.id);

    if (!r.produzido) {
      if (!r.vinculado) {
        erros.push(registro('erro', 'item_sem_material',
          `${item.nome}: ${r.erro}`, { itemId: item.id }));
        orfaos.push({ tipo: 'item', id: item.id, nome: item.nome, motivo: 'sem material' });
        sugestoes.push(`Vincule ${item.nome} a um material do almoxarifado no cadastro de itens.`);
        continue;
      }
      if (r.unidadeDivergente) {
        inconsistencias.push({
          tipo: 'unidade', item: item.nome,
          esperado: r.material.unidadeEstoque, encontrado: item.unidade,
        });
        alertas.push(registro('alerta', 'unidade_divergente',
          `${item.nome} está em ${item.unidade} e o material em ${r.material.unidadeEstoque}.`,
          { itemId: item.id }));
      }
      if (!(r.custo > 0)) {
        alertas.push(registro('alerta', 'material_sem_custo',
          `${item.nome}: material sem custo — todo budget que o usar sai incompleto.`,
          { itemId: item.id }));
      }
      const lista = porMaterial.get(r.materialId) || [];
      lista.push(item);
      porMaterial.set(r.materialId, lista);
    } else if (!r.vinculado) {
      erros.push(registro('erro', 'item_produzido_sem_transformacao',
        `${item.nome} é produzido mas nenhuma transformação o gera (§6).`, { itemId: item.id }));
      orfaos.push({ tipo: 'item', id: item.id, nome: item.nome, motivo: 'sem transformação' });
    }
  }

  /* §3 — dois itens industriais para o mesmo material */
  for (const [materialId, itens] of porMaterial.entries()) {
    if (itens.length < 2) continue;
    const material = (db.materiais || []).find((m) => m.id === materialId);
    duplicidades.push({
      tipo: 'item_material', materialId,
      material: material ? material.nome : materialId,
      itens: itens.map((i) => ({ id: i.id, nome: i.nome, codigo: i.codigo })),
    });
    alertas.push(registro('alerta', 'material_duplicado',
      `${material ? material.nome : materialId} está representado por `
      + `${itens.length} itens industriais: ${itens.map((i) => i.nome).join(', ')}.`,
      { materialId }));
    sugestoes.push(`Mantenha um item industrial por material: ${itens.map((i) => i.codigo).join(', ')}.`);
  }

  /* ---------------- ENGENHARIA ---------------- */
  for (const trf of ind.transformacoes || []) {
    if (trf.ativa === false) continue;
    if ((trf.entradas || []).length === 0) {
      erros.push(registro('erro', 'transformacao_sem_entrada',
        `${trf.nome} não recebe nada.`, { transformacaoId: trf.id }));
    }
    if ((trf.saidas || []).length === 0) {
      erros.push(registro('erro', 'transformacao_sem_saida',
        `${trf.nome} não entrega nada.`, { transformacaoId: trf.id }));
    }
    for (const saida of trf.saidas || []) {
      const item = (ind.itens || []).find((i) => i.id === saida.itemId);
      if (item && !ehProduzido(item)) {
        erros.push(registro('erro', 'saida_comprada',
          `${trf.nome} entrega ${item.nome}, que é item comprado — saída de transformação `
          + 'tem de ser item produzido (§6).', { transformacaoId: trf.id }));
      }
    }
    const minutos = (trf.operacoes || []).reduce(
      (s, o) => s + TIPOS_TEMPO.reduce((t, x) => t + num((o.tempos || {})[x.id]), 0), 0);
    if (!(minutos > 0)) {
      erros.push(registro('erro', 'etapa_sem_tempo',
        `${trf.nome} não tem tempo em nenhuma operação.`, { transformacaoId: trf.id }));
    }
    if (!trf.departamentoId) {
      erros.push(registro('erro', 'etapa_sem_setor',
        `${trf.nome} não tem setor.`, { transformacaoId: trf.id }));
    }
  }

  /* ---------------- INDUSTRIAL ---------------- */
  for (const demanda of ind.demandas || []) {
    const trf = (ind.transformacoes || []).find((t) => t.id === demanda.transformacaoId);
    if (!trf) {
      erros.push(registro('erro', 'demanda_sem_engenharia',
        `A demanda ${demanda.codigo} não aponta para transformação nenhuma.`,
        { demandaId: demanda.id }));
      orfaos.push({ tipo: 'demanda', id: demanda.id, nome: demanda.codigo, motivo: 'sem engenharia' });
    }
  }
  for (const ordem of ind.ordens || []) {
    if (!(ind.demandas || []).some((d) => d.id === ordem.demandaId)) {
      erros.push(registro('erro', 'op_sem_demanda',
        `A ordem ${ordem.codigo} não tem demanda.`, { ordemId: ordem.id }));
      orfaos.push({ tipo: 'ordem', id: ordem.id, nome: ordem.codigo, motivo: 'sem demanda' });
    }
  }
  for (const reserva of ind.reservas || []) {
    if (reserva.status !== 'ativa') continue;
    if (!(db.materiais || []).some((m) => m.id === reserva.materialId)) {
      erros.push(registro('erro', 'reserva_sem_material',
        `A reserva ${reserva.codigo} aponta para um material que não existe.`,
        { reservaId: reserva.id }));
    }
  }

  /* ---------------- RASTREABILIDADE ---------------- */
  for (const lote of ind.lotes || []) {
    if (lote.origem === 'producao' && !lote.execucaoId) {
      erros.push(registro('erro', 'lote_sem_execucao',
        `O lote ${lote.codigo} diz ser de produção mas não tem execução.`, { loteId: lote.id }));
      orfaos.push({ tipo: 'lote', id: lote.id, nome: lote.codigo, motivo: 'sem execução' });
    }
    if (lote.origem === 'compra' && !lote.movimentoId) {
      alertas.push(registro('alerta', 'lote_sem_movimento',
        `O lote de compra ${lote.codigo} não aponta para a entrada de estoque.`,
        { loteId: lote.id }));
    }
  }
  for (const execucao of ind.execucoes || []) {
    for (const consumo of execucao.consumos || []) {
      if (!consumo.loteId && !(consumo.lotes || []).length && consumo.origem === 'almoxarifado') {
        alertas.push(registro('alerta', 'consumo_sem_lote',
          `${execucao.codigo}: ${consumo.nome} foi consumido sem lote — a rastreabilidade para `
          + 'trás para nesse ponto.', { execucaoId: execucao.id }));
        inconsistencias.push({ tipo: 'rastreio', item: consumo.nome, execucao: execucao.codigo });
      }
    }
  }
  for (const saldo of ind.estoques || []) {
    if (num(saldo.quantidade) > 0 && !saldo.loteId) {
      alertas.push(registro('alerta', 'estoque_processo_sem_lote',
        `Estoque em processo sem lote em ${saldo.local}.`, { itemId: saldo.itemId }));
    }
  }

  /* ---------------- CUSTO ---------------- */
  for (const item of ind.itens || []) {
    if (item.ativo === false || !ehProduzido(item)) continue;
    const trf = transformacaoQueProduz(db, item.id);
    if (!trf) continue;
    const minutos = (trf.operacoes || []).reduce(
      (s, o) => s + TIPOS_TEMPO.reduce((t, x) => t + num((o.tempos || {})[x.id]), 0), 0);
    if (!(minutos > 0)) {
      alertas.push(registro('alerta', 'processo_sem_custo',
        `${item.nome}: a transformação que o produz não tem tempo — o custo de conversão sai zero.`,
        { itemId: item.id }));
    }
  }

  const ok = erros.length === 0;
  return {
    ok, erros, alertas, inconsistencias, orfaos, duplicidades,
    sugestoes: [...new Set(sugestoes)],
    verificadoEm: agoraISO(),
  };
}

/* ====================================== §30 saúde da engenharia industrial */

/**
 * §30 — a saúde da integração, em número de verdade: a porcentagem sai das
 * validações que passaram, não de um valor fixo.
 */
export function indicadoresDeIntegracao(db) {
  prepararIndustrial(db);
  const ind = db.industrial;
  const auditoria = auditarIntegracaoMateriaisEngenhariaIndustrial(db);

  const itens = (ind.itens || []).filter((i) => i.ativo !== false);
  const comprados = itens.filter((i) => !ehProduzido(i) || i.materialId);
  const produtos = itens.filter((i) => i.tipo === 'PRODUTO_ACABADO');
  const vinculados = comprados.filter((i) => resolverMaterialIndustrial(db, i.id).vinculado);

  /* produtos prontos para produzir: a mesma pergunta que a ordem faz */
  const prontos = [];
  const pendentes = [];
  for (const p of produtos) {
    const trf = transformacaoQueProduz(db, p.id);
    const semReceita = !trf;
    const semCusto = itensDaArvore(db, p.id).some((i) => {
      const r = resolverMaterialIndustrial(db, i);
      return !r.produzido && !(r.custo > 0);
    });
    if (semReceita || semCusto) pendentes.push(p);
    else prontos.push(p);
  }

  const ordens = (ind.consolidacoes || []).filter((c) => c.codigoOrdem);
  const emProducao = ordens.filter((c) => !['concluida', 'cancelada'].includes(c.status));
  const reservasAtivas = (ind.reservas || []).filter((r) => r.status === 'ativa');
  const requisicoesAbertas = (ind.requisicoesCompra || [])
    .filter((r) => !['recebida', 'cancelada'].includes(r.status));
  const wip = (ind.estoques || []).filter((s) => num(s.quantidade) > 0);
  const acabados = wip.filter((s) => {
    const item = itens.find((i) => i.id === s.itemId);
    return item && item.tipo === 'PRODUTO_ACABADO';
  });

  /* as provas que compõem a nota da integração */
  const provas = [
    { id: 'itens_vinculados', nome: 'Itens comprados ligados ao almoxarifado',
      total: comprados.length, ok: vinculados.length },
    { id: 'produtos_prontos', nome: 'Produtos com engenharia completa',
      total: produtos.length, ok: prontos.length },
    { id: 'transformacoes', nome: 'Transformações com setor e tempo',
      total: (ind.transformacoes || []).filter((t) => t.ativa !== false).length,
      ok: (ind.transformacoes || []).filter((t) => t.ativa !== false && t.departamentoId
        && (t.operacoes || []).some((o) => TIPOS_TEMPO.some((x) => num((o.tempos || {})[x.id]) > 0))).length },
    { id: 'lotes_com_origem', nome: 'Lotes com origem identificada',
      total: (ind.lotes || []).length,
      ok: (ind.lotes || []).filter((l) => (l.origem === 'producao' && l.execucaoId)
        || (l.origem === 'compra' && l.movimentoId) || l.origem === 'ajuste').length },
    { id: 'consumo_rastreado', nome: 'Consumo de almoxarifado com lote',
      total: (ind.execucoes || []).flatMap((e) => (e.consumos || [])
        .filter((c) => c.origem === 'almoxarifado')).length,
      ok: (ind.execucoes || []).flatMap((e) => (e.consumos || [])
        .filter((c) => c.origem === 'almoxarifado' && (c.loteId || (c.lotes || []).length > 0))).length },
    { id: 'demandas_com_engenharia', nome: 'Demandas ligadas a transformação',
      total: (ind.demandas || []).length,
      ok: (ind.demandas || []).filter((d) => (ind.transformacoes || [])
        .some((t) => t.id === d.transformacaoId)).length },
  ].map((p) => ({
    ...p,
    percentual: p.total > 0 ? arredondar((p.ok / p.total) * 100, 1) : 100,
    pendentes: Math.max(p.total - p.ok, 0),
  }));

  const comBase = provas.filter((p) => p.total > 0);
  const integracao = comBase.length
    ? arredondar(comBase.reduce((s, p) => s + p.percentual, 0) / comBase.length, 1)
    : 100;

  return {
    integracao,
    provas,
    auditoria,
    contagem: {
      materiais: (db.materiais || []).filter((m) => m.ativo !== false).length,
      itens: itens.length,
      produtosProntos: prontos.length,
      produtosPendentes: pendentes.length,
      transformacoes: (ind.transformacoes || []).filter((t) => t.ativa !== false).length,
      ordensEmProducao: emProducao.length,
      materiaisReservados: reservasAtivas.length,
      materiaisFaltantes: requisicoesAbertas.length,
      comprasAbertas: (ind.pedidosCompra || [])
        .filter((p) => !['recebido', 'cancelado'].includes(p.status)).length,
      wip: arredondar(wip.reduce((s, x) => s + num(x.quantidade), 0), 0),
      acabados: arredondar(acabados.reduce((s, x) => s + num(x.quantidade), 0), 0),
      errosIntegracao: auditoria.erros.length,
      alertasIntegracao: auditoria.alertas.length,
    },
    pendentes: pendentes.map((p) => ({ id: p.id, nome: p.nome, codigo: p.codigo })),
  };
}

/** Todos os itens que participam da árvore de um produto. */
export function itensDaArvore(db, itemId, vistos = new Set()) {
  if (vistos.has(itemId) || vistos.size > 200) return [...vistos];
  vistos.add(itemId);
  const trf = transformacaoQueProduz(db, itemId);
  for (const e of (trf || {}).entradas || []) itensDaArvore(db, e.itemId, vistos);
  const estrutura = estruturaDe(db, itemId);
  for (const c of (estrutura || {}).componentes || []) itensDaArvore(db, c.itemId, vistos);
  return [...vistos];
}

/* ================================================== §31 mapa da cadeia */

/**
 * §31 — a cadeia inteira em blocos, cada um com quantos registros tem e
 * quantos problemas carrega. É o mapa que mostra onde a corrente arrebentou.
 */
export function mapaDaCadeia(db) {
  prepararIndustrial(db);
  const ind = db.industrial;
  const indicadores = indicadoresDeIntegracao(db);
  const auditoria = indicadores.auditoria;

  const problemasDe = (...tipos) => auditoria.erros.concat(auditoria.alertas)
    .filter((a) => tipos.includes(a.tipo)).length;

  const itens = (ind.itens || []).filter((i) => i.ativo !== false);
  const blocos = [
    { id: 'materiais', nome: 'Material', aba: 'produtos',
      registros: (db.materiais || []).filter((m) => m.ativo !== false).length,
      problemas: problemasDe('material_sem_custo', 'material_duplicado'),
      nota: 'cadastro do almoxarifado' },
    { id: 'estoque', nome: 'Estoque', aba: 'plano',
      registros: (db.saldos || []).filter((s) => num(s.fisico) > 0).length,
      problemas: 0, nota: 'físico, reservado e disponível' },
    { id: 'itens', nome: 'Item industrial', aba: 'produtos',
      registros: itens.length,
      problemas: problemasDe('item_sem_material', 'unidade_divergente',
        'item_produzido_sem_transformacao'),
      nota: 'ligado ao material por id' },
    { id: 'engenharia', nome: 'Engenharia', aba: 'produtos',
      registros: (ind.estruturas || []).filter((e) => e.ativa).length
        + (ind.transformacoes || []).filter((t) => t.ativa !== false).length,
      problemas: problemasDe('transformacao_sem_entrada', 'transformacao_sem_saida',
        'etapa_sem_tempo', 'etapa_sem_setor', 'saida_comprada'),
      nota: 'estrutura e transformação' },
    { id: 'carteira', nome: 'Carteira', aba: 'carteira',
      registros: (ind.carteira || []).filter((l) => l.status !== 'cancelada').length,
      problemas: 0, nota: 'a demanda do cliente' },
    { id: 'mrp', nome: 'MRP', aba: 'plano',
      registros: (ind.requisicoesCompra || []).length,
      problemas: 0, nota: 'necessidade líquida' },
    { id: 'compras', nome: 'Compras', aba: 'compras',
      registros: (ind.pedidosCompra || []).length,
      problemas: problemasDe('compra_atrasada'), nota: 'requisição, pedido e recebimento' },
    { id: 'reserva', nome: 'Reserva', aba: 'plano',
      registros: (ind.reservas || []).filter((r) => r.status === 'ativa').length,
      problemas: problemasDe('reserva_sem_material'), nota: 'material com dono' },
    { id: 'ordens', nome: 'Ordem de produção', aba: 'ordens',
      registros: (ind.consolidacoes || []).filter((c) => c.codigoOrdem).length,
      problemas: problemasDe('op_sem_demanda'), nota: 'a cadeia de etapas' },
    { id: 'processos', nome: 'Processo', aba: 'producao',
      registros: (ind.demandas || []).length,
      problemas: problemasDe('demanda_sem_engenharia'), nota: 'uma por transformação' },
    { id: 'execucao', nome: 'Execução', aba: 'producao',
      registros: (ind.execucoes || []).length,
      problemas: problemasDe('consumo_sem_lote'), nota: 'o que a fábrica fez' },
    { id: 'wip', nome: 'Estoque em processo', aba: 'producao',
      registros: (ind.estoques || []).filter((s) => num(s.quantidade) > 0).length,
      problemas: problemasDe('estoque_processo_sem_lote'), nota: 'entre um setor e o outro' },
    { id: 'acabado', nome: 'Produto acabado', aba: 'painel',
      registros: indicadores.contagem.acabados, problemas: 0, nota: 'pronto para entregar' },
    { id: 'custo', nome: 'Custo', aba: 'plano',
      registros: (ind.budgets || []).length,
      problemas: problemasDe('processo_sem_custo'), nota: 'padrão e real' },
    { id: 'rastreio', nome: 'Rastreabilidade', aba: 'rastreio',
      registros: (ind.lotes || []).length,
      problemas: problemasDe('lote_sem_execucao', 'lote_sem_movimento'),
      nota: 'do rolo à camiseta, e de volta' },
  ];

  return { blocos, integracao: indicadores.integracao, indicadores };
}

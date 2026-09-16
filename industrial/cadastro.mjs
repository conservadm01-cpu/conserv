/**
 * MÓDULO INDUSTRIAL — cadastro de produto
 *
 * O ambiente onde o produto ganha engenharia: o item, o que ele leva dentro
 * (estrutura) e como ele é feito (transformações). Sem isto, a explosão não
 * tem o que explodir — a demonstração era a única porta de entrada.
 *
 * A regra que o cadastro protege é a mesma do módulo: material não é
 * consumido pelo produto acabado. Cada peça produzida precisa de uma receita
 * que diga em que setor ela nasce, o que entra, o que sai e quanto tempo leva.
 * `conferirEngenharia` é quem cobra isso antes de a ordem abrir.
 */

import {
  novoItem, novaEstrutura, novaTransformacao, estruturaDe, transformacaoQueProduz,
  prepararIndustrial, registrarHistorico, tipoItem, ehProduzido, TIPOS_ITEM,
  num, arredondar, uid, agoraISO, proximoCodigo, normalizar, tempos, TIPOS_TEMPO,
} from './modelo.mjs';
import { explodirBOM, calcularBudget, minutosDaTransformacao } from './motores.mjs';
import { resolverMaterialIndustrial } from './integracao.mjs';

const achar = (db, id) => (db.industrial.itens || []).find((i) => i.id === id) || null;

/* ============================================================ itens */

/**
 * Cria ou edita um item. O que muda conforme o tipo:
 *   comprado  → aponta para o material do almoxarifado, e herda preço e saldo
 *   produzido → nasce num setor, e precisa de receita para ser produzido
 */
export function salvarItem(db, dados, usuario) {
  prepararIndustrial(db);
  const nome = String(dados.nome || '').trim();
  if (!nome) return { erro: 'Dê um nome ao item.' };
  if (!tipoItem(dados.tipo)) return { erro: 'Escolha o tipo do item.' };

  const repetido = (db.industrial.itens || []).find(
    (i) => i.id !== dados.id && normalizar(i.nome) === normalizar(nome)
  );
  if (repetido) return { erro: `Já existe um item chamado ${repetido.nome} (${repetido.codigo}).` };

  const comprado = !ehProduzido({ tipo: dados.tipo }) || dados.materialId;
  if (comprado && !dados.materialId && dados.tipo !== 'COMPONENTE') {
    return { erro: 'Item comprado precisa apontar para um material do almoxarifado.' };
  }
  if (!comprado && !dados.departamentoId) {
    return { erro: 'Item produzido precisa dizer em que setor ele nasce.' };
  }

  const existente = dados.id ? achar(db, dados.id) : null;
  if (dados.id && !existente) return { erro: 'Item não encontrado.' };

  if (!existente) {
    const r = novoItem(db, dados);
    if (r.erro) return r;
    registrarHistorico(db, {
      tipo: 'cadastro', itemId: r.registro.id, usuario: usuario?.nome || '',
      motivo: `Item criado: ${r.registro.codigo} ${r.registro.nome}`,
    });
    return { item: r.registro };
  }

  /* edição: guarda o antes e o depois, campo a campo (§52) */
  const antes = { ...existente };
  const campos = ['nome', 'descricao', 'unidade', 'perdaPadrao', 'estoqueMinimo', 'custoPadrao',
    'fornecedorId', 'departamentoId', 'materialId', 'controlaLote', 'ativo'];
  for (const campo of campos) {
    if (dados[campo] === undefined) continue;
    const valor = ['perdaPadrao', 'estoqueMinimo', 'custoPadrao'].includes(campo)
      ? num(dados[campo]) : dados[campo];
    if (existente[campo] === valor) continue;
    registrarHistorico(db, {
      tipo: 'correcao', itemId: existente.id, usuario: usuario?.nome || '',
      valorAnterior: `${campo}: ${antes[campo]}`, valorNovo: `${campo}: ${valor}`,
      motivo: String(dados.motivo || '').trim() || `Alteração em ${existente.codigo}`,
    });
    existente[campo] = valor;
  }
  existente.alteradoEm = agoraISO();
  return { item: existente };
}

/** Item só sai de cena se ninguém depender dele — nada é apagado por cima (§52). */
export function inativarItem(db, itemId, motivo, usuario) {
  prepararIndustrial(db);
  const item = achar(db, itemId);
  if (!item) return { erro: 'Item não encontrado.' };

  const usos = [];
  for (const e of db.industrial.estruturas || []) {
    if (e.ativa && (e.componentes || []).some((c) => c.itemId === itemId)) {
      usos.push(`estrutura de ${(achar(db, e.itemId) || {}).nome || '?'}`);
    }
  }
  for (const t of db.industrial.transformacoes || []) {
    if (t.ativa === false) continue;
    if ((t.entradas || []).some((x) => x.itemId === itemId)
      || (t.saidas || []).some((x) => x.itemId === itemId)) usos.push(t.nome);
  }
  const emCarteira = (db.industrial.carteira || []).some(
    (l) => l.itemId === itemId && l.status !== 'cancelada' && l.status !== 'concluida'
  );
  if (emCarteira) return { erro: `${item.nome} está em carteira aberta.` };
  if (usos.length) {
    return { erro: `${item.nome} é usado em: ${[...new Set(usos)].join(', ')}.` };
  }

  item.ativo = false;
  item.inativadoEm = agoraISO();
  registrarHistorico(db, {
    tipo: 'correcao', itemId, usuario: usuario?.nome || '',
    valorAnterior: 'ativo', valorNovo: 'inativo',
    motivo: String(motivo || '').trim() || 'Item inativado',
  });
  return { item };
}

/* ======================================================== estrutura */

/** Grava a estrutura do item. Cada gravação é uma versão nova (§4). */
export function salvarEstrutura(db, itemId, componentes, dados, usuario) {
  prepararIndustrial(db);
  const item = achar(db, itemId);
  if (!item) return { erro: 'Item não encontrado.' };

  const limpos = (componentes || []).filter((c) => c.itemId && num(c.quantidade) > 0);
  if (limpos.length === 0) return { erro: 'A estrutura precisa de pelo menos um componente.' };

  /* laço na estrutura trava a explosão: a camisa não pode levar a si mesma */
  for (const c of limpos) {
    if (levaDentro(db, c.itemId, itemId)) {
      return {
        erro: `${(achar(db, c.itemId) || {}).nome} já leva ${item.nome} dentro — `
          + 'a estrutura ficaria em laço.',
      };
    }
  }

  const anterior = estruturaDe(db, itemId);
  const r = novaEstrutura(db, {
    itemId, componentes: limpos, motivo: String((dados || {}).motivo || '').trim(),
  });
  if (r.erro) return r;
  registrarHistorico(db, {
    tipo: 'cadastro', itemId, usuario: usuario?.nome || '',
    valorAnterior: anterior ? `versão ${anterior.versao}` : null,
    valorNovo: `versão ${r.registro.versao}`,
    motivo: `Estrutura de ${item.nome}`,
  });
  return { estrutura: r.registro };
}

/** O item `dentro` aparece na árvore de `alvo`? */
function levaDentro(db, alvoId, procurado, profundidade = 0) {
  if (alvoId === procurado) return true;
  if (profundidade > 20) return false;
  const filhos = new Set();
  const estrutura = estruturaDe(db, alvoId);
  for (const c of (estrutura || {}).componentes || []) filhos.add(c.itemId);
  const trf = transformacaoQueProduz(db, alvoId);
  for (const e of (trf || {}).entradas || []) filhos.add(e.itemId);
  for (const filho of filhos) {
    if (levaDentro(db, filho, procurado, profundidade + 1)) return true;
  }
  return false;
}

/* ==================================================== transformação */

/**
 * Cria ou edita a receita de transformação.
 *
 * Editar uma receita que já produziu não reescreve o passado: a execução
 * guardou os seus próprios números. O que muda vale da próxima vez.
 */
export function salvarTransformacao(db, dados, usuario) {
  prepararIndustrial(db);
  const existente = dados.id
    ? (db.industrial.transformacoes || []).find((t) => t.id === dados.id)
    : null;
  if (dados.id && !existente) return { erro: 'Transformação não encontrada.' };

  const entradas = (dados.entradas || []).filter((e) => e.itemId && num(e.quantidade) > 0);
  const saidas = (dados.saidas || []).filter((s) => s.itemId && num(s.quantidade) > 0);
  if (entradas.length === 0) return { erro: 'A transformação precisa de pelo menos uma entrada.' };
  if (saidas.length === 0) return { erro: 'A transformação precisa de pelo menos uma saída.' };

  for (const s of saidas) {
    const item = achar(db, s.itemId);
    if (!item) return { erro: 'Item de saída não encontrado.' };
    if (!ehProduzido(item)) {
      return { erro: `${item.nome} é um item comprado — não pode ser saída de uma transformação.` };
    }
    if (entradas.some((e) => e.itemId === s.itemId)) {
      return { erro: `${item.nome} está como entrada e saída da mesma transformação.` };
    }
    const outra = (db.industrial.transformacoes || []).find(
      (t) => t.ativa !== false && t.id !== (existente || {}).id
        && (t.saidas || []).some((x) => x.itemId === s.itemId)
    );
    if (outra) return { erro: `${item.nome} já é produzido por "${outra.nome}".` };
  }

  const comTempo = (dados.operacoes || []).filter(
    (o) => TIPOS_TEMPO.some((t) => num((o.tempos || {})[t.id]) > 0)
  );
  if (comTempo.length === 0) return { erro: 'Informe ao menos uma operação com tempo.' };

  if (!existente) {
    const r = novaTransformacao(db, { ...dados, entradas, saidas, operacoes: comTempo });
    if (r.erro) return r;
    registrarHistorico(db, {
      tipo: 'cadastro', usuario: usuario?.nome || '',
      motivo: `Transformação criada: ${r.registro.codigo} ${r.registro.nome}`,
    });
    return { transformacao: r.registro };
  }

  /* edição em cima: guarda o retrato anterior no histórico */
  const antes = JSON.stringify({
    entradas: existente.entradas, saidas: existente.saidas,
    minutos: minutosDaTransformacao(existente, 100).total,
  });
  const novo = novaTransformacao(db, { ...dados, entradas, saidas, operacoes: comTempo });
  if (novo.erro) return novo;
  /* o registro novo toma o lugar do antigo, mantendo o código */
  db.industrial.transformacoes = (db.industrial.transformacoes || [])
    .filter((t) => t.id !== novo.registro.id && t.id !== existente.id);
  const atualizado = { ...novo.registro, id: existente.id, codigo: existente.codigo,
    criadaEm: existente.criadaEm, alteradaEm: agoraISO() };
  db.industrial.transformacoes.push(atualizado);
  registrarHistorico(db, {
    tipo: 'correcao', usuario: usuario?.nome || '',
    valorAnterior: antes,
    valorNovo: JSON.stringify({
      entradas: atualizado.entradas, saidas: atualizado.saidas,
      minutos: minutosDaTransformacao(atualizado, 100).total,
    }),
    motivo: String(dados.motivo || '').trim() || `Transformação ${atualizado.codigo} alterada`,
  });
  return { transformacao: atualizado };
}

export function inativarTransformacao(db, id, motivo, usuario) {
  prepararIndustrial(db);
  const trf = (db.industrial.transformacoes || []).find((t) => t.id === id);
  if (!trf) return { erro: 'Transformação não encontrada.' };
  const emUso = (db.industrial.demandas || []).some(
    (d) => d.transformacaoId === id && d.status !== 'atendida' && d.status !== 'cancelada'
  );
  if (emUso) return { erro: `${trf.nome} tem demanda em aberto.` };
  trf.ativa = false;
  trf.inativadaEm = agoraISO();
  registrarHistorico(db, {
    tipo: 'correcao', usuario: usuario?.nome || '',
    valorAnterior: 'ativa', valorNovo: 'inativa',
    motivo: String(motivo || '').trim() || `${trf.nome} inativada`,
  });
  return { transformacao: trf };
}

/* ============================================= conferência e custo */

/**
 * O que falta para o produto poder ser produzido.
 *
 * Percorre a árvore inteira: todo item produzido precisa de receita, toda
 * receita precisa de tempo e de setor, todo item comprado precisa de preço.
 * É a mesma pergunta que a ordem faz antes de abrir — só que aqui a resposta
 * vem em lista, para o cadastro saber o que corrigir.
 */
export function conferirEngenharia(db, itemId, visitados = new Set()) {
  prepararIndustrial(db);
  const item = achar(db, itemId);
  if (!item) return { pronto: false, pendencias: ['Item não encontrado.'] };
  if (visitados.has(itemId)) return { pronto: true, pendencias: [] };
  visitados.add(itemId);

  const pendencias = [];
  if (ehProduzido(item)) {
    const trf = transformacaoQueProduz(db, itemId);
    const estrutura = estruturaDe(db, itemId);
    if (!trf) {
      pendencias.push(`${item.nome}: sem transformação — ninguém sabe em que setor ele é feito.`);
      if (!estrutura) pendencias.push(`${item.nome}: sem estrutura — não se sabe o que ele leva.`);
    } else {
      if (!trf.departamentoId) pendencias.push(`${trf.nome}: sem setor.`);
      const minutos = minutosDaTransformacao(trf, 100).total;
      if (!(minutos > 0)) pendencias.push(`${trf.nome}: nenhuma operação com tempo.`);
      for (const e of trf.entradas || []) {
        const filho = achar(db, e.itemId);
        if (!filho) { pendencias.push(`${trf.nome}: entrada removida do cadastro.`); continue; }
        const abaixo = conferirEngenharia(db, filho.id, visitados);
        pendencias.push(...abaixo.pendencias);
      }
    }
  } else {
    /* V3 §4 — a mesma ponte que o MRP usa; a conferência não pode enxergar
       um material que o cálculo não enxerga. */
    const resolvido = resolverMaterialIndustrial(db, item.id);
    const custo = num(resolvido.custo) || num(item.custoPadrao);
    if (!(custo > 0)) pendencias.push(`${item.nome}: sem custo — o budget sairia incompleto.`);
    if (!resolvido.material && !num(item.custoPadrao)) {
      pendencias.push(`${item.nome}: não está ligado a nenhum material do almoxarifado.`);
    }
    /* V3 §9 — comprar em rolo e consumir em metro exige conversão cadastrada */
    if (resolvido.unidadeDivergente) {
      pendencias.push(`${item.nome}: unidade ${item.unidade} diferente da do material `
        + `(${resolvido.unidade}) — cadastre a conversão.`);
    }
  }
  return { pronto: pendencias.length === 0, pendencias: [...new Set(pendencias)] };
}

/** O custo padrão do produto, para o lote informado — sem gravar nada. */
export function custoPadrao(db, itemId, lote = 1) {
  prepararIndustrial(db);
  const quantidade = Math.max(num(lote) || 1, 1);
  const explosao = explodirBOM(db, itemId, quantidade, { considerarEstoque: false });
  if (explosao.erro) return { erro: explosao.erro };
  const budget = calcularBudget(db, explosao, { registrar: false, considerarEstoque: false });
  return {
    quantidade,
    material: budget.totalMaterial,
    processo: budget.totalProcesso,
    indireto: budget.totalIndireto,
    total: budget.custoIndustrial,
    porPeca: budget.custoPorPeca,
    minutos: budget.minutosTotais,
    minutosPorPeca: arredondar(budget.minutosTotais / quantidade, 4),
    materiais: budget.materiais,
    processos: budget.processos,
    explosao,
  };
}

/** A árvore do produto, para desenhar em tela: item, filhos, setor e consumo. */
export function arvoreDoProduto(db, itemId, quantidade = 1, profundidade = 0) {
  const item = achar(db, itemId);
  if (!item || profundidade > 12) return null;
  const trf = transformacaoQueProduz(db, itemId);
  const estrutura = estruturaDe(db, itemId);

  const filhos = [];
  if (trf) {
    for (const e of trf.entradas || []) {
      const filho = arvoreDoProduto(db, e.itemId,
        arredondar(num(quantidade) * num(e.quantidade) * (1 + num(e.perda) / 100), 6),
        profundidade + 1);
      if (filho) filhos.push({ ...filho, perda: num(e.perda) });
    }
  } else if (estrutura) {
    for (const c of estrutura.componentes || []) {
      const filho = arvoreDoProduto(db, c.itemId,
        arredondar(num(quantidade) * num(c.quantidade) * (1 + num(c.perda) / 100), 6),
        profundidade + 1);
      if (filho) filhos.push({ ...filho, perda: num(c.perda) });
    }
  }

  const dep = trf ? (db.departamentos || []).find((d) => d.id === trf.departamentoId) : null;
  return {
    itemId: item.id,
    nome: item.nome,
    codigo: item.codigo,
    tipo: item.tipo,
    tipoNome: (TIPOS_ITEM.find((t) => t.id === item.tipo) || {}).nome || item.tipo,
    unidade: item.unidade,
    quantidade: num(quantidade),
    setor: dep ? dep.nome : (item.materialId ? 'almoxarifado' : ''),
    transformacao: trf ? trf.nome : '',
    nivel: profundidade,
    filhos,
  };
}

/** Duplica um produto inteiro — item, estrutura e receitas — com outro nome. */
export function clonarProduto(db, itemId, nome, usuario) {
  prepararIndustrial(db);
  const origem = achar(db, itemId);
  if (!origem) return { erro: 'Produto não encontrado.' };
  const limpo = String(nome || '').trim();
  if (!limpo) return { erro: 'Dê um nome ao novo produto.' };
  if ((db.industrial.itens || []).some((i) => normalizar(i.nome) === normalizar(limpo))) {
    return { erro: `Já existe um item chamado ${limpo}.` };
  }

  /* o clone copia a árvore produzida; o que é comprado continua o mesmo item */
  const mapa = new Map();
  const copiarItem = (id, nomeNovo) => {
    if (mapa.has(id)) return mapa.get(id);
    const item = achar(db, id);
    if (!item) return null;
    if (!ehProduzido(item)) { mapa.set(id, id); return id; }
    const r = novoItem(db, {
      ...item, id: undefined, codigo: undefined,
      nome: nomeNovo || `${item.nome} (cópia)`,
    });
    if (r.erro) return null;
    mapa.set(id, r.registro.id);
    const trf = transformacaoQueProduz(db, id);
    for (const e of (trf || {}).entradas || []) copiarItem(e.itemId);
    for (const s of (trf || {}).saidas || []) copiarItem(s.itemId);
    return r.registro.id;
  };
  copiarItem(origem.id, limpo);

  const feitas = new Set();
  for (const [antigo, novo] of mapa.entries()) {
    if (antigo === novo) continue;
    const trf = transformacaoQueProduz(db, antigo);
    if (trf && !feitas.has(trf.id)) {
      feitas.add(trf.id);
      novaTransformacao(db, {
        ...trf, id: undefined, codigo: undefined,
        nome: `${trf.nome} · ${limpo}`,
        entradas: trf.entradas.map((e) => ({ ...e, itemId: mapa.get(e.itemId) || e.itemId })),
        saidas: trf.saidas.map((s) => ({ ...s, itemId: mapa.get(s.itemId) || s.itemId })),
      });
    }
    const estrutura = estruturaDe(db, antigo);
    if (estrutura) {
      novaEstrutura(db, {
        itemId: novo,
        componentes: estrutura.componentes.map((c) => ({ ...c, itemId: mapa.get(c.itemId) || c.itemId })),
        motivo: `Cópia de ${origem.nome}`,
      });
    }
  }

  const novoId = mapa.get(origem.id);
  registrarHistorico(db, {
    tipo: 'cadastro', itemId: novoId, usuario: usuario?.nome || '',
    motivo: `${limpo} copiado de ${origem.nome}`,
  });
  return { item: achar(db, novoId) };
}

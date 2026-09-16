/**
 * MÓDULO INDUSTRIAL — a ponte com a ENGENHARIA do sistema
 *
 * O produto já está cadastrado. `db.produtos` guarda a ficha técnica
 * (`tecidos[]`: material e consumo por peça) e o roteiro (`processo[]`: setor,
 * etapa, tempo, pessoas e quais materiais entram em cada etapa). Pedir que
 * alguém digite isso de novo aqui seria manter dois cadastros da mesma peça —
 * e dois cadastros divergem no segundo mês.
 *
 * Então o industrial não cadastra produto: ele **deriva** o que a ficha já diz
 * e completa só o que ela não sabe dizer.
 *
 *   ficha (tecidos)   → itens comprados + estrutura
 *   roteiro (processo)→ uma transformação por setor, encadeadas
 *   modo da etapa     → ciclo ('projeto' = uma vez por ordem; 'pessoa' = por peça)
 *
 * O que só o industrial sabe — coproduto, os sete tipos de tempo, o rendimento
 * do ciclo — fica gravado aqui e sobrevive à reimportação (§V3).
 *
 * O vínculo é vivo: o item guarda `produtoId` e a assinatura da ficha de onde
 * veio. Quando a ficha muda, `divergenciasDaFicha` aponta o que mudou e a
 * derivação pode ser refeita sem perder o complemento industrial.
 */

import {
  prepararIndustrial, registrarHistorico, estruturaDe, transformacaoQueProduz,
  num, arredondar, normalizar, agoraISO, ehProduzido,
} from './modelo.mjs';
import { salvarItem, salvarEstrutura, salvarTransformacao } from './cadastro.mjs';

/* ===================================================== leitura da ficha */

const produtoDoSistema = (db, id) => (db.produtos || []).find((p) => p.id === id) || null;
const materialDoSistema = (db, id) => (db.materiais || []).find((m) => m.id === id) || null;
const setorDoSistema = (db, id) => (db.departamentos || []).find((d) => d.id === id) || null;
const etapaDoSistema = (db, id) => (db.etapas || []).find((e) => e.id === id) || null;

/** O nome do produto do jeito que a Engenharia o mostra. */
export const nomeDoProduto = (produto) => String(
  produto.nome || [produto.codigo, produto.complemento].filter(Boolean).join(' ')
).trim();

/**
 * O nome curto, para batizar o que passa de um setor para o outro. O nome
 * cheio do sistema traz grupo, tamanho, tecido e cor — "CAMISETA SILK P/M/G/GG
 * MALHA PV 30/1 AZUL MARINHO GOLA CARECA — Corte" não cabe em tabela nenhuma.
 */
export function rotuloCurtoDoProduto(db, produto) {
  const grupo = (db.gruposProduto || []).find((g) => g.id === produto.grupoId);
  const curto = [grupo ? grupo.nome : '', produto.complemento || '']
    .map((t) => String(t).trim()).filter(Boolean).join(' ');
  return (curto || nomeDoProduto(produto)).toUpperCase();
}

export function nomeCurtoDoProduto(db, produto) {
  return `${produto.codigo} ${rotuloCurtoDoProduto(db, produto)}`.trim();
}

/**
 * O tipo industrial de um material, pelo grupo em que ele está no
 * almoxarifado — subindo pela árvore de grupos, porque "Malha" é filha de
 * "Tecidos" e é o pai que diz o que a coisa é.
 */
export function tipoDoMaterial(db, material) {
  if (!material) return 'MATERIAL_AUXILIAR';
  const nomes = [];
  let grupo = (db.gruposMaterial || []).find((g) => g.id === material.grupoId);
  let voltas = 0;
  while (grupo && voltas < 8) {
    nomes.push(normalizar(grupo.nome));
    grupo = (db.gruposMaterial || []).find((g) => g.id === grupo.paiId);
    voltas += 1;
  }
  const tem = (...alvos) => alvos.some((a) => nomes.includes(normalizar(a)));
  if (tem('Tecidos', 'Malha', 'Tecido plano', 'Oxford', 'Brim', 'Microfibra', 'TNT', 'Forro')) {
    return 'MATERIA_PRIMA';
  }
  if (tem('Aviamentos', 'Linhas', 'Zíperes', 'Botões', 'Elásticos', 'Viés', 'Entretela', 'Velcro')) {
    return 'AVIAMENTO';
  }
  if (tem('Telas')) return 'MATERIAL_AUXILIAR';
  if (tem('Estamparia', 'Tintas', 'Emulsão', 'DTF', 'Sublimação', 'Transfer')) return 'INSUMO';
  if (tem('Embalagens', 'Sacos', 'Caixas', 'Etiquetas', 'Tags', 'Fitas')) return 'EMBALAGEM';
  return 'MATERIAL_AUXILIAR';
}

/** Minutos da etapa, qualquer que seja a unidade em que ela foi medida. */
const minutosDaEtapa = (etapa) => {
  const t = num(etapa.tempo);
  const unidade = String(etapa.unidadeTempo || 'min').toLowerCase();
  if (unidade.startsWith('h')) return arredondar(t * 60, 4);
  if (unidade.startsWith('s')) return arredondar(t / 60, 4);
  return arredondar(t, 4);
};

/**
 * A ficha lida na forma que o industrial entende: os materiais com consumo
 * por peça e o roteiro agrupado por setor, na ordem em que a peça passa.
 */
export function lerFichaDoProduto(db, produtoId) {
  prepararIndustrial(db);
  const produto = produtoDoSistema(db, produtoId);
  if (!produto) return { erro: 'Produto não encontrado na Engenharia.' };

  const materiais = (produto.tecidos || []).map((t) => {
    const material = materialDoSistema(db, t.materialId);
    return {
      fichaId: t.id,
      materialId: t.materialId,
      material,
      nome: material ? material.nome : '(material apagado do almoxarifado)',
      unidade: material ? material.unidadeEstoque : '',
      quantidade: num(t.quantidade),
      tipo: tipoDoMaterial(db, material),
      existe: !!material,
    };
  });

  /* o roteiro em blocos de setor: cada bloco vira uma transformação, e a
     ordem entre eles é a ordem em que a peça anda pela fábrica */
  const etapas = [...(produto.processo || [])]
    .sort((a, b) => num(a.ordem) - num(b.ordem));
  const setores = [];
  for (const etapa of etapas) {
    const ultimo = setores[setores.length - 1];
    if (ultimo && ultimo.departamentoId === etapa.departamentoId) ultimo.etapas.push(etapa);
    else setores.push({ departamentoId: etapa.departamentoId, etapas: [etapa] });
  }

  const blocos = setores.map((bloco, i) => {
    const setor = setorDoSistema(db, bloco.departamentoId);
    return {
      ordem: i + 1,
      departamentoId: bloco.departamentoId,
      departamento: setor ? setor.nome : '(setor apagado)',
      existe: !!setor,
      minutosPorPeca: arredondar(bloco.etapas
        .filter((e) => String(e.modo) !== 'projeto')
        .reduce((s, e) => s + minutosDaEtapa(e), 0), 4),
      minutosPorOrdem: arredondar(bloco.etapas
        .filter((e) => String(e.modo) === 'projeto')
        .reduce((s, e) => s + minutosDaEtapa(e), 0), 4),
      /* os materiais que a ficha diz que entram neste setor */
      fichaIds: [...new Set(bloco.etapas.flatMap((e) => e.materiais || []))],
      operacoes: bloco.etapas.map((e) => {
        const etapa = etapaDoSistema(db, e.etapaId);
        const porOrdem = String(e.modo) === 'projeto';
        return {
          nome: etapa ? etapa.nome : `Etapa ${e.ordem}`,
          etapaId: e.etapaId || '',
          /* 'projeto' é trabalho do lote inteiro — preparar a tela, enfestar:
             acontece uma vez por ordem, e é isso que o ciclo 0 quer dizer */
          porCiclo: porOrdem ? 0 : 1,
          pessoas: Math.max(num(e.pessoas) || 1, 1),
          minutos: minutosDaEtapa(e),
          modo: e.modo || 'pessoa',
          tempos: { [porOrdem ? 'preparacao' : 'processamento']: minutosDaEtapa(e) },
        };
      }),
    };
  });

  return {
    produtoId: produto.id,
    codigo: produto.codigo,
    nome: nomeDoProduto(produto),
    curto: nomeCurtoDoProduto(db, produto),
    status: produto.status || '',
    ativo: produto.ativo !== false,
    preco: num(produto.preco),
    materiais,
    blocos,
    minutosPorPeca: arredondar(blocos.reduce((s, b) => s + b.minutosPorPeca, 0), 4),
    pendencias: [
      ...(materiais.length === 0 ? ['A ficha não tem material nenhum.'] : []),
      ...materiais.filter((m) => !m.existe).map((m) => `${m.nome} não existe mais no almoxarifado.`),
      ...(blocos.length === 0 ? ['O roteiro não tem etapa nenhuma.'] : []),
      ...blocos.filter((b) => !b.existe).map((b) => `${b.departamento} não existe mais.`),
      ...blocos.filter((b) => b.minutosPorPeca + b.minutosPorOrdem <= 0)
        .map((b) => `${b.departamento}: nenhuma etapa com tempo.`),
    ],
  };
}

/**
 * A assinatura da ficha: muda quando muda alguma coisa que o industrial
 * copiou. É ela que diz, depois, se a derivação envelheceu.
 */
export function assinaturaDaFicha(ficha) {
  if (!ficha || ficha.erro) return '';
  const materiais = ficha.materiais
    .map((m) => `${m.materialId}:${arredondar(m.quantidade, 4)}`).sort().join('|');
  const roteiro = ficha.blocos
    .map((b) => `${b.departamentoId}:${b.operacoes
      .map((o) => `${o.etapaId || o.nome}@${o.minutos}/${o.porCiclo}`).join(',')}`).join('|');
  return `${materiais}#${roteiro}`;
}

/* ================================================== a derivação */

const itemDoProduto = (db, produtoId) => (db.industrial.itens || []).find(
  (i) => i.produtoId === produtoId && i.ativo !== false) || null;

const itemDoMaterial = (db, materialId) => (db.industrial.itens || []).find(
  (i) => i.materialId === materialId && i.ativo !== false) || null;

/**
 * Traz o produto da Engenharia para o industrial — criando o que falta e
 * reaproveitando o que já existe. Rodar duas vezes não duplica nada.
 *
 * O que ela cria:
 *   · um item comprado por material da ficha (ou reusa o item que já aponta
 *     para aquele material — é a regra da V3: um item por material)
 *   · um subproduto por setor do roteiro, menos o último
 *   · uma transformação por setor, encadeadas: o setor seguinte recebe o que
 *     o anterior entregou, mais os materiais das suas próprias etapas
 *   · a estrutura do produto acabado, com o que entra nele no último setor
 */
export function derivarProdutoDaEngenharia(db, produtoId, usuario, opcoes = {}) {
  prepararIndustrial(db);
  const ficha = lerFichaDoProduto(db, produtoId);
  if (ficha.erro) return ficha;
  if (ficha.materiais.some((m) => !m.existe)) {
    return { erro: `A ficha aponta para material que não existe mais: `
      + `${ficha.materiais.filter((m) => !m.existe).map((m) => m.nome).join(', ')}.` };
  }
  if (ficha.blocos.length === 0) return { erro: 'O roteiro do produto está vazio — nada a derivar.' };
  if (ficha.blocos.some((b) => !b.existe)) {
    return { erro: 'O roteiro aponta para um setor que não existe mais.' };
  }

  const criados = { itens: [], subprodutos: [], transformacoes: [] };
  const reusados = { itens: [] };

  /* 1. os materiais da ficha viram itens comprados — ou reusam o que existe */
  const itemPorFicha = new Map();
  for (const m of ficha.materiais) {
    let item = itemDoMaterial(db, m.materialId);
    if (item) reusados.itens.push(item.nome);
    else {
      const r = salvarItem(db, {
        nome: m.nome, tipo: m.tipo, materialId: m.materialId,
        unidade: m.unidade, origem: 'engenharia',
      }, usuario);
      if (r.erro) return { erro: `${m.nome}: ${r.erro}` };
      item = r.item;
      criados.itens.push(item.nome);
    }
    itemPorFicha.set(m.fichaId, { item, quantidade: m.quantidade });
  }

  /* materiais que a ficha não amarrou a etapa nenhuma entram no primeiro
     setor: é melhor consumir cedo do que deixar fora da conta */
  const amarrados = new Set(ficha.blocos.flatMap((b) => b.fichaIds));
  const soltos = ficha.materiais.filter((m) => !amarrados.has(m.fichaId)).map((m) => m.fichaId);

  /* 2. o produto acabado */
  const ultimoSetor = ficha.blocos[ficha.blocos.length - 1];
  let produtoAcabado = itemDoProduto(db, produtoId);
  if (!produtoAcabado) {
    const r = salvarItem(db, {
      nome: ficha.nome, tipo: 'PRODUTO_ACABADO', unidade: 'UN',
      departamentoId: ultimoSetor.departamentoId,
      produtoId, origem: 'engenharia',
    }, usuario);
    if (r.erro) return { erro: `${ficha.nome}: ${r.erro}` };
    produtoAcabado = r.item;
    criados.itens.push(produtoAcabado.nome);
  }

  /* 3. um subproduto por setor, menos o último — é o que passa de um setor
        para o outro, e é o que faz o estoque em processo existir */
  const saidaDoSetor = [];
  for (let i = 0; i < ficha.blocos.length; i += 1) {
    const bloco = ficha.blocos[i];
    if (i === ficha.blocos.length - 1) { saidaDoSetor.push(produtoAcabado); continue; }
    const nome = `${ficha.curto} — ${bloco.departamento}`;
    let sub = (db.industrial.itens || []).find(
      (x) => x.ativo !== false && normalizar(x.nome) === normalizar(nome));
    if (!sub) {
      const r = salvarItem(db, {
        nome, tipo: 'SUBPRODUTO', unidade: 'UN',
        departamentoId: bloco.departamentoId,
        produtoId, origem: 'engenharia',
      }, usuario);
      if (r.erro) return { erro: `${nome}: ${r.erro}` };
      sub = r.item;
      criados.subprodutos.push(sub.nome);
    }
    saidaDoSetor.push(sub);
  }

  /* 4. uma transformação por setor, encadeadas */
  for (let i = 0; i < ficha.blocos.length; i += 1) {
    const bloco = ficha.blocos[i];
    const saida = saidaDoSetor[i];
    const entradas = [];

    if (i > 0) entradas.push({ itemId: saidaDoSetor[i - 1].id, quantidade: 1, perda: 0 });
    const fichaIds = i === 0 ? [...bloco.fichaIds, ...soltos] : bloco.fichaIds;
    for (const fichaId of [...new Set(fichaIds)]) {
      const ligado = itemPorFicha.get(fichaId);
      if (!ligado || !(ligado.quantidade > 0)) continue;
      entradas.push({ itemId: ligado.item.id, quantidade: ligado.quantidade, perda: 0 });
    }
    if (entradas.length === 0) {
      return { erro: `${bloco.departamento}: a ficha não diz que material entra neste setor.` };
    }

    const existente = transformacaoQueProduz(db, saida.id);
    /* o complemento industrial que o usuário ajustou à mão (ciclo, tipos de
       tempo, coproduto) não é jogado fora numa reimportação */
    const manterOperacoes = existente && opcoes.manterTempos !== false
      && (existente.operacoes || []).length > 0;

    const r = salvarTransformacao(db, {
      id: existente ? existente.id : '',
      nome: `${ficha.curto} — ${bloco.departamento}`,
      departamentoId: bloco.departamentoId,
      entradas,
      saidas: [{ itemId: saida.id, quantidade: 1, principal: true }],
      operacoes: manterOperacoes ? existente.operacoes : bloco.operacoes.map((o) => ({
        nome: o.nome, etapaId: o.etapaId, porCiclo: o.porCiclo,
        pessoas: o.pessoas, tempos: o.tempos,
      })),
      motivo: existente ? 'Atualizada a partir da ficha do produto' : '',
      origem: 'engenharia',
    }, usuario);
    if (r.erro) return { erro: `${bloco.departamento}: ${r.erro}` };
    if (!existente) criados.transformacoes.push(r.transformacao.nome);
  }

  /* 5. a estrutura do produto acabado: o que entra nele no último setor */
  const ultimaTrf = transformacaoQueProduz(db, produtoAcabado.id);
  if (ultimaTrf) {
    const r = salvarEstrutura(db, produtoAcabado.id,
      (ultimaTrf.entradas || []).map((e) => ({ itemId: e.itemId, quantidade: e.quantidade, perda: 0 })),
      { motivo: `Derivada da ficha de ${ficha.codigo}` }, usuario);
    if (r.erro) return { erro: `Estrutura de ${ficha.nome}: ${r.erro}` };
  }

  /* 6. o vínculo vivo */
  produtoAcabado.produtoId = produtoId;
  produtoAcabado.origem = 'engenharia';
  produtoAcabado.fichaAssinatura = assinaturaDaFicha(ficha);
  produtoAcabado.derivadoEm = agoraISO();
  produtoAcabado.derivadoPor = usuario?.nome || '';

  registrarHistorico(db, {
    tipo: 'engenharia', itemId: produtoAcabado.id, usuario: usuario?.nome || '',
    motivo: `${ficha.codigo} ${ficha.nome} derivado da Engenharia: `
      + `${ficha.materiais.length} material(is) e ${ficha.blocos.length} setor(es)`,
  });

  return {
    item: produtoAcabado,
    ficha,
    criados,
    reusados,
    setores: ficha.blocos.map((b) => b.departamento),
  };
}

/* =========================================== o vínculo, depois de feito */

/**
 * As transformações que fazem ESTE produto, subindo a cadeia a partir dele:
 * a do último setor, a do setor anterior que entregou a ela, e assim por
 * diante. É o que separa a costura desta peça da costura de outra.
 */
export function transformacoesDoProduto(db, itemId, vistos = new Set()) {
  if (vistos.has(itemId) || vistos.size > 60) return [];
  vistos.add(itemId);
  const trf = transformacaoQueProduz(db, itemId);
  if (!trf) return [];
  const acima = (trf.entradas || []).flatMap((e) => transformacoesDoProduto(db, e.itemId, vistos));
  return [...acima, trf];
}

/**
 * O que mudou na ficha desde a derivação. Enquanto a lista estiver vazia, o
 * industrial e a Engenharia estão contando a mesma história.
 */
export function divergenciasDaFicha(db, produtoId) {
  prepararIndustrial(db);
  const item = itemDoProduto(db, produtoId);
  const ficha = lerFichaDoProduto(db, produtoId);
  if (ficha.erro) return { erro: ficha.erro };
  if (!item) {
    return {
      derivado: false, emDia: false, divergencias: [],
      resumo: 'ainda não veio para o industrial',
    };
  }

  const agora = assinaturaDaFicha(ficha);
  if (agora === item.fichaAssinatura) {
    return { derivado: true, emDia: true, divergencias: [], item, ficha, resumo: 'em dia com a ficha' };
  }

  /* a assinatura já disse que mudou; agora o que mudou, em português.
     A comparação só olha a cadeia DESTE produto: a mesma linha de costura
     entra em cinco fichas, e comparar com a transformação de outra peça
     acusaria uma diferença que não existe. */
  const divergencias = [];
  const cadeia = transformacoesDoProduto(db, item.id);
  for (const m of ficha.materiais) {
    const industrial = itemDoMaterial(db, m.materialId);
    if (!industrial) { divergencias.push(`${m.nome} entrou na ficha e não existe no industrial.`); continue; }
    const trf = cadeia.find((t) => (t.entradas || []).some((e) => e.itemId === industrial.id));
    if (!trf) { divergencias.push(`${m.nome} está na ficha e não entra em nenhum setor deste produto.`); continue; }
    const entrada = (trf.entradas || []).find((e) => e.itemId === industrial.id);
    if (Math.abs(num(entrada.quantidade) - m.quantidade) > 0.00001) {
      divergencias.push(`${m.nome}: a ficha diz ${m.quantidade} e o industrial usa ${num(entrada.quantidade)}.`);
    }
  }

  for (const bloco of ficha.blocos) {
    const trf = cadeia.find((t) => t.departamentoId === bloco.departamentoId);
    if (!trf) { divergencias.push(`${bloco.departamento} entrou no roteiro e não tem transformação.`); continue; }
    const minutosFicha = arredondar(bloco.operacoes.reduce((s, o) => s + o.minutos, 0), 2);
    const minutosInd = arredondar((trf.operacoes || []).reduce(
      (s, o) => s + Object.values(o.tempos || {}).reduce((x, v) => x + num(v), 0), 0), 2);
    if (Math.abs(minutosFicha - minutosInd) > 0.01) {
      divergencias.push(`${bloco.departamento}: a ficha soma ${minutosFicha} min e o industrial ${minutosInd} min.`);
    }
  }

  return {
    derivado: true,
    emDia: divergencias.length === 0,
    divergencias,
    item,
    ficha,
    resumo: divergencias.length === 0
      ? 'a ficha mudou em algo que o industrial não copia'
      : `${divergencias.length} diferença(s) para a ficha`,
  };
}

/**
 * A lista que a tela mostra: todo produto da Engenharia, com o estado do
 * vínculo. É por aqui que se vê que existem seis produtos cadastrados e
 * quantos deles o industrial já enxerga.
 */
export function produtosDaEngenharia(db) {
  prepararIndustrial(db);
  const linhas = (db.produtos || []).filter((p) => p.ativo !== false).map((produto) => {
    const ficha = lerFichaDoProduto(db, produto.id);
    const estado = divergenciasDaFicha(db, produto.id);
    return {
      produtoId: produto.id,
      codigo: produto.codigo,
      nome: nomeDoProduto(produto),
      status: produto.status || '',
      materiais: ficha.erro ? 0 : ficha.materiais.length,
      setores: ficha.erro ? [] : ficha.blocos.map((b) => b.departamento),
      minutosPorPeca: ficha.erro ? 0 : ficha.minutosPorPeca,
      pendencias: ficha.erro ? [ficha.erro] : ficha.pendencias,
      derivado: !!estado.derivado,
      emDia: !!estado.emDia,
      divergencias: estado.divergencias || [],
      itemId: estado.item ? estado.item.id : '',
      situacao: !estado.derivado ? 'fora' : (estado.emDia ? 'em_dia' : 'divergente'),
    };
  });
  return {
    linhas,
    total: linhas.length,
    derivados: linhas.filter((l) => l.derivado).length,
    divergentes: linhas.filter((l) => l.situacao === 'divergente').length,
    fora: linhas.filter((l) => !l.derivado).length,
  };
}

/**
 * §49/§53 — a demonstração completa: 10.000 camisetas básicas.
 *
 * Monta, sobre a base do sistema (materiais, setores, gente, jornada e custo
 * fixo que já existem), a estrutura industrial da camiseta e a carteira de
 * três clientes que se consolidam num lote só:
 *
 *   MALHA PV
 *      └─ CORTE ──────► frente · costas · manga (2) · gola
 *                          │         │        │       │
 *                          │         │        │       └─ PREPARAÇÃO (+ entretela, etiqueta)
 *                          │         │        │              └─ gola preparada
 *                          └─ SILK (+ tinta) ─┴──────────────────┐
 *                                 └─ frente estampada            │
 *                                            └─ COSTURA (+ linha)┘
 *                                                   └─ camiseta costurada
 *                                                          └─ ACABAMENTO (+ saco, tag)
 *                                                                 └─ CAMISETA BÁSICA
 *
 * Os números de consumo são os do próprio prompt do módulo (§7: 5.500 kg de
 * malha para 10.000 camisetas). Preço de material, salário e custo fixo saem
 * do cadastro da base — não são inventados aqui.
 */

import {
  prepararIndustrial, novoItem, novaEstrutura, novaTransformacao, novaLinhaCarteira,
  num, arredondar, uid, agoraISO, hojeISO,
} from './modelo.mjs';
import { entradaDeMaterial } from './compras.mjs';

const CONSUMO_MALHA_KG = 0.55;     // §7 — 5.500 kg para 10.000 camisetas

/** Acha um material do almoxarifado pelo nome, sem depender de acento nem caixa. */
function material(db, trecho) {
  const alvo = String(trecho).toUpperCase();
  return (db.materiais || []).find((m) => String(m.nome).toUpperCase().includes(alvo)) || null;
}

function setorPorNome(db, nome) {
  const alvo = String(nome).toUpperCase();
  return (db.departamentos || []).find((d) => String(d.nome).toUpperCase() === alvo) || null;
}

function etapa(db, departamentoId, nome) {
  const alvo = String(nome).toUpperCase();
  return (db.etapas || []).find(
    (e) => e.departamentoId === departamentoId && String(e.nome).toUpperCase() === alvo
  ) || null;
}

function cliente(db, trecho) {
  const alvo = String(trecho).toUpperCase();
  return (db.clientes || []).find(
    (c) => String(c.nomeFantasia || c.nome).toUpperCase().includes(alvo)
  ) || null;
}

const exigir = (valor, mensagem) => {
  if (!valor) throw new Error(mensagem);
  return valor;
};

const criar = (resultado, contexto) => {
  if (resultado.erro) throw new Error(`${contexto}: ${resultado.erro}`);
  return resultado.registro;
};

/**
 * Monta a estrutura industrial da camiseta e a carteira de 10.000 peças.
 * Não apaga nada: roda sobre a base que vier.
 */
export function montarDemonstracao(db, opcoes = {}) {
  prepararIndustrial(db);
  const quantidade = num(opcoes.quantidade) || 10000;

  /* ---------------------------------------------------------- setores */
  const corte = exigir(setorPorNome(db, 'Corte'), 'A base não tem o setor Corte.');
  const preparacao = exigir(setorPorNome(db, 'Preparação'), 'A base não tem o setor Preparação.');
  const estamparia = exigir(setorPorNome(db, 'Estamparia'), 'A base não tem o setor Estamparia.');
  const costura = exigir(setorPorNome(db, 'Costura'), 'A base não tem o setor Costura.');
  const acabamento = exigir(setorPorNome(db, 'Acabamento'), 'A base não tem o setor Acabamento.');

  /* ------------------------------------------------- itens comprados
     Apontam para o material do almoxarifado: preço, saldo e fornecedor
     continuam sendo os do cadastro, não uma cópia. */
  const doAlmoxarifado = (trecho, tipo, nome) => {
    const mat = exigir(material(db, trecho), `Material "${trecho}" não existe na base.`);
    return criar(novoItem(db, {
      nome: nome || mat.nome, tipo, materialId: mat.id, unidade: mat.unidadeEstoque,
    }), `item ${trecho}`);
  };

  const malha = doAlmoxarifado('MALHA PV', 'MATERIA_PRIMA');
  const linha = doAlmoxarifado('LINHA 120', 'AVIAMENTO');
  const etiqueta = doAlmoxarifado('ETIQUETA BORDADA', 'AVIAMENTO');
  const entretela = doAlmoxarifado('ENTRETELA', 'AVIAMENTO');
  const tinta = doAlmoxarifado('TINTA BASE', 'INSUMO');
  const tela = doAlmoxarifado('TELA SILK', 'MATERIAL_AUXILIAR');
  const saco = doAlmoxarifado('SACO PL', 'EMBALAGEM');
  const tag = doAlmoxarifado('TAG PAPEL', 'EMBALAGEM');

  /* --------------------------------------------------- subprodutos */
  const sub = (nome, departamentoId, perda = 0) => criar(novoItem(db, {
    nome, tipo: 'SUBPRODUTO', unidade: 'UN', departamentoId, perdaPadrao: perda,
  }), `subproduto ${nome}`);

  const frente = sub('FRENTE CORTADA', corte.id);
  const costas = sub('COSTAS CORTADA', corte.id);
  const manga = sub('MANGA CORTADA', corte.id);
  const golaCortada = sub('GOLA CORTADA', corte.id);
  const golaPreparada = sub('GOLA PREPARADA', preparacao.id, 1);
  const frenteEstampada = sub('FRENTE ESTAMPADA', estamparia.id, 2);

  const emProcesso = criar(novoItem(db, {
    nome: 'CAMISETA COSTURADA', tipo: 'PRODUTO_EM_PROCESSO', unidade: 'UN',
    departamentoId: costura.id, perdaPadrao: 1,
  }), 'produto em processo');

  const camiseta = criar(novoItem(db, {
    nome: 'CAMISETA BÁSICA MALHA PV', tipo: 'PRODUTO_ACABADO', unidade: 'UN',
    departamentoId: acabamento.id, custoPadrao: 0,
  }), 'produto acabado');

  /* ------------------------------------------- §4 estrutura multinível
     A estrutura declara o que a peça leva; a transformação, mais abaixo,
     diz em que setor isso acontece e quanto tempo leva. */
  criar(novaEstrutura(db, {
    itemId: camiseta.id,
    componentes: [{ itemId: emProcesso.id, quantidade: 1 },
      { itemId: saco.id, quantidade: 1 }, { itemId: tag.id, quantidade: 1 }],
  }), 'estrutura da camiseta');

  criar(novaEstrutura(db, {
    itemId: emProcesso.id,
    componentes: [
      { itemId: frenteEstampada.id, quantidade: 1 },
      { itemId: costas.id, quantidade: 1 },
      { itemId: manga.id, quantidade: 2 },
      { itemId: golaPreparada.id, quantidade: 1 },
      { itemId: linha.id, quantidade: 0.015 },
    ],
  }), 'estrutura da camiseta costurada');

  criar(novaEstrutura(db, {
    itemId: golaPreparada.id,
    componentes: [
      { itemId: golaCortada.id, quantidade: 1 },
      { itemId: entretela.id, quantidade: 0.02 },
      { itemId: etiqueta.id, quantidade: 1 },
    ],
  }), 'estrutura da gola preparada');

  criar(novaEstrutura(db, {
    itemId: frenteEstampada.id,
    componentes: [{ itemId: frente.id, quantidade: 1 }, { itemId: tinta.id, quantidade: 0.012 }],
  }), 'estrutura da frente estampada');

  /* ------------------------------------------ §45 transformações
     CORTE: um enfesto de 500 peças entrega as quatro partes de uma vez.
     Os tempos são os do §10 — 285 minutos por enfesto. */
  const trfCorte = criar(novaTransformacao(db, {
    nome: 'Corte da camiseta',
    departamentoId: corte.id,
    tipo: 'transformacao',
    /* o consumo por peça já é o da fábrica, com o retalho do encaixe dentro;
       o retalho real de cada enfesto é registrado na execução (§23) */
    entradas: [{ itemId: malha.id, quantidade: CONSUMO_MALHA_KG, unidade: 'KG', perda: 0 }],
    saidas: [
      { itemId: frente.id, quantidade: 1, principal: true },
      { itemId: costas.id, quantidade: 1 },
      { itemId: manga.id, quantidade: 2 },
      { itemId: golaCortada.id, quantidade: 1 },
    ],
    operacoes: [{
      nome: 'Enfesto e corte',
      etapaId: (etapa(db, corte.id, 'Corte') || {}).id || '',
      porCiclo: 500,
      pessoas: 1,
      tempos: { preparacao: 15, setup: 30, processamento: 120, manuseio: 60, inspecao: 40, movimentacao: 20 },
    }],
    lotePadrao: 500,
    observacao: 'Enfesto de 500 peças; o encaixe rende as quatro partes no mesmo golpe.',
  }), 'transformação do corte');

  const trfPreparacao = criar(novaTransformacao(db, {
    nome: 'Preparação da gola',
    departamentoId: preparacao.id,
    tipo: 'transformacao',
    entradas: [
      { itemId: golaCortada.id, quantidade: 1, perda: 0 },
      { itemId: entretela.id, quantidade: 0.02, unidade: 'M', perda: 0 },
      { itemId: etiqueta.id, quantidade: 1, perda: 0 },
    ],
    saidas: [{ itemId: golaPreparada.id, quantidade: 1, principal: true }],
    operacoes: [{
      nome: 'Fusão da entretela e etiqueta',
      etapaId: (etapa(db, preparacao.id, 'Fusão de entretela') || {}).id || '',
      porCiclo: 250,
      pessoas: 1,
      tempos: { preparacao: 10, setup: 5, processamento: 62, manuseio: 25, inspecao: 8, movimentacao: 10 },
    }],
    lotePadrao: 250,
  }), 'transformação da preparação');

  const trfSilk = criar(novaTransformacao(db, {
    nome: 'Silk da frente',
    departamentoId: estamparia.id,
    tipo: 'beneficiamento',
    entradas: [
      { itemId: frente.id, quantidade: 1, perda: 2 },
      { itemId: tinta.id, quantidade: 0.012, unidade: 'KG', perda: 0 },
    ],
    saidas: [{ itemId: frenteEstampada.id, quantidade: 1, principal: true }],
    operacoes: [
      {
        /* a tela se grava uma vez para a ordem inteira: é o custo que se
           dilui quando o lote cresce, e que mata o lote pequeno */
        nome: 'Gravação da tela',
        etapaId: (etapa(db, estamparia.id, 'Preparação de tela') || {}).id || '',
        porCiclo: 0,
        pessoas: 1,
        tempos: { preparacao: 20, setup: 35 },
      },
      {
        nome: 'Impressão e cura',
        etapaId: (etapa(db, estamparia.id, 'Silk') || {}).id || '',
        porCiclo: 200,
        pessoas: 1,
        tempos: { processamento: 90, espera: 25, manuseio: 30, inspecao: 12, movimentacao: 10 },
      },
    ],
    lotePadrao: 200,
    observacao: 'A tela é material auxiliar: dura vários lotes e não entra peça a peça.',
  }), 'transformação do silk');

  const trfCostura = criar(novaTransformacao(db, {
    nome: 'Montagem da camiseta',
    departamentoId: costura.id,
    tipo: 'montagem',
    entradas: [
      { itemId: frenteEstampada.id, quantidade: 1, perda: 0 },
      { itemId: costas.id, quantidade: 1, perda: 0 },
      { itemId: manga.id, quantidade: 2, perda: 0 },
      { itemId: golaPreparada.id, quantidade: 1, perda: 0 },
      { itemId: linha.id, quantidade: 0.015, unidade: 'UN', perda: 0 },
    ],
    saidas: [{ itemId: emProcesso.id, quantidade: 1, principal: true }],
    operacoes: [
      { nome: 'Fechar ombro', etapaId: (etapa(db, costura.id, 'Fechar ombro') || {}).id || '',
        porCiclo: 1, tempos: { processamento: 1.1, manuseio: 0.2 } },
      { nome: 'Pregar gola', etapaId: (etapa(db, costura.id, 'Pregar gola') || {}).id || '',
        porCiclo: 1, tempos: { processamento: 1.6, manuseio: 0.2 } },
      { nome: 'Colocar manga', etapaId: (etapa(db, costura.id, 'Colocar manga') || {}).id || '',
        porCiclo: 1, tempos: { processamento: 1.8, manuseio: 0.3 } },
      { nome: 'Fechar lateral', etapaId: (etapa(db, costura.id, 'Fechar lateral') || {}).id || '',
        porCiclo: 1, tempos: { processamento: 1.5, manuseio: 0.2 } },
      { nome: 'Bainha da barra', etapaId: (etapa(db, costura.id, 'Bainha da barra') || {}).id || '',
        porCiclo: 1, tempos: { processamento: 1.3, manuseio: 0.2, inspecao: 0.3 } },
    ],
    lotePadrao: 1,
  }), 'transformação da costura');

  const trfAcabamento = criar(novaTransformacao(db, {
    nome: 'Acabamento e embalagem',
    departamentoId: acabamento.id,
    tipo: 'transformacao',
    entradas: [
      { itemId: emProcesso.id, quantidade: 1, perda: 0 },
      { itemId: saco.id, quantidade: 1, perda: 0 },
      { itemId: tag.id, quantidade: 1, perda: 0 },
    ],
    saidas: [{ itemId: camiseta.id, quantidade: 1, principal: true }],
    operacoes: [{
      nome: 'Revisar, dobrar e embalar',
      etapaId: (etapa(db, acabamento.id, 'Revisão') || {}).id || '',
      porCiclo: 50,
      pessoas: 1,
      tempos: { preparacao: 4, processamento: 55, manuseio: 18, inspecao: 15, movimentacao: 8 },
    }],
    lotePadrao: 50,
  }), 'transformação do acabamento');

  /* ------------------------------------ V2 §9: custo hora das máquinas
     Números de máquina de confecção de porte médio — servem para a conta de
     custo hora sair do equipamento, e não de um parâmetro geral. */
  const CUSTOS_MAQUINA = {
    'Cortadeira vertical 8\"': { custoAquisicao: 4200, vidaUtilMeses: 120, valorResidual: 400,
      manutencaoMensal: 90, energiaHora: 1.1, horasDisponiveisMes: 176 },
    'Carrossel silk 6 cores': { custoAquisicao: 38000, vidaUtilMeses: 144, valorResidual: 4000,
      manutencaoMensal: 320, energiaHora: 2.4, horasDisponiveisMes: 176 },
    'Prensa térmica 40x50': { custoAquisicao: 6500, vidaUtilMeses: 96, valorResidual: 600,
      manutencaoMensal: 110, energiaHora: 4.2, horasDisponiveisMes: 176 },
    'Bordadeira 6 cabeças': { custoAquisicao: 96000, vidaUtilMeses: 180, valorResidual: 12000,
      manutencaoMensal: 850, energiaHora: 3.1, horasDisponiveisMes: 176 },
    'Reta 01': { custoAquisicao: 3200, vidaUtilMeses: 120, valorResidual: 300,
      manutencaoMensal: 60, energiaHora: 0.5, horasDisponiveisMes: 176 },
    'Reta 02': { custoAquisicao: 3200, vidaUtilMeses: 120, valorResidual: 300,
      manutencaoMensal: 60, energiaHora: 0.5, horasDisponiveisMes: 176 },
    'Overloque 01': { custoAquisicao: 4800, vidaUtilMeses: 120, valorResidual: 450,
      manutencaoMensal: 80, energiaHora: 0.7, horasDisponiveisMes: 176 },
    'Galoneira 01': { custoAquisicao: 7400, vidaUtilMeses: 120, valorResidual: 700,
      manutencaoMensal: 95, energiaHora: 0.8, horasDisponiveisMes: 176 },
  };
  for (const eq of db.equipamentos || []) {
    const custos = CUSTOS_MAQUINA[eq.nome];
    if (!custos) continue;
    Object.assign(eq, custos, { custoHoraDetalhado: true });
  }

  /* ----------------------------------------------- §2 carteira 10.000
     Três clientes, o mesmo produto: a consolidação evita enfestar três
     vezes o mesmo tecido. */
  const pedidos = [
    { cliente: 'Colégio Novo Horizonte', pedido: '4821', quantidade: 2000, prazo: 25, prioridade: 3 },
    { cliente: 'Bom Preço', pedido: '4822', quantidade: 3000, prazo: 30, prioridade: 4 },
    { cliente: 'Metalúrgica Ferraz', pedido: '4823', quantidade: 5000, prazo: 38, prioridade: 2 },
  ];
  const proporcao = quantidade / 10000;
  const linhasCarteira = pedidos.map((p) => {
    const c = cliente(db, p.cliente);
    const dias = (n) => {
      const d = new Date(`${hojeISO()}T00:00:00`);
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };
    return criar(novaLinhaCarteira(db, {
      itemId: camiseta.id,
      clienteId: c ? c.id : '',
      pedido: p.pedido,
      quantidade: Math.round(p.quantidade * proporcao),
      dataPrometida: dias(p.prazo),
      prioridade: p.prioridade,
      linhaProducao: 'Malha',
      observacao: `Camiseta do uniforme — pedido ${p.pedido}.`,
    }), `carteira ${p.pedido}`);
  });

  return {
    itens: { malha, linha, etiqueta, entretela, tinta, tela, saco, tag,
      frente, costas, manga, golaCortada, golaPreparada, frenteEstampada, emProcesso, camiseta },
    transformacoes: { corte: trfCorte, preparacao: trfPreparacao, silk: trfSilk,
      costura: trfCostura, acabamento: trfAcabamento },
    departamentos: { corte, preparacao, estamparia, costura, acabamento },
    carteira: linhasCarteira,
    quantidade,
  };
}

/**
 * Entrada de material no almoxarifado — atalho da demonstração para receber o
 * que o MRP pediu. A porta de entrada é uma só: `entradaDeMaterial`, em
 * compras.mjs, a mesma que o recebimento de pedido usa.
 */
export function receberCompra(db, materialId, quantidade, opcoes = {}) {
  return entradaDeMaterial(db, {
    materialId,
    quantidade,
    custoUnitario: opcoes.custoUnitario,
    documento: opcoes.documento || '',
    observacao: opcoes.observacao || 'Recebimento gerado pela necessidade do MRP.',
    origemTipo: 'recebimento',
  }, opcoes.usuario);
}

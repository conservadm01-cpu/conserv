/**
 * MÓDULO INDUSTRIAL — modelo de dados
 *
 * A regra que organiza tudo (§48): material não é consumido pelo produto
 * acabado. Material é TRANSFORMADO em subproduto, que é transformado em outro
 * subproduto, que é MONTADO em produto acabado. Cada passo tem entrada, saída,
 * perda, tempo, custo e lote — e é por isso que o corte não "dá baixa de
 * tecido": ele recebe rolo e entrega frente, costas, manga e gola.
 *
 * O módulo se apoia no que o sistema já tem e não duplica nada (§50):
 *   materiais, grupos e saldos ....... db.materiais, db.saldos, db.movimentacoes
 *   setores, etapas e máquinas ....... db.departamentos, db.etapas, db.equipamentos
 *   pessoas, salário e jornada ....... db.colaboradores, db.jornada, db.parametrosMaoDeObra
 *   custo indireto da fábrica ........ db.custosFixos, db.parametrosCustoIndireto
 *
 * O que é novo mora em `db.industrial`, e é só o que não existia: itens
 * tipados, estrutura multinível, receitas de transformação, carteira de
 * produção, demanda, ordem por processo, lote, estoque entre processos,
 * perda, retalho, budget e rastro.
 */

/* ============================================================ identidade */

export const uid = () => Math.random().toString(36).slice(2, 9);

export const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const arredondar = (v, casas = 4) => Number(num(v).toFixed(casas));

export const normalizar = (t) => String(t ?? '')
  .toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Z0-9]+/g, ' ').trim();

export const hojeISO = () => new Date().toISOString().slice(0, 10);
export const agoraISO = () => new Date().toISOString().slice(0, 19);

/** Código sequencial por prefixo: ITM-00001, OPC-0007, LOTE-2026-0003. */
export function proximoCodigo(lista, prefixo, digitos = 4) {
  const usados = (lista || [])
    .map((x) => String(x.codigo || ''))
    .filter((c) => c.startsWith(`${prefixo}-`))
    .map((c) => num(c.slice(prefixo.length + 1).replace(/^\d{4}-/, '')))
    .filter((v) => v > 0);
  const proximo = (usados.length ? Math.max(...usados) : 0) + 1;
  return `${prefixo}-${String(proximo).padStart(digitos, '0')}`;
}

/* ============================================================== §5 itens
   O tipo do item decide o que o sistema deixa fazer com ele: o que se
   compra, o que se produz, o que ocupa estoque e o que pode ser vendido. */

export const TIPOS_ITEM = [
  { id: 'MATERIA_PRIMA', nome: 'Matéria-prima', compra: true, produz: false, estoca: true,
    ajuda: 'tecido, malha — entra em rolo e sai cortado' },
  { id: 'AVIAMENTO', nome: 'Aviamento', compra: true, produz: false, estoca: true,
    ajuda: 'linha, zíper, botão, elástico, viés' },
  { id: 'INSUMO', nome: 'Insumo', compra: true, produz: false, estoca: true,
    ajuda: 'tinta, emulsão, filme, pó — consumido no beneficiamento' },
  { id: 'MATERIAL_AUXILIAR', nome: 'Material auxiliar', compra: true, produz: false, estoca: true,
    ajuda: 'tela, quadro, agulha — apoia o processo sem entrar na peça' },
  { id: 'EMBALAGEM', nome: 'Embalagem', compra: true, produz: false, estoca: true,
    ajuda: 'saco, caixa, tag, fita' },
  { id: 'COMPONENTE', nome: 'Componente', compra: true, produz: true, estoca: true,
    ajuda: 'parte que tanto se compra pronta quanto se produz' },
  { id: 'SUBPRODUTO', nome: 'Subproduto', compra: false, produz: true, estoca: true,
    ajuda: 'frente cortada, gola preparada, frente estampada' },
  { id: 'PRODUTO_EM_PROCESSO', nome: 'Produto em processo', compra: false, produz: true, estoca: true,
    ajuda: 'peça montada que ainda não passou pelo acabamento' },
  { id: 'PRODUTO_ACABADO', nome: 'Produto acabado', compra: false, produz: true, estoca: true,
    ajuda: 'a peça pronta, que a carteira promete ao cliente' },
];

export const tipoItem = (id) => TIPOS_ITEM.find((t) => t.id === id) || null;
export const ehComprado = (item) => !!(tipoItem(item?.tipo) || {}).compra;
export const ehProduzido = (item) => !!(tipoItem(item?.tipo) || {}).produz;

/* ====================================================== §26 unidades  */

export const UNIDADES = [
  { sigla: 'KG', nome: 'Quilograma', grandeza: 'massa', decimais: 3 },
  { sigla: 'G', nome: 'Grama', grandeza: 'massa', decimais: 1 },
  { sigla: 'M', nome: 'Metro', grandeza: 'comprimento', decimais: 3 },
  { sigla: 'CM', nome: 'Centímetro', grandeza: 'comprimento', decimais: 1 },
  { sigla: 'M2', nome: 'Metro quadrado', grandeza: 'area', decimais: 3 },
  { sigla: 'UN', nome: 'Unidade', grandeza: 'contagem', decimais: 0 },
  { sigla: 'DZ', nome: 'Dúzia', grandeza: 'contagem', decimais: 2 },
  { sigla: 'PAR', nome: 'Par', grandeza: 'contagem', decimais: 0 },
  { sigla: 'ROLO', nome: 'Rolo', grandeza: 'contagem', decimais: 2 },
  { sigla: 'CX', nome: 'Caixa', grandeza: 'contagem', decimais: 0 },
  { sigla: 'L', nome: 'Litro', grandeza: 'volume', decimais: 3 },
  { sigla: 'ML', nome: 'Mililitro', grandeza: 'volume', decimais: 0 },
  { sigla: 'H', nome: 'Hora', grandeza: 'tempo', decimais: 2 },
  { sigla: 'MIN', nome: 'Minuto', grandeza: 'tempo', decimais: 2 },
];

/** Conversões fixas; as do cadastro (1 rolo = 50 m) vêm de db.conversoes. */
const FATORES = { 'KG>G': 1000, 'M>CM': 100, 'L>ML': 1000, 'DZ>UN': 12, 'H>MIN': 60 };

/**
 * Converte quantidade entre unidades. Devolve `null` quando não há caminho —
 * quem chama decide se isso é erro ou se segue com a unidade de origem.
 * Conversão específica de material (1 rolo = 50 m daquele tecido) ganha da
 * geral, porque rolo de tecido não tem metragem universal.
 */
export function converter(quantidade, de, para, conversoes = [], materialId = '') {
  const origem = String(de || '').toUpperCase();
  const destino = String(para || '').toUpperCase();
  if (!origem || !destino || origem === destino) return num(quantidade);

  const doCadastro = (conversoes || []).filter((c) => !c.materialId || c.materialId === materialId);
  const especifica = doCadastro.find((c) => c.materialId === materialId
    && String(c.de).toUpperCase() === origem && String(c.para).toUpperCase() === destino);
  const generica = doCadastro.find((c) => String(c.de).toUpperCase() === origem
    && String(c.para).toUpperCase() === destino);
  const inversa = doCadastro.find((c) => String(c.de).toUpperCase() === destino
    && String(c.para).toUpperCase() === origem);

  if (especifica) return arredondar(num(quantidade) * num(especifica.fator));
  if (generica) return arredondar(num(quantidade) * num(generica.fator));
  if (inversa && num(inversa.fator) !== 0) return arredondar(num(quantidade) / num(inversa.fator));
  if (FATORES[`${origem}>${destino}`]) return arredondar(num(quantidade) * FATORES[`${origem}>${destino}`]);
  if (FATORES[`${destino}>${origem}`]) return arredondar(num(quantidade) / FATORES[`${destino}>${origem}`]);
  return null;
}

/* ================================================ §10 tempos da operação
   Tempo de máquina é a menor parte do dia. Separar os sete tempos é o que
   explica por que 120 minutos de corte viram 285 minutos de corte. */

export const TIPOS_TEMPO = [
  { id: 'preparacao', nome: 'Preparação', base: 'lote', ajuda: 'preparar o tecido, o posto, o material' },
  { id: 'setup', nome: 'Setup', base: 'lote', ajuda: 'regular a máquina, montar a tela, trocar a matriz' },
  { id: 'processamento', nome: 'Processamento', base: 'peca', ajuda: 'a operação em si' },
  { id: 'manuseio', nome: 'Manuseio', base: 'peca', ajuda: 'pegar, virar, empilhar, amarrar' },
  { id: 'inspecao', nome: 'Inspeção', base: 'peca', ajuda: 'conferir a peça ou a amostra' },
  { id: 'movimentacao', nome: 'Movimentação', base: 'lote', ajuda: 'levar o lote ao próximo setor' },
  { id: 'espera', nome: 'Espera', base: 'lote', ajuda: 'secagem, cura, descanso do tecido' },
];

export const tipoTempo = (id) => TIPOS_TEMPO.find((t) => t.id === id) || null;

/** Tempo vazio, com os sete campos — evita `undefined` espalhado na conta. */
export const tempos = (valores = {}) => TIPOS_TEMPO.reduce((acc, t) => {
  acc[t.id] = num(valores[t.id]);
  return acc;
}, {});

/**
 * Minutos que uma operação consome para produzir determinada quantidade.
 *
 * A unidade de trabalho é o CICLO: o enfesto que rende 500 peças, a mesa de
 * silk que estampa 200 por vez, a costureira que faz uma peça por vez
 * (`porCiclo: 1`). Os tempos são declarados por ciclo — é assim que a fábrica
 * cronometra — e o total sai da conta de quantos ciclos a quantidade exige.
 *
 * Por isso o setup de 35 minutos do silk pesa 0,17 min/peça num ciclo de 200 e
 * 35 min/peça num ciclo de uma peça só. O campo `base` de cada tipo de tempo
 * não muda essa conta: ele diz em qual parcela do custo o minuto entra (§43).
 */
export function minutosDaOperacao(operacao, quantidade) {
  const t = tempos(operacao.tempos);
  /* `porCiclo: 0` é a operação que acontece UMA VEZ POR ORDEM, não por ciclo:
     gravar a tela, montar a matriz do bordado, fazer o encaixe no CAD. É ela
     que faz o custo por peça cair quando o lote cresce (§39). */
  const umaVez = num(operacao.porCiclo) === 0;
  const porCiclo = umaVez ? 1 : Math.max(num(operacao.porCiclo) || 1, 1);
  const pessoas = Math.max(num(operacao.pessoas) || 1, 1);
  const ciclos = num(quantidade) > 0
    ? (umaVez ? 1 : Math.ceil(num(quantidade) / porCiclo))
    : 0;

  const porTipo = {};
  let somaCiclo = 0;
  for (const def of TIPOS_TEMPO) {
    const minutos = num(t[def.id]) * pessoas;
    somaCiclo += minutos;
    porTipo[def.id] = arredondar(minutos * ciclos, 3);
  }
  const total = arredondar(somaCiclo * ciclos, 3);
  return {
    ciclos,
    porCiclo: arredondar(somaCiclo, 3),
    porTipo,
    total,
    porUnidade: num(quantidade) > 0 ? arredondar(total / num(quantidade), 6) : 0,
  };
}

/* ================================================ §22 perdas e §23 sobras */

export const MOTIVOS_PERDA = [
  { id: 'retalho', nome: 'Retalho de encaixe', esperada: true },
  { id: 'erro_corte', nome: 'Erro de corte', esperada: false },
  { id: 'erro_estampa', nome: 'Erro de estampa', esperada: false },
  { id: 'defeito_material', nome: 'Defeito do material', esperada: false },
  { id: 'mancha', nome: 'Mancha', esperada: false },
  { id: 'furo', nome: 'Furo', esperada: false },
  { id: 'quebra', nome: 'Quebra de máquina', esperada: false },
  { id: 'retrabalho', nome: 'Retrabalho', esperada: false },
  { id: 'erro_operacional', nome: 'Erro operacional', esperada: false },
  { id: 'teste', nome: 'Teste e acerto', esperada: true },
];

export const motivoPerda = (id) => MOTIVOS_PERDA.find((m) => m.id === id) || null;

export const TIPOS_RETALHO = [
  { id: 'aproveitavel', nome: 'Retalho aproveitável', reaproveita: true },
  { id: 'nao_aproveitavel', nome: 'Retalho não aproveitável', reaproveita: false },
];

/* ====================================== §47 alertas do módulo industrial */

export const ALERTAS = [
  { id: 'material_insuficiente', tom: 'bad', nome: 'Material insuficiente' },
  { id: 'componente_faltante', tom: 'bad', nome: 'Componente faltante' },
  { id: 'gargalo', tom: 'bad', nome: 'Gargalo de capacidade' },
  { id: 'prazo_risco', tom: 'bad', nome: 'Prazo em risco' },
  { id: 'custo_acima', tom: 'bad', nome: 'Custo acima do budget' },
  { id: 'perda_acima', tom: 'bad', nome: 'Perda acima do padrão' },
  { id: 'eficiencia_abaixo', tom: 'bad', nome: 'Eficiência abaixo do padrão' },
  { id: 'estoque_minimo', tom: 'warn', nome: 'Estoque abaixo do mínimo' },
  { id: 'liberado', tom: 'ok', nome: 'Processo liberado' },
];

export const alerta = (id, mensagem, dados = {}) => {
  const def = ALERTAS.find((a) => a.id === id);
  return { id, tom: def ? def.tom : 'idle', titulo: def ? def.nome : id, mensagem, ...dados };
};

/* =============================================== situações e sequências */

export const STATUS_CARTEIRA = ['aberta', 'planejada', 'em_producao', 'concluida', 'cancelada'];
/* V2 §52 — a ordem passa por reserva antes de ser liberada */
export const STATUS_ORDEM = ['planejada', 'reservada', 'liberada', 'em_execucao', 'parcial',
  'concluida', 'cancelada'];
export const STATUS_DEMANDA = ['aberta', 'atendida_parcial', 'atendida', 'cancelada'];

/* V2 §5 — a leitura do MRP linha a linha */
export const STATUS_MRP = [
  { id: 'ok', nome: 'OK', tom: 'ok', ajuda: 'o estoque disponível cobre a necessidade' },
  { id: 'estoque_insuficiente', nome: 'Estoque insuficiente', tom: 'warn',
    ajuda: 'existe material, mas parte dele está reservada para outra ordem' },
  { id: 'compra_necessaria', nome: 'Compra necessária', tom: 'bad',
    ajuda: 'falta material e não há requisição nem pedido' },
  { id: 'compra_programada', nome: 'Compra programada', tom: 'info',
    ajuda: 'já existe requisição ou pedido cobrindo a falta' },
  { id: 'abaixo_minimo', nome: 'Abaixo do mínimo', tom: 'warn',
    ajuda: 'o saldo ficaria abaixo do estoque mínimo do cadastro' },
  { id: 'bloqueado', nome: 'Bloqueado', tom: 'bad', ajuda: 'material inativo ou sem custo' },
];
export const statusMrp = (id) => STATUS_MRP.find((s) => s.id === id) || STATUS_MRP[0];

/* V2 §7 — o caminho de uma requisição até o material na prateleira */
export const STATUS_REQUISICAO = ['pendente', 'aprovada', 'cotando', 'pedida', 'parcial',
  'recebida', 'cancelada'];
export const STATUS_PEDIDO = ['aberto', 'enviado', 'parcial', 'recebido', 'cancelado'];

/* V2 §6 — uma reserva vive até ser consumida ou devolvida */
export const STATUS_RESERVA = ['ativa', 'consumida', 'cancelada'];

/* V2 §16 — o que pode acontecer com um subproduto */
export const STATUS_SUBPRODUTO = ['em_processo', 'disponivel', 'reservado', 'consumido',
  'bloqueado', 'perdido'];

/* V2 §24 — por que o realizado passou do planejado */
export const MOTIVOS_DESVIO = [
  { id: 'tempo_acima', nome: 'Tempo acima do padrão' },
  { id: 'perda_acima', nome: 'Perda acima do padrão' },
  { id: 'retrabalho', nome: 'Retrabalho' },
  { id: 'material_mais_caro', nome: 'Material mais caro' },
  { id: 'consumo_acima', nome: 'Consumo acima do padrão' },
  { id: 'maquina_ociosa', nome: 'Máquina ociosa' },
  { id: 'setup_excessivo', nome: 'Setup excessivo' },
  { id: 'espera', nome: 'Espera' },
  { id: 'falta_material', nome: 'Falta de material' },
  { id: 'manual', nome: 'Informado pelo usuário' },
];

/* ======================================================== §41 coleções */

/** As coleções novas do módulo. O resto continua sendo do sistema. */
export function estadoIndustrial() {
  return {
    itens: [],            // §4/§5 — tudo o que tem código, tipo e custo
    estruturas: [],       // §4 — BOM multinível: item pai → componentes
    transformacoes: [],   // §45 — receita: entradas + operações → saídas
    carteira: [],         // §2 — linhas de carteira de produção
    consolidacoes: [],    // §2 — a carteira consolidada por produto
    demandas: [],         // §24 — o que cada departamento precisa produzir
    ordens: [],           // §34 — OP por processo, com dependência
    execucoes: [],        // §36/§45 — transformação realizada (o apontamento)
    lotes: [],            // §11 — cada lote e sua origem
    estoques: [],         // §18 — saldo por item, local e lote
    movimentos: [],       // §18 — todo movimento entre processos
    perdas: [],           // §22
    retalhos: [],         // §23
    budgets: [],          // §3/§38
    rastros: [],          // §32 — ligação entre lote de origem e lote gerado
    /* ---- V2 ---- */
    reservas: [],             // V2 §6 — material comprometido com uma ordem
    requisicoesCompra: [],    // V2 §7 — o que o MRP pediu para comprar
    pedidosCompra: [],        // V2 §7 — o pedido colocado no fornecedor
    recebimentosCompra: [],   // V2 §7 — o que chegou, total ou parcial
    auditorias: [],           // V2 §33 — o resultado de cada auditoria rodada
    parametros: parametrosPadrao(),
    versao: 3,
  };
}

/** §25/§37 — os números que o cálculo usa quando a fábrica não informou outro. */
export function parametrosPadrao() {
  return {
    estoqueSegurancaDias: 5,        // §25 cobertura mínima
    eficienciaPadrao: 85,           // §27 % da capacidade teórica
    perdaPadraoCorte: 4,            // §22 % de retalho esperado no encaixe
    custoEnergiaHoraMaquina: 3.2,   // §43 R$/hora de máquina ligada
    custoMaquinaHora: 4.5,          // §43 depreciação e manutenção, R$/hora
    diasUteisMes: 22,
    horasDia: 8.8,                  // jornada produtiva padrão (06:00–15:48)
    /* ---- V2 ---- */
    leadTimePadraoDias: 10,         // V2 §8 quando o material não diz o seu
    prazoPagamentoPadraoDias: 28,   // V2 §4.4 quando o fornecedor não diz
    reservarAoAbrirOrdem: true,     // V2 §52 a ordem reserva ao ser planejada
    perdaDesvioAlerta: 30,          // V2 §15 % acima da perda planejada que alerta
    tempoDesvioAlerta: 10,          // V2 §24 % acima do tempo padrão que alerta
  };
}

/** Garante as coleções sem apagar o que já existe — roda a cada carga. */
export function prepararIndustrial(db) {
  const modelo = estadoIndustrial();
  db.industrial = db.industrial || {};
  for (const chave of Object.keys(modelo)) {
    if (chave === 'parametros') {
      db.industrial.parametros = { ...modelo.parametros, ...(db.industrial.parametros || {}) };
      continue;
    }
    /* a versão é da migração, não daqui: marcá-la aqui esconderia uma base v1 */
    if (chave === 'versao') continue;
    if (!Array.isArray(db.industrial[chave])) db.industrial[chave] = modelo[chave];
  }
  return db;
}

/**
 * V2 §42 — migração.
 *
 * Roda a cada carga, e é feita para ser burra de propósito: acrescenta o que
 * falta e não toca no que existe. Nenhuma ordem some, nenhum lote muda de
 * custo, nenhum histórico é reescrito — só aparecem campos novos com valor
 * neutro, para o código novo não ter de perguntar `if (existe)` em toda linha.
 */
export function migrarIndustrialV2(db) {
  prepararIndustrial(db);
  const ind = db.industrial;
  const antes = num(ind.versao) || 1;
  const feitas = [];

  /* 1. equipamentos ganham os campos de custo hora (V2 §9), zerados: quem não
        preencher continua caindo no parâmetro geral da fábrica */
  let equipamentos = 0;
  for (const eq of db.equipamentos || []) {
    if (eq.custoHoraDetalhado !== undefined) continue;
    Object.assign(eq, {
      custoAquisicao: num(eq.custoAquisicao),
      vidaUtilMeses: num(eq.vidaUtilMeses),
      valorResidual: num(eq.valorResidual),
      manutencaoMensal: num(eq.manutencaoMensal),
      energiaHora: num(eq.energiaHora),
      outrosCustosMensais: num(eq.outrosCustosMensais),
      horasDisponiveisMes: num(eq.horasDisponiveisMes),
      custoHoraDetalhado: false,
    });
    equipamentos += 1;
  }
  if (equipamentos) feitas.push(`${equipamentos} equipamento(s) com campos de custo hora`);

  /* 2. colaboradores ganham benefícios e provisões (V2 §10), também zerados */
  let pessoas = 0;
  for (const c of db.colaboradores || []) {
    if (c.beneficiosMensais !== undefined) continue;
    c.beneficiosMensais = num(c.beneficiosMensais);
    c.outrosCustosMensais = num(c.outrosCustosMensais);
    pessoas += 1;
  }
  if (pessoas) feitas.push(`${pessoas} colaborador(es) com benefícios e outros custos`);

  /* 3. itens produzidos ganham situação (V2 §16) */
  let itens = 0;
  for (const i of ind.itens || []) {
    if (i.situacao !== undefined) continue;
    i.situacao = 'disponivel';
    itens += 1;
  }
  if (itens) feitas.push(`${itens} item(ns) com situação`);

  /* 4. ordens de processo ganham os campos do fluxo novo (V2 §52) */
  let ordens = 0;
  for (const o of ind.ordens || []) {
    if (o.reservaFeita !== undefined) continue;
    o.reservaFeita = false;
    o.motivoCancelamento = o.motivoCancelamento || '';
    ordens += 1;
  }
  if (ordens) feitas.push(`${ordens} ordem(ns) de processo com controle de reserva`);

  /* 5. execuções antigas: a parcela de material do almoxarifado passou a ser
        separada da que veio do processo. Onde não existir, a conta antiga
        continua valendo — não se reescreve custo histórico (V2 §32/§53). */
  let execucoes = 0;
  for (const e of ind.execucoes || []) {
    if (!e.custos || e.custos.materialAlmoxarifado !== undefined) continue;
    e.custos.materialAlmoxarifado = num(e.custos.material);
    e.custos.materialProcesso = 0;
    e.custos.migradoV2 = true;
    execucoes += 1;
  }
  if (execucoes) feitas.push(`${execucoes} execução(ões) com material separado por origem`);

  ind.parametros = { ...parametrosPadrao(), ...(ind.parametros || {}) };
  ind.versao = 2;
  if (antes < 2 && feitas.length) {
    registrarHistorico(db, {
      tipo: 'migracao', usuario: 'Sistema',
      valorAnterior: `versão ${antes}`, valorNovo: 'versão 2',
      motivo: feitas.join(' · '),
    });
  }
  return { de: antes, para: 2, feitas };
}

/**
 * V3 §34 — migração para a versão 3. Só acrescenta: o lote antigo ganha o
 * saldo e o material a que pertence, para entrar na fila FIFO sem que nenhum
 * número histórico mude. Roda quantas vezes quiser.
 */
export function migrarIndustrialV3(db) {
  migrarIndustrialV2(db);
  const ind = db.industrial;
  const antes = num(ind.versao) || 2;
  const feitas = [];

  /* 1. lotes ganham saldo e vínculo com o material do almoxarifado */
  let lotes = 0;
  for (const l of ind.lotes || []) {
    if (l.saldo !== undefined && l.materialId !== undefined) continue;
    if (l.materialId === undefined) {
      const it = (ind.itens || []).find((i) => i.id === l.itemId);
      l.materialId = it ? it.materialId || '' : '';
    }
    if (l.saldo === undefined) l.saldo = l.origem === 'compra' ? num(l.quantidade) : 0;
    l.movimentoId = l.movimentoId || '';
    l.fornecedorId = l.fornecedorId || '';
    l.documento = l.documento || '';
    lotes += 1;
  }
  if (lotes) feitas.push(`${lotes} lote(s) com saldo e material vinculados`);

  /* 2. o que já estava no almoxarifado vira lote de abertura: sem isso o
        primeiro consumo sairia sem rastro nenhum, e o indicador de integração
        acusaria uma cadeia partida que na verdade é saldo herdado */
  let aberturas = 0;
  for (const saldo of db.saldos || []) {
    if (!(num(saldo.fisico) > 0)) continue;
    const material = (db.materiais || []).find((m) => m.id === saldo.materialId);
    if (!material) continue;
    const jaTem = (ind.lotes || []).some((l) => l.materialId === saldo.materialId);
    if (jaTem) continue;
    const r = novoLote(db, {
      prefixo: 'LA',
      materialId: material.id,
      quantidade: num(saldo.fisico),
      saldo: num(saldo.fisico),
      unidade: material.unidadeEstoque,
      origem: 'ajuste',
      documento: 'Saldo de abertura',
      custoUnitario: num(material.custoMedio),
      data: hojeISO(),
    });
    if (!r.erro) aberturas += 1;
  }
  if (aberturas) feitas.push(`${aberturas} lote(s) de saldo de abertura`);

  /* 3. consumos antigos ganham a lista de lotes, vazia: não se inventa rastro
        que não foi registrado na época (§34 — nunca apagar histórico) */
  let consumos = 0;
  for (const e of ind.execucoes || []) {
    for (const c of e.consumos || []) {
      if (c.lotes !== undefined) continue;
      c.lotes = c.loteId ? [{ loteId: c.loteId, quantidade: num(c.quantidade) }] : [];
      consumos += 1;
    }
  }
  if (consumos) feitas.push(`${consumos} consumo(s) com lista de lotes`);

  ind.versao = 3;
  if (antes < 3 && feitas.length) {
    registrarHistorico(db, {
      tipo: 'migracao', usuario: 'Sistema',
      valorAnterior: `versão ${antes}`, valorNovo: 'versão 3',
      motivo: feitas.join(' · '),
    });
  }
  return { de: antes, para: 3, feitas };
}

/* =================================================== fábricas de registro
   Cada função devolve `{registro}` ou `{erro}`: o módulo nunca lança para
   erro de preenchimento, porque a tela precisa mostrar a frase. */

/** §4/§5 — um item. Matéria-prima aponta para o material do almoxarifado. */
export function novoItem(db, dados) {
  const nome = String(dados.nome || '').trim();
  if (!nome) return { erro: 'Dê um nome ao item.' };
  if (!tipoItem(dados.tipo)) return { erro: `Tipo de item inválido: ${dados.tipo}` };

  const material = dados.materialId
    ? (db.materiais || []).find((m) => m.id === dados.materialId)
    : null;
  if (dados.materialId && !material) return { erro: 'Material do almoxarifado não encontrado.' };

  const registro = {
    id: uid(),
    codigo: dados.codigo || proximoCodigo(db.industrial.itens, 'ITM', 5),
    nome,
    descricao: String(dados.descricao || '').trim(),
    tipo: dados.tipo,
    /* matéria-prima, aviamento e embalagem vivem no almoxarifado que já
       existe; subproduto e produto acabado nascem aqui */
    materialId: material ? material.id : '',
    unidade: String(dados.unidade || (material ? material.unidadeEstoque : 'UN')).toUpperCase(),
    perdaPadrao: num(dados.perdaPadrao),
    estoqueMinimo: num(dados.estoqueMinimo ?? (material ? material.estoqueMinimo : 0)),
    custoPadrao: num(dados.custoPadrao ?? (material ? material.custoMedio : 0)),
    fornecedorId: dados.fornecedorId || (material ? material.fornecedorPadraoId : '') || '',
    departamentoId: dados.departamentoId || '',   // onde nasce, quando é produzido
    produtoId: dados.produtoId || '',             // liga ao produto do sistema, quando é acabado
    controlaLote: dados.controlaLote !== false,
    ativo: dados.ativo !== false,
    criadoEm: agoraISO(),
  };
  db.industrial.itens.push(registro);
  return { registro };
}

/** §4 — estrutura (BOM) de um item: o que ele leva para existir. */
export function novaEstrutura(db, dados) {
  const pai = (db.industrial.itens || []).find((i) => i.id === dados.itemId);
  if (!pai) return { erro: 'Item da estrutura não encontrado.' };
  if (!ehProduzido(pai)) return { erro: `${pai.nome} é um item comprado — estrutura é de item produzido.` };

  const componentes = [];
  for (const c of dados.componentes || []) {
    const filho = (db.industrial.itens || []).find((i) => i.id === c.itemId);
    if (!filho) return { erro: `Componente não encontrado na estrutura de ${pai.nome}.` };
    if (filho.id === pai.id) return { erro: `${pai.nome} não pode ser componente de si mesmo.` };
    if (!(num(c.quantidade) > 0)) return { erro: `Informe o consumo de ${filho.nome}.` };
    componentes.push({
      id: uid(),
      itemId: filho.id,
      quantidade: num(c.quantidade),
      unidade: String(c.unidade || filho.unidade).toUpperCase(),
      perda: num(c.perda ?? filho.perdaPadrao),
      observacao: String(c.observacao || '').trim(),
    });
  }
  if (componentes.length === 0) return { erro: `A estrutura de ${pai.nome} está vazia.` };

  const anterior = (db.industrial.estruturas || []).find((e) => e.itemId === pai.id && e.ativa);
  if (anterior) anterior.ativa = false;

  const registro = {
    id: uid(),
    codigo: proximoCodigo(db.industrial.estruturas, 'BOM'),
    itemId: pai.id,
    versao: anterior ? num(anterior.versao) + 1 : 1,
    componentes,
    ativa: true,
    criadaEm: agoraISO(),
    motivo: String(dados.motivo || '').trim(),
  };
  db.industrial.estruturas.push(registro);
  return { registro };
}

export const estruturaDe = (db, itemId) =>
  (db.industrial.estruturas || []).find((e) => e.itemId === itemId && e.ativa) || null;

/**
 * §45 — a receita de transformação: o que entra, o que sai, em que setor,
 * com quais tempos. É ela que faz o corte entregar frente e manga em vez de
 * "dar baixa de tecido".
 */
export function novaTransformacao(db, dados) {
  const departamento = (db.departamentos || []).find((d) => d.id === dados.departamentoId);
  if (!departamento) return { erro: 'Escolha o departamento da transformação.' };

  const achar = (id) => (db.industrial.itens || []).find((i) => i.id === id);
  const entradas = [];
  for (const e of dados.entradas || []) {
    const item = achar(e.itemId);
    if (!item) return { erro: 'Item de entrada não encontrado.' };
    if (!(num(e.quantidade) > 0)) return { erro: `Informe o consumo de ${item.nome}.` };
    entradas.push({
      id: uid(), itemId: item.id, quantidade: num(e.quantidade),
      unidade: String(e.unidade || item.unidade).toUpperCase(),
      perda: num(e.perda ?? item.perdaPadrao),
    });
  }
  const saidas = [];
  for (const s of dados.saidas || []) {
    const item = achar(s.itemId);
    if (!item) return { erro: 'Item de saída não encontrado.' };
    if (!(num(s.quantidade) > 0)) return { erro: `Informe quanto sai de ${item.nome}.` };
    saidas.push({
      id: uid(), itemId: item.id, quantidade: num(s.quantidade),
      unidade: String(s.unidade || item.unidade).toUpperCase(),
      principal: !!s.principal,
    });
  }
  if (entradas.length === 0) return { erro: 'A transformação precisa de pelo menos uma entrada.' };
  if (saidas.length === 0) return { erro: 'A transformação precisa de pelo menos uma saída.' };
  if (!saidas.some((s) => s.principal)) saidas[0].principal = true;

  const operacoes = (dados.operacoes || []).map((o, i) => ({
    id: uid(),
    sequencia: (i + 1) * 10,
    nome: String(o.nome || '').trim() || `Operação ${i + 1}`,
    etapaId: o.etapaId || '',
    equipamentoId: o.equipamentoId || '',
    pessoas: Math.max(num(o.pessoas) || 1, 1),
    tempos: tempos(o.tempos),
    /* §17 — quantas peças o posto entrega por ciclo, quando não é uma a uma.
       Zero é reservado para a operação que acontece uma vez por ordem
       (gravar a tela, montar a matriz), e por isso não vira 1 aqui. */
    porCiclo: num(o.porCiclo) === 0 ? 0 : Math.max(num(o.porCiclo) || 1, 1),
  }));
  if (operacoes.length === 0) return { erro: 'Informe ao menos uma operação com tempo.' };

  const registro = {
    id: uid(),
    codigo: proximoCodigo(db.industrial.transformacoes, 'TRF'),
    nome: String(dados.nome || '').trim() || `${departamento.nome}: ${saidas[0] ? achar(saidas[0].itemId).nome : ''}`,
    departamentoId: departamento.id,
    tipo: dados.tipo || 'transformacao',   // transformacao | beneficiamento | montagem
    /* o lote técnico da receita: o encaixe rende 1 enfesto por vez */
    lotePadrao: Math.max(num(dados.lotePadrao) || 1, 1),
    entradas,
    saidas,
    operacoes,
    observacao: String(dados.observacao || '').trim(),
    ativa: dados.ativa !== false,
    criadaEm: agoraISO(),
  };
  db.industrial.transformacoes.push(registro);
  return { registro };
}

/** A transformação ativa que produz determinado item. */
export const transformacaoQueProduz = (db, itemId) =>
  (db.industrial.transformacoes || []).find(
    (t) => t.ativa !== false && (t.saidas || []).some((s) => s.itemId === itemId)
  ) || null;

/** §2 — uma linha de carteira de produção. */
export function novaLinhaCarteira(db, dados) {
  const item = (db.industrial.itens || []).find((i) => i.id === dados.itemId);
  if (!item) return { erro: 'Escolha o produto da carteira.' };
  if (item.tipo !== 'PRODUTO_ACABADO') return { erro: `${item.nome} não é produto acabado.` };
  if (!(num(dados.quantidade) > 0)) return { erro: 'Informe a quantidade do pedido.' };
  const cliente = dados.clienteId ? (db.clientes || []).find((c) => c.id === dados.clienteId) : null;
  if (dados.clienteId && !cliente) return { erro: 'Cliente não encontrado.' };

  const registro = {
    id: uid(),
    codigo: proximoCodigo(db.industrial.carteira, 'CART'),
    clienteId: cliente ? cliente.id : '',
    pedido: String(dados.pedido || '').trim(),
    itemId: item.id,
    sku: String(dados.sku || item.codigo).trim(),
    quantidade: num(dados.quantidade),
    dataPedido: dados.dataPedido || hojeISO(),
    dataPrometida: dados.dataPrometida || '',
    prioridade: num(dados.prioridade) || 5,
    status: 'aberta',
    responsavelId: dados.responsavelId || '',
    centroCustoId: dados.centroCustoId || '',
    linhaProducao: String(dados.linhaProducao || '').trim(),
    loteId: '',
    observacao: String(dados.observacao || '').trim(),
    consolidacaoId: '',
    criadaEm: agoraISO(),
  };
  db.industrial.carteira.push(registro);
  return { registro };
}

/** §11/§32 — lote: a identidade que atravessa a fábrica inteira. */
export function novoLote(db, dados) {
  const item = (db.industrial.itens || []).find((i) => i.id === dados.itemId)
    || (dados.materialId
      ? (db.industrial.itens || []).find((i) => i.materialId === dados.materialId)
      : null);
  /* V3 §13 — o rolo que chega da compra também é um lote. Quando o material
     ainda não tem item de engenharia, o lote nasce preso ao material: é ele
     que sustenta o rastro até a nota fiscal. */
  if (!item && !dados.materialId) return { erro: 'Item do lote não encontrado.' };
  const ano = (dados.data || hojeISO()).slice(0, 4);
  const doAno = (db.industrial.lotes || []).filter((l) => String(l.codigo).includes(`-${ano}-`));
  const quantidade = num(dados.quantidade);
  const registro = {
    id: uid(),
    codigo: `${dados.prefixo || 'LT'}-${ano}-${String(doAno.length + 1).padStart(4, '0')}`,
    itemId: item ? item.id : '',
    materialId: dados.materialId || (item ? item.materialId || '' : ''),
    quantidade,
    saldo: dados.saldo === undefined ? quantidade : num(dados.saldo),
    origem: dados.origem || 'producao',     // compra | producao | ajuste
    origemId: dados.origemId || '',
    execucaoId: dados.execucaoId || '',
    consolidacaoId: dados.consolidacaoId || '',
    movimentoId: dados.movimentoId || '',
    fornecedorId: dados.fornecedorId || '',
    documento: String(dados.documento || '').trim(),
    unidade: dados.unidade || (item ? item.unidade : ''),
    custoUnitario: num(dados.custoUnitario),
    data: dados.data || hojeISO(),
    criadoEm: agoraISO(),
  };
  db.industrial.lotes.push(registro);
  return { registro };
}

/**
 * V3 §26 — os lotes de compra de um material, na ordem em que chegaram, com
 * saldo ainda por consumir. É a fila que dá FIFO ao almoxarifado.
 */
export function lotesDeCompraDisponiveis(db, materialId) {
  /* o saldo de abertura entra na fila junto com a compra: é material que
     existe de verdade no almoxarifado, só sem nota fiscal para mostrar */
  return (db.industrial?.lotes || [])
    .filter((l) => ['compra', 'ajuste'].includes(l.origem)
      && l.materialId === materialId && num(l.saldo) > 0.0001)
    .sort((a, b) => String(a.data || a.criadoEm).localeCompare(String(b.data || b.criadoEm))
      || String(a.criadoEm).localeCompare(String(b.criadoEm)));
}

/* ====================================== §18 estoque entre processos
   Cada departamento tem o seu estoque. A frente cortada não some entre o
   corte e o silk: ela fica no estoque do corte esperando quem a busque. */

export const localDoDepartamento = (departamento) =>
  departamento ? `EST-${String(departamento.sigla || departamento.nome).toUpperCase().slice(0, 6)}` : 'EST-GERAL';

export function saldoDeProcesso(db, itemId, local, loteId = '') {
  return (db.industrial.estoques || []).find(
    (s) => s.itemId === itemId && s.local === local && (loteId ? s.loteId === loteId : !s.loteId)
  ) || null;
}

/** Soma tudo o que existe de um item em determinado local, em todos os lotes. */
export function disponivelEmProcesso(db, itemId, local = null) {
  return arredondar((db.industrial.estoques || [])
    .filter((s) => s.itemId === itemId && (local ? s.local === local : true))
    .reduce((soma, s) => soma + num(s.quantidade), 0));
}

/**
 * Movimento no estoque de processo. Não existe "corrigir o saldo": o saldo é
 * o acumulado dos movimentos, como no almoxarifado do sistema (§52).
 */
export function moverProcesso(db, dados, usuario) {
  const item = (db.industrial.itens || []).find((i) => i.id === dados.itemId);
  if (!item) return { erro: 'Item do movimento não encontrado.' };
  const quantidade = num(dados.quantidade);
  if (!(quantidade > 0)) return { erro: 'Quantidade inválida.' };
  const sinal = dados.sentido === 'saida' ? -1 : 1;
  const local = dados.local || 'EST-GERAL';
  const loteId = dados.loteId || '';

  if (sinal < 0) {
    const disponivel = num((saldoDeProcesso(db, item.id, local, loteId) || {}).quantidade);
    if (quantidade > disponivel + 0.0001) {
      return {
        erro: `Disponível em ${local}: ${arredondar(disponivel, 3)} ${item.unidade} de ${item.nome}. `
          + `A saída de ${arredondar(quantidade, 3)} deixaria o saldo negativo.`,
        disponivel,
      };
    }
  }

  const movimento = {
    id: uid(),
    codigo: proximoCodigo(db.industrial.movimentos, 'MVP', 5),
    quando: agoraISO(),
    data: dados.data || hojeISO(),
    itemId: item.id,
    local,
    loteId,
    sentido: sinal < 0 ? 'saida' : 'entrada',
    quantidade,
    unidade: item.unidade,
    custoUnitario: num(dados.custoUnitario),
    custoTotal: arredondar(num(dados.custoUnitario) * quantidade, 4),
    origemTipo: dados.origemTipo || 'manual',   // execucao | demanda | transferencia | manual
    origemId: dados.origemId || '',
    destino: dados.destino || '',
    motivo: String(dados.motivo || '').trim(),
    usuario: usuario ? usuario.nome : '',
  };
  db.industrial.movimentos.push(movimento);

  const saldo = saldoDeProcesso(db, item.id, local, loteId);
  if (saldo) {
    saldo.quantidade = arredondar(num(saldo.quantidade) + sinal * quantidade);
    saldo.custoUnitario = movimento.custoUnitario || saldo.custoUnitario;
    saldo.atualizadoEm = agoraISO();
  } else {
    db.industrial.estoques.push({
      id: uid(),
      itemId: item.id,
      local,
      loteId,
      quantidade: arredondar(sinal * quantidade),
      unidade: item.unidade,
      custoUnitario: movimento.custoUnitario,
      status: 'disponivel',
      atualizadoEm: agoraISO(),
    });
  }
  return { movimento };
}

/** Refaz os saldos de processo a partir dos movimentos — auditoria da regra. */
export function recalcularEstoquesProcesso(db) {
  const antes = (db.industrial.estoques || []).map((s) => ({ ...s }));
  const mapa = new Map();
  for (const m of db.industrial.movimentos || []) {
    const chave = `${m.itemId}|${m.local}|${m.loteId || ''}`;
    const atual = mapa.get(chave) || {
      id: uid(), itemId: m.itemId, local: m.local, loteId: m.loteId || '',
      quantidade: 0, unidade: m.unidade, custoUnitario: 0, status: 'disponivel',
    };
    atual.quantidade = arredondar(atual.quantidade + (m.sentido === 'saida' ? -1 : 1) * num(m.quantidade));
    if (m.sentido === 'entrada' && num(m.custoUnitario) > 0) atual.custoUnitario = num(m.custoUnitario);
    mapa.set(chave, atual);
  }
  db.industrial.estoques = [...mapa.values()];
  const divergencias = [];
  for (const a of antes) {
    const novo = db.industrial.estoques.find(
      (s) => s.itemId === a.itemId && s.local === a.local && (s.loteId || '') === (a.loteId || '')
    );
    const depois = novo ? num(novo.quantidade) : 0;
    if (Math.abs(depois - num(a.quantidade)) > 0.0001) {
      divergencias.push({ itemId: a.itemId, local: a.local, antes: num(a.quantidade), depois });
    }
  }
  return divergencias;
}

/* ============================================================ §52 histórico */

export function registrarHistorico(db, dados) {
  db.industrial.rastros = db.industrial.rastros || [];
  const registro = {
    id: uid(),
    quando: agoraISO(),
    tipo: dados.tipo,               // transformacao | correcao | liberacao | plano
    origemLoteId: dados.origemLoteId || '',
    destinoLoteId: dados.destinoLoteId || '',
    execucaoId: dados.execucaoId || '',
    itemId: dados.itemId || '',
    quantidade: num(dados.quantidade),
    usuario: dados.usuario || '',
    valorAnterior: dados.valorAnterior ?? null,
    valorNovo: dados.valorNovo ?? null,
    motivo: String(dados.motivo || '').trim(),
  };
  db.industrial.rastros.push(registro);
  return registro;
}

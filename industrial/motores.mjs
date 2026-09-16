/**
 * MÓDULO INDUSTRIAL — motores de cálculo
 *
 * Cinco contas sustentam o módulo, e todas são funções puras sobre a base:
 *
 *   explodirBOM        §44  o que a carteira exige, nível a nível
 *   calcularMRP        §25  o que falta comprar, depois do estoque e do que já vem
 *   calcularCapacidade §27  quantos minutos cada setor precisa e quantos tem
 *   calcularBudget     §3   quanto a carteira custa antes de começar
 *   custearExecucao    §43  quanto custou de verdade, quando terminou
 *
 * O que separa este módulo de um controle de ordem de produção é a explosão
 * entender COPRODUTO: um enfesto de corte entrega frente, costas, manga e
 * gola no mesmo golpe. Explodir cada componente por conta própria multiplicaria
 * o tecido por quatro. Aqui a conta é ao contrário — quantas vezes o corte
 * precisa rodar para o componente mais exigente, e o resto sai junto.
 */

import {
  num, arredondar, uid, agoraISO, hojeISO, proximoCodigo, statusMrp,
  tipoItem, ehProduzido, minutosDaOperacao, tempos, TIPOS_TEMPO,
  transformacaoQueProduz, estruturaDe, disponivelEmProcesso, moverProcesso,
  localDoDepartamento, novoLote, registrarHistorico, alerta, motivoPerda,
} from './modelo.mjs';
import { disponivelParaOrdem, consumoDaReserva } from './reservas.mjs';
import { entradasProgramadasDe, dataLimiteDeCompra } from './compras.mjs';

/* ===================================================== apoio da fábrica */

const item = (db, id) => (db.industrial.itens || []).find((i) => i.id === id) || null;
const departamento = (db, id) => (db.departamentos || []).find((d) => d.id === id) || null;

/** Minutos produtivos de um dia de trabalho, da jornada cadastrada. */
export function minutosDoDia(db) {
  const j = db.jornada;
  if (!j) return num((db.industrial.parametros || {}).horasDia) * 60 || 480;
  const emMinutos = (h) => {
    const [hh, mm] = String(h || '0:0').split(':');
    return num(hh) * 60 + num(mm);
  };
  const bruto = Math.max(emMinutos(j.fim) - emMinutos(j.inicio), 0);
  const pausas = (j.intervalos || []).reduce((s, i) => s + Math.max(emMinutos(i.fim) - emMinutos(i.inicio), 0), 0);
  return Math.max(bruto - pausas, 0);
}

/**
 * §43 — o custo do minuto de um setor: folha da equipe com encargos e
 * vale-transporte, dividida pelos minutos que o setor realmente produz.
 * Setor sem gente cadastrada cai na média da fábrica, para a conta não zerar.
 */
export function custoMinutoDepartamento(db, departamentoId) {
  const par = db.parametrosMaoDeObra || {};
  const encargos = num(par.encargos) || 80;
  const dias = num(par.diasUteis) || num((db.industrial.parametros || {}).diasUteisMes) || 22;
  const minutosMes = minutosDoDia(db) * dias;
  const equipe = (db.colaboradores || []).filter(
    (c) => c.status !== 'Inativo' && num(c.salario) > 0
      && (departamentoId ? c.departamentoId === departamentoId : !!c.departamentoId)
  );
  const base = equipe.length
    ? equipe
    : (db.colaboradores || []).filter((c) => c.status !== 'Inativo' && num(c.salario) > 0 && c.departamentoId);
  if (base.length === 0 || minutosMes === 0) return { custoMinuto: 0, pessoas: 0, vazio: true };

  const media = base.reduce((s, c) => s + num(c.salario), 0) / base.length;
  const comEncargos = media * (1 + encargos / 100);
  const vt = base.reduce((s, c) => {
    if (!c.usaConducao) return s;
    const mensal = num(c.conducoesDia) * num(c.valorConducao) * (num(c.diasConducao) || dias);
    const teto = num(c.salario) * 0.06;
    return s + Math.max(mensal - Math.min(mensal, teto), 0);
  }, 0) / base.length;

  /* V2 §10 — benefícios e outros custos cadastrados entram por fora do
     percentual de encargos, que já cobre férias, 13º e FGTS. Somar os dois
     como "encargos" seria contar a mesma provisão duas vezes. */
  const beneficios = base.reduce(
    (s, c) => s + num(c.beneficiosMensais) + num(c.outrosCustosMensais), 0) / base.length;

  const folha = comEncargos + vt + beneficios;
  return {
    pessoas: equipe.length,
    media: arredondar(media, 2),
    encargos,
    beneficios: arredondar(beneficios, 2),
    vtMedio: arredondar(vt, 2),
    folhaPorPessoa: arredondar(folha, 2),
    minutosMes,
    custoMinuto: arredondar(folha / minutosMes, 5),
    custoHora: arredondar((folha / minutosMes) * 60, 2),
    vazio: equipe.length === 0,
  };
}

/** V2 §10 — o custo do minuto de uma pessoa, quando se quer o número dela. */
export function custoMinutoColaborador(db, colaboradorId) {
  const c = (db.colaboradores || []).find((x) => x.id === colaboradorId);
  if (!c) return { custoMinuto: 0, vazio: true };
  const par = db.parametrosMaoDeObra || {};
  const encargos = num(par.encargos) || 80;
  const dias = num(par.diasUteis) || num((db.industrial.parametros || {}).diasUteisMes) || 22;
  const minutosMes = minutosDoDia(db) * dias;
  if (!(minutosMes > 0) || !(num(c.salario) > 0)) return { custoMinuto: 0, vazio: true, pessoa: c.nome };

  const vt = c.usaConducao
    ? Math.max(num(c.conducoesDia) * num(c.valorConducao) * (num(c.diasConducao) || dias)
      - Math.min(num(c.conducoesDia) * num(c.valorConducao) * (num(c.diasConducao) || dias),
        num(c.salario) * 0.06), 0)
    : 0;
  const folha = num(c.salario) * (1 + encargos / 100) + vt
    + num(c.beneficiosMensais) + num(c.outrosCustosMensais);
  return {
    pessoa: c.nome,
    folha: arredondar(folha, 2),
    minutosMes,
    custoMinuto: arredondar(folha / minutosMes, 5),
    custoHora: arredondar((folha / minutosMes) * 60, 2),
    vazio: false,
  };
}

/**
 * V2 §9 — o custo da hora de uma máquina específica.
 *
 * Overloque e plotter DTF não custam a mesma hora. Quando o equipamento tem
 * os números cadastrados, a conta é dele; quando não tem, cai no parâmetro
 * geral da fábrica — que é uma estimativa, e o sistema diz isso.
 */
export function custoHoraEquipamento(db, equipamentoId) {
  const parametros = db.industrial.parametros || {};
  const geral = {
    origem: 'parametro',
    depreciacao: 0, manutencao: 0, energia: num(parametros.custoEnergiaHoraMaquina),
    outros: 0,
    custoHora: arredondar(num(parametros.custoMaquinaHora) + num(parametros.custoEnergiaHoraMaquina), 4),
  };
  const eq = (db.equipamentos || []).find((e) => e.id === equipamentoId);
  if (!eq) return geral;

  const horas = num(eq.horasDisponiveisMes)
    || (minutosDoDia(db) / 60) * (num(parametros.diasUteisMes) || 22);
  if (!(horas > 0)) return { ...geral, equipamento: eq.nome };

  const meses = num(eq.vidaUtilMeses);
  const depreciacaoMes = meses > 0
    ? Math.max(num(eq.custoAquisicao) - num(eq.valorResidual), 0) / meses
    : 0;
  const detalhado = depreciacaoMes > 0 || num(eq.manutencaoMensal) > 0
    || num(eq.energiaHora) > 0 || num(eq.outrosCustosMensais) > 0;
  if (!detalhado) return { ...geral, equipamento: eq.nome };

  const depreciacao = arredondar(depreciacaoMes / horas, 4);
  const manutencao = arredondar(num(eq.manutencaoMensal) / horas, 4);
  const energia = arredondar(num(eq.energiaHora) || num(parametros.custoEnergiaHoraMaquina), 4);
  const outros = arredondar(num(eq.outrosCustosMensais) / horas, 4);
  return {
    origem: 'equipamento',
    equipamento: eq.nome,
    horasMes: arredondar(horas, 1),
    depreciacaoMensal: arredondar(depreciacaoMes, 2),
    depreciacao, manutencao, energia, outros,
    custoHora: arredondar(depreciacao + manutencao + energia + outros, 4),
  };
}

/** §43 — quanto o resto da fábrica (aluguel, energia, contabilidade) cobra por minuto. */
export function taxaIndiretoMinuto(db) {
  const fixos = (db.custosFixos || []).filter((c) => c.ativo !== false);
  const total = fixos.reduce((s, c) => s + num(c.valorMensal), 0);
  const par = db.parametrosCustoIndireto || {};
  const dias = num(par.diasUteis) || 22;
  const ocupacao = num(par.ocupacao) > 0 ? num(par.ocupacao) : 78;
  const diretos = (db.colaboradores || []).filter(
    (c) => c.status !== 'Inativo' && c.produtivo !== false && c.departamentoId
  );
  const minutos = diretos.length * minutosDoDia(db) * dias * (ocupacao / 100);
  return {
    totalMensal: arredondar(total, 2),
    minutosMes: Math.round(minutos),
    taxaMinuto: minutos > 0 ? arredondar(total / minutos, 5) : 0,
  };
}

/* ==================================================== §2 carteira consolidada */

/**
 * Consolida a carteira por produto. Três clientes pedindo a mesma camiseta
 * viram um lote de produção só — é isso que evita enfestar três vezes o mesmo
 * tecido e perder o encaixe em cada uma.
 */
export function consolidarCarteira(db, opcoes = {}) {
  const linhas = (db.industrial.carteira || []).filter((l) => {
    if (opcoes.linhaIds) return opcoes.linhaIds.includes(l.id);
    return l.status === 'aberta';
  });
  if (linhas.length === 0) return { erro: 'Nenhuma linha de carteira aberta para consolidar.' };

  const porItem = new Map();
  for (const l of linhas) {
    const atual = porItem.get(l.itemId) || { itemId: l.itemId, quantidade: 0, linhas: [], prazo: '' };
    atual.quantidade = arredondar(atual.quantidade + num(l.quantidade), 3);
    atual.linhas.push(l.id);
    /* o prazo da consolidação é o mais apertado dos pedidos dentro dela */
    if (l.dataPrometida && (!atual.prazo || l.dataPrometida < atual.prazo)) atual.prazo = l.dataPrometida;
    porItem.set(l.itemId, atual);
  }

  const registro = {
    id: uid(),
    codigo: proximoCodigo(db.industrial.consolidacoes, 'CONS'),
    nome: String(opcoes.nome || '').trim() || `Carteira consolidada ${hojeISO()}`,
    data: hojeISO(),
    produtos: [...porItem.values()].map((p) => ({
      itemId: p.itemId,
      quantidade: p.quantidade,
      prazo: p.prazo,
      linhas: p.linhas,
    })),
    status: 'planejada',
    criadaEm: agoraISO(),
  };
  db.industrial.consolidacoes.push(registro);
  for (const l of linhas) {
    l.consolidacaoId = registro.id;
    l.status = 'planejada';
  }
  return { consolidacao: registro };
}

/* ============================================================ §44 explosão */

/**
 * Nível de profundidade de cada item (low level code): o item entra na conta
 * depois de todos os pais que o exigem, senão a necessidade fica capenga.
 */
function niveisDaEstrutura(db, itemIdRaiz) {
  const nivel = new Map([[itemIdRaiz, 0]]);
  const fila = [[itemIdRaiz, 0]];
  const visitas = new Map();

  while (fila.length) {
    const [id, n] = fila.shift();
    if (num(visitas.get(id)) > 40) continue;                 // ciclo: não desce mais
    visitas.set(id, num(visitas.get(id)) + 1);

    const trf = transformacaoQueProduz(db, id);
    const filhos = trf
      ? (trf.entradas || []).map((e) => e.itemId)
      : ((estruturaDe(db, id) || {}).componentes || []).map((c) => c.itemId);

    for (const filho of filhos) {
      const novo = n + 1;
      if (num(nivel.get(filho)) >= novo && nivel.has(filho)) continue;
      nivel.set(filho, novo);
      fila.push([filho, novo]);
    }
  }
  return nivel;
}

/**
 * §44 — explode a estrutura de um produto para a quantidade pedida.
 *
 * Devolve a necessidade de cada item (bruta, o que já existe, a líquida), as
 * rodadas de cada transformação e os minutos que cada departamento vai gastar.
 * `considerarEstoque: false` dá a necessidade teórica pura, que é a que o
 * budget usa quando se quer o custo padrão da carteira, e não o do dia.
 */
export function explodirBOM(db, itemIdRaiz, quantidade, opcoes = {}) {
  const raiz = item(db, itemIdRaiz);
  if (!raiz) return { erro: 'Produto não encontrado.' };
  if (!(num(quantidade) > 0)) return { erro: 'Informe a quantidade a produzir.' };

  const considerarEstoque = opcoes.considerarEstoque !== false;
  const parametros = db.industrial.parametros || {};
  const nivel = niveisDaEstrutura(db, raiz.id);
  const maiorNivel = Math.max(...nivel.values());

  /* Uma transformação roda no nível da sua saída mais funda. O enfesto
     entrega frente (que ainda vai ao silk) e costas (que vai direto à
     costura): esperar a frente é o que faz o corte rodar uma vez só, com a
     necessidade das duas já conhecida. */
  const nivelDaTransformacao = new Map();
  for (const [itemId, n] of nivel.entries()) {
    const trf = transformacaoQueProduz(db, itemId);
    if (!trf) continue;
    nivelDaTransformacao.set(trf.id, Math.max(num(nivelDaTransformacao.get(trf.id)) || 0, n));
  }

  const brutas = new Map([[raiz.id, num(quantidade)]]);
  const linhas = new Map();
  const producao = [];
  const avisos = [];

  const calcularLinha = (id, n) => {
    const it = item(db, id);
    if (!it) return null;
    const bruta = arredondar(num(brutas.get(id)), 4);
    if (!(bruta > 0)) return null;
    /* O produto da ponta não desconta estoque: a ordem diz "produza 500", e
       500 camisetas paradas no estoque de outra ordem não produzem estas. O
       desconto vale para o que está no meio do caminho — subproduto cortado
       que sobrou de ontem é subproduto que não precisa cortar de novo. */
    const netar = considerarEstoque && !(n === 0 && id === raiz.id && opcoes.netarRaiz !== true);
    const disponivel = netar ? disponivelDoItem(db, it, opcoes.consolidacaoId) : 0;
    const programadas = netar ? entradasProgramadas(db, it) : 0;
    const seguranca = netar ? estoqueSeguranca(db, it, parametros) : 0;
    const liquida = Math.max(arredondar(bruta - disponivel - programadas + seguranca, 4), 0);
    const linha = {
      itemId: id, item: it, nivel: n, unidade: it.unidade, tipo: it.tipo,
      bruta, disponivel, programadas, seguranca, liquida,
      comprar: 0, produzir: 0, sobra: 0,
    };
    linhas.set(id, linha);
    return linha;
  };

  for (let n = 0; n <= maiorNivel; n += 1) {
    const doNivel = [...nivel.entries()].filter(([, v]) => v === n).map(([id]) => id);

    /* 1. necessidade líquida de cada item deste nível (§25) */
    for (const id of doNivel) calcularLinha(id, n);

    /* 2. o que é comprado já está resolvido; o que é produzido espera a
          transformação que o gera chegar ao seu nível */
    const rodar = new Map();
    for (const id of doNivel) {
      const linha = linhas.get(id);
      if (!linha || !(linha.liquida > 0)) continue;
      const it = linha.item;
      if (!ehProduzido(it)) { linha.comprar = linha.liquida; continue; }

      const trf = transformacaoQueProduz(db, id);
      if (!trf) {
        /* item produzido sem receita: a estrutura ainda serve para o custo,
           mas ninguém sabe em que setor ele nasce */
        const estrutura = estruturaDe(db, id);
        if (!estrutura) {
          avisos.push(`${it.nome} é produzido mas não tem transformação nem estrutura cadastrada.`);
          continue;
        }
        linha.produzir = linha.liquida;
        for (const c of estrutura.componentes) {
          const fator = num(c.quantidade) * (1 + num(c.perda) / 100);
          brutas.set(c.itemId, arredondar(num(brutas.get(c.itemId)) + linha.liquida * fator, 4));
        }
      }
    }

    for (const [trfId, nivelTrf] of nivelDaTransformacao.entries()) {
      if (nivelTrf !== n) continue;
      const trf = (db.industrial.transformacoes || []).find((t) => t.id === trfId);
      if (!trf) continue;
      /* a necessidade de cada saída já foi calculada no nível dela */
      const exigencias = (trf.saidas || [])
        .map((s) => linhas.get(s.itemId))
        .filter((linha) => linha && linha.liquida > 0);
      if (exigencias.length === 0) continue;
      rodar.set(trfId, { trf, exigencias });
    }

    for (const { trf, exigencias } of rodar.values()) {
      /* a rodada atende o componente mais exigente; os outros saem de brinde */
      let rodadas = 0;
      for (const linha of exigencias) {
        const saida = (trf.saidas || []).find((s) => s.itemId === linha.itemId);
        const porRodada = num(saida?.quantidade) || 1;
        rodadas = Math.max(rodadas, linha.liquida / porRodada);
      }
      rodadas = arredondar(rodadas, 4);
      if (!(rodadas > 0)) continue;

      const saidas = (trf.saidas || []).map((s) => {
        const produzido = arredondar(rodadas * num(s.quantidade), 3);
        const linha = linhas.get(s.itemId);
        if (linha) {
          linha.produzir = produzido;
          linha.bruta = Math.max(linha.bruta, produzido);
          linha.sobra = arredondar(Math.max(produzido - linha.liquida, 0), 3);
        }
        return { itemId: s.itemId, nome: (item(db, s.itemId) || {}).nome || '', quantidade: produzido,
                 principal: !!s.principal };
      });

      const entradas = (trf.entradas || []).map((e) => {
        const bruto = rodadas * num(e.quantidade) * (1 + num(e.perda) / 100);
        brutas.set(e.itemId, arredondar(num(brutas.get(e.itemId)) + bruto, 4));
        return {
          itemId: e.itemId, nome: (item(db, e.itemId) || {}).nome || '',
          quantidade: arredondar(bruto, 4), perda: num(e.perda), unidade: e.unidade,
        };
      });

      const principal = saidas.find((s) => s.principal) || saidas[0];
      const minutos = minutosDaTransformacao(trf, principal ? principal.quantidade : rodadas);
      producao.push({
        transformacaoId: trf.id,
        codigo: trf.codigo,
        nome: trf.nome,
        departamentoId: trf.departamentoId,
        departamento: (departamento(db, trf.departamentoId) || {}).nome || '',
        nivel: n,
        rodadas,
        quantidade: principal ? principal.quantidade : rodadas,
        entradas,
        saidas,
        minutos,
      });
    }
  }

  const necessidades = [...linhas.values()].sort((a, b) => a.nivel - b.nivel);
  return {
    raiz: { itemId: raiz.id, nome: raiz.nome, quantidade: num(quantidade) },
    necessidades,
    compras: necessidades.filter((l) => l.comprar > 0),
    producao: producao.sort((a, b) => b.nivel - a.nivel),   // do fundo para a frente
    avisos,
  };
}

/** Minutos de uma transformação inteira, somando as operações (§10). */
export function minutosDaTransformacao(transformacao, quantidade) {
  const detalhe = { total: 0, porTipo: tempos(), operacoes: [] };
  for (const op of transformacao.operacoes || []) {
    const m = minutosDaOperacao(op, quantidade);
    detalhe.total = arredondar(detalhe.total + m.total, 3);
    for (const t of TIPOS_TEMPO) {
      detalhe.porTipo[t.id] = arredondar(num(detalhe.porTipo[t.id]) + num(m.porTipo[t.id]), 3);
    }
    detalhe.operacoes.push({
      id: op.id, nome: op.nome, etapaId: op.etapaId, equipamentoId: op.equipamentoId,
      ciclos: m.ciclos, minutos: m.total, porUnidade: m.porUnidade,
    });
  }
  return detalhe;
}

/** Quanto do item existe hoje: almoxarifado para o comprado, processo para o produzido. */
export function disponivelDoItem(db, it, consolidacaoId) {
  if (it.materialId) {
    /* V2 §51 — o que está reservado para outra ordem não é disponível para
       esta. Com a ordem no contexto, o que ela mesma reservou volta a contar. */
    const posicao = disponivelParaOrdem(db, it.materialId, consolidacaoId);
    return consolidacaoId ? posicao.paraAOrdem : posicao.livre;
  }
  return arredondar(disponivelEmProcesso(db, it.id), 4);
}

/**
 * §25 — o que já foi comprado e ainda não chegou conta como entrada
 * programada. V2: sai do pedido de compra, que agora existe de verdade.
 */
export function entradasProgramadas(db, it) {
  if (!it.materialId) return 0;
  return entradasProgramadasDe(db, it.materialId);
}

/** §25 — cobertura mínima, em dias de consumo médio do próprio item. */
export function estoqueSeguranca(db, it, parametros = {}) {
  if (num(it.estoqueSegurancaFixo) > 0) return num(it.estoqueSegurancaFixo);
  const dias = num(parametros.estoqueSegurancaDias);
  if (!(dias > 0)) return 0;
  /* consumo médio diário dos últimos 90 dias, quando há histórico */
  const corte = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const saidas = (db.industrial.movimentos || []).filter(
    (m) => m.itemId === it.id && m.sentido === 'saida' && String(m.data) >= corte
  );
  if (saidas.length === 0) return 0;
  const total = saidas.reduce((s, m) => s + num(m.quantidade), 0);
  return arredondar((total / 90) * dias, 3);
}

/* ================================================================ §25 MRP */

/**
 * §25 — do que a explosão exige, o que de fato precisa ser comprado.
 *
 *   bruta − disponível − entradas programadas + segurança + perdas = líquida
 *
 * A perda já vem embutida na explosão (cada componente carrega o seu %), e
 * por isso ela aparece aqui separada, para a conta continuar legível.
 */
export function calcularMRP(db, explosao, opcoes = {}) {
  if (!explosao || explosao.erro) return { erro: explosao?.erro || 'Explosão inválida.' };
  const consolidacaoId = opcoes.consolidacaoId || '';
  const parametros = db.industrial.parametros || {};
  const dataNecessidade = opcoes.dataNecessidade || '';

  const linhas = explosao.necessidades
    .filter((l) => !ehProduzido(l.item) || l.comprar > 0)
    .map((l) => {
      const material = l.item.materialId
        ? (db.materiais || []).find((m) => m.id === l.item.materialId)
        : null;
      const custo = num(material?.custoMedio) || num(l.item.custoPadrao);
      const fornecedor = material
        ? (db.fornecedores || []).find((f) => f.id === material.fornecedorPadraoId)
        : null;

      /* V2 §51 — as cinco quantidades que não podem virar uma só */
      const posicao = material
        ? disponivelParaOrdem(db, material.id, consolidacaoId)
        : { fisico: l.disponivel, reservado: 0, reservadoDaOrdem: 0, reservadoDeOutras: 0,
            livre: l.disponivel, paraAOrdem: l.disponivel };
      const programadas = material ? entradasProgramadasDe(db, material.id) : 0;
      const seguranca = l.seguranca;
      const disponivelParaEsta = consolidacaoId ? posicao.paraAOrdem : posicao.livre;

      /* V2 §5: bruta − disponível − programadas + segurança = líquida */
      const comprar = arredondar(
        Math.max(l.bruta - disponivelParaEsta - programadas + seguranca, 0), 3);

      const prazo = material
        ? dataLimiteDeCompra(db, material.id, dataNecessidade || hojeISO())
        : { leadTimeDias: 0, dataLimite: '', atrasada: false };

      const requisicao = material
        ? (db.industrial.requisicoesCompra || []).find(
          (r) => r.materialId === material.id && !['recebida', 'cancelada'].includes(r.status))
        : null;

      /* V2 §5 — a leitura da linha, que é o que o comprador lê primeiro */
      let status = 'ok';
      if (material && material.ativo === false) status = 'bloqueado';
      else if (!(custo > 0)) status = 'bloqueado';
      else if (comprar > 0) {
        /* pedido colocado é compra programada; requisição ainda é intenção —
           quem compra precisa ver a diferença */
        if (programadas >= comprar - 0.0001) status = 'compra_programada';
        else if (posicao.fisico >= l.bruta - 0.0001) status = 'estoque_insuficiente';
        else status = 'compra_necessaria';
      } else if (programadas > 0 && l.bruta > disponivelParaEsta + 0.0001) {
        /* falta no estoque, mas já vem chegando: quem lê precisa saber que a
           compra existe, antes de ver o aviso de estoque mínimo */
        status = 'compra_programada';
      } else if (material && arredondar(posicao.fisico - l.bruta, 3) < num(material.estoqueMinimo)) {
        status = 'abaixo_minimo';
      }

      return {
        itemId: l.itemId,
        nome: l.item.nome,
        tipo: l.item.tipo,
        unidade: l.unidade,
        bruta: l.bruta,
        /* as quantidades separadas (§51) */
        fisico: posicao.fisico,
        reservado: posicao.reservado,
        reservadoDaOrdem: posicao.reservadoDaOrdem,
        reservadoDeOutras: posicao.reservadoDeOutras,
        disponivel: arredondar(disponivelParaEsta, 4),
        programadas,
        seguranca,
        comprar,
        custoUnitario: arredondar(custo, 4),
        valor: arredondar(comprar * custo, 2),
        /* o que já existe e vai ser consumido — entra no budget de consumo,
           mas não no de compras nem no caixa (§4.2/§4.3/§4.4) */
        valorDoEstoque: arredondar(Math.min(l.bruta, disponivelParaEsta) * custo, 2),
        valorConsumo: arredondar(l.bruta * custo, 2),
        materialId: material ? material.id : '',
        fornecedorId: fornecedor ? fornecedor.id : '',
        fornecedor: fornecedor ? (fornecedor.nomeFantasia || fornecedor.nome) : '',
        prazoPagamentoDias: fornecedor ? prazoEmDias(fornecedor, parametros) : num(parametros.prazoPagamentoPadraoDias),
        leadTimeDias: prazo.leadTimeDias,
        dataLimite: prazo.dataLimite,
        atrasada: comprar > 0 && prazo.atrasada,
        requisicao: requisicao ? requisicao.codigo : '',
        status,
        statusNome: statusMrp(status).nome,
        statusTom: statusMrp(status).tom,
        abaixoDoMinimo: material ? posicao.fisico < num(material.estoqueMinimo) : false,
      };
    })
    .sort((a, b) => b.valor - a.valor);

  const alertas = [];
  for (const l of linhas) {
    if (l.status === 'compra_necessaria') {
      alertas.push(alerta('material_insuficiente',
        `${l.nome}: faltam ${l.comprar} ${l.unidade}`
        + `${l.fornecedor ? ` — ${l.fornecedor}` : ''}`
        + `${l.leadTimeDias ? `, ${l.leadTimeDias} dias de prazo` : ''}`
        + `${l.dataLimite ? `, comprar até ${l.dataLimite}` : ''}.`,
        { itemId: l.itemId, quantidade: l.comprar }));
    } else if (l.status === 'estoque_insuficiente') {
      alertas.push(alerta('material_insuficiente',
        `${l.nome}: existem ${l.fisico} ${l.unidade} no estoque, mas ${l.reservadoDeOutras} `
        + 'estão reservados para outra ordem.', { itemId: l.itemId }));
    } else if (l.status === 'abaixo_minimo') {
      alertas.push(alerta('estoque_minimo', `${l.nome} ficaria abaixo do estoque mínimo.`,
        { itemId: l.itemId }));
    } else if (l.status === 'bloqueado') {
      alertas.push(alerta('material_insuficiente',
        `${l.nome}: sem custo cadastrado ou material inativo — o budget sai incompleto.`,
        { itemId: l.itemId }));
    }
    if (l.atrasada) {
      alertas.push(alerta('prazo_risco',
        `${l.nome}: compra atrasada para atendimento da produção (limite ${l.dataLimite}).`,
        { itemId: l.itemId }));
    }
  }

  return {
    linhas,
    totalCompra: arredondar(linhas.reduce((s, l) => s + l.valor, 0), 2),
    totalConsumo: arredondar(linhas.reduce((s, l) => s + l.valorConsumo, 0), 2),
    totalEstoque: arredondar(linhas.reduce((s, l) => s + l.valorDoEstoque, 0), 2),
    itensAComprar: linhas.filter((l) => l.comprar > 0).length,
    itensBloqueados: linhas.filter((l) => l.status === 'bloqueado').length,
    prazoMaximo: Math.max(0, ...linhas.filter((l) => l.comprar > 0).map((l) => l.leadTimeDias)),
    alertas,
    geradoEm: agoraISO(),
    ...(consolidacaoId ? { consolidacaoId } : {}),
  };
}

/** Prazo de pagamento em dias, lido da condição do fornecedor ("28 dias"). */
function prazoEmDias(fornecedor, parametros) {
  const achado = String(fornecedor?.condicaoPagamento || '').match(/(\d+)/);
  return achado ? num(achado[1]) : num(parametros.prazoPagamentoPadraoDias) || 28;
}

/* ====================================================== §17/§27 capacidade */

/**
 * §27 — minutos que cada setor precisa contra os minutos que ele tem.
 * §17 — takt time da carteira e as operações que não cabem nele: o gargalo
 * não é o setor mais cheio, é a operação que não entrega no ritmo do prazo.
 */
export function calcularCapacidade(db, explosao, opcoes = {}) {
  const parametros = db.industrial.parametros || {};
  const dias = Math.max(num(opcoes.diasUteis) || 0, 0) || num(parametros.diasUteisMes) || 22;
  const eficiencia = num(opcoes.eficiencia) || num(parametros.eficienciaPadrao) || 85;
  const minutosDia = minutosDoDia(db);

  const porDepartamento = new Map();
  for (const p of explosao.producao || []) {
    const atual = porDepartamento.get(p.departamentoId) || {
      departamentoId: p.departamentoId,
      departamento: p.departamento,
      minutosNecessarios: 0,
      porTipo: tempos(),
      operacoes: [],
    };
    atual.minutosNecessarios = arredondar(atual.minutosNecessarios + num(p.minutos.total), 2);
    for (const t of TIPOS_TEMPO) {
      atual.porTipo[t.id] = arredondar(num(atual.porTipo[t.id]) + num(p.minutos.porTipo[t.id]), 2);
    }
    for (const op of p.minutos.operacoes) {
      atual.operacoes.push({ ...op, transformacao: p.nome, quantidade: p.quantidade });
    }
    porDepartamento.set(p.departamentoId, atual);
  }

  const linhas = [...porDepartamento.values()].map((d) => {
    const equipe = (db.colaboradores || []).filter(
      (c) => c.departamentoId === d.departamentoId && c.status !== 'Inativo' && c.produtivo !== false
    );
    const maquinas = (db.equipamentos || []).filter(
      (e) => e.departamentoId === d.departamentoId && e.tipo === 'maquina' && e.situacao !== 'baixado'
    );
    const disponiveis = arredondar(equipe.length * minutosDia * dias * (eficiencia / 100), 1);
    const ocupacao = disponiveis > 0 ? arredondar((d.minutosNecessarios / disponiveis) * 100, 1) : null;
    return {
      ...d,
      pessoas: equipe.length,
      maquinas: maquinas.length,
      minutosDisponiveis: disponiveis,
      horasNecessarias: arredondar(d.minutosNecessarios / 60, 1),
      horasDisponiveis: arredondar(disponiveis / 60, 1),
      ocupacao,
      situacao: ocupacao === null ? 'sem_equipe' : ocupacao > 100 ? 'gargalo' : ocupacao > 85 ? 'risco' : 'normal',
    };
  }).sort((a, b) => num(b.ocupacao) - num(a.ocupacao));

  /* takt: o ritmo que o prazo exige, em minutos por peça */
  const pecas = num(opcoes.quantidade) || num(explosao.raiz?.quantidade);
  const minutosDisponiveisTotais = linhas.reduce((s, l) => s + l.minutosDisponiveis, 0);
  const takt = pecas > 0 ? arredondar(minutosDia * dias / pecas, 4) : 0;

  const gargalos = [];
  for (const l of linhas) {
    if (l.situacao === 'gargalo') {
      gargalos.push(alerta('gargalo',
        `${l.departamento}: precisa de ${l.horasNecessarias}h e tem ${l.horasDisponiveis}h `
        + `(${l.ocupacao}% de ocupação).`, { departamentoId: l.departamentoId }));
    } else if (l.situacao === 'sem_equipe') {
      gargalos.push(alerta('gargalo',
        `${l.departamento}: ${l.horasNecessarias}h de trabalho e nenhuma pessoa cadastrada no setor.`,
        { departamentoId: l.departamentoId }));
    }
  }

  return {
    dias, eficiencia, minutosDia, takt,
    pecas,
    linhas,
    minutosNecessarios: arredondar(linhas.reduce((s, l) => s + l.minutosNecessarios, 0), 1),
    minutosDisponiveis: arredondar(minutosDisponiveisTotais, 1),
    ocupacaoGeral: minutosDisponiveisTotais > 0
      ? arredondar((linhas.reduce((s, l) => s + l.minutosNecessarios, 0) / minutosDisponiveisTotais) * 100, 1)
      : null,
    gargalos,
  };
}

/* ============================================================= §3 budget */

/**
 * §3/§38 — o orçamento industrial da carteira: material, processo e indireto,
 * com custo por peça. É o número contra o qual o realizado será comparado (§21).
 */
export function calcularBudget(db, explosao, opcoes = {}) {
  const indireto = taxaIndiretoMinuto(db);
  const materiais = [];
  for (const linha of explosao.necessidades) {
    if (ehProduzido(linha.item) && !linha.item.materialId) continue;
    const material = linha.item.materialId
      ? (db.materiais || []).find((m) => m.id === linha.item.materialId)
      : null;
    const custo = num(material?.custoMedio) || num(linha.item.custoPadrao);
    const quantidade = opcoes.considerarEstoque === false ? linha.bruta : Math.max(linha.bruta, 0);
    if (!(quantidade > 0)) continue;
    materiais.push({
      itemId: linha.itemId, nome: linha.item.nome, tipo: linha.item.tipo,
      unidade: linha.unidade, quantidade: arredondar(quantidade, 3),
      custoUnitario: arredondar(custo, 4), valor: arredondar(quantidade * custo, 2),
    });
  }

  const processos = (explosao.producao || []).map((p) => {
    const mo = custoMinutoDepartamento(db, p.departamentoId);
    const custoMinuto = num(mo.custoMinuto);
    const parametros = db.industrial.parametros || {};
    const porTipo = p.minutos.porTipo;
    const minutosMaquina = num(porTipo.processamento);
    const minutosManuseio = num(porTipo.manuseio) + num(porTipo.movimentacao);
    const minutosSetup = num(porTipo.preparacao) + num(porTipo.setup);
    const minutosDiretos = num(porTipo.processamento) + num(porTipo.inspecao);
    const trabalhados = minutosDiretos + minutosManuseio + minutosSetup;

    const maoDeObra = arredondar(minutosDiretos * custoMinuto, 2);
    const manuseio = arredondar(minutosManuseio * custoMinuto, 2);
    const setup = arredondar(minutosSetup * custoMinuto, 2);
    /* V2 §9 — quando a operação tem máquina cadastrada com custo, a hora é a
       dela; senão vale o parâmetro geral da fábrica */
    const trf = (db.industrial.transformacoes || []).find((t) => t.id === p.transformacaoId);
    const equipamentoId = ((trf || {}).operacoes || []).map((o) => o.equipamentoId).find(Boolean);
    const hora = custoHoraEquipamento(db, equipamentoId);
    const maquina = arredondar((minutosMaquina / 60)
      * (hora.origem === 'equipamento' ? hora.custoHora - hora.energia : num(parametros.custoMaquinaHora)), 2);
    const energia = arredondar((minutosMaquina / 60) * num(hora.energia), 2);
    const indiretoValor = arredondar(trabalhados * indireto.taxaMinuto, 2);
    return {
      transformacaoId: p.transformacaoId,
      nome: p.nome,
      departamentoId: p.departamentoId,
      departamento: p.departamento,
      quantidade: p.quantidade,
      minutos: arredondar(p.minutos.total, 1),
      minutosPorTipo: porTipo,
      maoDeObra, manuseio, setup, maquina, energia, indireto: indiretoValor,
      total: arredondar(maoDeObra + manuseio + setup + maquina + energia + indiretoValor, 2),
    };
  });

  const totalMaterial = arredondar(materiais.reduce((s, m) => s + m.valor, 0), 2);
  const totalProcesso = arredondar(processos.reduce((s, p) => s + p.total, 0), 2);
  const pecas = num(explosao.raiz?.quantidade);

  const registro = {
    id: uid(),
    codigo: proximoCodigo(db.industrial.budgets, 'BDG'),
    consolidacaoId: opcoes.consolidacaoId || '',
    itemId: explosao.raiz?.itemId || '',
    quantidade: pecas,
    data: hojeISO(),
    materiais,
    processos,
    totalMaterial,
    totalProcesso,
    totalIndireto: arredondar(processos.reduce((s, p) => s + p.indireto, 0), 2),
    custoIndustrial: arredondar(totalMaterial + totalProcesso, 2),
    custoPorPeca: pecas > 0 ? arredondar((totalMaterial + totalProcesso) / pecas, 4) : 0,
    minutosTotais: arredondar(processos.reduce((s, p) => s + p.minutos, 0), 1),
    criadoEm: agoraISO(),
  };
  if (opcoes.registrar !== false) db.industrial.budgets.push(registro);
  return registro;
}

/* ============================================ V2 §4 — os quatro budgets */

/**
 * V2 §4 — budget não é um número só. São quatro perguntas diferentes, e
 * misturá-las é o erro clássico:
 *
 *   industrial  quanto custa FABRICAR a carteira (material + conversão)
 *   consumo     quanto material será CONSUMIDO, com as perdas
 *   compras     quanto precisa ser COMPRADO, depois do estoque e das reservas
 *   caixa       quanto sai do BOLSO, e quando
 *
 * Custo industrial ≠ valor de compra ≠ necessidade de caixa (§50). O material
 * que já está no estoque custa na produção, mas não pesa no caixa deste mês —
 * ele foi pago no mês em que entrou.
 */
export function budgetsDaCarteira(db, explosao, opcoes = {}) {
  if (!explosao || explosao.erro) return { erro: explosao?.erro || 'Explosão inválida.' };
  const parametros = db.industrial.parametros || {};
  const industrial = calcularBudget(db, explosao, { ...opcoes, registrar: false });
  const mrp = calcularMRP(db, explosao, opcoes);
  const pecas = num(explosao.raiz?.quantidade);

  /* 4.2 consumo: o que a produção vai consumir, com as perdas já embutidas
     na explosão (cada componente carrega o seu %) */
  const consumo = {
    linhas: mrp.linhas.map((l) => ({
      itemId: l.itemId, nome: l.nome, unidade: l.unidade,
      necessidade: l.bruta, custoUnitario: l.custoUnitario, valor: l.valorConsumo,
      doEstoque: arredondar(Math.min(l.bruta, l.disponivel), 4),
      aComprar: l.comprar,
    })),
    total: mrp.totalConsumo,
    porPeca: pecas > 0 ? arredondar(mrp.totalConsumo / pecas, 4) : 0,
  };

  /* 4.3 compras: só o que falta de verdade, depois de estoque, reserva e
     pedido em aberto */
  const compras = {
    linhas: mrp.linhas.filter((l) => l.comprar > 0).map((l) => ({
      itemId: l.itemId, nome: l.nome, unidade: l.unidade,
      necessidade: l.bruta, disponivel: l.disponivel, reservadoDeOutras: l.reservadoDeOutras,
      programadas: l.programadas, seguranca: l.seguranca,
      comprar: l.comprar, custoUnitario: l.custoUnitario, valor: l.valor,
      fornecedor: l.fornecedor, fornecedorId: l.fornecedorId,
      leadTimeDias: l.leadTimeDias, dataLimite: l.dataLimite, atrasada: l.atrasada,
      prazoPagamentoDias: l.prazoPagamentoDias,
      status: l.status, statusNome: l.statusNome, statusTom: l.statusTom,
    })),
    total: mrp.totalCompra,
    itens: mrp.itensAComprar,
    prazoMaximo: mrp.prazoMaximo,
  };

  /* 4.4 caixa: o desembolso, com data. O material que já está no estoque
     aparece separado, porque ele não sai do caixa de novo. */
  const conversao = industrial.processos.reduce((acc, p) => {
    acc.maoDeObra += num(p.maoDeObra) + num(p.manuseio) + num(p.setup);
    acc.maquina += num(p.maquina) + num(p.energia);
    acc.indireto += num(p.indireto);
    return acc;
  }, { maoDeObra: 0, maquina: 0, indireto: 0 });

  const desembolsos = compras.linhas.map((l) => ({
    tipo: 'material',
    descricao: `${l.nome} · ${l.fornecedor || 'sem fornecedor'}`,
    valor: l.valor,
    /* chega no lead time e vence no prazo do fornecedor */
    quando: somarDiasISO(hojeISO(), num(l.leadTimeDias) + num(l.prazoPagamentoDias)),
  }));
  if (conversao.maoDeObra > 0) {
    desembolsos.push({
      tipo: 'mao_de_obra', descricao: 'Mão de obra da produção',
      valor: arredondar(conversao.maoDeObra, 2),
      quando: somarDiasISO(hojeISO(), 30),
    });
  }
  if (conversao.maquina > 0) {
    desembolsos.push({
      tipo: 'maquina', descricao: 'Máquina e energia',
      valor: arredondar(conversao.maquina, 2),
      quando: somarDiasISO(hojeISO(), 30),
    });
  }

  const caixa = {
    custoIndustrial: industrial.custoIndustrial,
    materialExistente: mrp.totalEstoque,
    materialAComprar: compras.total,
    maoDeObraFutura: arredondar(conversao.maoDeObra, 2),
    maquinaEnergia: arredondar(conversao.maquina, 2),
    /* o indireto é custo fixo já contratado: entra no custo industrial, mas
       não é desembolso novo desta carteira */
    indiretoRateado: arredondar(conversao.indireto, 2),
    desembolsos: desembolsos.sort((a, b) => String(a.quando).localeCompare(String(b.quando))),
    necessidadeDeCaixa: arredondar(
      compras.total + conversao.maoDeObra + conversao.maquina, 2),
  };

  /* o mesmo desembolso, agrupado por mês — é como o caixa é olhado */
  const porMes = new Map();
  for (const d of caixa.desembolsos) {
    const mes = String(d.quando).slice(0, 7);
    porMes.set(mes, arredondar(num(porMes.get(mes)) + num(d.valor), 2));
  }
  caixa.porMes = [...porMes.entries()].map(([mes, valor]) => ({ mes, valor }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  return { industrial, consumo, compras, caixa, mrp, pecas };
}

function somarDiasISO(iso, dias) {
  const base = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  base.setDate(base.getDate() + num(dias));
  return base.toISOString().slice(0, 10);
}

/* =================================================== §24 plano de produção */

/**
 * §24 — o botão "gerar plano de produção", inteiro:
 * consolida, explode, confere estoque, calcula a necessidade líquida, abre a
 * demanda de cada departamento, mede a capacidade, aponta o gargalo e fecha
 * o budget da carteira.
 */
export function planoDeProducao(db, opcoes = {}) {
  let consolidacao = opcoes.consolidacaoId
    ? (db.industrial.consolidacoes || []).find((c) => c.id === opcoes.consolidacaoId)
    : null;
  if (!consolidacao) {
    const r = consolidarCarteira(db, opcoes);
    if (r.erro) return { erro: r.erro };
    consolidacao = r.consolidacao;
  }

  /* Planejar é abrir ordem. Uma carteira consolidada aqui e uma ordem aberta
     no ambiente de ordens são a mesma coisa para a fábrica — e por isso as
     duas ganham código de ordem e aparecem na mesma lista. */
  if (!consolidacao.codigoOrdem) {
    const ano = hojeISO().slice(0, 4);
    const doAno = (db.industrial.consolidacoes || []).filter(
      (c) => String(c.codigoOrdem || '').startsWith(`OP-${ano}-`)
    );
    consolidacao.codigoOrdem = `OP-${ano}-${String(doAno.length + 1).padStart(4, '0')}`;
    consolidacao.origem = consolidacao.origem || 'carteira';
  }

  const planos = [];
  for (const produto of consolidacao.produtos) {
    const explosao = explodirBOM(db, produto.itemId, produto.quantidade, opcoes);
    if (explosao.erro) return { erro: explosao.erro };

    const mrp = calcularMRP(db, explosao, { consolidacaoId: consolidacao.id });
    const capacidade = calcularCapacidade(db, explosao, { ...opcoes, quantidade: produto.quantidade });
    const budget = calcularBudget(db, explosao, { consolidacaoId: consolidacao.id });

    /* §24 — a demanda de cada departamento, na ordem em que a fábrica produz */
    const demandas = [];
    for (const p of explosao.producao) {
      const registro = {
        id: uid(),
        codigo: proximoCodigo(db.industrial.demandas, 'DEM', 5),
        consolidacaoId: consolidacao.id,
        transformacaoId: p.transformacaoId,
        departamentoId: p.departamentoId,
        itemId: (p.saidas.find((s) => s.principal) || p.saidas[0] || {}).itemId || '',
        quantidade: p.quantidade,
        rodadas: p.rodadas,
        nivel: p.nivel,
        minutos: arredondar(p.minutos.total, 1),
        entradas: p.entradas,
        saidas: p.saidas,
        produzido: 0,
        status: 'aberta',
        prazo: produto.prazo || '',
        criadaEm: agoraISO(),
      };
      db.industrial.demandas.push(registro);
      demandas.push(registro);
    }

    /* §34 — uma OP por processo, com dependência do nível anterior */
    const ordens = [];
    for (const demanda of demandas) {
      const dep = departamento(db, demanda.departamentoId);
      const sigla = String(dep?.sigla || 'OP').toUpperCase();
      const depende = demandas
        .filter((d) => d.nivel > demanda.nivel
          && d.saidas.some((s) => demanda.entradas.some((e) => e.itemId === s.itemId)))
        .map((d) => d.id);
      const ordem = {
        id: uid(),
        codigo: `OP-${sigla}-${String((db.industrial.ordens || []).filter((o) => String(o.codigo).includes(`-${sigla}-`)).length + 1).padStart(4, '0')}`,
        demandaId: demanda.id,
        consolidacaoId: consolidacao.id,
        transformacaoId: demanda.transformacaoId,
        departamentoId: demanda.departamentoId,
        itemId: demanda.itemId,
        quantidade: demanda.quantidade,
        dependeDe: depende,
        status: 'planejada',
        prazo: demanda.prazo,
        criadaEm: agoraISO(),
      };
      db.industrial.ordens.push(ordem);
      ordens.push(ordem);
    }

    planos.push({ produto, explosao, mrp, capacidade, budget, demandas, ordens });
  }

  consolidacao.status = 'em_producao';
  registrarHistorico(db, {
    tipo: 'plano',
    motivo: `Plano gerado para ${consolidacao.codigo}`,
    usuario: opcoes.usuario?.nome || '',
  });

  return {
    consolidacao,
    planos,
    alertas: planos.flatMap((p) => [...p.mrp.alertas, ...p.capacidade.gargalos]),
    custoPlanejado: arredondar(planos.reduce((s, p) => s + p.budget.custoIndustrial, 0), 2),
  };
}

/* ================================================== §45 transformação real */

/**
 * §45/§36 — executa uma transformação: consome o que entrou, entrega o que
 * saiu, registra perda, tempo, operador e lote. O custo do que sai carrega o
 * custo do que entrou (§20) — é isso que faz a camiseta acabada saber quanto
 * custou desde o rolo de tecido.
 *
 * `ganchos.consumirMaterial` permite que a montagem no navegador use o motor
 * de estoque do próprio sistema em vez do daqui (§50: não duplicar).
 */
export function executarTransformacao(db, dados, usuario, ganchos = {}) {
  const trf = (db.industrial.transformacoes || []).find((t) => t.id === dados.transformacaoId);
  if (!trf) return { erro: 'Transformação não encontrada.' };
  const dep = departamento(db, trf.departamentoId);
  const local = localDoDepartamento(dep);

  const producao = (dados.saidas || []).map((s) => ({ ...s, quantidade: num(s.quantidade) }));
  if (producao.length === 0) return { erro: 'Informe o que foi produzido.' };
  const principalSaida = trf.saidas.find((s) => s.principal) || trf.saidas[0];
  const produzidoPrincipal = num(
    (producao.find((s) => s.itemId === principalSaida.itemId) || {}).quantidade
  );
  if (!(produzidoPrincipal > 0)) return { erro: 'A produção do item principal precisa ser maior que zero.' };
  const rodadas = produzidoPrincipal / num(principalSaida.quantidade);

  /* 1. consumo: o que a receita pede, ou o que o operador informou */
  const consumos = (dados.consumos && dados.consumos.length ? dados.consumos : trf.entradas.map((e) => ({
    itemId: e.itemId,
    quantidade: arredondar(rodadas * num(e.quantidade) * (1 + num(e.perda) / 100), 4),
  }))).map((c) => ({ ...c, quantidade: num(c.quantidade) }));

  /* O custo do subproduto consumido já foi contado quando ELE foi produzido.
     Somar os dois como "material" faria a mesma malha ser cobrada de novo a
     cada setor — e o realizado da carteira sairia três vezes maior que o
     budget. Por isso as duas origens andam separadas. */
  let custoAlmoxarifado = 0;
  let custoProcesso = 0;
  const consumosRegistrados = [];
  for (const consumo of consumos) {
    const it = item(db, consumo.itemId);
    if (!it) return { erro: 'Item consumido não encontrado.' };
    if (!(consumo.quantidade > 0)) continue;

    if (it.materialId) {
      /* matéria-prima sai do almoxarifado do sistema */
      const baixa = ganchos.consumirMaterial
        ? ganchos.consumirMaterial({ item: it, quantidade: consumo.quantidade, transformacao: trf, dados })
        : baixarMaterialPadrao(db, it, consumo.quantidade, trf, usuario);
      if (baixa && baixa.erro) return { erro: baixa.erro };
      const custoUnitario = num(baixa?.custoUnitario)
        || num((db.materiais || []).find((m) => m.id === it.materialId)?.custoMedio);
      custoAlmoxarifado += consumo.quantidade * custoUnitario;
      /* V2 §6 — o consumo baixa a reserva da ordem. O que passar do reservado
         sai do estoque livre, e é esse excedente que vira desvio de consumo. */
      const baixaReserva = consumoDaReserva(db, {
        materialId: it.materialId,
        quantidade: consumo.quantidade,
        consolidacaoId: dados.consolidacaoId || '',
      }, usuario);
      consumosRegistrados.push({ itemId: it.id, nome: it.nome, quantidade: consumo.quantidade,
        unidade: it.unidade, custoUnitario: arredondar(custoUnitario, 4), origem: 'almoxarifado',
        daReserva: num(baixaReserva.daReserva), foraDaReserva: num(baixaReserva.doLivre) });
    } else {
      /* subproduto sai do estoque do processo anterior */
      const saldo = (db.industrial.estoques || [])
        .filter((s) => s.itemId === it.id && num(s.quantidade) > 0)
        .sort((a, b) => String(a.atualizadoEm).localeCompare(String(b.atualizadoEm)));
      let restante = consumo.quantidade;
      for (const s of saldo) {
        if (restante <= 0.0001) break;
        const usar = Math.min(restante, num(s.quantidade));
        const r = moverProcesso(db, {
          itemId: it.id, local: s.local, loteId: s.loteId, sentido: 'saida', quantidade: usar,
          custoUnitario: s.custoUnitario, origemTipo: 'execucao', destino: local,
          data: dados.data,
        }, usuario);
        if (r.erro) return { erro: r.erro };
        custoProcesso += usar * num(s.custoUnitario);
        consumosRegistrados.push({ itemId: it.id, nome: it.nome, quantidade: arredondar(usar, 4),
          unidade: it.unidade, custoUnitario: num(s.custoUnitario), loteId: s.loteId, origem: s.local });
        restante -= usar;
      }
      if (restante > 0.0001) {
        return {
          erro: `Faltam ${arredondar(restante, 3)} ${it.unidade} de ${it.nome} para executar `
            + `${trf.nome}.`,
          faltante: { itemId: it.id, quantidade: arredondar(restante, 3) },
        };
      }
    }
  }

  /* 2. tempos e custo de conversão (§9/§43) */
  const minutos = dados.tempos
    ? { total: Object.values(tempos(dados.tempos)).reduce((s, v) => s + num(v), 0),
        porTipo: tempos(dados.tempos), operacoes: [] }
    : minutosDaTransformacao(trf, produzidoPrincipal);
  const custos = custearExecucao(db, {
    departamentoId: trf.departamentoId,
    equipamentoId: dados.equipamentoId
      || (trf.operacoes || []).map((o) => o.equipamentoId).find(Boolean) || '',
    minutosPorTipo: minutos.porTipo,
    custoAlmoxarifado,
    custoProcesso,
    perdas: dados.perdas || [],
    retrabalho: num(dados.retrabalho),
  });

  /* 3. saídas: cada uma recebe o custo acumulado do que a gerou (§20) */
  const execucaoId = uid();
  const valorTotal = custos.total;
  const totalSaidas = producao.reduce((s, p) => s + num(p.quantidade), 0);
  const saidasRegistradas = [];
  for (const saida of producao) {
    const it = item(db, saida.itemId);
    if (!it) return { erro: 'Item produzido não encontrado.' };
    const receita = trf.saidas.find((s) => s.itemId === it.id);
    /* rateio do custo entre as saídas: pelo peso da receita, não pela
       quantidade solta — 20.000 mangas não custam o dobro de 10.000 frentes
       só por serem mais peças */
    const peso = receita ? num(receita.quantidade) * num(receita.pesoCusto || 1) : 1;
    const pesoTotal = producao.reduce((s, p) => {
      const r = trf.saidas.find((x) => x.itemId === p.itemId);
      return s + (r ? num(r.quantidade) * num(r.pesoCusto || 1) : 1);
    }, 0) || 1;
    const custoSaida = arredondar(valorTotal * (peso / pesoTotal), 4);
    const quantidade = num(saida.quantidade);
    const custoUnitario = quantidade > 0 ? arredondar(custoSaida / quantidade, 6) : 0;

    const lote = novoLote(db, {
      itemId: it.id, quantidade, origem: 'producao', origemId: dados.ordemId || '',
      execucaoId, consolidacaoId: dados.consolidacaoId || '', custoUnitario,
      data: dados.data, prefixo: String(dep?.sigla || 'LT').toUpperCase(),
    });
    if (lote.erro) return { erro: lote.erro };

    const r = moverProcesso(db, {
      itemId: it.id, local, loteId: lote.registro.id, sentido: 'entrada',
      quantidade, custoUnitario, origemTipo: 'execucao', origemId: execucaoId, data: dados.data,
    }, usuario);
    if (r.erro) return { erro: r.erro };

    saidasRegistradas.push({ itemId: it.id, nome: it.nome, quantidade, unidade: it.unidade,
      loteId: lote.registro.id, loteCodigo: lote.registro.codigo, custoUnitario, custoTotal: custoSaida });

    for (const consumo of consumosRegistrados) {
      registrarHistorico(db, {
        tipo: 'transformacao', execucaoId, itemId: it.id, quantidade,
        origemLoteId: consumo.loteId || '', destinoLoteId: lote.registro.id,
        usuario: usuario?.nome || '',
        motivo: `${trf.nome}: ${consumo.nome} → ${it.nome}`,
      });
    }
  }

  /* 4. perdas e retalhos (§22/§23) */
  for (const perda of dados.perdas || []) {
    const it = item(db, perda.itemId);
    db.industrial.perdas.push({
      id: uid(), execucaoId, data: dados.data || hojeISO(),
      departamentoId: trf.departamentoId, itemId: perda.itemId,
      nome: it ? it.nome : '', quantidade: num(perda.quantidade), unidade: it ? it.unidade : '',
      motivo: perda.motivo, motivoNome: (motivoPerda(perda.motivo) || {}).nome || perda.motivo,
      esperada: !!(motivoPerda(perda.motivo) || {}).esperada,
      custo: arredondar(num(perda.quantidade) * num(perda.custoUnitario || (it || {}).custoPadrao), 2),
      observacao: String(perda.observacao || '').trim(),
    });
  }
  for (const retalho of dados.retalhos || []) {
    db.industrial.retalhos.push({
      id: uid(), execucaoId, data: dados.data || hojeISO(),
      itemId: retalho.itemId || '', tipo: retalho.tipo || 'aproveitavel',
      metragem: num(retalho.metragem), peso: num(retalho.peso),
      cor: String(retalho.cor || '').trim(), composicao: String(retalho.composicao || '').trim(),
      localizacao: String(retalho.localizacao || '').trim(),
      loteId: retalho.loteId || '', status: 'disponivel',
    });
  }

  /* 5. o registro da execução — nada é apagado depois (§52) */
  const execucao = {
    id: execucaoId,
    codigo: proximoCodigo(db.industrial.execucoes, 'EXE', 5),
    transformacaoId: trf.id,
    ordemId: dados.ordemId || '',
    demandaId: dados.demandaId || '',
    consolidacaoId: dados.consolidacaoId || '',
    departamentoId: trf.departamentoId,
    data: dados.data || hojeISO(),
    colaboradorId: dados.colaboradorId || '',
    equipamentoId: dados.equipamentoId || '',
    consumos: consumosRegistrados,
    saidas: saidasRegistradas,
    refugo: num(dados.refugo),
    retrabalho: num(dados.retrabalho),
    minutos: arredondar(minutos.total, 2),
    minutosPorTipo: minutos.porTipo,
    minutosPrevistos: arredondar(minutosDaTransformacao(trf, produzidoPrincipal).total, 2),
    custos,
    observacao: String(dados.observacao || '').trim(),
    criadaEm: agoraISO(),
    criadaPor: usuario?.nome || '',
  };
  db.industrial.execucoes.push(execucao);

  /* 6. a demanda e a ordem andam junto */
  if (dados.demandaId) {
    const demanda = (db.industrial.demandas || []).find((d) => d.id === dados.demandaId);
    if (demanda) {
      demanda.produzido = arredondar(num(demanda.produzido) + produzidoPrincipal, 3);
      demanda.status = demanda.produzido + 0.0001 >= num(demanda.quantidade) ? 'atendida' : 'atendida_parcial';
    }
  }
  if (dados.ordemId) {
    const ordem = (db.industrial.ordens || []).find((o) => o.id === dados.ordemId);
    if (ordem) {
      const demanda = (db.industrial.demandas || []).find((d) => d.id === ordem.demandaId);
      ordem.status = demanda && demanda.status === 'atendida' ? 'concluida' : 'em_execucao';
    }
  }

  return { execucao };
}

/** Baixa de material no almoxarifado do sistema, quando não há gancho próprio. */
function baixarMaterialPadrao(db, it, quantidade, trf, usuario) {
  const material = (db.materiais || []).find((m) => m.id === it.materialId);
  if (!material) return { erro: `Material de ${it.nome} não encontrado no almoxarifado.` };
  const estoque = (db.estoques || []).find((e) => e.padrao) || (db.estoques || [])[0];
  if (!estoque) return { erro: 'Nenhum local de estoque cadastrado.' };
  const saldo = (db.saldos || []).find((s) => s.materialId === material.id && s.estoqueId === estoque.id);
  const disponivel = num(saldo?.fisico) - num(saldo?.reservado);
  if (quantidade > disponivel + 0.0001) {
    return {
      erro: `Disponível de ${material.nome}: ${arredondar(disponivel, 3)} ${material.unidadeEstoque}. `
        + `A baixa de ${arredondar(quantidade, 3)} deixaria o saldo negativo.`,
    };
  }
  const custoUnitario = num(material.custoMedio);
  db.movimentacoes = db.movimentacoes || [];
  db.movimentacoes.push({
    id: uid(),
    numero: `MOV-IND-${String(db.movimentacoes.length + 1).padStart(5, '0')}`,
    quando: agoraISO(),
    materialId: material.id,
    estoqueId: estoque.id,
    tipo: 'saida_producao',
    sinal: -1,
    quantidade,
    unidade: material.unidadeEstoque,
    custoUnitario,
    custoTotal: arredondar(custoUnitario * quantidade, 4),
    origemTipo: 'industrial',
    origemId: trf.id,
    documento: trf.codigo,
    observacao: `Consumo industrial: ${trf.nome}`,
    usuario: usuario?.nome || '',
  });
  if (saldo) saldo.fisico = arredondar(num(saldo.fisico) - quantidade);
  return { custoUnitario };
}

/* ============================================================ §43 custeio */

/**
 * §37/§43 — o custo de uma transformação, aberto nas parcelas que a fábrica
 * reconhece. Cada minuto entra numa parcela só: tempo de processamento não é
 * cobrado de novo como manuseio.
 */
export function custearExecucao(db, dados) {
  const parametros = db.industrial.parametros || {};
  const mo = custoMinutoDepartamento(db, dados.departamentoId);
  const indireto = taxaIndiretoMinuto(db);
  const t = tempos(dados.minutosPorTipo);

  const minutosDiretos = num(t.processamento) + num(t.inspecao);
  const minutosManuseio = num(t.manuseio) + num(t.movimentacao);
  const minutosSetup = num(t.preparacao) + num(t.setup);
  const trabalhados = minutosDiretos + minutosManuseio + minutosSetup;

  const materialAlmoxarifado = arredondar(num(dados.custoAlmoxarifado ?? dados.custoEntradas), 4);
  const materialProcesso = arredondar(num(dados.custoProcesso), 4);
  const material = arredondar(materialAlmoxarifado + materialProcesso, 4);
  const maoDeObra = arredondar(minutosDiretos * num(mo.custoMinuto), 4);
  const manuseio = arredondar(minutosManuseio * num(mo.custoMinuto), 4);
  const setup = arredondar(minutosSetup * num(mo.custoMinuto), 4);
  /* V2 §9 — a hora da máquina que de fato rodou */
  const hora = custoHoraEquipamento(db, dados.equipamentoId);
  const maquina = arredondar((num(t.processamento) / 60)
    * (hora.origem === 'equipamento' ? hora.custoHora - hora.energia : num(parametros.custoMaquinaHora)), 4);
  const energia = arredondar((num(t.processamento) / 60) * num(hora.energia), 4);
  const perda = arredondar((dados.perdas || []).reduce(
    (s, p) => s + num(p.quantidade) * num(p.custoUnitario), 0), 4);
  const retrabalho = arredondar(num(dados.retrabalho) * num(mo.custoMinuto), 4);
  const indiretoValor = arredondar(trabalhados * num(indireto.taxaMinuto), 4);

  return {
    material,
    /* o que saiu do almoxarifado nesta execução — é o que entra no realizado
       da carteira, porque o resto já foi contado antes */
    materialAlmoxarifado,
    /* o custo que o subproduto trouxe consigo, para o custo acumulado */
    materialProcesso,
    maoDeObra, manuseio, setup, maquina, energia, perda, retrabalho,
    indireto: indiretoValor,
    conversao: arredondar(maoDeObra + manuseio + setup + maquina + energia + retrabalho + indiretoValor, 4),
    total: arredondar(material + maoDeObra + manuseio + setup + maquina + energia
      + perda + retrabalho + indiretoValor, 4),
    minutos: { diretos: minutosDiretos, manuseio: minutosManuseio, setup: minutosSetup,
      espera: num(t.espera), trabalhados },
    custoMinuto: num(mo.custoMinuto),
    taxaIndireta: num(indireto.taxaMinuto),
    custoHoraMaquina: num(hora.custoHora),
    origemCustoMaquina: hora.origem,
  };
}

/* ===================================================== §20 custo acumulado */

/**
 * O que um lote custou desde a matéria-prima, passo a passo.
 *
 * A costura consome quatro subprodutos que saíram do MESMO enfesto: a história
 * é contada por execução, não por lote, senão o corte apareceria quatro vezes
 * na mesma árvore.
 */
export function custoAcumulado(db, loteId, contexto = null) {
  const ctx = contexto || { lotes: new Set(), execucoes: new Set(), etapas: [] };
  const lote = (db.industrial.lotes || []).find((l) => l.id === loteId);
  if (!lote) return { erro: 'Lote não encontrado.' };
  if (ctx.lotes.has(loteId)) return { lote, item: item(db, lote.itemId), etapas: ctx.etapas };
  ctx.lotes.add(loteId);

  const execucao = (db.industrial.execucoes || []).find((e) => e.id === lote.execucaoId);
  if (execucao && !ctx.execucoes.has(execucao.id)) {
    ctx.execucoes.add(execucao.id);
    for (const consumo of execucao.consumos) {
      if (consumo.loteId) custoAcumulado(db, consumo.loteId, ctx);
    }
    const dep = departamento(db, execucao.departamentoId);
    ctx.etapas.push({
      execucaoId: execucao.id,
      execucao: execucao.codigo,
      loteId: lote.id,
      lote: lote.codigo,
      departamento: dep ? dep.nome : '',
      data: execucao.data,
      material: num(execucao.custos.materialAlmoxarifado ?? execucao.custos.material),
      conversao: execucao.custos.conversao,
      total: execucao.custos.total,
      quantidade: lote.quantidade,
      custoUnitario: lote.custoUnitario,
    });
  }

  if (contexto) return { lote, item: item(db, lote.itemId), etapas: ctx.etapas };
  return {
    lote,
    item: item(db, lote.itemId),
    etapas: ctx.etapas,
    custoUnitario: num(lote.custoUnitario),
    custoTotal: arredondar(num(lote.custoUnitario) * num(lote.quantidade), 2),
    /* a conta fechada da história inteira, para conferir com o budget */
    materialTotal: arredondar(ctx.etapas.reduce((s, e) => s + num(e.material), 0), 2),
    conversaoTotal: arredondar(ctx.etapas.reduce((s, e) => s + num(e.conversao), 0), 2),
  };
}

/* ================================================= §35 liberar para costura */

/**
 * §35 — a costura só começa quando todos os componentes existem. A recusa
 * precisa dizer o que falta e quanto: "faltam 350 mangas" resolve; "material
 * insuficiente" manda a encarregada procurar sozinha.
 */
export function liberarParaCostura(db, ordemId, usuario) {
  const ordem = (db.industrial.ordens || []).find((o) => o.id === ordemId);
  if (!ordem) return { erro: 'Ordem não encontrada.' };
  const trf = (db.industrial.transformacoes || []).find((t) => t.id === ordem.transformacaoId);
  if (!trf) return { erro: 'Transformação da ordem não encontrada.' };

  const rodadas = num(ordem.quantidade) / num((trf.saidas.find((s) => s.principal) || trf.saidas[0]).quantidade);
  const faltas = [];
  const conferidos = [];
  for (const entrada of trf.entradas) {
    const it = item(db, entrada.itemId);
    if (!it) continue;
    const precisa = arredondar(rodadas * num(entrada.quantidade) * (1 + num(entrada.perda) / 100), 3);
    /* V2 §6 — o que a própria ordem reservou conta como disponível para ela;
       o que está reservado para outra, não. */
    const tem = it.materialId
      ? disponivelDoItem(db, it, ordem.consolidacaoId)
      : disponivelEmProcesso(db, it.id);
    conferidos.push({ itemId: it.id, nome: it.nome, precisa, tem: arredondar(tem, 3), unidade: it.unidade });
    if (tem + 0.0001 < precisa) {
      faltas.push({ itemId: it.id, nome: it.nome, falta: arredondar(precisa - tem, 3), unidade: it.unidade });
    }
  }

  if (faltas.length) {
    return {
      liberada: false,
      conferidos,
      faltas,
      alertas: faltas.map((f) => alerta('componente_faltante',
        `Faltam ${f.falta} ${f.unidade === 'UN' ? '' : `${f.unidade} de `}${f.nome}`.trim() + '.',
        { itemId: f.itemId })),
    };
  }

  ordem.status = 'liberada';
  ordem.liberadaEm = agoraISO();
  ordem.liberadaPor = usuario?.nome || '';
  registrarHistorico(db, {
    tipo: 'liberacao', itemId: ordem.itemId, quantidade: ordem.quantidade,
    usuario: usuario?.nome || '', motivo: `${ordem.codigo} liberada`,
  });
  return {
    liberada: true,
    conferidos,
    alertas: [alerta('liberado', `${ordem.codigo} liberada: todos os componentes disponíveis.`)],
  };
}

/* ====================================================== §19 WIP e §21 desvio */

/** §19 — onde estão as peças da carteira, processo a processo. */
export function wipDaCarteira(db, consolidacaoId) {
  const consolidacao = (db.industrial.consolidacoes || []).find((c) => c.id === consolidacaoId);
  if (!consolidacao) return { erro: 'Carteira consolidada não encontrada.' };
  const demandas = (db.industrial.demandas || []).filter((d) => d.consolidacaoId === consolidacaoId);

  const etapas = demandas
    .sort((a, b) => b.nivel - a.nivel)
    .map((d) => {
      const dep = departamento(db, d.departamentoId);
      const it = item(db, d.itemId);
      const emEstoque = disponivelEmProcesso(db, d.itemId, localDoDepartamento(dep));
      return {
        demandaId: d.id,
        departamentoId: d.departamentoId,
        departamento: dep ? dep.nome : '',
        item: it ? it.nome : '',
        planejado: num(d.quantidade),
        produzido: num(d.produzido),
        emEstoque: arredondar(emEstoque, 3),
        saldo: arredondar(num(d.quantidade) - num(d.produzido), 3),
        percentual: num(d.quantidade) > 0 ? arredondar((num(d.produzido) / num(d.quantidade)) * 100, 1) : 0,
        status: d.status,
      };
    });

  const total = consolidacao.produtos.reduce((s, p) => s + num(p.quantidade), 0);
  return {
    consolidacao,
    total,
    etapas,
    emProcesso: arredondar(etapas.reduce((s, e) => s + e.emEstoque, 0), 3),
    concluidas: etapas.filter((e) => e.status === 'atendida').length,
  };
}

/** §21 — budget contra realizado, por departamento, com o motivo do desvio. */
export function realizadoVersusBudget(db, consolidacaoId) {
  const budget = (db.industrial.budgets || []).find((b) => b.consolidacaoId === consolidacaoId);
  if (!budget) return { erro: 'Esta carteira ainda não tem budget.' };
  const execucoes = (db.industrial.execucoes || []).filter((e) => e.consolidacaoId === consolidacaoId);

  const porDepartamento = new Map();
  for (const p of budget.processos) {
    porDepartamento.set(p.departamentoId, {
      departamentoId: p.departamentoId,
      departamento: p.departamento,
      planejado: p.total,
      planejadoMinutos: p.minutos,
      realizado: 0, realizadoMinutos: 0, material: 0, perdas: 0, execucoes: 0,
    });
  }
  for (const e of execucoes) {
    const atual = porDepartamento.get(e.departamentoId) || {
      departamentoId: e.departamentoId,
      departamento: (departamento(db, e.departamentoId) || {}).nome || '',
      planejado: 0, planejadoMinutos: 0, realizado: 0, realizadoMinutos: 0, material: 0, perdas: 0, execucoes: 0,
    };
    atual.realizado = arredondar(atual.realizado + num(e.custos.conversao), 2);
    atual.material = arredondar(atual.material + num(e.custos.materialAlmoxarifado ?? e.custos.material), 2);
    atual.perdas = arredondar(atual.perdas + num(e.custos.perda), 2);
    atual.realizadoMinutos = arredondar(atual.realizadoMinutos + num(e.minutos), 1);
    atual.execucoes += 1;
    porDepartamento.set(e.departamentoId, atual);
  }

  const linhas = [...porDepartamento.values()].map((l) => {
    const desvio = arredondar(l.realizado - l.planejado, 2);
    return {
      ...l,
      desvio,
      desvioPercentual: l.planejado > 0 ? arredondar((desvio / l.planejado) * 100, 1) : null,
      motivo: desvio > 0
        ? (l.perdas > 0 ? 'Perda acima do padrão' : 'Tempo acima do padrão')
        : desvio < 0 ? 'Economia de tempo' : '',
    };
  });

  const materialRealizado = arredondar(execucoes.reduce(
    (s, e) => s + num(e.custos.materialAlmoxarifado ?? e.custos.material), 0), 2);
  const conversaoRealizada = arredondar(linhas.reduce((s, l) => s + l.realizado, 0), 2);
  const realizado = arredondar(materialRealizado + conversaoRealizada, 2);
  const alertas = [];
  if (realizado > budget.custoIndustrial) {
    alertas.push(alerta('custo_acima',
      `Realizado R$ ${realizado} contra budget de R$ ${budget.custoIndustrial}.`));
  }
  for (const l of linhas) {
    if (l.planejadoMinutos > 0 && l.realizadoMinutos > l.planejadoMinutos * 1.1) {
      alertas.push(alerta('eficiencia_abaixo',
        `${l.departamento}: ${l.realizadoMinutos} min contra ${l.planejadoMinutos} min previstos.`,
        { departamentoId: l.departamentoId }));
    }
  }

  return {
    budget,
    linhas,
    planejado: budget.custoIndustrial,
    realizado,
    materialRealizado,
    conversaoRealizada,
    desvio: arredondar(realizado - budget.custoIndustrial, 2),
    alertas,
  };
}

/* ========================================================= §32 rastro */

/** A árvore de transformação de um lote, do tecido ao produto acabado. */
export function rastrear(db, loteId, profundidade = 0) {
  const lote = (db.industrial.lotes || []).find((l) => l.id === loteId);
  if (!lote) return { erro: 'Lote não encontrado.' };
  if (profundidade > 20) return { erro: 'Árvore de transformação longa demais.' };

  const execucao = (db.industrial.execucoes || []).find((e) => e.id === lote.execucaoId);
  const dep = execucao ? departamento(db, execucao.departamentoId) : null;
  const origens = [];
  if (execucao) {
    for (const consumo of execucao.consumos) {
      if (consumo.loteId) {
        const anterior = rastrear(db, consumo.loteId, profundidade + 1);
        if (!anterior.erro) origens.push(anterior);
      } else {
        origens.push({
          tipo: 'almoxarifado',
          item: consumo.nome,
          quantidade: consumo.quantidade,
          unidade: consumo.unidade,
          custoUnitario: consumo.custoUnitario,
        });
      }
    }
  }
  const destinos = (db.industrial.execucoes || [])
    .filter((e) => (e.consumos || []).some((c) => c.loteId === lote.id))
    .map((e) => ({ execucao: e.codigo, departamento: (departamento(db, e.departamentoId) || {}).nome || '',
                   data: e.data, saidas: e.saidas.map((s) => `${s.quantidade} ${s.nome}`) }));

  return {
    tipo: 'lote',
    loteId: lote.id,
    lote: lote.codigo,
    item: (item(db, lote.itemId) || {}).nome || '',
    quantidade: lote.quantidade,
    custoUnitario: lote.custoUnitario,
    data: lote.data,
    departamento: dep ? dep.nome : '',
    execucao: execucao ? execucao.codigo : '',
    origens,
    destinos,
  };
}

/**
 * V2 §22 — rastreabilidade para a frente: deste rolo, o que saiu?
 *
 * O caminho inverso do `rastrear`: parte de um lote e desce pelas execuções
 * que o consumiram, até o produto acabado e o cliente que o recebeu.
 */
export function rastrearParaFrente(db, loteId, profundidade = 0) {
  const lote = (db.industrial.lotes || []).find((l) => l.id === loteId);
  if (!lote) return { erro: 'Lote não encontrado.' };
  if (profundidade > 20) return { erro: 'Árvore de transformação longa demais.' };

  const consumidoPor = (db.industrial.execucoes || [])
    .filter((e) => (e.consumos || []).some((c) => c.loteId === lote.id));

  const destinos = consumidoPor.map((e) => {
    const dep = departamento(db, e.departamentoId);
    const consumo = (e.consumos || []).find((c) => c.loteId === lote.id) || {};
    return {
      execucao: e.codigo,
      departamento: dep ? dep.nome : '',
      data: e.data,
      consumido: num(consumo.quantidade),
      saidas: (e.saidas || []).map((s) => {
        const adiante = rastrearParaFrente(db, s.loteId, profundidade + 1);
        return {
          lote: s.loteCodigo, loteId: s.loteId, item: s.nome, quantidade: num(s.quantidade),
          custoUnitario: num(s.custoUnitario),
          destinos: adiante.erro ? [] : adiante.destinos,
          entregue: adiante.erro ? null : adiante.entregue,
        };
      }),
    };
  });

  /* ponta da linha: produto acabado parado no estoque, e a carteira que o espera */
  const item = (db.industrial.itens || []).find((i) => i.id === lote.itemId);
  const entregue = item && item.tipo === 'PRODUTO_ACABADO'
    ? (db.industrial.carteira || [])
      .filter((l) => l.itemId === item.id)
      .map((l) => {
        const cliente = (db.clientes || []).find((c) => c.id === l.clienteId);
        return { pedido: l.pedido || l.codigo, cliente: cliente ? (cliente.nomeFantasia || cliente.nome) : 'estoque',
          quantidade: num(l.quantidade) };
      })
    : null;

  return {
    loteId: lote.id,
    lote: lote.codigo,
    item: item ? item.nome : '',
    quantidade: num(lote.quantidade),
    data: lote.data,
    destinos,
    entregue,
    consumido: destinos.length > 0,
  };
}

/* ======================================================== §39 simulação */

/** "E se eu produzir 20.000?" — refaz a conta inteira sem gravar nada. */
export function simular(db, itemId, quantidades, opcoes = {}) {
  return quantidades.map((quantidade) => {
    const explosao = explodirBOM(db, itemId, quantidade, opcoes);
    if (explosao.erro) return { quantidade, erro: explosao.erro };
    const mrp = calcularMRP(db, explosao);
    const capacidade = calcularCapacidade(db, explosao, { ...opcoes, quantidade });
    const budget = calcularBudget(db, explosao, { registrar: false });
    return {
      quantidade,
      compra: mrp.totalCompra,
      itensAComprar: mrp.itensAComprar,
      custoIndustrial: budget.custoIndustrial,
      custoPorPeca: budget.custoPorPeca,
      horas: arredondar(budget.minutosTotais / 60, 1),
      ocupacao: capacidade.ocupacaoGeral,
      gargalos: capacidade.gargalos.map((g) => g.mensagem),
    };
  });
}

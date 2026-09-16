/**
 * MÓDULO INDUSTRIAL V3 — teste do fluxo completo (§28, §29, §41)
 *
 * `testarFluxoCompletoERPIndustrial(db)` roda a fábrica inteira sobre uma
 * CÓPIA da base: cadastro → engenharia → carteira → MRP → requisição →
 * pedido → recebimento (com lote) → reserva → ordem → cinco processos →
 * produto acabado → rastro → custo → auditoria.
 *
 * Trinta passos numerados, cada um com uma conta que confere. Não é um teste
 * de que "a tela abre": é a prova de que o número que o budget prometeu é o
 * número que a produção realizou, e que o rolo que entrou pela nota fiscal é
 * o rolo que saiu dentro da camiseta.
 *
 * Roda no Node (`node --test`) e dentro do sistema, na aba Integração.
 */

import {
  prepararIndustrial, migrarIndustrialV3, disponivelEmProcesso, localDoDepartamento,
  num, arredondar,
} from './modelo.mjs';
import {
  explodirBOM, calcularMRP, calcularCapacidade, budgetsDaCarteira,
  executarTransformacao, custoAcumulado, rastrear, rastrearParaFrente,
  realizadoVersusBudget, liberarParaCostura,
} from './motores.mjs';
import { conferirEngenharia } from './cadastro.mjs';
import { abrirOrdem, resumoDaOrdem } from './ordens.mjs';
import { disponivelParaOrdem } from './reservas.mjs';
import {
  gerarRequisicoes, aprovarRequisicao, criarPedidoCompra, receberPedido,
  dataLimiteDeCompra, entradasProgramadasDe,
} from './compras.mjs';
import { auditarIndustrial, reconciliarEstoqueIndustrial } from './auditoria.mjs';
import {
  resolverMaterialIndustrial, converterUnidadeMaterial,
  auditarIntegracaoMateriaisEngenhariaIndustrial, indicadoresDeIntegracao,
} from './integracao.mjs';
import { montarDemonstracao } from './demonstracao.mjs';
import { produtosDaEngenharia, derivarProdutoDaEngenharia } from './engenharia.mjs';

/* Os nomes com que a demonstração batiza cada peça: é por eles que o cenário
   é reconhecido quando já está na base. */
const ITENS_DO_CENARIO = {
  malha: 'MALHA PV', linha: 'LINHA 120', etiqueta: 'ETIQUETA BORDADA', entretela: 'ENTRETELA',
  tinta: 'TINTA BASE', tela: 'TELA SILK', saco: 'SACO PL', tag: 'TAG PAPEL',
  frente: 'FRENTE CORTADA', costas: 'COSTAS CORTADA', manga: 'MANGA CORTADA',
  golaCortada: 'GOLA CORTADA', golaPreparada: 'GOLA PREPARADA',
  frenteEstampada: 'FRENTE ESTAMPADA', emProcesso: 'CAMISETA COSTURADA',
  camiseta: 'CAMISETA BÁSICA',
};
const SETORES_DO_CENARIO = ['corte', 'preparacao', 'estamparia', 'costura', 'acabamento'];
const PROCESSOS_DO_CENARIO = {
  corte: 'Corte', preparacao: 'Preparação', silk: 'Estamparia',
  costura: 'Costura', acabamento: 'Acabamento',
};

/** O cenário da camiseta já montado na base, ou null se ele não estiver lá. */
function cenarioExistente(db) {
  const semAcento = (t) => String(t).toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const achar = (trecho) => (db.industrial.itens || []).find(
    (i) => i.ativo !== false && semAcento(i.nome).includes(semAcento(trecho)));

  const itens = {};
  for (const [chave, nome] of Object.entries(ITENS_DO_CENARIO)) {
    const item = achar(nome);
    if (!item) return null;
    itens[chave] = item;
  }

  const departamentos = {};
  for (const chave of SETORES_DO_CENARIO) {
    const dep = (db.departamentos || []).find((d) => semAcento(d.nome) === semAcento(
      chave === 'preparacao' ? 'Preparação' : chave));
    if (!dep) return null;
    departamentos[chave] = dep;
  }

  const transformacoes = {};
  for (const [chave, setor] of Object.entries(PROCESSOS_DO_CENARIO)) {
    const dep = (db.departamentos || []).find((d) => semAcento(d.nome) === semAcento(setor));
    const trf = (db.industrial.transformacoes || []).find(
      (t) => t.ativa !== false && dep && t.departamentoId === dep.id);
    if (!trf) return null;
    transformacoes[chave] = trf;
  }

  return {
    itens, transformacoes, departamentos,
    carteira: (db.industrial.carteira || []).filter((l) => l.itemId === itens.camiseta.id),
  };
}

/** Fotografia do almoxarifado, para provar que uma função não mexeu nele. */
const fotoDoEstoque = (db) => JSON.stringify({
  saldos: (db.saldos || []).map((s) => [s.materialId, s.estoqueId, num(s.fisico), num(s.reservado)]),
  movimentos: (db.movimentacoes || []).length,
  lotes: (db.industrial?.lotes || []).length,
});

export function testarFluxoCompletoERPIndustrial(baseOriginal, opcoes = {}) {
  /* cópia profunda: a base do usuário não é tocada em passo nenhum */
  const db = JSON.parse(JSON.stringify(baseOriginal));
  prepararIndustrial(db);
  migrarIndustrialV3(db);

  const usuario = { nome: opcoes.usuario?.nome || 'Teste de fluxo', perfil: 'Sistema' };
  const quantidade = num(opcoes.quantidade) || 10000;
  const resultados = [];
  const ctx = {};

  const passo = (numero, nome, fn) => {
    /* um passo que falha não interrompe a bateria: os seguintes que dependem
       dele falham por dependência, e o relatório mostra onde começou */
    try {
      const r = fn() || {};
      resultados.push({ numero, nome, situacao: r.alerta ? 'alerta' : 'ok', detalhe: r.detalhe || '' });
    } catch (e) {
      resultados.push({ numero, nome, situacao: 'falha', detalhe: e.message });
    }
  };
  const exigir = (condicao, mensagem) => { if (!condicao) throw new Error(mensagem); };
  const semErro = (r, contexto) => { exigir(r && !r.erro, `${contexto}: ${r?.erro || 'sem resposta'}`); return r; };
  const perto = (a, b, tolerancia, mensagem) => exigir(
    Math.abs(num(a) - num(b)) <= tolerancia,
    `${mensagem} — ${arredondar(a, 4)} contra ${arredondar(b, 4)} (tolerância ${tolerancia})`);

  /* ============================================ 1 a 4 — base e cadastro */

  /* 1 */ passo(1, 'Base migrada para a versão 3', () => {
    exigir(num(db.industrial.versao) === 3, `versão ${db.industrial.versao}`);
    exigir(Array.isArray(db.industrial.lotes), 'a base não tem coleção de lotes');
    return { detalhe: `versão ${db.industrial.versao} · ${(db.materiais || []).length} materiais no almoxarifado` };
  });

  /* 2 */ passo(2, `Engenharia do sistema ligada e cenário de ${quantidade} camisetas montado`, () => {
    /* o produto cadastrado na Engenharia é a origem: antes de qualquer coisa,
       o que a fábrica já tem cadastrado entra no industrial — derivado, não
       redigitado */
    const antes = produtosDaEngenharia(db);
    for (const l of antes.linhas) {
      if (l.derivado || l.pendencias.length) continue;
      const r = derivarProdutoDaEngenharia(db, l.produtoId, usuario);
      exigir(!r.erro, `derivar ${l.codigo}: ${r.erro}`);
    }
    const depois = produtosDaEngenharia(db);
    exigir(depois.derivados === depois.total,
      `${depois.derivados} de ${depois.total} produtos da Engenharia no industrial`);
    exigir(depois.divergentes === 0, `${depois.divergentes} produto(s) divergindo da ficha`);
    ctx.engenharia = depois;

    /* se a base já tem o cenário, ele é reaproveitado: montar de novo criaria
       um segundo item para cada material, que é exatamente a duplicidade que
       a V3 existe para impedir (§37) */
    const existente = cenarioExistente(db);
    ctx.cenario = existente || montarDemonstracao(db, { quantidade });
    ctx.reaproveitado = !!existente;
    const { itens, transformacoes } = ctx.cenario;
    exigir(itens.camiseta && itens.malha, 'o cenário não tem os itens da camiseta');
    exigir(Object.keys(transformacoes).length === 5, 'o cenário precisa dos cinco processos');
    exigir(Object.keys(itens).length >= 14, `${Object.keys(itens).length} itens no cenário`);
    return {
      detalhe: `${ctx.engenharia.total} produto(s) da Engenharia derivado(s) · `
        + `${Object.keys(itens).length} itens do cenário · 5 transformações · `
        + `${ctx.reaproveitado ? 'cenário já existente reaproveitado' : `${ctx.cenario.carteira.length} linhas de carteira criadas`}`,
    };
  });

  /* 3 */ passo(3, 'Todo item comprado resolve para um material do almoxarifado', () => {
    const comprados = (db.industrial.itens || []).filter((i) => i.ativo !== false && i.materialId);
    exigir(comprados.length >= 8, `só ${comprados.length} itens comprados`);
    for (const it of comprados) {
      const r = resolverMaterialIndustrial(db, it.id);
      exigir(r.vinculado && r.material, `${it.nome}: ${r.erro || 'sem material'}`);
      exigir(!r.unidadeDivergente, `${it.nome}: unidade ${it.unidade} ≠ ${r.unidade}`);
    }
    const malha = resolverMaterialIndustrial(db, ctx.cenario.itens.malha.id);
    exigir(num(malha.custo) > 0, 'a malha resolveu sem custo');
    exigir(malha.origemCusto === 'medio' || malha.origemCusto === 'ultimo',
      `custo da malha veio de ${malha.origemCusto}`);
    return { detalhe: `${comprados.length} itens ligados · malha a ${arredondar(malha.custo, 4)}/${malha.unidade}` };
  });

  /* 4 */ passo(4, 'Conversão de unidade não duplica cadastro', () => {
    const malha = resolverMaterialIndustrial(db, ctx.cenario.itens.malha.id);
    const igual = converterUnidadeMaterial(db, {
      materialId: malha.materialId, quantidade: 100, de: malha.unidade, para: malha.unidade,
    });
    semErro(igual, 'converter na mesma unidade');
    exigir(igual.fator === 1 && igual.destino.quantidade === 100, 'a unidade igual mudou de quantidade');
    const impossivel = converterUnidadeMaterial(db, {
      materialId: malha.materialId, quantidade: 1, de: 'CONTAINER', para: malha.unidade,
    });
    exigir(impossivel.erro, 'converteu de uma unidade que ninguém cadastrou');
    return { detalhe: `1:1 em ${malha.unidade} · conversão inexistente recusada com frase` };
  });

  /* ================================= 5 a 8 — engenharia e necessidade */

  /* 5 */ passo(5, 'Engenharia do produto acabado está completa', () => {
    const r = conferirEngenharia(db, ctx.cenario.itens.camiseta.id);
    exigir(r.pronto, `pendências: ${r.pendencias.slice(0, 2).join(' · ')}`);
    return { detalhe: 'estrutura, roteiro, tempos e custos presentes' };
  });

  /* 6 */ passo(6, 'Explosão da BOM desce os cinco níveis', () => {
    const explosao = semErro(
      explodirBOM(db, ctx.cenario.itens.camiseta.id, quantidade, { considerarEstoque: false }),
      'explodir BOM');
    ctx.explosao = explosao;
    const setores = explosao.producao.map((p) => p.departamento);
    exigir(setores.length === 5, `${setores.length} processos`);
    exigir(explosao.avisos.length === 0, `avisos: ${explosao.avisos.join(' · ')}`);
    return { detalhe: setores.join(' → ') };
  });

  /* 7 */ passo(7, 'Coproduto do corte não multiplica o tecido', () => {
    const { itens } = ctx.cenario;
    const acha = (id) => ctx.explosao.necessidades.find((l) => l.itemId === id) || {};
    const frente = num(acha(itens.frente.id).bruta);
    const manga = num(acha(itens.manga.id).bruta);
    const malha = num(acha(itens.malha.id).bruta);
    /* o silk refuga 2%: 10.000 frentes boas exigem 10.200 cortadas */
    exigir(frente === 10200 * (quantidade / 10000), `frente cortada: ${frente}`);
    exigir(manga === frente * 2, `manga: ${manga} deveria ser o dobro da frente`);
    /* 10.200 peças enfestadas × 0,55 kg = 5.610 kg — e não 4 × isso */
    perto(malha, frente * 0.55, 0.01, 'a necessidade de malha não bate com o enfesto');
    return { detalhe: `${frente} frentes · ${manga} mangas · ${malha} kg de malha (= ${frente} × 0,55)` };
  });

  /* 8 */ passo(8, 'MRP separa bruta, disponível, reservado e a comprar', () => {
    const comEstoque = semErro(explodirBOM(db, ctx.cenario.itens.camiseta.id, quantidade), 'explodir com estoque');
    const mrp = semErro(calcularMRP(db, comEstoque), 'calcular MRP');
    ctx.mrp = mrp;
    const malha = mrp.linhas.find((l) => l.itemId === ctx.cenario.itens.malha.id);
    exigir(malha, 'a malha não apareceu no MRP');
    perto(malha.comprar, Math.max(malha.bruta - malha.disponivel - malha.programadas + malha.seguranca, 0),
      0.01, 'a necessidade líquida não fecha com a fórmula');
    exigir(mrp.linhas.some((l) => l.comprar > 0), 'a carteira de 10.000 não gerou compra nenhuma');
    return { detalhe: `${mrp.linhas.length} linhas · ${mrp.itensAComprar} a comprar · R$ ${mrp.totalCompra}` };
  });

  /* ==================================== 9 a 16 — compras e recebimento */

  /* 9 */ passo(9, 'O MRP não altera estoque nenhum', () => {
    const antes = fotoDoEstoque(db);
    calcularMRP(db, explodirBOM(db, ctx.cenario.itens.camiseta.id, quantidade));
    calcularMRP(db, explodirBOM(db, ctx.cenario.itens.camiseta.id, quantidade * 3));
    exigir(fotoDoEstoque(db) === antes, 'calcular o MRP mexeu no saldo, no extrato ou nos lotes');
    return { detalhe: 'dois cálculos seguidos · saldos, movimentações e lotes intactos' };
  });

  /* 10 */ passo(10, 'Data limite de compra respeita o lead time', () => {
    const malha = ctx.mrp.linhas.find((l) => l.itemId === ctx.cenario.itens.malha.id);
    const prazo = dataLimiteDeCompra(db, malha.materialId, '2099-12-31');
    exigir(prazo.dataLimite < '2099-12-31' || prazo.leadTimeDias === 0,
      `lead time ${prazo.leadTimeDias} não recuou a data`);
    exigir(prazo.atrasada === false, 'uma compra para 2099 apareceu como atrasada');
    return { detalhe: `lead ${prazo.leadTimeDias} dias · colocar até ${prazo.dataLimite}` };
  });

  /* 11 */ passo(11, 'A falta do MRP vira requisição de compra', () => {
    const faltas = ctx.mrp.linhas.filter((l) => l.comprar > 0 && l.materialId);
    const r = semErro(gerarRequisicoes(db, { linhas: faltas, origem: 'teste-v3' }, usuario), 'gerar requisições');
    exigir(r.criadas.length > 0, 'nenhuma requisição criada');
    ctx.requisicoes = r.criadas;
    for (const req of r.criadas) exigir(req.status === 'pendente', `${req.codigo} nasceu ${req.status}`);
    return { detalhe: `${r.criadas.length} requisição(ões) · ${r.puladas.length} pulada(s) por já existirem` };
  });

  /* 12 */ passo(12, 'Requisição aprovada muda de estado, não de quantidade', () => {
    const req = ctx.requisicoes[0];
    const quantidadeAntes = num(req.quantidade);
    semErro(aprovarRequisicao(db, req.id, usuario), 'aprovar requisição');
    const depois = db.industrial.requisicoesCompra.find((r) => r.id === req.id);
    exigir(depois.status === 'aprovada', `status ${depois.status}`);
    exigir(num(depois.quantidade) === quantidadeAntes, 'aprovar mexeu na quantidade');
    exigir(aprovarRequisicao(db, req.id, usuario).erro, 'aprovou duas vezes a mesma requisição');
    return { detalhe: `${depois.codigo} aprovada · ${quantidadeAntes} ${depois.unidade || ''}`.trim() };
  });

  /* 13 */ passo(13, 'Pedido de compra agrupa requisições por fornecedor', () => {
    const r = semErro(criarPedidoCompra(db, { requisicaoIds: ctx.requisicoes.map((x) => x.id) }, usuario),
      'criar pedido');
    exigir(r.pedidos.length > 0, 'nenhum pedido criado');
    ctx.pedidos = r.pedidos;
    const fornecedores = new Set(r.pedidos.map((p) => p.fornecedorId));
    exigir(fornecedores.size === r.pedidos.length, 'dois pedidos para o mesmo fornecedor');
    const itensPedidos = r.pedidos.reduce((s, p) => s + p.itens.length, 0);
    exigir(itensPedidos === ctx.requisicoes.length,
      `${itensPedidos} itens para ${ctx.requisicoes.length} requisições`);
    exigir(num(r.valor) > 0, 'o pedido saiu sem valor');
    return { detalhe: `${r.pedidos.length} pedido(s) · ${itensPedidos} item(ns) · R$ ${arredondar(r.valor, 2)}` };
  });

  /* 14 */ passo(14, 'Pedido colocado vira entrada programada no MRP', () => {
    const malha = ctx.mrp.linhas.find((l) => l.itemId === ctx.cenario.itens.malha.id);
    const programado = entradasProgramadasDe(db, malha.materialId);
    exigir(programado > 0, 'o pedido não apareceu como entrada programada');
    const novo = calcularMRP(db, explodirBOM(db, ctx.cenario.itens.camiseta.id, quantidade));
    const linha = novo.linhas.find((l) => l.itemId === malha.itemId);
    exigir(linha.status === 'compra_programada' || linha.comprar === 0,
      `com pedido colocado a linha ficou ${linha.status}`);
    return { detalhe: `${arredondar(programado, 3)} ${malha.unidade} a caminho · status ${linha.statusNome}` };
  });

  /* 15 */ passo(15, 'Recebimento cria movimentação E lote, não só um saldo', () => {
    const movimentosAntes = (db.movimentacoes || []).length;
    const lotesAntes = (db.industrial.lotes || []).length;
    for (const pedido of ctx.pedidos) {
      semErro(receberPedido(db, { pedidoId: pedido.id, documento: `NF ${pedido.codigo}` }, usuario),
        `receber ${pedido.codigo}`);
    }
    const criados = (db.industrial.lotes || []).length - lotesAntes;
    const movimentos = (db.movimentacoes || []).length - movimentosAntes;
    exigir(criados === movimentos, `${movimentos} movimentações para ${criados} lotes`);
    exigir(criados > 0, 'o recebimento não criou lote nenhum');
    ctx.lotesDeCompra = (db.industrial.lotes || []).slice(lotesAntes);
    return { detalhe: `${movimentos} movimentação(ões) e ${criados} lote(s) de compra` };
  });

  /* 16 */ passo(16, 'O lote recebido sabe fornecedor, documento, custo e saldo', () => {
    for (const lote of ctx.lotesDeCompra) {
      exigir(lote.origem === 'compra', `${lote.codigo} nasceu com origem ${lote.origem}`);
      exigir(lote.materialId, `${lote.codigo} sem material`);
      exigir(lote.movimentoId, `${lote.codigo} sem movimentação de origem`);
      exigir(lote.fornecedorId, `${lote.codigo} sem fornecedor`);
      exigir(String(lote.documento).length > 0, `${lote.codigo} sem documento`);
      exigir(num(lote.custoUnitario) > 0, `${lote.codigo} sem custo`);
      exigir(num(lote.saldo) === num(lote.quantidade), `${lote.codigo} nasceu com saldo parcial`);
    }
    const um = ctx.lotesDeCompra[0];
    return { detalhe: `${um.codigo} · ${arredondar(um.quantidade, 3)} a ${arredondar(um.custoUnitario, 4)} · ${um.documento}` };
  });

  /* ================================== 17 a 21 — ordem, reserva, budget */

  /* 17 */ passo(17, 'Com tudo recebido, o MRP não pede mais compra', () => {
    const mrp = calcularMRP(db, explodirBOM(db, ctx.cenario.itens.camiseta.id, quantidade));
    const faltando = mrp.linhas.filter((l) => l.comprar > 0);
    exigir(faltando.length === 0,
      `ainda faltam: ${faltando.map((l) => `${l.nome} ${l.comprar}`).join(' · ')}`);
    return { detalhe: 'necessidade líquida zerada para a carteira inteira' };
  });

  /* 18 */ passo(18, 'Ordem de produção abre com código, plano e reserva', () => {
    const r = semErro(abrirOrdem(db, {
      itemId: ctx.cenario.itens.camiseta.id, quantidade,
      pedido: 'PED-V3', entrega: '2099-12-31',
    }, usuario), 'abrir ordem');
    ctx.ordem = r.ordem;
    ctx.plano = r.plano;
    exigir(/^OP-\d{4}-\d{4}$/.test(r.ordem.codigoOrdem), `código ${r.ordem.codigoOrdem}`);
    exigir(r.plano.ordens.length === 5, `${r.plano.ordens.length} ordens de processo`);
    exigir(r.reserva.feitas.length > 0, 'a ordem nasceu sem reservar material');
    exigir(r.reserva.faltantes.length === 0,
      `faltou reservar: ${r.reserva.faltantes.map((f) => f.nome).join(' · ')}`);
    return { detalhe: `${r.ordem.codigoOrdem} · ${r.plano.ordens.length} etapas · ${r.reserva.feitas.length} materiais reservados · custo planejado R$ ${arredondar(r.custoPlanejado, 2)}` };
  });

  /* 19 */ passo(19, 'Reserva separa físico, reservado e disponível', () => {
    const malha = resolverMaterialIndustrial(db, ctx.cenario.itens.malha.id, { consolidacaoId: ctx.ordem.id });
    const posicao = disponivelParaOrdem(db, malha.materialId, ctx.ordem.id);
    exigir(num(posicao.reservado) > 0, 'nada reservado para a ordem');
    perto(posicao.livre, num(posicao.fisico) - num(posicao.reservado), 0.01,
      'livre não é físico menos reservado');
    perto(posicao.paraAOrdem, num(posicao.livre) + num(posicao.reservadoDaOrdem), 0.01,
      'o que a ordem reservou não voltou para ela');
    exigir(num(posicao.paraAOrdem) >= num(posicao.livre), 'a ordem enxergou menos do que o estoque livre');
    return { detalhe: `físico ${arredondar(posicao.fisico, 2)} · reservado ${arredondar(posicao.reservado, 2)} · livre ${arredondar(posicao.livre, 2)} · para a ordem ${arredondar(posicao.paraAOrdem, 2)}` };
  });

  /* 20 */ passo(20, 'Os quatro budgets respondem perguntas diferentes', () => {
    const explosao = semErro(explodirBOM(db, ctx.cenario.itens.camiseta.id, quantidade), 'explodir para budget');
    const b = semErro(budgetsDaCarteira(db, explosao, { consolidacaoId: ctx.ordem.id }), 'budgets da carteira');
    ctx.budget = b;
    exigir(num(b.industrial.custoIndustrial) > 0, 'budget industrial zerado');
    exigir(num(b.consumo.total) > 0, 'budget de consumo zerado');
    exigir(num(b.caixa.necessidadeDeCaixa) >= num(b.compras.total),
      'a necessidade de caixa ficou menor que o que há para comprar');
    /* com tudo já comprado, o consumo é maior que a compra: é a prova de que
       os dois não são o mesmo número com nomes diferentes */
    exigir(num(b.consumo.total) >= num(b.compras.total),
      'consumo e compras se misturaram');
    return { detalhe: `industrial R$ ${b.industrial.custoIndustrial} · consumo R$ ${b.consumo.total} · compras R$ ${b.compras.total} · caixa R$ ${b.caixa.necessidadeDeCaixa}` };
  });

  /* 21 */ passo(21, 'Capacidade compara minutos necessários com minutos que existem', () => {
    const capacidade = semErro(calcularCapacidade(db, ctx.explosao, { quantidade, dias: 22 }), 'capacidade');
    exigir(capacidade.linhas.length === 5, `${capacidade.linhas.length} setores`);
    for (const l of capacidade.linhas) {
      exigir(num(l.minutosNecessarios) > 0, `${l.departamento} sem minutos necessários`);
      exigir(['normal', 'risco', 'gargalo'].includes(l.situacao), `${l.departamento}: ${l.situacao}`);
    }
    exigir(num(capacidade.takt) > 0, 'takt zerado');
    const gargalo = [...capacidade.linhas].sort((a, b) => num(b.ocupacao) - num(a.ocupacao))[0];
    return { detalhe: `takt ${arredondar(capacidade.takt, 3)} min/peça · gargalo ${gargalo.departamento} a ${arredondar(gargalo.ocupacao, 1)}%` };
  });

  /* ============================== 22 a 27 — produção pelos cinco setores */

  /* a transformação do silk roda na Estamparia: o nome do processo e o nome
     do setor não são a mesma chave */
  const SETOR_DO_PROCESSO = {
    corte: 'corte', preparacao: 'preparacao', silk: 'estamparia',
    costura: 'costura', acabamento: 'acabamento',
  };

  const executar = (chave, saidas, extra = {}) => {
    const { transformacoes, departamentos } = ctx.cenario;
    const dep = departamentos[SETOR_DO_PROCESSO[chave]];
    const demanda = ctx.plano.demandas.find((d) => d.departamentoId === dep.id);
    const ordemProcesso = ctx.plano.ordens.find((o) => o.departamentoId === dep.id);
    const r = executarTransformacao(db, {
      transformacaoId: transformacoes[chave].id,
      demandaId: demanda ? demanda.id : '',
      ordemId: ordemProcesso ? ordemProcesso.id : '',
      consolidacaoId: ctx.ordem.id,
      saidas,
      ...extra,
    }, usuario);
    return semErro(r, `executar ${chave}`);
  };

  /* 22 */ passo(22, 'Corte consome malha reservada e entrega os quatro cortes', () => {
    const { itens, departamentos } = ctx.cenario;
    const fator = quantidade / 10000;
    const r = executar('corte', [
      { itemId: itens.frente.id, quantidade: 10200 * fator },
      { itemId: itens.costas.id, quantidade: 10200 * fator },
      { itemId: itens.manga.id, quantidade: 20400 * fator },
      { itemId: itens.golaCortada.id, quantidade: 10200 * fator },
    ]);
    ctx.corte = r.execucao;
    const consumo = r.execucao.consumos.find((c) => c.itemId === itens.malha.id);
    exigir(consumo, 'o corte não consumiu malha');
    perto(consumo.quantidade, 5610 * fator, 0.01, 'consumo de malha fora do enfesto');
    exigir(num(consumo.daReserva) > 0, 'o consumo não baixou a reserva da ordem');
    const local = localDoDepartamento(departamentos.corte);
    exigir(disponivelEmProcesso(db, itens.frente.id, local) === 10200 * fator, 'frentes não entraram no corte');
    return { detalhe: `${arredondar(consumo.quantidade, 2)} kg de malha · ${10200 * fator} frentes · R$ ${arredondar(r.execucao.custos.total, 2)}` };
  });

  /* 23 */ passo(23, 'O consumo gravou de que lote de compra o tecido saiu', () => {
    const consumo = ctx.corte.consumos.find((c) => c.itemId === ctx.cenario.itens.malha.id);
    exigir((consumo.lotes || []).length > 0, 'o consumo de malha não guardou lote nenhum');
    const somaLotes = consumo.lotes.reduce((s, l) => s + num(l.quantidade), 0);
    perto(somaLotes + num(consumo.semLote), consumo.quantidade, 0.01,
      'os lotes do consumo não somam o que foi consumido');
    /* FIFO: o saldo de abertura sai antes do rolo que acabou de chegar */
    const lotes = consumo.lotes.map((l) => db.industrial.lotes.find((x) => x.id === l.loteId));
    exigir(lotes.every(Boolean), 'o consumo aponta para um lote que não existe');
    exigir(lotes.every((l) => ['compra', 'ajuste'].includes(l.origem)),
      `origem inesperada: ${lotes.map((l) => l.origem).join(' · ')}`);
    for (const l of lotes) {
      exigir(num(l.saldo) < num(l.quantidade), `${l.codigo} foi consumido e manteve o saldo cheio`);
    }
    const ordem = lotes.map((l) => l.data);
    exigir(ordem.join('') === [...ordem].sort().join(''), `os lotes saíram fora do FIFO: ${ordem.join(' · ')}`);
    const deCompra = lotes.find((l) => l.origem === 'compra');
    exigir(deCompra, 'o rolo recebido pela nota fiscal não entrou no consumo');
    ctx.loteDeOrigem = deCompra;
    return { detalhe: `${lotes.length} lote(s) FIFO: ${lotes.map((l) => `${l.codigo} (${l.origem})`).join(' · ')}` };
  });

  /* 24 */ passo(24, 'A costura recusa enquanto faltar componente, e diz o que falta', () => {
    const ordemCostura = ctx.plano.ordens.find((o) => o.departamentoId === ctx.cenario.departamentos.costura.id);
    ctx.ordemCostura = ordemCostura;
    const r = liberarParaCostura(db, ordemCostura.id, usuario);
    exigir(r.liberada === false, 'a costura foi liberada sem o silk e sem a preparação');
    const faltas = r.faltas.map((f) => f.nome);
    exigir(faltas.includes('FRENTE ESTAMPADA'), `faltas: ${faltas.join(' · ')}`);
    return { detalhe: `bloqueada por ${faltas.length} componente(s): ${faltas.join(' · ')}` };
  });

  /* 25 */ passo(25, 'Preparação e silk entregam gola preparada e frente estampada', () => {
    const { itens } = ctx.cenario;
    const fator = quantidade / 10000;
    const prep = executar('preparacao', [{ itemId: itens.golaPreparada.id, quantidade: 10000 * fator }]);
    const silk = executar('silk', [{ itemId: itens.frenteEstampada.id, quantidade: 10000 * fator }], {
      perdas: [{ itemId: itens.frente.id, quantidade: 200 * fator, motivo: 'erro_estampa', custoUnitario: 3.1 }],
    });
    exigir(disponivelEmProcesso(db, itens.frenteEstampada.id) === 10000 * fator, 'frentes estampadas não entraram');
    exigir(disponivelEmProcesso(db, itens.frente.id) === 0, 'sobrou frente cortada que devia ter entrado no silk');
    /* as 200 golas a mais do enfesto ficam no corte, não somem */
    exigir(disponivelEmProcesso(db, itens.golaCortada.id) === 200 * fator,
      `sobra de gola: ${disponivelEmProcesso(db, itens.golaCortada.id)}`);
    ctx.silk = silk.execucao;
    return { detalhe: `${10000 * fator} golas preparadas · ${10000 * fator} frentes estampadas · ${200 * fator} refugadas · ${200 * fator} golas sobrando no corte` };
  });

  /* 26 */ passo(26, 'Com os componentes prontos, a costura é liberada e monta', () => {
    const { itens } = ctx.cenario;
    const fator = quantidade / 10000;
    const liberacao = liberarParaCostura(db, ctx.ordemCostura.id, usuario);
    exigir(liberacao.liberada === true, `ainda falta: ${JSON.stringify(liberacao.faltas)}`);
    executar('costura', [{ itemId: itens.emProcesso.id, quantidade: quantidade }]);
    exigir(disponivelEmProcesso(db, itens.emProcesso.id) === quantidade, 'a costura não entregou tudo');
    exigir(disponivelEmProcesso(db, itens.frenteEstampada.id) === 0, 'sobrou frente estampada');
    exigir(disponivelEmProcesso(db, itens.manga.id) === 400 * fator,
      `sobra de manga: ${disponivelEmProcesso(db, itens.manga.id)}`);
    return { detalhe: `${quantidade} camisetas costuradas · ${400 * fator} mangas de coproduto sobrando` };
  });

  /* 27 */ passo(27, 'Acabamento entrega produto acabado com custo acumulado', () => {
    const { itens } = ctx.cenario;
    const r = executar('acabamento', [{ itemId: itens.camiseta.id, quantidade }]);
    ctx.acabamento = r.execucao;
    exigir(disponivelEmProcesso(db, itens.camiseta.id) === quantidade, 'o produto acabado não entrou no estoque');
    const saida = r.execucao.saidas.find((s) => s.itemId === itens.camiseta.id);
    exigir(num(saida.custoUnitario) > 0, 'a camiseta saiu sem custo');
    ctx.loteAcabado = db.industrial.lotes.find((l) => l.id === saida.loteId);
    exigir(ctx.loteAcabado, 'o acabamento não gerou lote do produto');
    return { detalhe: `${quantidade} camisetas · lote ${ctx.loteAcabado.codigo} · R$ ${arredondar(saida.custoUnitario, 4)}/peça` };
  });

  /* ================================= 28 a 30 — rastro, custo, auditoria */

  /* 28 */ passo(28, 'Rastro para trás vai da camiseta ao rolo e ao fornecedor', () => {
    const arvore = semErro(rastrear(db, ctx.loteAcabado.id), 'rastrear para trás');
    const raizes = [];
    const descer = (no, nivel) => {
      if (nivel > 12) return;
      for (const origem of no.origens || []) {
        if (origem.tipo === 'compra' || origem.tipo === 'abertura') raizes.push(origem);
        else descer(origem, nivel + 1);
      }
    };
    descer(arvore, 0);
    exigir(raizes.length > 0, 'o rastro parou antes de chegar à origem do material');
    /* toda ponta é identificada: ou uma nota fiscal, ou o saldo de abertura
       declarado como tal — nunca "apareceu do nada" */
    const semIdentidade = raizes.filter((r) => !r.documento);
    exigir(semIdentidade.length === 0, `${semIdentidade.length} ponta(s) do rastro sem documento`);
    const compras = raizes.filter((r) => r.tipo === 'compra' && r.fornecedorId && r.documento);
    exigir(compras.length > 0, 'nenhuma nota fiscal de compra apareceu na raiz do rastro');
    /* o caminho de volta: rolo → corte → silk → costura → acabamento → camiseta */
    const frente = rastrearParaFrente(db, ctx.loteDeOrigem.id);
    semErro(frente, 'rastrear para a frente');
    exigir(frente.destinos.length > 0, 'o lote de compra não aponta para nenhuma execução');
    ctx.rastro = { raizes: raizes.length, compras: compras.length, primeiro: compras[0] };
    return { detalhe: `${raizes.length} ponta(s) · ${compras.length} de compra · ${compras[0].fornecedor} · ${compras[0].documento}` };
  });

  /* 29 */ passo(29, 'Realizado fecha com o budget e o custo não é contado duas vezes', () => {
    const comparacao = semErro(realizadoVersusBudget(db, ctx.ordem.id), 'realizado × budget');
    const planejado = num(comparacao.budget?.custoIndustrial ?? comparacao.planejado);
    const realizado = num(comparacao.realizado?.total ?? comparacao.realizado);
    exigir(planejado > 0 && realizado > 0, `planejado ${planejado} · realizado ${realizado}`);
    const desvio = Math.abs(realizado - planejado) / planejado * 100;
    exigir(desvio < 10, `desvio de ${arredondar(desvio, 2)}% entre realizado e budget`);
    const acumulado = custoAcumulado(db, ctx.loteAcabado.id);
    if (!acumulado.erro) {
      const etapas = (acumulado.etapas || []).map((e) => e.departamento);
      exigir(new Set(etapas).size === etapas.length, `etapa repetida no custo acumulado: ${etapas.join(' · ')}`);
    }
    return { detalhe: `budget R$ ${arredondar(planejado, 2)} · realizado R$ ${arredondar(realizado, 2)} · desvio ${arredondar(desvio, 2)}%` };
  });

  /* 30 */ passo(30, 'Auditoria, integração e reconciliação fecham', () => {
    const integracao = auditarIntegracaoMateriaisEngenhariaIndustrial(db);
    const industrial = auditarIndustrial(db, { registrar: false, usuario });
    const reconciliacao = reconciliarEstoqueIndustrial(db);
    const indicadores = indicadoresDeIntegracao(db);
    exigir(reconciliacao.conferido,
      `estoque não reconcilia: ${JSON.stringify((reconciliacao.divergencias || []).slice(0, 2))}`);
    exigir(integracao.erros.length === 0,
      `integração: ${integracao.erros.slice(0, 2).map((e) => e.mensagem).join(' · ')}`);
    exigir(industrial.erros.length === 0,
      `industrial: ${industrial.erros.slice(0, 2).map((e) => e.mensagem).join(' · ')}`);
    exigir(num(indicadores.integracao) >= 90,
      `saúde da engenharia industrial em ${indicadores.integracao}%`);
    const resumo = resumoDaOrdem(db, ctx.ordem.id);
    exigir(!resumo.erro, `resumo da ordem: ${resumo.erro}`);
    const alertas = integracao.alertas.length + industrial.alertas.length;
    return {
      alerta: alertas > 0,
      detalhe: `integração ${indicadores.integracao}% · ${alertas} alerta(s) · estoque reconciliado`,
    };
  });

  ctx.indicadores = indicadoresDeIntegracao(db);
  resultados.sort((a, b) => a.numero - b.numero);
  const falhas = resultados.filter((r) => r.situacao === 'falha');
  const alertas = resultados.filter((r) => r.situacao === 'alerta');
  return {
    resultados,
    total: resultados.length,
    ok: resultados.filter((r) => r.situacao === 'ok').length,
    falhas: falhas.length,
    alertas: alertas.length,
    detalhesFalhas: falhas,
    quantidade,
    indicadores: ctx.indicadores,
    quando: new Date().toISOString().slice(0, 19),
  };
}

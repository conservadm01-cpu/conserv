/**
 * MÓDULO INDUSTRIAL V2 — bateria de testes (§47)
 *
 * `testarIndustrialV2(db)` roda os vinte testes do documento sobre uma CÓPIA
 * da base: nada do que ele cria sobrevive, e nenhuma ordem de verdade é
 * tocada. É a mesma bateria que roda no Node (`node --test`) e dentro do
 * sistema, na aba Auditoria — o que passa aqui é o que a fábrica vai usar.
 */

import {
  prepararIndustrial, migrarIndustrialV2, disponivelEmProcesso, num, arredondar,
} from './modelo.mjs';
import {
  explodirBOM, calcularMRP, calcularCapacidade, budgetsDaCarteira,
  executarTransformacao, custoAcumulado, rastrear, rastrearParaFrente,
  wipDaCarteira, realizadoVersusBudget,
} from './motores.mjs';
import { salvarItem, salvarTransformacao, conferirEngenharia } from './cadastro.mjs';
import { abrirOrdem, resumoDaOrdem, conferirComponentes } from './ordens.mjs';
import {
  reservarMaterial, disponivelParaOrdem, saldoReservado, cancelarReserva,
} from './reservas.mjs';
import { gerarRequisicoes, criarPedidoCompra, receberPedido, painelCompras } from './compras.mjs';
import { auditarIndustrial, reconciliarEstoqueIndustrial } from './auditoria.mjs';

export function testarIndustrialV2(baseOriginal, opcoes = {}) {
  /* cópia profunda: o teste não encosta na base do usuário */
  const db = JSON.parse(JSON.stringify(baseOriginal));
  prepararIndustrial(db);
  migrarIndustrialV2(db);

  const usuario = { nome: opcoes.usuario?.nome || 'Teste automático', perfil: 'Sistema' };
  const resultados = [];
  const ctx = {};

  const teste = (numero, nome, fn) => {
    try {
      const r = fn() || {};
      resultados.push({
        numero, nome,
        situacao: r.alerta ? 'alerta' : 'ok',
        detalhe: r.detalhe || '',
      });
    } catch (e) {
      resultados.push({ numero, nome, situacao: 'falha', detalhe: e.message });
    }
  };
  const exigir = (condicao, mensagem) => { if (!condicao) throw new Error(mensagem); };
  const semErro = (r, contexto) => { exigir(r && !r.erro, `${contexto}: ${r?.erro || 'sem resposta'}`); return r; };

  const setor = (nome) => (db.departamentos || []).find((d) => d.nome === nome);
  const material = (trecho) => (db.materiais || []).find((m) => String(m.nome).includes(trecho));
  const marca = `T${Date.now().toString().slice(-6)}`;

  /* 1 */ teste(1, 'Criar matéria-prima', () => {
    const mat = material('TNT 40G') || (db.materiais || [])[0];
    exigir(mat, 'a base não tem material para vincular');
    const r = semErro(salvarItem(db, {
      nome: `MP TESTE ${marca}`, tipo: 'MATERIA_PRIMA', materialId: mat.id, unidade: mat.unidadeEstoque,
    }, usuario), 'criar matéria-prima');
    ctx.mp = r.item;
    exigir(num(ctx.mp.custoPadrao) > 0, 'a matéria-prima não herdou custo do almoxarifado');
    return { detalhe: `${ctx.mp.codigo} ${ctx.mp.nome}` };
  });

  /* 2 */ teste(2, 'Criar subproduto', () => {
    const r = semErro(salvarItem(db, {
      nome: `SUB TESTE ${marca}`, tipo: 'SUBPRODUTO', unidade: 'UN',
      departamentoId: setor('Corte').id,
    }, usuario), 'criar subproduto');
    ctx.sub = r.item;
    const acabado = semErro(salvarItem(db, {
      nome: `PA TESTE ${marca}`, tipo: 'PRODUTO_ACABADO', unidade: 'UN',
      departamentoId: setor('Costura').id,
    }, usuario), 'criar produto acabado');
    ctx.acabado = acabado.item;
    return { detalhe: `${ctx.sub.codigo} e ${ctx.acabado.codigo}` };
  });

  /* 3 */ teste(3, 'Criar transformação', () => {
    const r = semErro(salvarTransformacao(db, {
      nome: `Corte teste ${marca}`, departamentoId: setor('Corte').id,
      entradas: [{ itemId: ctx.mp.id, quantidade: 0.25, perda: 0 }],
      saidas: [{ itemId: ctx.sub.id, quantidade: 1, principal: true }],
      operacoes: [{ nome: 'Cortar', porCiclo: 100,
        tempos: { preparacao: 5, processamento: 30, manuseio: 10 } }],
    }, usuario), 'criar transformação');
    ctx.trf1 = r.transformacao;
    return { detalhe: ctx.trf1.codigo };
  });

  /* 7 (antecipado: a segunda receita fecha a cadeia antes da ordem) */
  teste(7, 'Criar segunda transformação', () => {
    const r = semErro(salvarTransformacao(db, {
      nome: `Costura teste ${marca}`, departamentoId: setor('Costura').id,
      entradas: [{ itemId: ctx.sub.id, quantidade: 1, perda: 0 }],
      saidas: [{ itemId: ctx.acabado.id, quantidade: 1, principal: true }],
      operacoes: [{ nome: 'Costurar', porCiclo: 1, tempos: { processamento: 0.9, manuseio: 0.2 } }],
    }, usuario), 'segunda transformação');
    ctx.trf2 = r.transformacao;
    const conferencia = conferirEngenharia(db, ctx.acabado.id);
    exigir(conferencia.pronto, `engenharia incompleta: ${conferencia.pendencias.join(' · ')}`);
    return { detalhe: `${ctx.trf2.codigo} · engenharia completa` };
  });

  /* 9 (antecipado: o MRP da ordem precisa existir antes de reservar) */
  teste(9, 'Gerar MRP', () => {
    const explosao = explodirBOM(db, ctx.acabado.id, 500);
    semErro(explosao, 'explosão');
    const mrp = calcularMRP(db, explosao, {});
    semErro(mrp, 'MRP');
    const linha = mrp.linhas.find((l) => l.itemId === ctx.mp.id);
    exigir(linha, 'a matéria-prima não apareceu no MRP');
    exigir(linha.bruta === 125, `necessidade bruta ${linha.bruta}, esperado 125`);
    exigir(linha.statusNome, 'a linha do MRP não trouxe situação');
    ctx.mrp = mrp;
    return { detalhe: `${mrp.linhas.length} linhas · ${linha.statusNome}` };
  });

  /* 10 */ teste(10, 'Criar reserva', () => {
    const mat = (db.materiais || []).find((m) => m.id === ctx.mp.materialId);
    const posicao = disponivelParaOrdem(db, mat.id);
    const quantidade = arredondar(Math.min(10, posicao.livre), 3);
    exigir(quantidade > 0, 'não há material livre para reservar');
    const r = semErro(reservarMaterial(db, {
      materialId: mat.id, quantidade, consolidacaoId: 'ordem-teste',
    }, usuario), 'reservar');
    ctx.reserva = r.reserva;
    const depois = disponivelParaOrdem(db, mat.id);
    exigir(Math.abs(depois.livre - (posicao.livre - quantidade)) < 0.001,
      'o disponível não caiu depois da reserva');
    exigir(saldoReservado(db, mat.id).total >= quantidade, 'o reservado não subiu');
    /* a reserva de teste é desfeita: ela era só para provar a conta */
    cancelarReserva(db, ctx.reserva.id, 'teste', usuario);
    return { detalhe: `${quantidade} ${mat.unidadeEstoque} reservados e liberados` };
  });

  /* 13 (abertura da ordem: reserva + requisição nascem daqui) */
  teste(13, 'Liberar ordem', () => {
    const r = semErro(abrirOrdem(db, {
      itemId: ctx.acabado.id, quantidade: 500, entrega: '', observacao: 'ordem de teste',
    }, usuario), 'abrir ordem');
    ctx.ordem = r.ordem;
    ctx.plano = r.plano;
    exigir(r.plano.demandas.length === 2, `esperado 2 etapas, veio ${r.plano.demandas.length}`);
    const resumo = resumoDaOrdem(db, ctx.ordem.id);
    const corte = resumo.etapas.find((e) => e.departamento === 'Corte');
    exigir(corte, 'a ordem não abriu etapa de corte');
    ctx.corte = corte;
    ctx.costura = resumo.etapas.find((e) => e.departamento === 'Costura');
    const conferencia = conferirComponentes(db, ctx.costura.ordemId, usuario);
    exigir(conferencia.liberada === false, 'a costura foi liberada sem o subproduto existir');
    return { detalhe: `${resumo.codigo} · ${resumo.etapas.length} etapas` };
  });

  /* 11 */ teste(11, 'Gerar requisição de compra', () => {
    const mrp = resumoDaOrdem(db, ctx.ordem.id) && calcularMRP(db,
      explodirBOM(db, ctx.acabado.id, 500, { consolidacaoId: ctx.ordem.id }),
      { consolidacaoId: ctx.ordem.id });
    const faltas = mrp.linhas.filter((l) => l.comprar > 0);
    if (faltas.length === 0) {
      /* estoque cobria tudo: requisita mesmo assim, para provar o caminho */
      const linha = mrp.linhas.find((l) => l.materialId);
      const r = semErro(gerarRequisicoes(db, {
        linhas: [{ ...linha, comprar: 50 }], consolidacaoId: ctx.ordem.id, origem: 'teste',
      }, usuario), 'gerar requisição');
      ctx.requisicao = r.criadas[0];
    } else {
      const existentes = (db.industrial.requisicoesCompra || []).filter(
        (r) => r.consolidacaoId === ctx.ordem.id);
      ctx.requisicao = existentes[0];
      exigir(ctx.requisicao, 'a ordem não gerou requisição para a falta');
    }
    exigir(ctx.requisicao.dataLimite, 'a requisição saiu sem data limite de compra');
    return { detalhe: `${ctx.requisicao.codigo} · limite ${ctx.requisicao.dataLimite}` };
  });

  /* 12 */ teste(12, 'Receber material', () => {
    const pedido = semErro(criarPedidoCompra(db, {
      requisicaoIds: [ctx.requisicao.id],
    }, usuario), 'criar pedido');
    ctx.pedido = pedido.pedidos[0];
    const recebimento = semErro(receberPedido(db, {
      pedidoId: ctx.pedido.id, documento: 'NF TESTE',
    }, usuario), 'receber pedido');
    exigir(ctx.pedido.status === 'recebido', `pedido ficou ${ctx.pedido.status}`);
    const req = (db.industrial.requisicoesCompra || []).find((r) => r.id === ctx.requisicao.id);
    exigir(req.status === 'recebida', `requisição ficou ${req.status}`);
    return { detalhe: `${recebimento.recebimento.codigo} · ${ctx.pedido.codigo}` };
  });

  /* 4 */ teste(4, 'Executar transformação', () => {
    const r = semErro(executarTransformacao(db, {
      transformacaoId: ctx.trf1.id,
      demandaId: ctx.corte.demandaId,
      ordemId: ctx.corte.ordemId,
      consolidacaoId: ctx.ordem.id,
      saidas: [{ itemId: ctx.sub.id, quantidade: ctx.corte.planejado }],
    }, usuario), 'executar corte');
    ctx.execucao1 = r.execucao;
    exigir(disponivelEmProcesso(db, ctx.sub.id) === ctx.corte.planejado,
      'o subproduto não entrou no estoque de processo');
    return { detalhe: `${ctx.execucao1.codigo} · ${ctx.corte.planejado} peças` };
  });

  /* 5 */ teste(5, 'Gerar lote', () => {
    const lote = ctx.execucao1.saidas[0];
    exigir(lote && lote.loteId, 'a execução não gerou lote');
    ctx.lote1 = lote;
    const registro = (db.industrial.lotes || []).find((l) => l.id === lote.loteId);
    exigir(registro && registro.execucaoId === ctx.execucao1.id, 'o lote não aponta para a execução');
    return { detalhe: lote.loteCodigo };
  });

  /* 6 */ teste(6, 'Carregar custo', () => {
    exigir(num(ctx.lote1.custoUnitario) > 0, 'o lote saiu sem custo');
    exigir(num(ctx.execucao1.custos.material) > 0, 'a execução não registrou material');
    exigir(num(ctx.execucao1.custos.conversao) > 0, 'a execução não registrou conversão');
    return { detalhe: `R$ ${ctx.lote1.custoUnitario} por peça` };
  });

  /* 14 */ teste(14, 'Executar produção', () => {
    const conferencia = conferirComponentes(db, ctx.costura.ordemId, usuario);
    exigir(conferencia.liberada, `costura não liberou: ${JSON.stringify(conferencia.faltas || [])}`);
    const r = semErro(executarTransformacao(db, {
      transformacaoId: ctx.trf2.id,
      demandaId: ctx.costura.demandaId,
      ordemId: ctx.costura.ordemId,
      consolidacaoId: ctx.ordem.id,
      saidas: [{ itemId: ctx.acabado.id, quantidade: 500 }],
    }, usuario), 'executar costura');
    ctx.execucao2 = r.execucao;
    ctx.loteFinal = r.execucao.saidas[0];
    exigir(disponivelEmProcesso(db, ctx.acabado.id) === 500, 'o produto acabado não entrou no estoque');
    return { detalhe: `${ctx.execucao2.codigo} · 500 peças acabadas` };
  });

  /* 8 */ teste(8, 'Verificar custo acumulado', () => {
    const custo = custoAcumulado(db, ctx.loteFinal.loteId);
    semErro(custo, 'custo acumulado');
    exigir(custo.etapas.length === 2, `esperado 2 etapas na história, veio ${custo.etapas.length}`);
    const material = custo.materialTotal;
    const materialDaPrimeira = num(ctx.execucao1.custos.materialAlmoxarifado);
    exigir(Math.abs(material - materialDaPrimeira) < 0.01,
      `a matéria-prima foi contada duas vezes: ${material} contra ${materialDaPrimeira}`);
    exigir(num(custo.custoUnitario) > num(ctx.lote1.custoUnitario),
      'o custo não cresceu de uma etapa para a outra');
    return { detalhe: `R$ ${custo.custoUnitario} por peça em 2 etapas` };
  });

  /* 15 */ teste(15, 'Atualizar WIP', () => {
    const wip = wipDaCarteira(db, ctx.ordem.id);
    semErro(wip, 'WIP');
    exigir(wip.etapas.length === 2, 'o WIP não mostrou as duas etapas');
    exigir(wip.etapas.every((e) => e.status === 'atendida'), 'o WIP não fechou as etapas');
    return { detalhe: `${wip.total} peças · ${wip.etapas.length} etapas concluídas` };
  });

  /* 16 */ teste(16, 'Comparar Budget × Realizado', () => {
    const comparacao = realizadoVersusBudget(db, ctx.ordem.id);
    semErro(comparacao, 'budget × realizado');
    exigir(comparacao.planejado > 0, 'sem budget planejado');
    exigir(comparacao.realizado > 0, 'sem custo realizado');
    const distancia = Math.abs(comparacao.realizado - comparacao.planejado) / comparacao.planejado;
    if (distancia > 0.15) {
      return { alerta: true,
        detalhe: `realizado ${comparacao.realizado} contra planejado ${comparacao.planejado}` };
    }
    return { detalhe: `planejado R$ ${comparacao.planejado} · realizado R$ ${comparacao.realizado}` };
  });

  /* 17 */ teste(17, 'Rastrear lote para trás', () => {
    const arvore = rastrear(db, ctx.loteFinal.loteId);
    semErro(arvore, 'rastreio para trás');
    const nomes = [];
    const andar = (no) => { nomes.push(no.item); (no.origens || []).forEach(andar); };
    andar(arvore);
    exigir(nomes.some((n) => n === ctx.sub.nome), 'o rastreio não chegou ao subproduto');
    exigir(nomes.some((n) => String(n).includes('MP TESTE') || n === ctx.mp.nome),
      'o rastreio não chegou à matéria-prima');
    return { detalhe: nomes.filter(Boolean).slice(0, 3).join(' ← ') };
  });

  /* 18 */ teste(18, 'Rastrear lote para frente', () => {
    const adiante = rastrearParaFrente(db, ctx.lote1.loteId);
    semErro(adiante, 'rastreio para frente');
    exigir(adiante.consumido, 'o lote do corte não aparece consumido em lugar nenhum');
    const saida = adiante.destinos[0].saidas[0];
    exigir(saida && saida.item === ctx.acabado.nome,
      'o rastreio para frente não chegou ao produto acabado');
    return { detalhe: `${adiante.lote} → ${saida.lote} (${saida.item})` };
  });

  /* 19 */ teste(19, 'Detectar gargalo', () => {
    const explosao = explodirBOM(db, ctx.acabado.id, 50000, { considerarEstoque: false });
    const capacidade = calcularCapacidade(db, explosao, { quantidade: 50000 });
    exigir(capacidade.linhas.length > 0, 'a capacidade não calculou setor nenhum');
    const gargalo = capacidade.linhas.find((l) => l.situacao === 'gargalo');
    exigir(gargalo, 'nenhum gargalo apontado num lote de 50.000 peças');
    exigir(capacidade.gargalos.length > 0, 'o gargalo não virou alerta');
    return { detalhe: `${gargalo.departamento} a ${gargalo.ocupacao}% de ocupação` };
  });

  /* budgets: as quatro visões (§4) */
  teste(21, 'Separar budget industrial, consumo, compras e caixa', () => {
    const explosao = explodirBOM(db, ctx.acabado.id, 500, { considerarEstoque: false });
    const b = budgetsDaCarteira(db, explosao, {});
    semErro(b, 'budgets');
    exigir(b.industrial.custoIndustrial > 0, 'budget industrial zerado');
    exigir(b.consumo.total > 0, 'budget de consumo zerado');
    exigir(b.caixa.necessidadeDeCaixa >= b.compras.total,
      'a necessidade de caixa ficou menor que as compras');
    exigir(b.industrial.custoIndustrial !== b.caixa.necessidadeDeCaixa
      || b.compras.total === b.consumo.total,
      'custo industrial e necessidade de caixa saíram iguais — os conceitos se misturaram');
    return { detalhe: `industrial R$ ${b.industrial.custoIndustrial} · caixa R$ ${b.caixa.necessidadeDeCaixa}` };
  });

  /* 20 */ teste(20, 'Executar auditoria', () => {
    const auditoria = auditarIndustrial(db, { registrar: false, usuario });
    const reconciliacao = reconciliarEstoqueIndustrial(db);
    exigir(reconciliacao.conferido,
      `estoque não reconcilia: ${JSON.stringify(reconciliacao.divergencias.slice(0, 2))}`);
    if (auditoria.erros.length > 0) {
      throw new Error(`auditoria encontrou ${auditoria.erros.length} erro(s): `
        + auditoria.erros.slice(0, 2).map((e) => e.mensagem).join(' · '));
    }
    if (auditoria.alertas.length > 0) {
      return { alerta: true, detalhe: `${auditoria.alertas.length} alerta(s) na auditoria` };
    }
    return { detalhe: 'sem erros e sem alertas' };
  });

  resultados.sort((a, b) => a.numero - b.numero);
  const ok = resultados.filter((r) => r.situacao === 'ok').length;
  const falhas = resultados.filter((r) => r.situacao === 'falha');
  const alertas = resultados.filter((r) => r.situacao === 'alerta');
  return {
    resultados,
    total: resultados.length,
    ok,
    falhas: falhas.length,
    alertas: alertas.length,
    detalhesFalhas: falhas,
    quando: new Date().toISOString().slice(0, 19),
  };
}

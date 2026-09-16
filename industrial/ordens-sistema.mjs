/**
 * MÓDULO INDUSTRIAL — a ordem nasce fora, o motor roda aqui
 *
 * A ordem de produção é aberta onde ela sempre foi aberta: no módulo
 * **Produção** do sistema, na tela que a fábrica já conhece. Lá ela nasce
 * amarrada ao produto e à versão da engenharia, com as tarefas fotografadas
 * do roteiro (`db.ordens[].tarefas`).
 *
 * O industrial não abre ordem: ele **planeja** a que foi aberta. Ao planejar,
 * a ordem ganha o que só o motor sabe fazer —
 *
 *   linha de carteira · consolidação · plano por setor · MRP ·
 *   reserva de material · requisição do que falta · budget
 *
 * — e o código continua sendo o do sistema (OP-0001), não um segundo número
 * para a mesma ordem.
 */

import {
  prepararIndustrial, registrarHistorico, novaLinhaCarteira,
  num, arredondar, agoraISO,
} from './modelo.mjs';
import { planejarLinhaDeCarteira, resumoDaOrdem } from './ordens.mjs';
import {
  derivarProdutoDaEngenharia, nomeDoProduto, rotuloCurtoDoProduto, divergenciasDaFicha,
} from './engenharia.mjs';
import { conferirEngenharia } from './cadastro.mjs';

/* as situações que o módulo Produção usa para dizer que a ordem está de pé */
const VIVAS = ['aberta', 'liberada', 'producao'];

const ordemDoSistema = (db, id) => (db.ordens || []).find((o) => o.id === id) || null;

/** A consolidação industrial que corresponde a esta ordem do sistema. */
export const planoDaOrdemDoSistema = (db, ordemId) =>
  (db.industrial?.consolidacoes || []).find((c) => c.ordemSistemaId === ordemId) || null;

/** O item industrial que corresponde a este produto do sistema. */
const itemIndustrialDoProduto = (db, produtoId) => (db.industrial?.itens || []).find(
  (i) => i.produtoId === produtoId && i.ativo !== false) || null;

/**
 * Planeja no industrial uma ordem aberta no módulo Produção.
 *
 * Se o produto ainda não veio da Engenharia, ele vem agora: não faz sentido
 * pedir que alguém traga o produto antes de planejar a ordem dele.
 */
export function planejarOrdemDoSistema(db, ordemId, usuario, opcoes = {}) {
  prepararIndustrial(db);
  const ordem = ordemDoSistema(db, ordemId);
  if (!ordem) return { erro: 'Ordem não encontrada no módulo Produção.' };
  if (!VIVAS.includes(ordem.situacao)) {
    return { erro: `${ordem.codigo} está ${ordem.situacao} — só ordem em aberto entra no plano.` };
  }
  const jaTem = planoDaOrdemDoSistema(db, ordem.id);
  if (jaTem) return { erro: `${ordem.codigo} já está planejada no industrial.`, ordem: jaTem };

  const produto = (db.produtos || []).find((p) => p.id === ordem.produtoId);
  if (!produto) return { erro: `O produto de ${ordem.codigo} não existe mais no cadastro.` };

  /* 1. o produto precisa existir no industrial — derivado da ficha, não
        redigitado. Se já existe, nada é criado de novo. */
  let item = itemIndustrialDoProduto(db, produto.id);
  if (!item) {
    const derivado = derivarProdutoDaEngenharia(db, produto.id, usuario);
    if (derivado.erro) return { erro: `${ordem.codigo}: ${derivado.erro}` };
    item = derivado.item;
  }

  const conferencia = conferirEngenharia(db, item.id);
  if (!conferencia.pronto) {
    return {
      erro: `${ordem.codigo}: a engenharia de ${nomeDoProduto(produto)} está incompleta — `
        + conferencia.pendencias[0],
      pendencias: conferencia.pendencias,
    };
  }

  /* 2. a ordem vira demanda: uma linha de carteira que aponta para ela */
  const linha = novaLinhaCarteira(db, {
    itemId: item.id,
    clienteId: ordem.clienteId || '',
    pedido: ordem.codigo,
    quantidade: num(ordem.quantidade),
    dataPrometida: ordem.entrega || '',
    prioridade: num(ordem.prioridade) || 5,
    observacao: ordem.observacao || '',
  });
  if (linha.erro) return linha;
  linha.registro.origem = 'producao';
  linha.registro.ordemSistemaId = ordem.id;

  /* 3. e o motor roda: consolidação, plano, MRP, reserva e requisição */
  const plano = planejarLinhaDeCarteira(db, linha.registro, {
    codigoOrdem: ordem.codigo,
    ordemSistemaId: ordem.id,
    /* o código já é o do sistema; e o nome cheio ("CAMISETA SILK P/M/G/GG
       MALHA PV 30/1 AZUL MARINHO GOLA CARECA") não cabe no seletor de ordens */
    nomeDaOrdem: rotuloCurtoDoProduto(db, produto),
    entrega: ordem.entrega || '',
    prioridade: num(ordem.prioridade) || 5,
    gerarRequisicoes: opcoes.gerarRequisicoes !== false,
  }, usuario);
  if (plano.erro) return plano;

  /* 4. o vínculo dos dois lados, para ninguém planejar a mesma ordem duas vezes */
  ordem.industrialId = plano.ordem.id;
  ordem.planejadoEm = agoraISO();

  registrarHistorico(db, {
    tipo: 'ordem', itemId: item.id, quantidade: num(ordem.quantidade),
    usuario: usuario?.nome || '',
    motivo: `${ordem.codigo} planejada no industrial: ${plano.plano.ordens.length} etapa(s), `
      + `${plano.reserva.feitas.length} material(is) reservado(s)`,
  });

  return { ...plano, ordemSistema: ordem, produto, item };
}

/** Planeja de uma vez todas as ordens em aberto que ainda não têm plano. */
export function planejarOrdensPendentes(db, usuario) {
  prepararIndustrial(db);
  const feitas = [];
  const falhas = [];
  for (const ordem of db.ordens || []) {
    if (!VIVAS.includes(ordem.situacao)) continue;
    if (planoDaOrdemDoSistema(db, ordem.id)) continue;
    const r = planejarOrdemDoSistema(db, ordem.id, usuario);
    if (r.erro) falhas.push({ codigo: ordem.codigo, erro: r.erro });
    else feitas.push({ codigo: ordem.codigo, etapas: r.plano.ordens.length, custo: num(r.custoPlanejado) });
  }
  return {
    feitas, falhas,
    erro: feitas.length === 0 && falhas.length ? falhas[0].erro : '',
  };
}

/**
 * As ordens do módulo Produção com o que o industrial sabe de cada uma: se
 * já tem plano, quanto vai custar, o que falta comprar e em que etapa está.
 */
export function ordensDoSistema(db, opcoes = {}) {
  prepararIndustrial(db);
  const linhas = (db.ordens || [])
    .filter((o) => (opcoes.todas ? true : VIVAS.includes(o.situacao)))
    .map((ordem) => {
      const produto = (db.produtos || []).find((p) => p.id === ordem.produtoId);
      const cliente = (db.clientes || []).find((c) => c.id === ordem.clienteId);
      const consolidacao = planoDaOrdemDoSistema(db, ordem.id);
      const resumo = consolidacao ? resumoDaOrdem(db, consolidacao.id) : null;
      const item = produto ? itemIndustrialDoProduto(db, produto.id) : null;
      const ficha = produto ? divergenciasDaFicha(db, produto.id) : { emDia: true };

      return {
        ordemId: ordem.id,
        codigo: ordem.codigo,
        situacao: ordem.situacao,
        amostra: !!ordem.amostra,
        produtoId: ordem.produtoId,
        produto: produto ? nomeDoProduto(produto) : '(produto removido)',
        produtoCurto: produto ? rotuloCurtoDoProduto(db, produto) : '(produto removido)',
        cliente: cliente ? (cliente.nomeFantasia || cliente.nome) : 'estoque',
        quantidade: num(ordem.quantidade),
        entrega: ordem.entrega || '',
        prioridade: num(ordem.prioridade) || 5,
        etapasDoSistema: (ordem.tarefas || []).length,
        /* o que o industrial acrescenta */
        planejada: !!consolidacao,
        consolidacaoId: consolidacao ? consolidacao.id : '',
        itemId: item ? item.id : '',
        noIndustrial: !!item,
        fichaEmDia: ficha.emDia !== false,
        /* falta de verdade é material que não existe; componente esperando o
           setor anterior é a vida normal de uma ordem, não problema */
        faltas: resumo && !resumo.erro
          ? (resumo.etapas || []).flatMap((e) => (e.faltas || []).filter((f) => !f.esperando)).length
          : 0,
        custoPlanejado: resumo && !resumo.erro ? num(resumo.custoPlanejado) : 0,
        custoPorPeca: resumo && !resumo.erro ? num(resumo.custoPorPecaPlanejado) : 0,
        etapas: resumo && !resumo.erro ? (resumo.etapas || []).length : 0,
        acabadas: resumo && !resumo.erro ? num(resumo.acabadas) : 0,
        percentual: resumo && !resumo.erro ? num(resumo.percentual) : 0,
        proxima: resumo && !resumo.erro && resumo.proxima ? resumo.proxima.departamento : '',
        reservas: resumo && !resumo.erro ? (resumo.reservas || []).length : 0,
        estado: '',
      };
    });

  for (const l of linhas) {
    l.estado = !l.planejada ? 'sem_plano' : (l.faltas > 0 ? 'faltando' : 'planejada');
  }

  return {
    linhas,
    total: linhas.length,
    planejadas: linhas.filter((l) => l.planejada).length,
    semPlano: linhas.filter((l) => !l.planejada).length,
    comFalta: linhas.filter((l) => l.estado === 'faltando').length,
    custoPlanejado: arredondar(linhas.reduce((s, l) => s + num(l.custoPlanejado), 0), 2),
  };
}

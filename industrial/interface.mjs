/**
 * MÓDULO INDUSTRIAL — interface (§46)
 *
 * A aba Industrial do sistema, no mesmo vocabulário visual das outras: painel
 * com KPIs, sub-abas, tabelas e os selos de situação que a fábrica já
 * reconhece. Nada aqui recalcula nada — tudo vem dos motores.
 *
 * O componente é escrito em React.createElement porque é assim que o sistema
 * inteiro é escrito: o arquivo final não passa por compilador nenhum. Para o
 * código não virar uma escada de parênteses, as tabelas e os painéis são
 * montados por funções rasas (`tabela`, `bloco`, `linha`).
 */

import {
  prepararIndustrial, disponivelEmProcesso,
  num, arredondar, MOTIVOS_PERDA,
} from './modelo.mjs';
import {
  explodirBOM, calcularCapacidade, executarTransformacao, liberarParaCostura,
  wipDaCarteira, realizadoVersusBudget, simular, budgetsDaCarteira,
} from './motores.mjs';
import { gerarRequisicoes, painelCompras } from './compras.mjs';
import { auditarIndustrial } from './auditoria.mjs';
import { TelaCompras } from './telas-compras.mjs';
import { TelaConferencia } from './telas-integracao.mjs';
import { TelaOrdensDoSistema } from './telas-ordens-sistema.mjs';
import { ordensDoSistema, planejarOrdensPendentes } from './ordens-sistema.mjs';
import { indicadoresDeIntegracao } from './integracao.mjs';
import { montarDemonstracao, receberCompra } from './demonstracao.mjs';
import { produtosDaEngenharia, derivarProdutoDaEngenharia } from './engenharia.mjs';

export const h = (tipo, props, ...filhos) => React.createElement(tipo, props, ...filhos);

/**
 * O que um ambiente quer dizer ao outro quando o usuário pula de aba: qual
 * produto abrir, qual ordem mostrar. É um bilhete, não estado — quem lê,
 * apaga.
 */
export const navegacao = { produtoId: '', fichaId: '', ordemId: '' };
export const irEComBilhete = (irPara, aba, bilhete = {}) => {
  Object.assign(navegacao, bilhete);
  if (typeof irPara === 'function') irPara(aba);
};

export const moeda = (v) => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const inteiro = (v) => num(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
export const decimal = (v, casas = 3) => num(v).toLocaleString('pt-BR', { maximumFractionDigits: casas });
export const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

export const SELO = { normal: 'ok', risco: 'warn', gargalo: 'bad', sem_equipe: 'bad' };
export const selo = (tom, texto) => h('span', { className: `badge ${tom}` }, h('span', { className: 'dot' }), texto);
export const vazio = (texto) => h('div', { className: 'empty' }, texto);
export const pequeno = (texto, estilo) => h('p', { className: 'small muted', style: estilo }, texto);

export const kpi = (rotulo, valor, apoio, destaque) => h('div', {
  className: `kpi${destaque ? ' accent' : ''}`, key: rotulo,
}, h('div', { className: 'lbl' }, rotulo),
   h('div', { className: 'val' }, valor),
   apoio ? h('div', { className: 'small', style: { opacity: .75, marginTop: 2 } }, apoio) : null);

/** Painel com título, selo opcional e os filhos que vierem. */
export const bloco = (titulo, chip, filhos, props) => h('div', Object.assign({ className: 'panel' }, props || {}),
  h('h3', null, titulo, chip ? h('span', { className: 'chip' }, chip) : null),
  ...filhos.filter(Boolean));

/** Tabela: cabeçalhos como ['Item', ['Valor','num']] e linhas já montadas. */
export const tabela = (cabecalhos, linhas) => h('table', null,
  h('thead', null, h('tr', null, ...cabecalhos.map((c, i) => {
    const [texto, classe] = Array.isArray(c) ? c : [c, ''];
    return h('th', { key: i, className: classe }, texto);
  }))),
  h('tbody', null, ...linhas));

/** Linha: células como ['texto'] ou [valor, 'num'] ou [elemento]. */
export const linha = (chave, celulas) => h('tr', { key: chave }, ...celulas.map((c, i) => {
  const [conteudo, classe, estilo] = Array.isArray(c) ? c : [c, ''];
  return h('td', { key: i, className: classe || '', style: estilo || null }, conteudo);
}));

/* ====================================================================== */

export function GrupoIndustrial({ db, update, usuario, irPara }) {
  const [sub, setSub] = React.useState('painel');
  const [escolhida, setEscolhida] = React.useState('');
  const [erro, setErro] = React.useState('');
  const [aviso, setAviso] = React.useState('');
  const [apontando, setApontando] = React.useState(null);
  const [loteAberto, setLoteAberto] = React.useState('');

  const ind = db.industrial || {};
  const itens = ind.itens || [];
  const consolidacoes = ind.consolidacoes || [];
  const atual = consolidacoes.find((c) => c.id === escolhida)
    || consolidacoes[consolidacoes.length - 1] || null;

  const item = (id) => itens.find((i) => i.id === id) || null;
  const depNome = (id) => ((db.departamentos || []).find((d) => d.id === id) || {}).nome || '';

  /* Toda escrita passa por aqui: prepara as coleções, roda o motor e traz de
     volta o erro do motor para a tela, em vez de engolir. */
  const mexer = (fn, sucesso) => {
    setErro(''); setAviso('');
    let resposta = null;
    update((d) => {
      prepararIndustrial(d);
      resposta = fn(d);
      return d;
    });
    if (resposta && resposta.erro) setErro(resposta.erro);
    else if (sucesso) setAviso(typeof sucesso === 'function' ? sucesso(resposta) : sucesso);
    return resposta;
  };

  const contexto = { db, ind, atual, item, depNome, mexer, usuario, setSub, setApontando,
    loteAberto, setLoteAberto, irPara };

  const cabeca = h('div', { className: 'page-head' },
    h('div', null, h('p', { className: 'eyebrow' }, 'Fábrica digital'), h('h2', null, 'Industrial')),
    consolidacoes.length > 1 && atual
      ? h('select', {
        value: atual.id, style: { width: 280 },
        onChange: (e) => setEscolhida(e.target.value),
      }, consolidacoes.map((c) => h('option', { key: c.id, value: c.id },
        `${c.codigoOrdem || c.codigo} · ${c.nome}`)))
      : null);

  const vazioAinda = itens.length === 0;

  /* A ordem é aberta no módulo Produção e o produto, no módulo Produtos: as
     duas telas que a fábrica já conhece. Aqui fica o motor — plano, MRP,
     reserva, compra, custo e rastro. */
  const doSistema = ordensDoSistema(db);
  /* Cinco lugares, um por pergunta que alguém faz na fábrica:
       Painel      como estamos?
       Ordens      o que produzir, e o que isso exige (MRP, budget, etapas)
       Compras     o que falta comprar, e em que pé está
       Produção    o que a fábrica fez hoje
       Conferência a cadeia está inteira? de onde veio esta peça? */
  const abas = [
    { id: 'painel', label: 'Painel' },
    { id: 'ordens', label: `Ordens (${doSistema.planejadas}/${doSistema.total})` },
    { id: 'compras', label: `Compras (${(ind.requisicoesCompra || []).filter(
      (r) => !['recebida', 'cancelada'].includes(r.status)).length})` },
    { id: 'producao', label: `Produção (${(ind.demandas || []).filter((d) => d.status !== 'atendida').length})` },
    { id: 'conferencia', label: `Conferência (${saudeDaCadeia(db)}%)` },
  ];

  const recado = (texto, cor, fundo) => h('div', {
    className: 'panel', style: { borderColor: cor, background: fundo, marginBottom: 14 },
  }, h('strong', { className: 'small' }, texto));

  /* Cadastro de produto e ordem de produção moram aqui dentro: são o que
     alimenta o módulo, não módulos à parte. As duas telas recebem `irPara`
     apontando para a própria troca de sub-aba. */
  const embutir = (Componente) => h(Componente, {
    db, update, usuario, embutido: true, irPara: (aba) => { setSub(aba); setErro(''); setAviso(''); },
  });

  const telas = {
    /* base sem nada cadastrado: o painel vira o convite */
    painel: () => (vazioAinda
      ? boasVindas(db, mexer, usuario, erro, () => setSub('ordens'))
      : h(TelaPainel, contexto)),
    ordens: () => h(TelaOrdensDoSistema, { ...contexto, setEscolhida }),
    compras: () => h(TelaCompras, contexto),
    producao: () => h(TelaProducao, contexto),
    conferencia: () => h(TelaConferencia, { ...contexto, update }),
  };

  return h('div', null,
    cabeca,
    h(SubTabs, { tabs: abas, active: sub, onChange: (id) => { setSub(id); setErro(''); setAviso(''); } }),
    erro ? recado(erro, 'var(--bad)', 'var(--bad-bg)') : null,
    aviso ? recado(aviso, 'var(--ok)', 'var(--ok-bg)') : null,
    (telas[sub] || telas.painel)(),
    apontando ? h(ModalExecucao, {
      db, ind, item, usuario, demanda: apontando,
      onFechar: () => setApontando(null),
      onConfirmar: (dados) => {
        const r = mexer((d) => executarTransformacao(d, dados, usuario), (resp) =>
          `Execução ${resp.execucao.codigo}: `
          + `${resp.execucao.saidas.map((s) => `${inteiro(s.quantidade)} ${s.nome}`).join(', ')}.`);
        if (r && !r.erro) setApontando(null);
      },
    }) : null);
}

/** A nota da integração no rótulo da aba, sem derrubar a tela se algo faltar. */
function saudeDaCadeia(db) {
  try { return num(indicadoresDeIntegracao(db).integracao); } catch (e) { return 0; }
}

/* ------------------------------------------------- base sem o módulo */

function boasVindas(db, mexer, usuario, erro, irParaProdutos) {
  /* o caminho mais curto: o produto já está cadastrado na Engenharia */
  const engenharia = produtosDaEngenharia(db);
  /* Os quatro passos que ligam a fábrica, na ordem em que cada um destrava o
     seguinte. Quem chega aqui precisa saber por onde começar — e o começo é
     um material do almoxarifado, não uma tela deste módulo. */
  const passo = (n, titulo, texto) => h('div', { key: n, style: { display: 'flex', gap: 10, marginTop: 10 } },
    h('div', {
      style: {
        width: 24, height: 24, borderRadius: 12, background: 'var(--accent)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 600, flexShrink: 0,
      },
    }, n),
    h('div', null,
      h('strong', { className: 'small' }, titulo),
      h('div', { className: 'small muted', style: { lineHeight: 1.5 } }, texto)));

  return bloco('O módulo industrial ainda não tem estrutura cadastrada', null, [
    pequeno('Aqui moram a carteira de produção, o budget industrial, o MRP e o caminho que a peça '
      + 'faz de um setor para o outro — cada departamento recebendo, transformando e entregando para '
      + 'o próximo.', { maxWidth: 640, lineHeight: 1.6 }),
    erro ? h('p', { className: 'small', style: { color: 'var(--bad)' } }, erro) : null,

    engenharia.fora > 0 ? h('div', {
      className: 'panel',
      style: { background: 'var(--ok-bg)', borderColor: 'var(--ok)', marginTop: 16 },
    },
    h('h3', null, `${engenharia.fora} produto(s) já cadastrado(s) na Engenharia`),
    pequeno('Ficha técnica e roteiro já existem. O industrial deriva daí a estrutura e uma '
      + 'transformação por setor — você não digita nada de novo.', { marginTop: -6 }),
    h('div', { className: 'small muted', style: { marginBottom: 10 } },
      engenharia.linhas.filter((l) => !l.derivado).slice(0, 6)
        .map((l) => `${l.codigo} ${l.nome}`).join(' · ')),
    h('button', {
      className: 'btn accent',
      onClick: () => mexer((d) => {
        const feitos = [];
        for (const l of produtosDaEngenharia(d).linhas) {
          if (l.derivado || l.pendencias.length) continue;
          const r = derivarProdutoDaEngenharia(d, l.produtoId, usuario);
          if (!r.erro) feitos.push(l.codigo);
        }
        return feitos.length ? { feitos } : { erro: 'Nenhum produto da Engenharia pôde ser trazido.' };
      }, (r) => `${r.feitos.length} produto(s) trazido(s) da Engenharia: ${r.feitos.join(', ')}.`),
    }, 'Trazer os produtos da Engenharia')) : null,

    h('h3', { style: { marginTop: 18 } }, 'Como a fábrica alimenta este motor'),
    passo(1, 'Material — aba Materiais',
      'Tecido, aviamento e embalagem, com unidade, preço, estoque mínimo e prazo de entrega. '
      + 'O industrial não duplica esse cadastro: ele aponta para ele.'),
    passo(2, 'Produto e composição — aba Produtos',
      'Ficha técnica (o que a peça leva) e processo (por onde ela passa), nas telas de sempre. '
      + 'É daí que o industrial deriva a estrutura e uma transformação por setor.'),
    passo(3, 'Ordem de produção — aqui, na sub-aba Ordens',
      'A ordem nasce do produto: escolha, diga quantas peças, e ela já vem com as etapas do '
      + 'processo e a versão da engenharia congelada.'),
    passo(4, 'E o motor roda junto',
      'Cada ordem ganha plano por setor, MRP, reserva do material que existe, requisição do que '
      + 'falta, budget, custo real e rastro por lote.'),

    h('div', { className: 'row-actions', style: { marginTop: 18 } },
      h('button', {
        className: 'btn accent',
        onClick: () => (irParaProdutos ? irParaProdutos() : null),
      }, 'Cadastrar o meu produto'),
      h('button', {
        className: 'btn ghost',
        onClick: () => mexer((d) => {
          try { montarDemonstracao(d); return { ok: true }; } catch (e) { return { erro: e.message }; }
        }, 'Demonstração carregada: carteira de 10.000 camisetas em três pedidos.'),
      }, 'Carregar demonstração (10.000 camisetas)'),
      h('span', { className: 'small muted', style: { alignSelf: 'center' } },
        'a demonstração mostra o módulo com número de verdade, e não atrapalha o seu cadastro')),
  ]);
}

/* ============================================================ §28 painel */

function TelaPainel({ db, ind, atual, item, setSub }) {
  if (!atual) return vazio('Nenhuma carteira consolidada. Abra a aba Carteira e gere o plano de produção.');

  const wip = wipDaCarteira(db, atual.id);
  const comparacao = realizadoVersusBudget(db, atual.id);
  const budget = (ind.budgets || []).find((b) => b.consolidacaoId === atual.id);
  const acabadas = wip.erro ? 0 : num((wip.etapas[wip.etapas.length - 1] || {}).produzido);
  const compras = painelCompras(db);
  const auditoria = auditarIndustrial(db, { registrar: false });

  /* V2 §54 — o painel da direção: carteira, dinheiro e gargalo numa olhada */
  const produto = atual.produtos[0] || {};
  const explosao = produto.itemId ? explodirBOM(db, produto.itemId, produto.quantidade,
    { consolidacaoId: atual.id }) : { erro: 'sem produto' };
  const capacidade = explosao.erro ? null
    : calcularCapacidade(db, explosao, { quantidade: produto.quantidade });
  const gargalo = capacidade ? capacidade.linhas.find((l) => l.situacao === 'gargalo') : null;
  const contas = explosao.erro ? null : budgetsDaCarteira(db, explosao, { consolidacaoId: atual.id });

  const alertas = [
    ...(comparacao.erro ? [] : comparacao.alertas),
    ...compras.alertas,
    ...(capacidade ? capacidade.gargalos : []),
  ];

  const cartoes = h('div', { className: 'kpis' },
    kpi('Carteira', inteiro(wip.erro ? 0 : wip.total), 'peças prometidas'),
    kpi('Produzido', inteiro(acabadas), 'peças acabadas', acabadas > 0),
    kpi('Em processo', inteiro(wip.erro ? 0 : wip.emProcesso), 'peças entre setores'),
    kpi('Budget', budget ? moeda(budget.custoIndustrial) : '—',
      budget ? `${moeda(budget.custoPorPeca)} por peça` : 'sem budget'),
    kpi('Realizado', comparacao.erro || !(comparacao.realizado > 0) ? '—' : moeda(comparacao.realizado),
      comparacao.erro || !(comparacao.realizado > 0)
        ? 'nada apontado ainda' : `desvio ${moeda(comparacao.desvio)}`),
    kpi('Compras', moeda(compras.valorRequisitado + compras.valorEmPedido),
      `${compras.aRequisitar} a requisitar · ${compras.emPedido} em pedido`),
    kpi('Caixa', contas ? moeda(contas.caixa.necessidadeDeCaixa) : '—',
      'necessidade estimada', contas && contas.caixa.necessidadeDeCaixa > 0),
    kpi('Gargalo', gargalo ? gargalo.departamento : 'nenhum',
      gargalo ? `${gargalo.ocupacao}% de ocupação` : 'capacidade folgada', !!gargalo));

  const painelAlertas = alertas.length
    ? bloco('⚠ Alertas', null, [h('ul', { style: { margin: 0, paddingLeft: 18 } },
      ...alertas.slice(0, 8).map((a, i) => h('li', { key: i, className: 'small', style: { marginBottom: 4 } },
        h('strong', null, `${a.titulo}: `), a.mensagem)))], { style: { borderColor: 'var(--warn)' } })
    : null;

  const saude = auditoria.erros.length || !wip.erro
    ? bloco('Saúde do módulo', '§33', [
      h('div', { style: { display: 'flex', gap: 22, flexWrap: 'wrap' } },
        h('div', null, h('div', { className: 'small muted' }, 'AUDITORIA'),
          selo(auditoria.erros.length ? 'bad' : 'ok',
            auditoria.erros.length ? `${auditoria.erros.length} erro(s)` : 'sem erros')),
        h('div', null, h('div', { className: 'small muted' }, 'ALERTAS'),
          selo(auditoria.alertas.length ? 'warn' : 'ok',
            auditoria.alertas.length ? `${auditoria.alertas.length}` : 'nenhum')),
        h('div', null, h('div', { className: 'small muted' }, 'MATERIAL RESERVADO'),
          h('strong', null, inteiro((ind.reservas || []).filter((r) => r.status === 'ativa').length),
            ' reserva(s) ativa(s)'))),
      auditoria.erros.length ? h('button', {
        className: 'btn ghost sm', style: { marginTop: 10 }, onClick: () => setSub('conferencia'),
      }, 'Ver na auditoria') : null,
    ])
    : null;

  const pilulas = wip.erro ? vazio(wip.erro) : h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
    ...wip.etapas.map((e) => h('div', {
      key: e.demandaId, className: 'stage-pill',
      style: { borderColor: e.status === 'atendida' ? 'var(--ok)' : 'var(--line)' },
    }, h('div', { className: 'snome' }, e.departamento),
       h('div', { className: 'sqtd' }, `${inteiro(e.produzido)} / ${inteiro(e.planejado)}`),
       h('div', { className: 'sqtd' }, `${e.percentual}%`),
       h('div', { style: { marginTop: 6 } }, selo(
         e.status === 'atendida' ? 'ok' : e.produzido > 0 ? 'warn' : 'idle',
         e.status === 'atendida' ? 'concluído' : e.produzido > 0 ? 'em curso' : 'não começou')))));

  const desvio = comparacao.erro ? null : bloco('Budget × realizado por setor', '§21', [
    tabela(['Setor', ['Planejado', 'num'], ['Realizado', 'num'], ['Desvio', 'num'],
      ['Min. previstos', 'num'], ['Min. reais', 'num'], 'Motivo'],
    comparacao.linhas.map((l) => linha(l.departamentoId, [
      l.departamento,
      [moeda(l.planejado), 'num'],
      [moeda(l.realizado), 'num'],
      [`${l.desvio > 0 ? '+' : ''}${moeda(l.desvio)}`, 'num',
        { color: l.desvio > 0 ? 'var(--bad)' : 'var(--ok)' }],
      [inteiro(l.planejadoMinutos), 'num'],
      [inteiro(l.realizadoMinutos), 'num'],
      [l.motivo || '—', 'small muted'],
    ]))),
  ]);

  return h('div', null, cartoes, painelAlertas,
    bloco('Onde estão as peças', 'WIP', [pilulas]), desvio, saude);
}

/* ========================================================== §2 carteira */


/* ================================================ §3/§25/§27 plano e budget */

export function TelaPlano({ db, ind, atual, item, mexer, usuario, setSub }) {
  if (!atual) return vazio('Abra uma ordem para ver o MRP e o budget dela.');
  const produto = atual.produtos[0];
  const explosao = explodirBOM(db, produto.itemId, produto.quantidade, { consolidacaoId: atual.id });
  if (explosao.erro) return vazio(explosao.erro);

  /* V2 §4 — as quatro contas, cada uma respondendo a sua pergunta */
  const contas = budgetsDaCarteira(db, explosao, { consolidacaoId: atual.id });
  const { industrial, consumo, compras, caixa, mrp } = contas;
  const capacidade = calcularCapacidade(db, explosao, { quantidade: produto.quantidade });
  const cenarios = simular(db, produto.itemId,
    [Math.round(produto.quantidade / 2), produto.quantidade, produto.quantidade * 2],
    { considerarEstoque: false });

  const cartoes = h('div', { className: 'kpis' },
    kpi('Custo industrial', moeda(industrial.custoIndustrial),
      `${moeda(industrial.custoPorPeca)} por peça`, true),
    kpi('Consumo de material', moeda(consumo.total), `${moeda(consumo.porPeca)} por peça`),
    kpi('A comprar', moeda(compras.total), `${compras.itens} item(ns) em falta`),
    kpi('Necessidade de caixa', moeda(caixa.necessidadeDeCaixa), 'desembolso previsto'),
    kpi('Ocupação', capacidade.ocupacaoGeral === null ? '—' : `${capacidade.ocupacaoGeral}%`,
      `takt ${decimal(capacidade.takt, 3)} min/peça`));

  /* §51 — as quantidades separadas, que é o que o V2 pede */
  const tabelaMrp = tabela(
    ['Item', ['Necessário', 'num'], ['Físico', 'num'], ['Reservado', 'num'],
      ['Disp. p/ esta ordem', 'num'], ['Em pedido', 'num'], ['Comprar', 'num'], ['Comprar até', 'num'],
      'Situação'],
    mrp.linhas.map((l) => linha(l.itemId, [
      h('div', null, l.nome,
        h('div', { className: 'small muted' },
          `${l.fornecedor || 'sem fornecedor'}${l.requisicao ? ` · ${l.requisicao}` : ''}`)),
      [`${decimal(l.bruta)} ${l.unidade}`, 'num'],
      [decimal(l.fisico), 'num'],
      [decimal(l.reservado), 'num', l.reservadoDeOutras > 0 ? { color: 'var(--warn)' } : null],
      [decimal(l.disponivel), 'num'],
      [l.programadas > 0 ? decimal(l.programadas) : '—', 'num'],
      [l.comprar > 0 ? decimal(l.comprar) : '—', 'num', l.comprar > 0 ? { color: 'var(--bad)' } : null],
      [l.dataLimite ? dataBR(l.dataLimite) : '—', 'num',
        l.atrasada ? { color: 'var(--bad)', fontWeight: 600 } : null],
      selo(l.statusTom, l.statusNome),
    ])));

  const aRequisitar = mrp.linhas.filter((l) => l.comprar > 0);
  const botaoRequisitar = aRequisitar.length === 0 ? null
    : h('div', { className: 'row-actions', style: { marginTop: 12 } },
      h('button', {
        className: 'btn accent',
        onClick: () => {
          const r = mexer((d) => gerarRequisicoes(d, {
            linhas: aRequisitar, consolidacaoId: atual.id,
            dataNecessidade: (atual.produtos[0] || {}).prazo || '', origem: 'plano',
          }, usuario), (resp) => `${resp.criadas.length} requisição(ões) de compra geradas`
            + `${resp.puladas.length ? ` · ${resp.puladas.length} já tinham requisição aberta` : ''}.`);
          if (r && !r.erro) setSub('compras');
        },
      }, `Gerar requisições de compra (${aRequisitar.length} item(ns))`),
      h('span', { className: 'small muted', style: { alignSelf: 'center' } },
        'a requisição vira pedido e o pedido vira recebimento, na aba Compras'));

  const tabelaConsumo = tabela(
    ['Material', ['Necessário', 'num'], ['Do estoque', 'num'], ['A comprar', 'num'],
      ['Custo unitário', 'num'], ['Valor', 'num']],
    consumo.linhas.map((l) => linha(l.itemId, [
      l.nome,
      [`${decimal(l.necessidade)} ${l.unidade}`, 'num'],
      [decimal(l.doEstoque), 'num'],
      [l.aComprar > 0 ? decimal(l.aComprar) : '—', 'num'],
      [moeda(l.custoUnitario), 'num'],
      [moeda(l.valor), 'num'],
    ])));

  const tabelaCapacidade = tabela(
    ['Setor', ['Pessoas', 'num'], ['Horas necessárias', 'num'], ['Horas disponíveis', 'num'],
      ['Ocupação', 'num'], ['Déficit', 'num'], 'Situação'],
    capacidade.linhas.map((l) => linha(l.departamentoId, [
      l.departamento,
      [l.pessoas, 'num'],
      [decimal(l.horasNecessarias, 1), 'num'],
      [decimal(l.horasDisponiveis, 1), 'num'],
      [l.ocupacao === null ? '—' : `${l.ocupacao}%`, 'num'],
      [l.horasNecessarias > l.horasDisponiveis
        ? decimal(l.horasNecessarias - l.horasDisponiveis, 1) : '—', 'num',
        l.horasNecessarias > l.horasDisponiveis ? { color: 'var(--bad)' } : null],
      selo(SELO[l.situacao] || 'idle', l.situacao === 'sem_equipe' ? 'sem equipe' : l.situacao),
    ])));

  const tabelaBudget = tabela(
    ['Processo', ['Minutos', 'num'], ['Mão de obra', 'num'], ['Manuseio', 'num'], ['Setup', 'num'],
      ['Máquina', 'num'], ['Indireto', 'num'], ['Total', 'num']],
    industrial.processos.map((p) => linha(p.transformacaoId, [
      `${p.departamento} — ${p.nome}`,
      [inteiro(p.minutos), 'num'],
      [moeda(p.maoDeObra), 'num'],
      [moeda(p.manuseio), 'num'],
      [moeda(p.setup), 'num'],
      [moeda(p.maquina + p.energia), 'num'],
      [moeda(p.indireto), 'num'],
      [moeda(p.total), 'num'],
    ])));

  /* §4.4/§25 — custo industrial não é necessidade de caixa */
  const linhaCaixa = (rotulo, valor, nota) => h('div', {
    key: rotulo,
    style: { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0',
      borderBottom: '1px solid var(--line)' },
  }, h('div', null, h('strong', { className: 'small' }, rotulo),
      nota ? h('div', { className: 'small muted' }, nota) : null),
     h('strong', { style: { fontFamily: 'var(--mono)' } }, moeda(valor)));

  const blocoCaixa = bloco('Custo industrial × necessidade de caixa', '§25', [
    pequeno('São contas diferentes: o material que já está no estoque custa na produção, mas não '
      + 'sai do caixa de novo — ele foi pago quando entrou.', { marginTop: -6 }),
    linhaCaixa('Custo industrial da carteira', caixa.custoIndustrial, 'material + conversão + indireto'),
    linhaCaixa('Material que já está no estoque', caixa.materialExistente, 'não pesa no caixa'),
    linhaCaixa('Material a comprar', caixa.materialAComprar, `${compras.itens} item(ns)`),
    linhaCaixa('Mão de obra da produção', caixa.maoDeObraFutura, 'folha do período'),
    linhaCaixa('Máquina e energia', caixa.maquinaEnergia, ''),
    linhaCaixa('Custo fixo rateado', caixa.indiretoRateado, 'já contratado, não é desembolso novo'),
    h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 16, paddingTop: 12 } },
      h('strong', null, 'NECESSIDADE ESTIMADA DE CAIXA'),
      h('strong', { style: { fontFamily: 'var(--display)', fontSize: 22 } },
        moeda(caixa.necessidadeDeCaixa))),
    caixa.porMes.length ? h('div', { style: { marginTop: 12 } },
      tabela(['Mês', ['Desembolso previsto', 'num']],
        caixa.porMes.map((m) => linha(m.mes, [m.mes, [moeda(m.valor), 'num']])))) : null,
    pequeno('Projeção industrial, não contabilidade: os prazos vêm do lead time e da condição de '
      + 'pagamento de cada fornecedor.'),
  ]);

  const tabelaSimulacao = tabela(
    [['Quantidade', 'num'], ['Compra', 'num'], ['Custo industrial', 'num'], ['Por peça', 'num'],
      ['Horas', 'num'], ['Ocupação', 'num']],
    cenarios.map((c) => linha(c.quantidade, [
      [inteiro(c.quantidade), 'num'],
      [moeda(c.compra), 'num'],
      [moeda(c.custoIndustrial), 'num'],
      [moeda(c.custoPorPeca), 'num'],
      [decimal(c.horas, 1), 'num'],
      [c.ocupacao === null ? '—' : `${c.ocupacao}%`, 'num'],
    ])));

  return h('div', null, cartoes,
    bloco('MRP — o que falta, e para quando', '§5', [
      pequeno('bruta − disponível − entradas programadas + segurança = líquida. Disponível já '
        + 'desconta o que está reservado para outra ordem.', { marginTop: -6 }),
      tabelaMrp,
      botaoRequisitar,
    ]),
    bloco('Budget de consumo', '§4.2', [
      pequeno('Quanto material a produção vai consumir, com as perdas — venha do estoque ou da '
        + 'compra.', { marginTop: -6 }),
      tabelaConsumo,
    ]),
    blocoCaixa,
    bloco('Capacidade por setor', '§27', [tabelaCapacidade]),
    bloco('Budget industrial', '§4.1', [
      tabelaBudget,
      pequeno('Cada minuto entra numa parcela só: tempo de processamento não é cobrado de novo como '
        + 'manuseio. O custo do minuto sai da folha da equipe de cada setor.'),
    ]),
    bloco('Simulação', '§39', [
      tabelaSimulacao,
      pequeno('O custo por peça cai com o lote porque a operação que acontece uma vez por ordem — '
        + 'gravar a tela, montar a matriz — se dilui.'),
    ]));
}

/* ============================================= §34/§35/§36 chão de fábrica */

function TelaProducao({ db, ind, atual, item, depNome, mexer, usuario, setApontando }) {
  if (!atual) return vazio('Gere o plano de produção primeiro.');
  const demandas = (ind.demandas || []).filter((d) => d.consolidacaoId === atual.id)
    .sort((a, b) => b.nivel - a.nivel);
  if (demandas.length === 0) return vazio('Esta carteira ainda não tem demanda gerada.');

  const conferir = (ordem) => {
    const r = mexer((base) => liberarParaCostura(base, ordem.id, usuario));
    if (!r) return;
    if (r.liberada === false) mexer(() => ({ erro: r.alertas.map((a) => a.mensagem).join(' ') }));
    else if (r.liberada) mexer(() => ({}), `${ordem.codigo} liberada: todos os componentes disponíveis.`);
  };

  const linhasDemanda = demandas.map((d) => {
    const ordem = (ind.ordens || []).find((o) => o.demandaId === d.id) || null;
    const pronto = d.status === 'atendida';
    const acoes = h('div', { className: 'row-actions' },
      ordem && ordem.dependeDe.length > 0 && ordem.status !== 'concluida'
        ? h('button', { className: 'btn ghost sm', onClick: () => conferir(ordem) }, 'Conferir componentes')
        : null,
      pronto ? null : h('button', { className: 'btn sm', onClick: () => setApontando(d) }, 'Apontar produção'));
    return linha(d.id, [
      ordem ? ordem.codigo : '—',
      depNome(d.departamentoId),
      (item(d.itemId) || {}).nome || '—',
      [inteiro(d.quantidade), 'num'],
      [inteiro(d.produzido), 'num'],
      [inteiro(d.minutos), 'num'],
      selo(pronto ? 'ok' : d.produzido > 0 ? 'warn' : 'idle',
        pronto ? 'atendida' : d.produzido > 0 ? 'parcial' : 'aberta'),
      acoes,
    ]);
  });

  const emProcesso = (ind.estoques || []).filter((s) => num(s.quantidade) > 0);
  const tabelaEstoque = emProcesso.length === 0 ? vazio('Nada em processo ainda.') : tabela(
    ['Item', 'Local', 'Lote', ['Quantidade', 'num'], ['Custo unitário', 'num']],
    emProcesso.map((s) => {
      const lote = (ind.lotes || []).find((l) => l.id === s.loteId);
      return linha(s.id, [
        (item(s.itemId) || {}).nome || '—',
        [s.local, 'small muted'],
        [lote ? lote.codigo : '—', 'small muted'],
        [`${decimal(s.quantidade)} ${s.unidade}`, 'num'],
        [moeda(s.custoUnitario), 'num'],
      ]);
    }));

  const perdas = ind.perdas || [];
  const blocoPerdas = perdas.length === 0 ? null : bloco('Perdas registradas', '§22', [tabela(
    ['Data', 'Setor', 'Item', ['Quantidade', 'num'], 'Motivo', ['Custo', 'num']],
    perdas.map((p) => linha(p.id, [
      dataBR(p.data),
      depNome(p.departamentoId),
      p.nome,
      [decimal(p.quantidade), 'num'],
      selo(p.esperada ? 'idle' : 'bad', p.motivoNome),
      [moeda(p.custo), 'num'],
    ])))]);

  return h('div', null,
    bloco('Demandas por processo', '§34', [
      pequeno('A ordem de cada setor nasce da explosão da estrutura, na sequência em que a fábrica '
        + 'produz. A costura só é liberada quando todos os componentes existem.', { marginTop: -6 }),
      tabela(['Ordem', 'Setor', 'Entrega', ['Planejado', 'num'], ['Produzido', 'num'],
        ['Minutos', 'num'], 'Situação', ''], linhasDemanda),
    ]),
    bloco('Estoque entre processos', '§18', [tabelaEstoque]),
    blocoPerdas);
}

/* ==================================================== §32/§33 rastreio */


/* ================================================= §36 apontar produção */

export function ModalExecucao({ db, ind, demanda, item, usuario, onFechar, onConfirmar }) {
  const trf = (ind.transformacoes || []).find((t) => t.id === demanda.transformacaoId);
  const restante = Math.max(num(demanda.quantidade) - num(demanda.produzido), 0);
  const [quantidade, setQuantidade] = React.useState(restante);
  const [perdaQtd, setPerdaQtd] = React.useState('');
  const [perdaMotivo, setPerdaMotivo] = React.useState(MOTIVOS_PERDA[0].id);
  if (!trf) return null;

  const principal = trf.saidas.find((s) => s.principal) || trf.saidas[0];
  const rodadas = num(quantidade) / num(principal.quantidade);

  const consumos = trf.entradas.map((e) => {
    const it = item(e.itemId);
    const precisa = arredondar(rodadas * num(e.quantidade) * (1 + num(e.perda) / 100), 3);
    const tem = it && it.materialId ? null : arredondar(disponivelEmProcesso(db, e.itemId), 3);
    const marca = tem === null
      ? h('span', { className: 'small muted' }, ' · almoxarifado')
      : h('span', { className: 'small', style: { color: tem + 0.0001 < precisa ? 'var(--bad)' : 'var(--ok)' } },
        ` · em processo: ${decimal(tem)}`);
    return h('div', { key: e.id }, `${decimal(precisa)} ${it ? it.unidade : ''} de ${it ? it.nome : '?'}`, marca);
  });

  const entregas = trf.saidas.map((s) => h('div', { key: s.id },
    `${decimal(arredondar(rodadas * num(s.quantidade), 3))} ${(item(s.itemId) || {}).nome || '?'}`));

  const confirmar = () => {
    const entrada = trf.entradas[0];
    const itemPerda = entrada ? item(entrada.itemId) : null;
    onConfirmar({
      transformacaoId: trf.id,
      demandaId: demanda.id,
      ordemId: ((ind.ordens || []).find((o) => o.demandaId === demanda.id) || {}).id || '',
      consolidacaoId: demanda.consolidacaoId,
      saidas: trf.saidas.map((s) => ({
        itemId: s.itemId, quantidade: arredondar(rodadas * num(s.quantidade), 3),
      })),
      perdas: num(perdaQtd) > 0 && itemPerda
        ? [{ itemId: itemPerda.id, quantidade: num(perdaQtd), motivo: perdaMotivo,
            custoUnitario: num(itemPerda.custoPadrao) }]
        : [],
      colaboradorId: (usuario && usuario.id) || '',
    });
  };

  return h(Modal, { title: `Apontar produção · ${trf.nome}`, onClose: onFechar, wide: true },
    pequeno('O que entra sai do estoque do processo anterior; o que sai entra no estoque deste setor, '
      + 'com lote próprio e o custo acumulado de tudo o que veio antes.'),
    h('div', { className: 'field' },
      h('label', null, `Quantidade produzida de ${(item(principal.itemId) || {}).nome || ''}`),
      h('input', { type: 'number', value: quantidade, min: 0,
        onChange: (e) => setQuantidade(e.target.value) })),
    h('div', { className: 'panel', style: { background: '#fff' } },
      h('strong', { className: 'small' }, 'Vai consumir'),
      h('div', { className: 'small', style: { lineHeight: 1.8 } }, ...consumos),
      h('strong', { className: 'small', style: { display: 'block', marginTop: 10 } }, 'Vai entregar'),
      h('div', { className: 'small', style: { lineHeight: 1.8 } }, ...entregas)),
    h('div', { className: 'grid2' },
      h('div', { className: 'field' },
        h('label', null, 'Perda (opcional)'),
        h('input', { type: 'number', value: perdaQtd, min: 0, placeholder: '0',
          onChange: (e) => setPerdaQtd(e.target.value) })),
      h('div', { className: 'field' },
        h('label', null, 'Motivo da perda'),
        h('select', { value: perdaMotivo, onChange: (e) => setPerdaMotivo(e.target.value) },
          MOTIVOS_PERDA.map((m) => h('option', { key: m.id, value: m.id }, m.nome))))),
    h('div', { className: 'modal-actions' },
      h('button', { className: 'btn ghost', onClick: onFechar }, 'Cancelar'),
      h('button', { className: 'btn accent', onClick: confirmar }, 'Lançar execução')));
}

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
  prepararIndustrial, disponivelEmProcesso, num, arredondar, MOTIVOS_PERDA, TIPOS_ITEM,
} from './modelo.mjs';
import {
  consolidarCarteira, explodirBOM, calcularMRP, calcularCapacidade, calcularBudget,
  planoDeProducao, executarTransformacao, liberarParaCostura, wipDaCarteira,
  realizadoVersusBudget, custoAcumulado, rastrear, simular,
} from './motores.mjs';
import { montarDemonstracao, receberCompra } from './demonstracao.mjs';

const h = (tipo, props, ...filhos) => React.createElement(tipo, props, ...filhos);

const moeda = (v) => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const inteiro = (v) => num(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const decimal = (v, casas = 3) => num(v).toLocaleString('pt-BR', { maximumFractionDigits: casas });
const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

const SELO = { normal: 'ok', risco: 'warn', gargalo: 'bad', sem_equipe: 'bad' };
const selo = (tom, texto) => h('span', { className: `badge ${tom}` }, h('span', { className: 'dot' }), texto);
const vazio = (texto) => h('div', { className: 'empty' }, texto);
const pequeno = (texto, estilo) => h('p', { className: 'small muted', style: estilo }, texto);

const kpi = (rotulo, valor, apoio, destaque) => h('div', {
  className: `kpi${destaque ? ' accent' : ''}`, key: rotulo,
}, h('div', { className: 'lbl' }, rotulo),
   h('div', { className: 'val' }, valor),
   apoio ? h('div', { className: 'small', style: { opacity: .75, marginTop: 2 } }, apoio) : null);

/** Painel com título, selo opcional e os filhos que vierem. */
const bloco = (titulo, chip, filhos, props) => h('div', Object.assign({ className: 'panel' }, props || {}),
  h('h3', null, titulo, chip ? h('span', { className: 'chip' }, chip) : null),
  ...filhos.filter(Boolean));

/** Tabela: cabeçalhos como ['Item', ['Valor','num']] e linhas já montadas. */
const tabela = (cabecalhos, linhas) => h('table', null,
  h('thead', null, h('tr', null, ...cabecalhos.map((c, i) => {
    const [texto, classe] = Array.isArray(c) ? c : [c, ''];
    return h('th', { key: i, className: classe }, texto);
  }))),
  h('tbody', null, ...linhas));

/** Linha: células como ['texto'] ou [valor, 'num'] ou [elemento]. */
const linha = (chave, celulas) => h('tr', { key: chave }, ...celulas.map((c, i) => {
  const [conteudo, classe, estilo] = Array.isArray(c) ? c : [c, ''];
  return h('td', { key: i, className: classe || '', style: estilo || null }, conteudo);
}));

/* ====================================================================== */

export function GrupoIndustrial({ db, update, usuario }) {
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
    loteAberto, setLoteAberto };

  const cabeca = h('div', { className: 'page-head' },
    h('div', null, h('p', { className: 'eyebrow' }, 'Fábrica digital'), h('h2', null, 'Industrial')),
    consolidacoes.length > 1 && atual
      ? h('select', {
        value: atual.id, style: { width: 280 },
        onChange: (e) => setEscolhida(e.target.value),
      }, consolidacoes.map((c) => h('option', { key: c.id, value: c.id }, `${c.codigo} · ${c.nome}`)))
      : null);

  if (itens.length === 0) return h('div', null, cabeca, boasVindas(mexer, erro));

  const abas = [
    { id: 'painel', label: 'Painel' },
    { id: 'carteira', label: `Carteira (${(ind.carteira || []).length})` },
    { id: 'plano', label: 'Plano e budget' },
    { id: 'producao', label: `Produção (${(ind.demandas || []).filter((d) => d.status !== 'atendida').length})` },
    { id: 'estrutura', label: 'Estrutura' },
    { id: 'rastreio', label: `Rastreio (${(ind.lotes || []).length})` },
  ];

  const recado = (texto, cor, fundo) => h('div', {
    className: 'panel', style: { borderColor: cor, background: fundo, marginBottom: 14 },
  }, h('strong', { className: 'small' }, texto));

  const telas = {
    painel: () => telaPainel(contexto),
    carteira: () => telaCarteira(contexto),
    plano: () => telaPlano(contexto),
    producao: () => telaProducao(contexto),
    estrutura: () => telaEstrutura(contexto),
    rastreio: () => telaRastreio(contexto),
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

/* ------------------------------------------------- base sem o módulo */

function boasVindas(mexer, erro) {
  return bloco('O módulo industrial ainda não tem estrutura cadastrada', null, [
    pequeno('Aqui moram a carteira de produção, o budget industrial, o MRP e o caminho que a peça '
      + 'faz de um setor para o outro — cada departamento recebendo, transformando e entregando para '
      + 'o próximo. Para conhecer o módulo com número de verdade, carregue a demonstração: uma '
      + 'carteira de 10.000 camisetas de três clientes, com ficha técnica, roteiro e tempos dos '
      + 'cinco processos.', { maxWidth: 640, lineHeight: 1.6 }),
    erro ? h('p', { className: 'small', style: { color: 'var(--bad)' } }, erro) : null,
    h('button', {
      className: 'btn accent',
      onClick: () => mexer((d) => {
        try { montarDemonstracao(d); return { ok: true }; } catch (e) { return { erro: e.message }; }
      }, 'Demonstração carregada: carteira de 10.000 camisetas em três pedidos.'),
    }, 'Carregar demonstração (10.000 camisetas)'),
  ]);
}

/* ============================================================ §28 painel */

function telaPainel({ db, ind, atual, item }) {
  if (!atual) return vazio('Nenhuma carteira consolidada. Abra a aba Carteira e gere o plano de produção.');

  const wip = wipDaCarteira(db, atual.id);
  const comparacao = realizadoVersusBudget(db, atual.id);
  const budget = (ind.budgets || []).find((b) => b.consolidacaoId === atual.id);
  const acabadas = wip.erro ? 0 : num((wip.etapas[wip.etapas.length - 1] || {}).produzido);
  const alertas = comparacao.erro ? [] : comparacao.alertas;

  const cartoes = h('div', { className: 'kpis' },
    kpi('Carteira', inteiro(wip.erro ? 0 : wip.total), 'peças prometidas'),
    kpi('Produzido', inteiro(acabadas), 'peças acabadas', acabadas > 0),
    kpi('Custo planejado', budget ? moeda(budget.custoIndustrial) : '—',
      budget ? `${moeda(budget.custoPorPeca)} por peça` : 'sem budget'),
    kpi('Custo real', comparacao.erro ? '—' : moeda(comparacao.realizado),
      comparacao.erro ? 'nada apontado ainda' : `desvio ${moeda(comparacao.desvio)}`),
    kpi('Em processo', inteiro(wip.erro ? 0 : wip.emProcesso), 'peças entre setores'));

  const painelAlertas = alertas.length
    ? bloco('⚠ Alertas', null, [h('ul', { style: { margin: 0, paddingLeft: 18 } },
      ...alertas.slice(0, 8).map((a, i) => h('li', { key: i, className: 'small', style: { marginBottom: 4 } },
        h('strong', null, `${a.titulo}: `), a.mensagem)))], { style: { borderColor: 'var(--warn)' } })
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
    bloco('Onde estão as peças', 'WIP', [pilulas]), desvio);
}

/* ========================================================== §2 carteira */

function telaCarteira({ db, ind, item, mexer, setSub }) {
  const linhas = (ind.carteira || []).filter((l) => l.status !== 'cancelada');
  const abertas = linhas.filter((l) => l.status === 'aberta');
  const nomeCliente = (id) => {
    const c = (db.clientes || []).find((x) => x.id === id);
    return c ? (c.nomeFantasia || c.nome) : '—';
  };

  const tabelaCarteira = linhas.length === 0 ? vazio('Nenhuma linha de carteira.') : tabela(
    ['Pedido', 'Cliente', 'Produto', ['Quantidade', 'num'], 'Entrega', ['Prioridade', 'num'], 'Situação'],
    linhas.map((l) => linha(l.id, [
      l.pedido || l.codigo,
      nomeCliente(l.clienteId),
      (item(l.itemId) || {}).nome || '—',
      [inteiro(l.quantidade), 'num'],
      dataBR(l.dataPrometida),
      [l.prioridade, 'num'],
      selo(l.status === 'aberta' ? 'idle' : 'info', l.status),
    ])));

  const botaoConsolidar = h('div', { className: 'row-actions', style: { marginTop: 14 } },
    h('button', {
      className: 'btn', disabled: abertas.length === 0,
      onClick: () => mexer((d) => consolidarCarteira(d, {}), (r) =>
        `${r.consolidacao.codigo}: `
        + `${inteiro(r.consolidacao.produtos.reduce((s, p) => s + num(p.quantidade), 0))} peças consolidadas.`),
    }, `Consolidar ${abertas.length} pedido(s) aberto(s)`));

  const consolidadas = (ind.consolidacoes || []).length === 0
    ? vazio('Nenhuma consolidação ainda.')
    : tabela(['Código', 'Nome', 'Produto', ['Peças', 'num'], 'Entrega', 'Situação', ''],
      (ind.consolidacoes || []).map((c) => {
        const temPlano = (ind.demandas || []).some((d) => d.consolidacaoId === c.id);
        const acao = temPlano
          ? h('span', { className: 'small muted' }, 'plano gerado')
          : h('button', {
            className: 'btn accent sm',
            onClick: () => {
              mexer((d) => planoDeProducao(d, { consolidacaoId: c.id }), (r) =>
                `Plano gerado: ${r.planos[0].demandas.length} demandas · `
                + `custo planejado ${moeda(r.custoPlanejado)}.`);
              setSub('plano');
            },
          }, 'Gerar plano de produção');
        return linha(c.id, [
          c.codigo, c.nome,
          c.produtos.map((p) => (item(p.itemId) || {}).nome).join(', '),
          [inteiro(c.produtos.reduce((s, p) => s + num(p.quantidade), 0)), 'num'],
          dataBR(c.produtos[0] && c.produtos[0].prazo),
          selo(c.status === 'em_producao' ? 'ok' : 'idle', c.status),
          acao,
        ]);
      }));

  return h('div', null,
    bloco('Carteira de produção', `${inteiro(linhas.reduce((s, l) => s + num(l.quantidade), 0))} peças`, [
      pequeno('Consolidar junta o mesmo produto de clientes diferentes num lote só — é o que evita '
        + 'enfestar três vezes o mesmo tecido.', { marginTop: -6 }),
      tabelaCarteira,
      botaoConsolidar,
    ]),
    bloco('Carteiras consolidadas', null, [consolidadas]));
}

/* ================================================ §3/§25/§27 plano e budget */

function telaPlano({ db, ind, atual, item, mexer, usuario }) {
  if (!atual) return vazio('Consolide a carteira primeiro.');
  const produto = atual.produtos[0];
  const explosao = explodirBOM(db, produto.itemId, produto.quantidade);
  if (explosao.erro) return vazio(explosao.erro);

  const mrp = calcularMRP(db, explosao);
  const capacidade = calcularCapacidade(db, explosao, { quantidade: produto.quantidade });
  const budget = (ind.budgets || []).find((b) => b.consolidacaoId === atual.id)
    || calcularBudget(db, explosao, { registrar: false });
  const cenarios = simular(db, produto.itemId,
    [Math.round(produto.quantidade / 2), produto.quantidade, produto.quantidade * 2],
    { considerarEstoque: false });

  const cartoes = h('div', { className: 'kpis' },
    kpi('Material', moeda(budget.totalMaterial), 'ao custo do almoxarifado'),
    kpi('Processo', moeda(budget.totalProcesso), `${inteiro(budget.minutosTotais)} minutos`),
    kpi('Custo industrial', moeda(budget.custoIndustrial), `${moeda(budget.custoPorPeca)} por peça`, true),
    kpi('Compras', moeda(mrp.totalCompra), `${mrp.itensAComprar} item(ns) em falta`),
    kpi('Ocupação', capacidade.ocupacaoGeral === null ? '—' : `${capacidade.ocupacaoGeral}%`,
      `takt ${decimal(capacidade.takt, 3)} min/peça`));

  const tabelaMrp = tabela(
    ['Item', 'Tipo', ['Bruta', 'num'], ['Disponível', 'num'], ['Comprar', 'num'], 'Fornecedor', ['Valor', 'num']],
    mrp.linhas.map((l) => linha(l.itemId, [
      l.nome,
      [(TIPOS_ITEM.find((t) => t.id === l.tipo) || {}).nome || l.tipo, 'small muted'],
      [`${decimal(l.bruta)} ${l.unidade}`, 'num'],
      [decimal(l.disponivel), 'num'],
      [l.comprar > 0 ? decimal(l.comprar) : '—', 'num', l.comprar > 0 ? { color: 'var(--bad)' } : null],
      [l.fornecedor || '—', 'small'],
      [l.valor > 0 ? moeda(l.valor) : '—', 'num'],
    ])));

  const tabelaCapacidade = tabela(
    ['Setor', ['Pessoas', 'num'], ['Horas necessárias', 'num'], ['Horas disponíveis', 'num'],
      ['Ocupação', 'num'], 'Situação'],
    capacidade.linhas.map((l) => linha(l.departamentoId, [
      l.departamento,
      [l.pessoas, 'num'],
      [decimal(l.horasNecessarias, 1), 'num'],
      [decimal(l.horasDisponiveis, 1), 'num'],
      [l.ocupacao === null ? '—' : `${l.ocupacao}%`, 'num'],
      selo(SELO[l.situacao] || 'idle', l.situacao === 'sem_equipe' ? 'sem equipe' : l.situacao),
    ])));

  const tabelaBudget = tabela(
    ['Processo', ['Minutos', 'num'], ['Mão de obra', 'num'], ['Manuseio', 'num'], ['Setup', 'num'],
      ['Máquina', 'num'], ['Indireto', 'num'], ['Total', 'num']],
    budget.processos.map((p) => linha(p.transformacaoId, [
      `${p.departamento} — ${p.nome}`,
      [inteiro(p.minutos), 'num'],
      [moeda(p.maoDeObra), 'num'],
      [moeda(p.manuseio), 'num'],
      [moeda(p.setup), 'num'],
      [moeda(p.maquina + p.energia), 'num'],
      [moeda(p.indireto), 'num'],
      [moeda(p.total), 'num'],
    ])));

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

  /* Enquanto não existe módulo de compras, receber o que falta é um atalho da
     demonstração — a entrada é a mesma que o almoxarifado registraria. */
  const faltando = mrp.linhas.filter((l) => l.comprar > 0);
  const botaoReceber = faltando.length === 0 ? null : h('div', { className: 'row-actions', style: { marginTop: 12 } },
    h('button', {
      className: 'btn',
      onClick: () => mexer((d) => {
        for (const l of faltando) {
          const r = receberCompra(d, l.materialId, l.comprar, { documento: 'Compra do plano', usuario });
          if (r && r.erro) return r;
        }
        return { ok: true };
      }, `Recebimento lançado: ${faltando.length} material(is), ${moeda(mrp.totalCompra)}.`),
    }, `Receber as compras deste plano (${faltando.length} item(ns))`),
    h('span', { className: 'small muted', style: { alignSelf: 'center' } },
      'atalho da demonstração — sem módulo de compras, a entrada é lançada direto no almoxarifado'));

  return h('div', null, cartoes,
    bloco('MRP — necessidade líquida', '§25', [
      pequeno('bruta − disponível − entradas programadas + segurança = líquida', { marginTop: -6 }),
      tabelaMrp,
      botaoReceber,
    ]),
    bloco('Capacidade por setor', '§27', [tabelaCapacidade]),
    bloco('Budget industrial', '§3', [
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

function telaProducao({ db, ind, atual, item, depNome, mexer, usuario, setApontando }) {
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

/* ======================================================== §4/§5 estrutura */

function telaEstrutura({ db, ind, item, depNome }) {
  const tabelaItens = tabela(
    ['Código', 'Item', 'Tipo', 'Unidade', 'Nasce em', ['Em processo', 'num']],
    (ind.itens || []).map((i) => linha(i.id, [
      [i.codigo, 'small muted'],
      i.nome,
      [(TIPOS_ITEM.find((t) => t.id === i.tipo) || {}).nome || i.tipo, 'small'],
      [i.unidade, 'small muted'],
      [i.materialId ? 'almoxarifado' : depNome(i.departamentoId) || '—', 'small muted'],
      [decimal(disponivelEmProcesso(db, i.id)), 'num'],
    ])));

  const receitas = (ind.transformacoes || []).map((t) => h('div', {
    key: t.id, style: { borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 },
  },
    h('div', { style: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' } },
      h('strong', null, t.nome), selo('info', depNome(t.departamentoId)),
      h('span', { className: 'small muted' }, `lote padrão ${inteiro(t.lotePadrao)}`)),
    h('div', { className: 'small', style: { marginTop: 6, lineHeight: 1.7 } },
      h('strong', null, 'recebe: '),
      t.entradas.map((e) => `${decimal(e.quantidade)} ${(item(e.itemId) || {}).nome || '?'}`
        + `${num(e.perda) ? ` (+${e.perda}% perda)` : ''}`).join(' · ')),
    h('div', { className: 'small', style: { lineHeight: 1.7 } },
      h('strong', null, 'entrega: '),
      t.saidas.map((s) => `${decimal(s.quantidade)} ${(item(s.itemId) || {}).nome || '?'}`).join(' · ')),
    h('div', { className: 'small muted', style: { marginTop: 4 } },
      t.operacoes.map((o) => `${o.nome} (${o.porCiclo === 0 ? 'uma vez por ordem'
        : `ciclo de ${inteiro(o.porCiclo)}`})`).join(' → '))));

  return h('div', null,
    bloco('Itens', '§5', [tabelaItens]),
    bloco('Transformações', '§45', [
      pequeno('Cada receita diz o que entra, o que sai e quanto tempo leva. É o que faz o corte '
        + 'entregar frente, costas, manga e gola em vez de "dar baixa de tecido".', { marginTop: -6 }),
      ...receitas,
    ]));
}

/* ==================================================== §32/§33 rastreio */

function telaRastreio({ db, ind, item, loteAberto, setLoteAberto }) {
  const lotes = (ind.lotes || []).slice().reverse();
  if (lotes.length === 0) return vazio('Nenhum lote produzido ainda. Aponte uma execução na aba Produção.');

  const arvore = loteAberto ? rastrear(db, loteAberto) : null;
  const custo = loteAberto ? custoAcumulado(db, loteAberto) : null;

  const desenhar = (no, nivel, chave) => {
    if (!no) return null;
    const recuo = { paddingLeft: nivel * 18, lineHeight: 1.8 };
    if (no.tipo === 'almoxarifado') {
      return h('div', { key: chave, style: recuo },
        h('span', { className: 'small muted' }, '← '),
        h('span', { className: 'small' }, `${decimal(no.quantidade)} ${no.unidade} de ${no.item}`),
        h('span', { className: 'small muted' }, ` · almoxarifado · ${moeda(no.custoUnitario)}`));
    }
    const filhos = (no.origens || []).map((o, i) => desenhar(o, nivel + 1, `${chave}-${i}`));
    return h('div', { key: chave, style: recuo },
      h('span', { className: 'small' }, h('strong', null, no.lote), ` · ${inteiro(no.quantidade)} ${no.item}`),
      no.departamento ? h('span', { className: 'small muted' }, ` · ${no.departamento} · ${dataBR(no.data)}`) : null,
      h('span', { className: 'small muted' }, ` · ${moeda(no.custoUnitario)}/un`),
      ...filhos);
  };

  const tabelaLotes = tabela(['Lote', 'Item', ['Quantidade', 'num'], ['Custo unitário', 'num'], 'Data', ''],
    lotes.map((l) => linha(l.id, [
      l.codigo,
      (item(l.itemId) || {}).nome || '—',
      [decimal(l.quantidade), 'num'],
      [moeda(l.custoUnitario), 'num'],
      dataBR(l.data),
      h('button', { className: 'btn ghost sm', onClick: () => setLoteAberto(l.id) }, 'Ver árvore'),
    ])));

  const blocoArvore = arvore && !arvore.erro ? bloco(`Árvore de transformação · ${arvore.lote}`, '§33', [
    desenhar(arvore, 0, 'raiz'),
    custo && !custo.erro ? h('div', { style: { marginTop: 16 } },
      h('h3', null, 'Custo acumulado'),
      tabela(['Etapa', 'Setor', ['Material', 'num'], ['Conversão', 'num'], ['Total', 'num']],
        custo.etapas.map((e) => linha(e.execucaoId, [
          [e.execucao, 'small muted'],
          e.departamento,
          [moeda(e.material), 'num'],
          [moeda(e.conversao), 'num'],
          [moeda(e.total), 'num'],
        ]))),
      pequeno(`Custo unitário do lote: ${moeda(custo.custoUnitario)} · material `
        + `${moeda(custo.materialTotal)} + conversão ${moeda(custo.conversaoTotal)}.`)) : null,
  ]) : null;

  return h('div', null, bloco('Lotes', '§11', [tabelaLotes]), blocoArvore);
}

/* ================================================= §36 apontar produção */

function ModalExecucao({ db, ind, demanda, item, usuario, onFechar, onConfirmar }) {
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

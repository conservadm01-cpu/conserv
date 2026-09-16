/**
 * MÓDULO INDUSTRIAL — a tela das ordens que nasceram no módulo Produção
 *
 * Aqui não se abre ordem: abre-se no módulo **Produção**, na tela de sempre.
 * Esta tela mostra as ordens que existem e o que o motor industrial fez — ou
 * ainda não fez — com cada uma: plano por setor, material reservado, o que
 * falta comprar e quanto vai custar.
 */

import {
  h, moeda, inteiro, decimal, dataBR, selo, vazio, pequeno, kpi, bloco, tabela, linha,
  irEComBilhete,
} from './interface.mjs';
import { num } from './modelo.mjs';
import {
  ordensDoSistema, planejarOrdemDoSistema, planejarOrdensPendentes,
  abrirOrdemDeProducao, versaoVigenteDoProduto, tarefasDaOrdem,
} from './ordens-sistema.mjs';
import { lerFichaDoProduto, nomeDoProduto } from './engenharia.mjs';
import { resumoDaOrdem } from './ordens.mjs';

const ESTADO = {
  sem_plano: ['idle', 'sem plano industrial'],
  planejada: ['ok', 'planejada'],
  faltando: ['warn', 'falta material'],
};

const SITUACAO_SISTEMA = {
  aberta: ['idle', 'aberta'],
  liberada: ['ok', 'liberada'],
  producao: ['ok', 'em produção'],
  concluida: ['ok', 'concluída'],
  cancelada: ['bad', 'cancelada'],
};

export function TelaOrdensDoSistema({ db, mexer, usuario, setSub, setEscolhida }) {
  const [todas, setTodas] = React.useState(false);
  const [aberta, setAberta] = React.useState('');
  const [nova, setNova] = React.useState(null);

  const lista = ordensDoSistema(db, { todas });
  const detalhe = aberta ? resumoDaOrdem(db, aberta) : null;

  const planejar = (l) => mexer(
    (d) => planejarOrdemDoSistema(d, l.ordemId, usuario),
    (r) => `${l.codigo} planejada: ${r.plano.ordens.length} etapa(s), `
      + `${r.reserva.feitas.length} material(is) reservado(s)`
      + `${r.requisicoes.criadas.length ? ` e ${r.requisicoes.criadas.length} requisição(ões)` : ''}. `
      + `Custo planejado R$ ${r.custoPlanejado}.`);

  const linhas = lista.linhas.map((l) => linha(l.ordemId, [
    [l.codigo, 'small muted'],
    h('div', null,
      h('div', null, l.produtoCurto,
        l.amostra ? h('span', { className: 'chip', style: { marginLeft: 6 } }, 'amostra') : null),
      h('div', { className: 'small muted' }, `${l.cliente} · ${l.produto}`)),
    [inteiro(l.quantidade), 'num', { whiteSpace: 'nowrap' }],
    [dataBR(l.entrega), 'small muted', { whiteSpace: 'nowrap' }],
    selo(...(SITUACAO_SISTEMA[l.situacao] || ['idle', l.situacao])),
    selo(...(ESTADO[l.estado] || ['idle', l.estado])),
    [l.planejada ? `${l.etapas} etapa(s)` : '—', 'small muted', { whiteSpace: 'nowrap' }],
    [l.planejada ? moeda(l.custoPlanejado) : '—', 'num', { whiteSpace: 'nowrap' }],
    h('div', { className: 'row-actions' },
      l.planejada
        ? h('button', {
          className: 'btn ghost sm',
          onClick: () => { setAberta(l.consolidacaoId); if (setEscolhida) setEscolhida(l.consolidacaoId); },
        }, 'Ver plano')
        : h('button', { className: 'btn sm', onClick: () => planejar(l) }, 'Planejar no industrial'),
      l.planejada ? h('button', {
        className: 'btn ghost sm',
        onClick: () => { if (setEscolhida) setEscolhida(l.consolidacaoId); if (setSub) setSub('plano'); },
      }, 'MRP e budget') : null),
  ]));

  const cartoes = h('div', { className: 'kpis' },
    kpi('Ordens em aberto', inteiro(lista.total), 'em produção agora'),
    kpi('Planejadas aqui', inteiro(lista.planejadas), 'com plano, reserva e MRP'),
    kpi('Sem plano', inteiro(lista.semPlano), 'abertas antes, fora do motor', lista.semPlano > 0),
    kpi('Custo planejado', moeda(lista.custoPlanejado), 'soma das ordens planejadas'));

  const detalhePlano = !detalhe || detalhe.erro ? null : bloco(
    `Plano de ${detalhe.codigo} · ${detalhe.produto}`, null, [
      pequeno(`${inteiro(detalhe.quantidade)} peça(s) · ${detalhe.percentual}% acabado · `
        + `custo planejado ${moeda(detalhe.custoPlanejado)} (${moeda(detalhe.custoPorPecaPlanejado)} por peça)`,
      { marginTop: -6 }),
      tabela(['Etapa', 'Setor', ['Quantidade', 'num'], ['Produzido', 'num'], 'Situação', 'O que falta'],
        (detalhe.etapas || []).map((e) => linha(e.demandaId, [
          [e.codigo || '', 'small muted'],
          e.departamento,
          [decimal(e.quantidade), 'num'],
          [decimal(e.produzido), 'num'],
          selo(e.status === 'atendida' ? 'ok' : (e.podeComecar ? 'idle' : 'warn'),
            e.status === 'atendida' ? 'pronta' : (e.podeComecar ? 'pode começar' : 'esperando')),
          [(e.faltas || []).map((f) => `${decimal(f.falta)} ${f.nome}${f.esperando ? ' (na fila)' : ''}`)
            .join(' · ') || '—', 'small muted'],
        ]))),
      h('div', { className: 'row-actions' },
        h('button', {
          className: 'btn ghost sm',
          onClick: () => { if (setSub) setSub('producao'); },
        }, 'Ir para o apontamento'),
        h('button', {
          className: 'btn ghost sm', onClick: () => setAberta(''),
        }, 'Fechar plano')),
    ]);

  return h('div', null,
    cartoes,

    h('div', { className: 'row-actions', style: { marginBottom: 14 } },
      h('button', {
        className: 'btn accent', onClick: () => setNova({ quantidade: 100 }),
      }, '+ Nova ordem de produção'),
      lista.semPlano > 0 ? h('button', {
        className: 'btn',
        onClick: () => mexer((d) => planejarOrdensPendentes(d, usuario),
          (r) => `${r.feitas.length} ordem(ns) planejada(s): ${r.feitas.map((f) => f.codigo).join(', ')}.`
            + (r.falhas.length ? ` ${r.falhas.length} não entraram: ${r.falhas[0].erro}` : '')),
      }, `Planejar as ${lista.semPlano} que faltam`) : null,
      h('button', {
        className: 'btn ghost', onClick: () => setTodas(!todas),
      }, todas ? 'Mostrar só as em aberto' : 'Mostrar também as fechadas')),

    bloco('Ordens de produção', null, [
      pequeno('A ordem nasce do produto cadastrado em Produtos, com a versão da engenharia '
        + 'congelada e as etapas do processo fotografadas. Junto com ela nasce o plano industrial: '
        + 'uma etapa por setor, a reserva do material que existe, a requisição do que falta e o '
        + 'budget da ordem.',
      { marginTop: -6, maxWidth: 760, lineHeight: 1.6 }),
      linhas.length === 0
        ? vazio('Nenhuma ordem de produção em aberto. Use "+ Nova ordem de produção".')
        : tabela(['Ordem', 'Produto', ['Qtd', 'num'], 'Entrega', 'No sistema', 'No industrial',
          'Etapas', ['Custo planejado', 'num'], ''], linhas),
    ]),

    detalhePlano,

    nova ? h(ModalNovaOrdem, {
      db, dados: nova,
      onFechar: () => setNova(null),
      onAbrir: (dados) => {
        const r = mexer((d) => abrirOrdemDeProducao(d, dados, usuario),
          (resp) => `${resp.ordemSistema.codigo} aberta: ${inteiro(resp.ordemSistema.quantidade)} `
            + `peça(s) · ${resp.plano.ordens.length} etapa(s) · custo planejado `
            + `R$ ${resp.custoPlanejado}`
            + `${resp.requisicoes.criadas.length ? ` · ${resp.requisicoes.criadas.length} requisição(ões)` : ''}.`);
        if (r && !r.erro) setNova(null);
      },
    }) : null);
}

/* ------------------------------------------------- abrir a ordem */

function ModalNovaOrdem({ db, dados, onFechar, onAbrir }) {
  const produtos = (db.produtos || []).filter((p) => p.ativo !== false);
  const [f, setF] = React.useState({
    produtoId: dados.produtoId || (produtos[0] || {}).id || '',
    quantidade: dados.quantidade || 100,
    clienteId: '',
    entrega: '',
    prioridade: 5,
    amostra: false,
    observacao: '',
  });
  const set = (campo, valor) => setF((p) => ({ ...p, [campo]: valor }));

  const produto = produtos.find((p) => p.id === f.produtoId) || null;
  const ficha = produto ? lerFichaDoProduto(db, produto.id) : null;
  const versao = produto ? versaoVigenteDoProduto(db, produto.id) : null;
  const liberado = produto && String(produto.status || '').toLowerCase() === 'liberado';
  const pronto = !!ficha && !ficha.erro && ficha.pendencias.length === 0 && (liberado || f.amostra);

  const situacao = !produto
    ? h('p', { className: 'small' }, 'Escolha o produto.')
    : h('div', null,
      ficha.pendencias.length
        ? h('div', null,
          h('p', { className: 'small', style: { color: 'var(--bad)', marginBottom: 4 } },
            'A ficha deste produto está incompleta:'),
          h('ul', { style: { margin: 0, paddingLeft: 18 } },
            ...ficha.pendencias.slice(0, 4).map((p, i) => h('li', { key: i, className: 'small' }, p))))
        : h('p', { className: 'small', style: { color: liberado || f.amostra ? 'var(--ok)' : 'var(--bad)' } },
          liberado
            ? `✓ ${ficha.materiais.length} material(is) na ficha e ${ficha.blocos.length} setor(es) `
              + `no processo — a ordem abre a cadeia inteira.`
            : `Produto em ${produto.status || 'desenvolvimento'}: só abre ordem marcada como amostra.`),
      h('div', { className: 'small muted', style: { marginTop: 6 } },
        `${ficha.blocos.map((b) => b.departamento).join(' → ')}`
        + ` · ${decimal(ficha.minutosPorPeca)} min por peça`
        + `${versao ? ` · engenharia ${versao.codigo}` : ''}`));

  /* o que a ordem vai consumir, direto da composição do produto */
  const composicao = !ficha || ficha.erro ? null : tabela(
    ['Material', ['Por peça', 'num'], ['Total da ordem', 'num'], 'Unidade'],
    ficha.materiais.map((m) => linha(m.fichaId, [
      m.nome,
      [decimal(m.quantidade, 4), 'num'],
      [decimal(m.quantidade * num(f.quantidade), 3), 'num'],
      [m.unidade, 'small muted'],
    ])));

  return h(Modal, { title: 'Nova ordem de produção', onClose: onFechar, wide: true },
    pequeno('O produto e a composição vêm do cadastro de Produtos. A ordem abre a cadeia inteira: '
      + 'uma etapa por setor, reserva do material que existe e requisição do que falta.'),

    h('div', { className: 'grid2' },
      h('div', { className: 'field' },
        h('label', null, 'Produto'),
        h('select', { value: f.produtoId, onChange: (e) => set('produtoId', e.target.value) },
          h('option', { value: '' }, 'escolha o produto…'),
          ...produtos.map((p) => h('option', { key: p.id, value: p.id },
            `${p.codigo} · ${nomeDoProduto(p)}`)))),
      h('div', { className: 'field' },
        h('label', null, 'Quantidade'),
        h('input', { type: 'number', min: 1, value: f.quantidade,
          onChange: (e) => set('quantidade', e.target.value) }))),

    h('div', { className: 'panel', style: { background: '#fff' } }, situacao),

    h('div', { className: 'grid3' },
      h('div', { className: 'field' },
        h('label', null, 'Cliente'),
        h('select', { value: f.clienteId, onChange: (e) => set('clienteId', e.target.value) },
          h('option', { value: '' }, 'produção para estoque'),
          ...(db.clientes || []).map((c) => h('option', { key: c.id, value: c.id },
            c.nomeFantasia || c.nome)))),
      h('div', { className: 'field' },
        h('label', null, 'Entrega'),
        h('input', { type: 'date', value: f.entrega, onChange: (e) => set('entrega', e.target.value) })),
      h('div', { className: 'field' },
        h('label', null, 'Prioridade (1 é a mais urgente)'),
        h('input', { type: 'number', min: 1, max: 9, value: f.prioridade,
          onChange: (e) => set('prioridade', e.target.value) }))),

    h('div', { className: 'grid2' },
      h('div', { className: 'field' },
        h('label', null, 'Observação'),
        h('input', { value: f.observacao, onChange: (e) => set('observacao', e.target.value) })),
      h('div', { className: 'field' },
        h('label', null, 'Amostra'),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          h('input', {
            type: 'checkbox', checked: f.amostra, style: { width: 'auto' },
            onChange: (e) => set('amostra', e.target.checked),
          }),
          h('span', { className: 'small muted' }, 'lote de aprovação do modelo')))),

    composicao ? h('div', { style: { marginTop: 14 } },
      h('h3', null, 'O que esta ordem vai consumir'),
      pequeno('Direto da composição do produto, multiplicada pela quantidade.', { marginTop: -6 }),
      composicao) : null,

    h('div', { className: 'modal-actions' },
      h('button', { className: 'btn ghost', onClick: onFechar }, 'Cancelar'),
      h('button', {
        className: 'btn accent', disabled: !pronto,
        onClick: () => onAbrir(f),
      }, 'Abrir ordem')));
}

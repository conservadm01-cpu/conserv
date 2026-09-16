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
} from './ordens-sistema.mjs';
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
    kpi('Ordens em aberto', inteiro(lista.total), 'abertas no módulo Produção'),
    kpi('Planejadas aqui', inteiro(lista.planejadas), 'com plano, reserva e MRP'),
    kpi('Sem plano', inteiro(lista.semPlano), 'o motor ainda não as viu', lista.semPlano > 0),
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
      lista.semPlano > 0 ? h('button', {
        className: 'btn accent',
        onClick: () => mexer((d) => planejarOrdensPendentes(d, usuario),
          (r) => `${r.feitas.length} ordem(ns) planejada(s): ${r.feitas.map((f) => f.codigo).join(', ')}.`
            + (r.falhas.length ? ` ${r.falhas.length} não entraram: ${r.falhas[0].erro}` : '')),
      }, `Planejar as ${lista.semPlano} ordens que faltam`) : null,
      h('button', {
        className: 'btn ghost', onClick: () => setTodas(!todas),
      }, todas ? 'Mostrar só as em aberto' : 'Mostrar também as fechadas')),

    bloco('Ordens de produção', null, [
      pequeno('A ordem é aberta no módulo Produção, na tela de sempre — com produto, versão da '
        + 'engenharia, cliente e entrega. Aqui ela ganha o que o motor industrial faz: o plano por '
        + 'setor, a reserva do material que existe, a requisição do que falta e o budget da ordem.',
      { marginTop: -6, maxWidth: 760, lineHeight: 1.6 }),
      linhas.length === 0
        ? vazio('Nenhuma ordem de produção em aberto. Abra uma no módulo Produção.')
        : tabela(['Ordem', 'Produto', ['Qtd', 'num'], 'Entrega', 'No sistema', 'No industrial',
          'Etapas', ['Custo planejado', 'num'], ''], linhas),
    ]),

    detalhePlano);
}

/**
 * MÓDULO INDUSTRIAL V3 — tela de integração (§30, §31, §41)
 *
 * Duas perguntas, uma tela:
 *
 *   1. A cadeia MATERIAL → ENGENHARIA → INDUSTRIAL está inteira? — o número
 *      não é decorativo: sai das provas contadas uma a uma, e cai quando um
 *      vínculo se quebra.
 *   2. Onde ela está partida? — o mapa mostra os quinze elos com quantos
 *      registros cada um tem, e leva para a aba onde o problema se conserta.
 *
 * E o botão que roda os trinta passos do fluxo completo sobre uma cópia da
 * base, sem encostar em nada de verdade.
 */

import { h, selo, pequeno, kpi, bloco, tabela, linha } from './interface.mjs';
import { num, arredondar } from './modelo.mjs';
import {
  indicadoresDeIntegracao, mapaDaCadeia,
  auditarIntegracaoMateriaisEngenhariaIndustrial, resolverMaterialIndustrial,
} from './integracao.mjs';
import { testarFluxoCompletoERPIndustrial } from './testes-v3.mjs';

const tomDaNota = (n) => (n >= 95 ? 'ok' : n >= 80 ? 'warn' : 'bad');
const corDaNota = (n) => (n >= 95 ? 'var(--ok)' : n >= 80 ? 'var(--warn)' : 'var(--bad)');

/** Barra de proporção: o percentual desenhado, para a nota não ser só texto. */
const barra = (percentual, cor) => h('div', {
  style: {
    height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden', minWidth: 90,
  },
}, h('div', {
  style: {
    width: `${Math.max(0, Math.min(100, num(percentual)))}%`, height: '100%',
    background: cor || 'var(--accent)',
  },
}));

export function TelaIntegracao({ db, usuario, setSub }) {
  const [fluxo, setFluxo] = React.useState(null);
  const [rodando, setRodando] = React.useState(false);

  const indicadores = indicadoresDeIntegracao(db);
  const auditoria = indicadores.auditoria;
  const mapa = mapaDaCadeia(db);
  const contagem = indicadores.contagem;
  const nota = num(indicadores.integracao);

  /* ------------------------------------------------- §30 dashboard */

  const cartoes = h('div', { className: 'kpis' },
    kpi('Saúde da engenharia industrial', `${nota}%`,
      `${indicadores.provas.filter((p) => p.percentual === 100).length} de `
      + `${indicadores.provas.length} provas inteiras`, nota < 95),
    kpi('Produtos prontos para produzir', `${contagem.produtosProntos}`,
      `${contagem.produtosPendentes} com engenharia incompleta`),
    kpi('Ordens em produção', `${contagem.ordensEmProducao}`,
      `${contagem.materiaisReservados} material(is) reservado(s)`),
    kpi('Erros de integração', `${contagem.errosIntegracao}`,
      `${contagem.alertasIntegracao} alerta(s)`, contagem.errosIntegracao > 0));

  const provas = bloco(`Como os ${nota}% são contados`, '§30', [
    pequeno('A nota não é opinião: cada prova conta quantos registros passam e quantos existem. '
      + 'Quebrar um vínculo derruba o número na hora.', { marginTop: -6 }),
    tabela(['Prova', ['Ok', 'num'], ['Total', 'num'], ['Pendentes', 'num'], '', ['%', 'num']],
      indicadores.provas.map((p) => linha(p.id, [
        p.nome,
        [p.ok, 'num'],
        [p.total, 'num'],
        [p.pendentes || '—', 'num'],
        [barra(p.percentual, corDaNota(p.percentual))],
        [`${p.percentual}%`, 'num', { color: corDaNota(p.percentual) }],
      ]))),
  ]);

  /* ------------------------------------------------ §31 mapa visual */

  const cartaoDoBloco = (b, i) => h('div', {
    key: b.id,
    className: 'panel',
    onClick: () => { if (b.aba && setSub) setSub(b.aba); },
    style: {
      padding: '10px 12px', margin: 0, cursor: b.aba ? 'pointer' : 'default',
      borderColor: b.problemas > 0 ? 'var(--bad)' : 'var(--line)',
      background: b.problemas > 0 ? 'var(--bad-bg)' : 'var(--panel)',
      minWidth: 150, flex: '1 1 150px',
    },
  },
  h('div', { className: 'small muted' }, `${i + 1}. ${b.nome}`),
  h('div', { style: { fontSize: 20, fontWeight: 600, margin: '2px 0' } }, arredondar(b.registros, 0)),
  h('div', { className: 'small muted' }, b.nota),
  b.problemas > 0
    ? h('div', { style: { marginTop: 6 } }, selo('bad', `${b.problemas} problema(s)`))
    : h('div', { style: { marginTop: 6 } }, selo('ok', 'ligado')));

  const mapaVisual = bloco('Mapa da cadeia', '§31', [
    pequeno('Do material comprado à camiseta entregue, e de volta. Cada elo mostra quantos registros '
      + 'tem hoje; o que estiver em vermelho tem problema de ligação. Clique para ir à aba onde ele '
      + 'se resolve.', { marginTop: -6 }),
    h('div', {
      style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    }, ...mapa.blocos.map(cartaoDoBloco)),
  ]);

  /* --------------------------------------- §27 o que está partido */

  const nivelTom = { erro: 'bad', alerta: 'warn', info: 'idle' };
  const achados = auditoria.erros.concat(auditoria.alertas);
  const listaAchados = bloco(
    `Ligações quebradas — ${auditoria.erros.length} erro(s) e ${auditoria.alertas.length} alerta(s)`,
    '§27', [
      pequeno('Item comprado sem material, unidade que não conversa com a do almoxarifado, dois '
        + 'cadastros para a mesma coisa, lote sem origem, consumo sem lote.', { marginTop: -6 }),
      achados.length === 0
        ? h('p', { className: 'small', style: { color: 'var(--ok)' } },
          '✓ a cadeia está inteira: material, engenharia e industrial falam por id')
        : tabela(['Nível', 'Tipo', 'O que foi encontrado'],
          achados.slice(0, 60).map((a, i) => linha(i, [
            selo(nivelTom[a.nivel] || 'idle', a.nivel),
            [String(a.tipo).replace(/_/g, ' '), 'small muted'],
            a.mensagem,
          ]))),
    ]);

  const sugestoes = (auditoria.sugestoes || []).length === 0 ? null
    : bloco('O que fazer primeiro', '§27', [
      h('ul', { className: 'small', style: { lineHeight: 1.7, paddingLeft: 18 } },
        ...auditoria.sugestoes.slice(0, 8).map((s, i) =>
          h('li', { key: i }, typeof s === 'string' ? s : s.texto || s.mensagem))),
    ]);

  const duplicados = (auditoria.duplicidades || []).length === 0 ? null
    : bloco('Cadastro em duplicidade', '§37', [
      pequeno('O mesmo material atendido por dois itens industriais: o estoque se divide e o MRP '
        + 'compra duas vezes.', { marginTop: -6 }),
      tabela(['Material', 'Itens que apontam para ele'],
        auditoria.duplicidades.map((d, i) => linha(i, [
          d.material || d.nome || '—',
          [(d.itens || []).map((x) => x.nome || x).join(' · '), 'small muted'],
        ]))),
    ]);

  /* ------------------------------------------- §41 fluxo completo */

  const resultadoFluxo = !fluxo ? null : bloco(
    `Fluxo completo — ${fluxo.ok}/${fluxo.total} passos · ${fluxo.falhas} falha(s)`, '§28', [
      pequeno(`Rodado em ${String(fluxo.quando).replace('T', ' ')} sobre uma cópia da base, com `
        + `${fluxo.quantidade} camisetas: cadastro, engenharia, MRP, compra, recebimento com lote, `
        + 'reserva, ordem, cinco processos, rastro, custo e auditoria.', { marginTop: -6 }),
      tabela([['#', 'num'], 'Passo', 'Situação', 'Prova'],
        fluxo.resultados.map((t) => linha(t.numero, [
          [t.numero, 'num'],
          t.nome,
          selo(t.situacao === 'ok' ? 'ok' : t.situacao === 'alerta' ? 'warn' : 'bad', t.situacao),
          [t.detalhe || '—', 'small muted'],
        ]))),
    ]);

  const pendentes = (indicadores.pendentes || []).length === 0 ? null
    : bloco('Produtos que ainda não podem virar ordem', '§30', [
      tabela(['Código', 'Produto', ''],
        indicadores.pendentes.map((p) => linha(p.id, [
          [p.codigo, 'small muted'],
          p.nome,
          h('button', {
            className: 'btn ghost sm', onClick: () => setSub && setSub('produtos'),
          }, 'Abrir cadastro'),
        ]))),
    ]);

  return h('div', null,
    cartoes,
    h('div', { className: 'row-actions', style: { marginBottom: 14 } },
      h('button', {
        className: 'btn accent', disabled: rodando,
        onClick: () => {
          setRodando(true);
          try { setFluxo(testarFluxoCompletoERPIndustrial(db, { usuario })); }
          catch (e) {
            setFluxo({ total: 0, ok: 0, falhas: 1, alertas: 0, quantidade: 0, quando: '',
              resultados: [{ numero: 0, nome: 'Fluxo completo', situacao: 'falha', detalhe: e.message }] });
          }
          setRodando(false);
        },
      }, rodando ? 'Rodando…' : 'Rodar o fluxo completo (30 passos)'),
      h('span', { className: 'small muted', style: { alignSelf: 'center' } },
        'roda sobre uma cópia — a sua base não é tocada')),
    resultadoFluxo,
    provas,
    mapaVisual,
    pendentes,
    listaAchados,
    duplicados,
    sugestoes);
}

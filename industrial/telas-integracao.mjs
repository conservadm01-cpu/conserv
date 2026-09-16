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

import {
  h, moeda, inteiro, decimal, dataBR, selo, vazio, pequeno, kpi, bloco, tabela, linha,
} from './interface.mjs';
import { num, arredondar } from './modelo.mjs';
import { rastrear, custoAcumulado } from './motores.mjs';
import {
  indicadoresDeIntegracao, mapaDaCadeia,
  auditarIntegracaoMateriaisEngenhariaIndustrial, resolverMaterialIndustrial,
} from './integracao.mjs';
import { testarFluxoCompletoERPIndustrial } from './testes-v3.mjs';
import { TelaAuditoria } from './telas-compras.mjs';
import { GrupoProdutosIndustriais } from './telas-produtos.mjs';

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

export function TelaIntegracao({ db, usuario, setSub, setVista }) {
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
            className: 'btn ghost sm', onClick: () => setVista && setVista('ficha'),
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


/* ====================================================== a aba Conferência

   Quatro perguntas de quem confere, num lugar só:

     Saúde           a cadeia está inteira?
     Rastreio        de onde veio esta peça, e para onde foi?
     Ficha industrial o que o motor entendeu da ficha do produto?
     Auditoria       o que está errado agora?

   São telas que já existiam em quatro abas do menu. Juntá-las não mudou
   nenhuma conta: mudou o número de lugares onde procurar.
*/

const VISTAS = [
  { id: 'saude', label: 'Saúde da cadeia' },
  { id: 'rastreio', label: 'Rastreio' },
  { id: 'ficha', label: 'Ficha industrial' },
  { id: 'auditoria', label: 'Auditoria e testes' },
];

/* ---------------------------------------------- §32 rastreio do lote */

function TelaRastreioConferencia({ db, ind, item, loteAberto, setLoteAberto }) {
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
        h('span', { className: 'small muted' }, ` · almoxarifado, sem lote · ${moeda(no.custoUnitario)}`));
    }
    /* V3 §26 — a ponta de cima: a nota fiscal do fornecedor, ou o saldo que
       já estava lá quando o módulo começou */
    if (no.tipo === 'compra') {
      return h('div', { key: chave, style: recuo },
        h('span', { className: 'small muted' }, '← '),
        h('span', { className: 'small' }, `comprado de ${no.fornecedor}`),
        h('span', { className: 'small muted' },
          ` · ${no.documento || 'sem documento'} · ${dataBR(no.data)} · ${moeda(no.custoUnitario)}`));
    }
    if (no.tipo === 'abertura') {
      return h('div', { key: chave, style: recuo },
        h('span', { className: 'small muted' }, '← '),
        h('span', { className: 'small' }, 'saldo de abertura do almoxarifado'),
        h('span', { className: 'small muted' }, ` · ${dataBR(no.data)} · ${moeda(no.custoUnitario)}`));
    }
    const filhos = (no.origens || []).map((o, i) => desenhar(o, nivel + 1, `${chave}-${i}`));
    return h('div', { key: chave, style: recuo },
      h('span', { className: 'small' }, h('strong', null, no.lote), ` · ${inteiro(no.quantidade)} ${no.item}`),
      no.departamento ? h('span', { className: 'small muted' }, ` · ${no.departamento} · ${dataBR(no.data)}`) : null,
      h('span', { className: 'small muted' }, ` · ${moeda(no.custoUnitario)}/un`),
      ...filhos);
  };

  /* V3 §13 — o lote do almoxarifado é do material, não de um item produzido:
     o nome vem do cadastro de materiais, e a origem diz se veio de nota
     fiscal, de produção ou do saldo de abertura. */
  const ORIGEM = { compra: ['ok', 'compra'], producao: ['idle', 'produção'], ajuste: ['warn', 'abertura'] };
  const nomeDoLote = (l) => (item(l.itemId) || {}).nome
    || ((db.materiais || []).find((m) => m.id === l.materialId) || {}).nome || '—';

  const tabelaLotes = tabela(
    ['Lote', 'Item', 'Origem', ['Quantidade', 'num'], ['Saldo', 'num'], ['Custo unitário', 'num'], 'Data', ''],
    lotes.map((l) => linha(l.id, [
      l.codigo,
      nomeDoLote(l),
      selo(...(ORIGEM[l.origem] || ['idle', l.origem || '—'])),
      [decimal(l.quantidade), 'num'],
      [l.origem === 'producao' ? '—' : decimal(l.saldo), 'num'],
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

export function TelaConferencia(contexto) {
  const [vista, setVista] = React.useState('saude');
  const { db, update, usuario } = contexto;

  const telas = {
    saude: () => h(TelaIntegracao, { ...contexto, setVista }),
    rastreio: () => h(TelaRastreioConferencia, contexto),
    ficha: () => h(GrupoProdutosIndustriais, {
      db, update, usuario, embutido: true,
      irPara: (aba) => (aba === 'ordens' ? contexto.setSub('ordens') : setVista('ficha')),
    }),
    auditoria: () => h(TelaAuditoria, contexto),
  };

  return h('div', null,
    h('div', { className: 'tabs-strip', style: { marginBottom: 16 } },
      ...VISTAS.map((v) => h('button', {
        key: v.id, className: vista === v.id ? 'active' : '',
        onClick: () => setVista(v.id),
      }, v.label))),
    (telas[vista] || telas.saude)());
}

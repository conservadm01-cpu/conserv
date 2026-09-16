/**
 * MÓDULO INDUSTRIAL V2 — telas de compras e de auditoria (§28, §33, §47)
 *
 * Compras deixa de ser um atalho: a falta que o MRP aponta vira requisição,
 * a requisição vira pedido, o pedido vira recebimento, e o recebido entra
 * reservado para a ordem que o pediu.
 */

import { prepararIndustrial, num, arredondar, STATUS_REQUISICAO } from './modelo.mjs';
import {
  painelCompras, gerarRequisicoes, aprovarRequisicao, cancelarRequisicao,
  criarPedidoCompra, receberPedido, cancelarPedido,
} from './compras.mjs';
import { auditarIndustrial, reconciliarEstoqueIndustrial } from './auditoria.mjs';
import { testarIndustrialV2 } from './testes-v2.mjs';
import {
  h, moeda, inteiro, decimal, dataBR, selo, vazio, pequeno, kpi, bloco, tabela, linha,
} from './interface.mjs';

const TOM_REQUISICAO = {
  pendente: 'idle', aprovada: 'info', cotando: 'info', pedida: 'warn',
  parcial: 'warn', recebida: 'ok', cancelada: 'idle',
};

/* ============================================================ §28 compras */

export function TelaCompras({ db, mexer, usuario }) {
  const [selecionadas, setSelecionadas] = React.useState([]);
  const painel = painelCompras(db);

  const alternar = (id) => setSelecionadas((atual) =>
    atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]);

  const cartoes = h('div', { className: 'kpis' },
    kpi('A requisitar', inteiro(painel.aRequisitar), 'requisições pendentes'),
    kpi('Em pedido', inteiro(painel.emPedido), 'pedidos abertos'),
    kpi('Valor requisitado', moeda(painel.valorRequisitado), 'o que falta comprar'),
    kpi('Em aberto no fornecedor', moeda(painel.valorEmPedido), 'pedido e ainda não recebido'),
    kpi('Atrasadas', inteiro(painel.atrasadas), 'passaram da data limite', painel.atrasadas > 0));

  const linhasRequisicao = painel.requisicoes.map((r) => {
    const acoes = h('div', { className: 'row-actions' },
      r.status === 'pendente' ? h('button', {
        className: 'btn ghost sm',
        onClick: () => mexer((d) => aprovarRequisicao(d, r.id, usuario), `${r.codigo} aprovada.`),
      }, 'Aprovar') : null,
      ['pendente', 'aprovada', 'cotando'].includes(r.status) ? h('button', {
        className: 'btn ghost sm',
        onClick: () => {
          const motivo = prompt(`Por que cancelar a requisição de ${r.material}?`);
          if (motivo) mexer((d) => cancelarRequisicao(d, r.id, motivo, usuario), `${r.codigo} cancelada.`);
        },
      }, 'Cancelar') : null);
    return linha(r.id, [
      ['aprovada', 'cotando'].includes(r.status)
        ? h('input', {
          type: 'checkbox', checked: selecionadas.includes(r.id), style: { width: 'auto' },
          onChange: () => alternar(r.id),
        })
        : h('span', { className: 'small muted' }, '—'),
      h('div', null, h('strong', null, r.material),
        h('div', { className: 'small muted' }, `${r.codigo} · ${r.fornecedorNome || 'sem fornecedor'}`)),
      [`${decimal(r.saldo)} ${r.unidade}`, 'num'],
      [decimal(r.disponivel), 'num'],
      [decimal(r.programado), 'num'],
      [r.dataLimite ? dataBR(r.dataLimite) : '—', 'num',
        r.atrasada ? { color: 'var(--bad)', fontWeight: 600 } : null],
      [moeda(r.valor), 'num'],
      selo(TOM_REQUISICAO[r.status] || 'idle', r.status),
      acoes,
    ]);
  });

  const linhasPedido = painel.pedidos.map((p) => linha(p.id, [
    h('div', null, h('strong', null, p.codigo),
      h('div', { className: 'small muted' }, p.fornecedor)),
    [`${p.itens.length} item(ns)`, 'small'],
    [moeda(p.valor), 'num'],
    [moeda(p.valorAberto), 'num'],
    dataBR(p.previsaoEntrega),
    dataBR(p.vencimento),
    selo(p.status === 'recebido' ? 'ok' : p.status === 'parcial' ? 'warn' : 'info', p.status),
    h('div', { className: 'row-actions' },
      p.status !== 'recebido' ? h('button', {
        className: 'btn sm',
        onClick: () => mexer((d) => receberPedido(d, { pedidoId: p.id, documento: p.codigo }, usuario),
          (r) => `${r.recebimento.codigo}: ${r.entradas.length} item(ns) no estoque.`),
      }, 'Receber tudo') : null,
      p.status === 'enviado' ? h('button', {
        className: 'btn ghost sm',
        onClick: () => {
          const motivo = prompt(`Por que cancelar o ${p.codigo}?`);
          if (motivo) mexer((d) => cancelarPedido(d, p.id, motivo, usuario), `${p.codigo} cancelado.`);
        },
      }, 'Cancelar') : null),
  ]));

  return h('div', null,
    cartoes,
    bloco('Requisições', '§7', [
      pequeno('A falta que o MRP aponta vira requisição. Aprovada, ela pode virar pedido — e o '
        + 'sistema agrupa por fornecedor, porque dois pedidos no mesmo dia é frete pago duas vezes.',
      { marginTop: -6 }),
      painel.requisicoes.length === 0
        ? vazio('Nenhuma requisição aberta. Abra uma ordem ou gere as requisições no Plano.')
        : tabela(['', 'Material', ['Falta', 'num'], ['Disponível', 'num'], ['Programado', 'num'],
          ['Comprar até', 'num'], ['Valor', 'num'], 'Situação', ''], linhasRequisicao),
      selecionadas.length ? h('div', { className: 'row-actions', style: { marginTop: 12 } },
        h('button', {
          className: 'btn accent',
          onClick: () => {
            const r = mexer((d) => criarPedidoCompra(d, { requisicaoIds: selecionadas }, usuario),
              (resp) => `${resp.pedidos.length} pedido(s): `
                + `${resp.pedidos.map((p) => `${p.codigo} · ${p.fornecedor}`).join(' · ')}.`);
            if (r && !r.erro) setSelecionadas([]);
          },
        }, `Gerar pedido com ${selecionadas.length} requisição(ões)`)) : null,
    ]),
    bloco('Pedidos de compra', '§7', [
      painel.pedidos.length === 0
        ? vazio('Nenhum pedido em aberto.')
        : tabela(['Pedido', 'Itens', ['Valor', 'num'], ['Em aberto', 'num'], 'Entrega',
          'Vencimento', 'Situação', ''], linhasPedido),
      pequeno('Receber lança a entrada no almoxarifado e, quando o pedido nasceu de uma ordem, '
        + 'o material já entra reservado para ela.'),
    ]));
}

/* ====================================================== §33/§47 auditoria */

export function TelaAuditoria({ db, mexer, usuario }) {
  const [bateria, setBateria] = React.useState(null);
  const [rodando, setRodando] = React.useState(false);
  const auditoria = auditarIndustrial(db, { registrar: false, usuario });
  const reconciliacao = reconciliarEstoqueIndustrial(db);

  const nivelTom = { erro: 'bad', alerta: 'warn', info: 'idle' };
  const lista = (achados) => achados.length === 0
    ? h('p', { className: 'small', style: { color: 'var(--ok)' } }, '✓ nada a apontar')
    : tabela(['Nível', 'Tipo', 'O que foi encontrado'],
      achados.map((a, i) => linha(i, [
        selo(nivelTom[a.nivel] || 'idle', a.nivel),
        [a.tipo.replace(/_/g, ' '), 'small muted'],
        a.mensagem,
      ])));

  const cartoes = h('div', { className: 'kpis' },
    kpi('Erros', inteiro(auditoria.erros.length), 'a conta está errada', auditoria.erros.length > 0),
    kpi('Alertas', inteiro(auditoria.alertas.length), 'vai dar problema'),
    kpi('Estoque', reconciliacao.conferido ? 'confere' : `${reconciliacao.divergencias.length} divergência(s)`,
      'saldo × extrato'),
    kpi('Testes', bateria ? `${bateria.ok}/${bateria.total}` : '—',
      bateria ? `${bateria.falhas} falha(s) · ${bateria.alertas} alerta(s)` : 'ainda não rodados'));

  const resultadoTestes = !bateria ? null : bloco(
    `Bateria V2 — ${bateria.ok} OK · ${bateria.falhas} falhas · ${bateria.alertas} alertas`, '§47', [
      pequeno(`Rodada em ${bateria.quando.replace('T', ' ')}, sobre uma cópia da base: nada do que `
        + 'ela cria sobrevive.', { marginTop: -6 }),
      tabela([['#', 'num'], 'Teste', 'Situação', 'Detalhe'],
        bateria.resultados.map((t) => linha(t.numero, [
          [t.numero, 'num'],
          t.nome,
          selo(t.situacao === 'ok' ? 'ok' : t.situacao === 'alerta' ? 'warn' : 'bad', t.situacao),
          [t.detalhe || '—', 'small muted'],
        ]))),
    ]);

  return h('div', null,
    cartoes,
    h('div', { className: 'row-actions', style: { marginBottom: 14 } },
      h('button', {
        className: 'btn accent', disabled: rodando,
        onClick: () => {
          setRodando(true);
          /* a bateria roda sobre uma cópia — não passa pelo update da base */
          try { setBateria(testarIndustrialV2(db, { usuario })); }
          catch (e) { setBateria({ total: 0, ok: 0, falhas: 1, alertas: 0, resultados: [
            { numero: 0, nome: 'Bateria', situacao: 'falha', detalhe: e.message }], quando: '' }); }
          setRodando(false);
        },
      }, rodando ? 'Rodando…' : 'Rodar os 20 testes (§47)'),
      h('button', {
        className: 'btn ghost',
        onClick: () => mexer((d) => { auditarIndustrial(d, { usuario }); return { ok: true }; },
          'Auditoria registrada no histórico.'),
      }, 'Registrar esta auditoria')),

    resultadoTestes,

    bloco('Erros', '§33', [
      pequeno('O que está quebrado agora: estrutura apontando para item que não existe, reserva '
        + 'maior que o estoque, lote sem origem, dependência circular.', { marginTop: -6 }),
      lista(auditoria.erros),
    ]),
    bloco('Alertas', '§33', [lista(auditoria.alertas)]),
    bloco('Reconciliação de estoque', '§34', [
      pequeno('O saldo tem de ser o acumulado do extrato — no almoxarifado e entre processos. '
        + 'A rotina mostra a diferença e não corrige nada sozinha.', { marginTop: -6 }),
      reconciliacao.conferido
        ? h('p', { className: 'small', style: { color: 'var(--ok)' } },
          '✓ todo saldo bate com o extrato de movimentos')
        : tabela(['Onde', 'Item', 'Local', ['Saldo', 'num'], ['Extrato', 'num'], ['Diferença', 'num']],
          reconciliacao.divergencias.map((d, i) => linha(i, [
            [d.onde, 'small muted'], d.item, [d.local, 'small muted'],
            [decimal(d.saldo), 'num'], [decimal(d.extrato), 'num'],
            [decimal(d.diferenca), 'num', { color: 'var(--bad)' }],
          ]))),
    ]),
    (db.industrial.auditorias || []).length ? bloco('Auditorias registradas', null, [
      tabela(['Quando', 'Quem', ['Erros', 'num'], ['Alertas', 'num']],
        (db.industrial.auditorias || []).slice().reverse().slice(0, 10).map((a) => linha(a.id, [
          a.quando.replace('T', ' '), [a.usuario || '—', 'small muted'],
          [inteiro(a.erros), 'num'], [inteiro(a.alertas), 'num'],
        ]))),
    ]) : null);
}

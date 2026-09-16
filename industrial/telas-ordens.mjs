/**
 * AMBIENTE — ORDENS DE PRODUÇÃO
 *
 * Abrir uma ordem aqui não cria uma linha: cria a cadeia inteira que a peça
 * percorre, cada etapa com a sua dependência. A tela mostra onde a ordem está,
 * o que trava a próxima etapa e quanto já custou contra o que foi planejado.
 */

import { prepararIndustrial, num, arredondar } from './modelo.mjs';
import {
  abrirOrdem, resumoDaOrdem, ordensDeProducao, cancelarOrdem, encerrarOrdem,
  conferirComponentes, materiaisDaOrdem, capacidadeDaOrdem,
} from './ordens.mjs';
import { conferirEngenharia } from './cadastro.mjs';
import { executarTransformacao } from './motores.mjs';
import { receberCompra } from './demonstracao.mjs';
import {
  h, moeda, inteiro, decimal, dataBR, selo, vazio, pequeno, kpi, bloco, tabela, linha,
  SELO, ModalExecucao, navegacao, irEComBilhete,
} from './interface.mjs';
import { montarDemonstracao } from './demonstracao.mjs';

export function GrupoOrdens({ db, update, usuario, irPara, embutido }) {
  const [erro, setErro] = React.useState('');
  const [aviso, setAviso] = React.useState('');
  const [nova, setNova] = React.useState(null);
  const [aberta, setAberta] = React.useState('');
  const [apontando, setApontando] = React.useState(null);

  /* bilhete de outro ambiente: abrir ordem deste produto, ou mostrar esta ordem */
  React.useEffect(() => {
    if (navegacao.produtoId) {
      setNova({ itemId: navegacao.produtoId, quantidade: 100 });
      navegacao.produtoId = '';
    }
    if (navegacao.ordemId) { setAberta(navegacao.ordemId); navegacao.ordemId = ''; }
  }, []);

  const ind = db.industrial || {};
  const item = (id) => (ind.itens || []).find((i) => i.id === id) || null;
  const lista = ordensDeProducao(db);
  const detalhe = aberta ? resumoDaOrdem(db, aberta) : null;

  const mexer = (fn, sucesso) => {
    setErro(''); setAviso('');
    let resposta = null;
    update((d) => { prepararIndustrial(d); resposta = fn(d); return d; });
    if (resposta && resposta.erro) setErro(resposta.erro);
    else if (sucesso) setAviso(typeof sucesso === 'function' ? sucesso(resposta) : sucesso);
    return resposta;
  };

  const recado = (texto, cor, fundo) => h('div', {
    className: 'panel', style: { borderColor: cor, background: fundo, marginBottom: 14 },
  }, h('strong', { className: 'small' }, texto));

  const produtos = (ind.itens || []).filter((i) => i.tipo === 'PRODUTO_ACABADO' && i.ativo !== false);

  const botaoNova = h('button', {
    className: 'btn accent', disabled: produtos.length === 0,
    onClick: () => setNova({ quantidade: 100 }),
  }, '+ Nova ordem');

  const cabeca = embutido
    ? h('div', { className: 'row-actions', style: { marginBottom: 14 } }, botaoNova)
    : h('div', { className: 'page-head' },
      h('div', null,
        h('p', { className: 'eyebrow' }, 'Chão de fábrica'),
        h('h2', null, 'Ordens de produção')),
      botaoNova);

  if (produtos.length === 0) {
    return h('div', null, cabeca,
      erro ? recado(erro, 'var(--bad)', 'var(--bad-bg)') : null,
      aviso ? recado(aviso, 'var(--ok)', 'var(--ok-bg)') : null,
      bloco('Nenhum produto pronto para produzir', null, [
        pequeno('A ordem de produção nasce de um produto com engenharia completa: estrutura, '
          + 'transformações e tempos. Cadastre o produto no ambiente Produtos — lá o sistema diz, '
          + 'item por item, o que ainda falta.'),
        h('div', { className: 'row-actions' },
          h('button', { className: 'btn accent', onClick: () => irEComBilhete(irPara, 'produtos') },
            'Ir para Produtos'),
          h('button', {
            className: 'btn ghost',
            onClick: () => mexer((d) => {
              try { montarDemonstracao(d); return { ok: true }; } catch (e) { return { erro: e.message }; }
            }, 'Demonstração carregada: a camiseta básica está pronta para produzir.'),
          }, 'Carregar demonstração')),
      ]));
  }

  const cartoes = h('div', { className: 'kpis' },
    kpi('Ordens abertas', inteiro(lista.abertas), `${lista.ordens.length} no total`),
    kpi('Peças em aberto', inteiro(lista.pecasAbertas), 'ainda por produzir', lista.pecasAbertas > 0),
    kpi('Atrasadas', inteiro(lista.atrasadas), 'passaram da entrega'),
    kpi('Custo planejado', moeda(lista.custoPlanejado), 'das ordens abertas'));

  const linhas = lista.ordens.map((o) => {
    const situacao = o.situacao === 'concluida' ? selo('ok', 'encerrada')
      : o.situacao === 'cancelada' ? selo('idle', 'cancelada')
        : o.atrasada ? selo('bad', 'atrasada')
          : o.acabadas > 0 ? selo('warn', 'em produção') : selo('idle', 'aberta');
    return linha(o.ordem.id, [
      h('div', null, h('strong', null, o.codigo),
        h('div', { className: 'small muted' },
          o.origem === 'ordem' ? 'aberta em Ordens' : 'carteira consolidada')),
      o.produto,
      [inteiro(o.quantidade), 'num'],
      [`${inteiro(o.acabadas)} · ${o.percentual}%`, 'num'],
      dataBR(o.entrega),
      [o.cliente || '—', 'small muted'],
      [moeda(o.custoPlanejado), 'num'],
      [o.custoReal > 0 ? moeda(o.custoReal) : '—', 'num'],
      situacao,
      h('button', { className: 'btn ghost sm', onClick: () => setAberta(o.ordem.id) }, 'Abrir'),
    ]);
  });

  return h('div', null,
    cabeca,
    erro ? recado(erro, 'var(--bad)', 'var(--bad-bg)') : null,
    aviso ? recado(aviso, 'var(--ok)', 'var(--ok-bg)') : null,
    cartoes,
    bloco('Ordens', '§34', [
      pequeno('Entra aqui tudo o que virou plano: a ordem aberta nesta tela e a carteira '
        + 'consolidada no ambiente Industrial — para a fábrica é a mesma coisa.', { marginTop: -6 }),
      lista.ordens.length === 0
        ? vazio('Nenhuma ordem aberta. Use "+ Nova ordem" para abrir a primeira, ou consolide a '
          + 'carteira no ambiente Industrial.')
        : tabela(['Ordem', 'Produto', ['Quantidade', 'num'], ['Produzido', 'num'], 'Entrega',
          'Cliente', ['Planejado', 'num'], ['Real', 'num'], 'Situação', ''], linhas),
    ]),

    nova ? h(ModalNovaOrdem, {
      db, ind, produtos, dados: nova,
      onFechar: () => setNova(null),
      onAbrir: (dados) => {
        const r = mexer((d) => abrirOrdem(d, dados, usuario), (resp) =>
          `${resp.ordem.codigoOrdem} aberta: ${inteiro(dados.quantidade)} peça(s) · `
          + `custo planejado ${moeda(resp.custoPlanejado)}.`);
        if (r && !r.erro) { setNova(null); setAberta(r.ordem.id); }
      },
    }) : null,

    detalhe && !detalhe.erro ? h(ModalOrdem, {
      db, ind, detalhe, item, usuario, mexer, irPara,
      onFechar: () => setAberta(''),
      onApontar: (etapa) => setApontando(
        (ind.demandas || []).find((d) => d.id === etapa.demandaId) || null),
    }) : null,

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

/* ------------------------------------------------------ nova ordem */

function ModalNovaOrdem({ db, ind, produtos, dados, onFechar, onAbrir }) {
  const [f, setF] = React.useState({
    itemId: dados.itemId || (produtos[0] || {}).id || '',
    quantidade: dados.quantidade || 100,
    clienteId: '',
    pedido: '',
    entrega: '',
    prioridade: 5,
    observacao: '',
  });
  const set = (campo, valor) => setF((p) => ({ ...p, [campo]: valor }));
  const conferencia = f.itemId ? conferirEngenharia(db, f.itemId) : { pronto: false, pendencias: [] };

  const situacao = conferencia.pronto
    ? h('p', { className: 'small', style: { color: 'var(--ok)' } },
      '✓ Engenharia completa — a ordem vai abrir a cadeia inteira de etapas.')
    : h('div', null,
      h('p', { className: 'small', style: { color: 'var(--bad)', marginBottom: 4 } },
        'A engenharia deste produto está incompleta:'),
      h('ul', { style: { margin: 0, paddingLeft: 18 } },
        ...conferencia.pendencias.slice(0, 5).map((p, i) =>
          h('li', { key: i, className: 'small' }, p))));

  return h(Modal, { title: 'Nova ordem de produção', onClose: onFechar, wide: true },
    pequeno('A ordem abre a cadeia inteira: uma etapa por processo, cada uma dependendo da '
      + 'anterior. A costura só é liberada quando a gola existir.'),
    h('div', { className: 'grid2' },
      h('div', { className: 'field' },
        h('label', null, 'Produto'),
        h('select', { value: f.itemId, onChange: (e) => set('itemId', e.target.value) },
          ...produtos.map((p) => h('option', { key: p.id, value: p.id }, `${p.codigo} · ${p.nome}`)))),
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
        h('label', null, 'Pedido'),
        h('input', { value: f.pedido, onChange: (e) => set('pedido', e.target.value) })),
      h('div', { className: 'field' },
        h('label', null, 'Entrega'),
        h('input', { type: 'date', value: f.entrega, onChange: (e) => set('entrega', e.target.value) }))),

    h('div', { className: 'grid2' },
      h('div', { className: 'field' },
        h('label', null, 'Prioridade (1 é a mais urgente)'),
        h('input', { type: 'number', min: 1, max: 9, value: f.prioridade,
          onChange: (e) => set('prioridade', e.target.value) })),
      h('div', { className: 'field' },
        h('label', null, 'Observação'),
        h('input', { value: f.observacao, onChange: (e) => set('observacao', e.target.value) }))),

    h('div', { className: 'modal-actions' },
      h('button', { className: 'btn ghost', onClick: onFechar }, 'Cancelar'),
      h('button', {
        className: 'btn accent', disabled: !conferencia.pronto,
        onClick: () => onAbrir(f),
      }, 'Abrir ordem')));
}

/* --------------------------------------------------- detalhe da ordem */

function ModalOrdem({ db, ind, detalhe, item, usuario, mexer, irPara, onFechar, onApontar }) {
  const mrp = materiaisDaOrdem(db, detalhe.ordem.id);
  const capacidade = capacidadeDaOrdem(db, detalhe.ordem.id);
  const encerrada = detalhe.situacao === 'concluida' || detalhe.situacao === 'cancelada';

  /* dentro do modal o cartão grande não cabe: aqui o resumo é uma faixa de
     rótulo e valor, que aguenta R$ 16.692,58 sem quebrar no meio */
  const dado = (rotulo, valor, apoio) => h('div', { key: rotulo, style: { minWidth: 120 } },
    h('div', { className: 'small muted', style: { fontFamily: 'var(--mono)', fontSize: 10,
      letterSpacing: '.08em', textTransform: 'uppercase' } }, rotulo),
    h('div', { style: { fontFamily: 'var(--display)', fontSize: 20, fontWeight: 600 } }, valor),
    apoio ? h('div', { className: 'small muted' }, apoio) : null);

  const cartoes = h('div', {
    style: { display: 'flex', gap: 22, flexWrap: 'wrap', padding: '14px 0',
      borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', marginBottom: 14 },
  },
    dado('Quantidade', inteiro(detalhe.quantidade), detalhe.cliente || 'para estoque'),
    dado('Produzido', `${inteiro(detalhe.acabadas)} · ${detalhe.percentual}%`,
      detalhe.acabadas > 0 ? 'em produção' : 'nada apontado'),
    dado('Planejado', moeda(detalhe.custoPlanejado), `${moeda(detalhe.custoPorPecaPlanejado)}/peça`),
    dado('Real', detalhe.custoReal > 0 ? moeda(detalhe.custoReal) : '—',
      detalhe.custoReal > 0 ? `desvio ${moeda(detalhe.desvio)}` : ''));

  const etapas = tabela(
    ['Etapa', ['Planejado', 'num'], ['Produzido', 'num'], ['Minutos', 'num'], 'Situação', ''],
    detalhe.etapas.map((e) => {
      const acao = encerrada ? null : h('div', { className: 'row-actions' },
        h('button', {
          className: 'btn ghost sm',
          onClick: () => {
            const r = mexer((d) => conferirComponentes(d, e.ordemId, usuario));
            if (r && r.liberada === false) mexer(() => ({ erro: r.alertas.map((a) => a.mensagem).join(' ') }));
            else if (r && r.liberada) mexer(() => ({}), `${e.codigo} liberada: componentes disponíveis.`);
          },
        }, 'Conferir'),
        e.status === 'atendida' ? null
          : h('button', { className: 'btn sm', onClick: () => onApontar(e) }, 'Apontar'));
      const esperando = e.faltas.find((f) => f.esperando);
      const situacao = e.status === 'atendida' ? selo('ok', 'atendida')
        : e.produzido > 0 ? selo('warn', 'parcial')
          : e.podeComecar ? selo('info', 'pode começar')
            : selo('idle', esperando ? `espera ${esperando.esperando.toLowerCase()}` : 'esperando');
      const identificacao = h('div', null,
        h('strong', null, e.departamento),
        h('div', { className: 'small muted' }, `${e.codigo} · ${e.item}`));
      return linha(e.demandaId, [
        identificacao,
        [inteiro(e.planejado), 'num'],
        [inteiro(e.produzido), 'num'],
        [`${inteiro(e.minutosPrevistos)}${e.minutosReais > 0 ? ` / ${inteiro(e.minutosReais)}` : ''}`, 'num'],
        situacao,
        acao,
      ]);
    }));

  /* falta de verdade é o que não existe; o resto é fila — a costura esperando
     o corte não é problema, é a ordem acontecendo */
  const faltas = detalhe.etapas
    .flatMap((e) => e.faltas.map((f) => ({ ...f, setor: e.departamento })))
    .filter((f) => !f.esperando);
  const blocoFaltas = faltas.length === 0 ? null : h('div', {
    className: 'panel', style: { background: 'var(--warn-bg)', borderColor: 'var(--warn)' },
  }, h('strong', { className: 'small' }, 'O que falta para produzir'),
     h('ul', { style: { margin: '6px 0 0', paddingLeft: 18 } },
       ...faltas.map((f, i) => h('li', { key: i, className: 'small' },
         `${f.setor}: faltam ${decimal(f.falta)} ${f.unidade} de ${f.nome}`))));

  const compras = mrp.erro || mrp.itensAComprar === 0 ? null : h('div', {
    className: 'panel', style: { background: '#fff' },
  }, h('h3', null, 'Material que falta comprar', h('span', { className: 'chip' }, '§25')),
     tabela(['Item', ['Necessário', 'num'], ['Disponível', 'num'], ['Comprar', 'num'], 'Fornecedor'],
       mrp.linhas.filter((l) => l.comprar > 0).map((l) => linha(l.itemId, [
         l.nome,
         [`${decimal(l.bruta)} ${l.unidade}`, 'num'],
         [decimal(l.disponivel), 'num'],
         [decimal(l.comprar), 'num'],
         [l.fornecedor || '—', 'small'],
       ]))),
     h('div', { className: 'row-actions', style: { marginTop: 10 } },
       h('button', {
         className: 'btn ghost sm',
         onClick: () => mexer((d) => {
           for (const l of mrp.linhas.filter((x) => x.comprar > 0)) {
             const r = receberCompra(d, l.materialId, l.comprar, { documento: detalhe.codigo, usuario });
             if (r && r.erro) return r;
           }
           return { ok: true };
         }, 'Recebimento lançado no almoxarifado.'),
       }, 'Receber o que falta'),
       h('span', { className: 'small muted', style: { alignSelf: 'center' } },
         'atalho da demonstração — sem módulo de compras')));

  const carga = capacidade.erro ? null : h('div', { className: 'panel', style: { background: '#fff' } },
    h('h3', null, 'Carga nos setores', h('span', { className: 'chip' }, '§27')),
    tabela(['Setor', ['Horas', 'num'], ['Disponível', 'num'], ['Ocupação', 'num'], 'Situação'],
      capacidade.linhas.map((l) => linha(l.departamentoId, [
        l.departamento,
        [decimal(l.horasNecessarias, 1), 'num'],
        [decimal(l.horasDisponiveis, 1), 'num'],
        [l.ocupacao === null ? '—' : `${l.ocupacao}%`, 'num'],
        selo(SELO[l.situacao] || 'idle', l.situacao === 'sem_equipe' ? 'sem equipe' : l.situacao),
      ]))));

  const acoes = encerrada
    ? [h('button', { key: 'fechar', className: 'btn', onClick: onFechar }, 'Fechar')]
    : [
      h('button', {
        key: 'cancelar', className: 'btn ghost',
        onClick: () => {
          const motivo = prompt('Por que esta ordem está sendo cancelada?');
          if (!motivo) return;
          const r = mexer((d) => cancelarOrdem(d, detalhe.ordem.id, motivo, usuario),
            `${detalhe.codigo} cancelada.`);
          if (r && !r.erro) onFechar();
        },
      }, 'Cancelar ordem'),
      h('button', {
        key: 'encerrar', className: 'btn',
        onClick: () => {
          const saldo = arredondar(detalhe.quantidade - detalhe.acabadas, 3);
          const motivo = saldo > 0
            ? prompt(`Faltam ${inteiro(saldo)} peça(s). Por que encerrar assim?`)
            : '';
          if (saldo > 0 && !motivo) return;
          const r = mexer((d) => encerrarOrdem(d, detalhe.ordem.id, { motivo }, usuario), (resp) =>
            `${detalhe.codigo} encerrada com ${inteiro(resp.acabadas)} peça(s)`
            + `${resp.saldo > 0 ? ` e saldo de ${inteiro(resp.saldo)}` : ''}.`);
          if (r && !r.erro) onFechar();
        },
      }, 'Encerrar ordem'),
      h('button', { key: 'fechar', className: 'btn accent', onClick: onFechar }, 'Fechar'),
    ];

  return h(Modal, {
    title: `${detalhe.codigo} · ${detalhe.produto}`, onClose: onFechar, wide: true,
  },
    h('p', { className: 'small muted' },
      `${detalhe.pedido ? `Pedido ${detalhe.pedido} · ` : ''}`
      + `${detalhe.cliente ? `${detalhe.cliente} · ` : ''}`
      + `entrega ${detalhe.entrega ? dataBR(detalhe.entrega) : 'sem data'}`
      + `${detalhe.atrasada ? ' · ATRASADA' : ''}`,
      detalhe.produtoId ? h('button', {
        className: 'btn ghost sm', style: { marginLeft: 10 },
        onClick: () => { onFechar(); irEComBilhete(irPara, 'produtos', { fichaId: detalhe.produtoId }); },
      }, 'Ver ficha do produto') : null),
    cartoes,
    blocoFaltas,
    h('div', { className: 'panel', style: { background: '#fff' } },
      h('h3', null, 'Etapas da ordem'),
      pequeno('Cada etapa é uma ordem de processo, na sequência da fábrica. Minutos: previsto / '
        + 'real. Conferir mostra o que falta; apontar registra o que saiu, com lote e custo '
        + 'acumulado.', { marginTop: -6 }),
      etapas),
    compras,
    carga,
    h('div', { className: 'modal-actions' }, ...acoes));
}

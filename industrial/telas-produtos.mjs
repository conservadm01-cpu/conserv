/**
 * AMBIENTE — CADASTRO DE PRODUTOS (sobre o módulo industrial)
 *
 * Onde o produto ganha engenharia: o item, o que ele leva dentro e como é
 * feito. Três listas e três formulários, e uma conferência que diz, em
 * português, o que ainda falta para a ordem poder abrir.
 *
 * A ficha do produto mostra a árvore: a camiseta é feita de frente estampada,
 * costas, mangas e gola preparada; a gola preparada vem da gola cortada; a
 * gola cortada vem da malha. Quem lê a ficha entende a fábrica.
 */

import {
  prepararIndustrial, TIPOS_ITEM, TIPOS_TEMPO, tempos, ehProduzido,
  num, arredondar, estruturaDe, transformacaoQueProduz,
} from './modelo.mjs';
import {
  salvarItem, salvarEstrutura, salvarTransformacao, inativarItem, inativarTransformacao,
  conferirEngenharia, custoPadrao, arvoreDoProduto, clonarProduto,
} from './cadastro.mjs';
import { resolverMaterialIndustrial } from './integracao.mjs';
import { produtosDaEngenharia, derivarProdutoDaEngenharia } from './engenharia.mjs';
import {
  h, moeda, inteiro, decimal, selo, vazio, pequeno, kpi, bloco, tabela, linha,
  navegacao, irEComBilhete,
} from './interface.mjs';
import { montarDemonstracao } from './demonstracao.mjs';

const TIPOS_COMPRADOS = TIPOS_ITEM.filter((t) => t.compra && !t.produz);
const TIPOS_PRODUZIDOS = TIPOS_ITEM.filter((t) => t.produz);

export function GrupoProdutosIndustriais({ db, update, usuario, irPara, embutido }) {
  const [sub, setSub] = React.useState('produtos');
  const [erro, setErro] = React.useState('');
  const [aviso, setAviso] = React.useState('');
  const [ficha, setFicha] = React.useState('');           // produto aberto
  const [formItem, setFormItem] = React.useState(null);   // item em edição
  const [formTrf, setFormTrf] = React.useState(null);     // transformação em edição
  const [formEstrutura, setFormEstrutura] = React.useState(null);
  const [lote, setLote] = React.useState(1000);

  /* bilhete deixado por outro ambiente: abrir a ficha deste produto */
  React.useEffect(() => {
    if (navegacao.fichaId) { setFicha(navegacao.fichaId); navegacao.fichaId = ''; }
  }, []);

  const ind = db.industrial || {};
  const itens = (ind.itens || []).filter((i) => i.ativo !== false);
  const produtos = itens.filter((i) => i.tipo === 'PRODUTO_ACABADO');
  const item = (id) => (ind.itens || []).find((i) => i.id === id) || null;
  const depNome = (id) => ((db.departamentos || []).find((d) => d.id === id) || {}).nome || '';

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

  const engenharia = produtosDaEngenharia(db);
  const abas = [
    { id: 'produtos', label: `Produtos (${produtos.length})` },
    /* a Engenharia é a origem: aqui se vê quantos produtos já cadastrados o
       industrial enxerga, e quantos ainda estão de fora */
    { id: 'engenharia', label: `Da Engenharia (${engenharia.derivados}/${engenharia.total})` },
    { id: 'itens', label: `Itens (${itens.length})` },
    { id: 'receitas', label: `Transformações (${(ind.transformacoes || []).filter((t) => t.ativa !== false).length})` },
  ];

  const contexto = { db, ind, itens, produtos, item, depNome, mexer, usuario,
    setFicha, setFormItem, setFormTrf, setFormEstrutura, lote, setLote, ficha, irPara,
    engenharia, setSub };

  /* Embutido no ambiente Industrial, o cabeçalho é o de lá: aqui sobram os
     botões de cadastro, que são o que esta tela oferece. */
  const acoes = h('div', { className: 'row-actions', style: { marginBottom: 14 } },
    h('button', { className: 'btn ghost', onClick: () => setFormItem({ tipo: 'MATERIA_PRIMA' }) }, '+ Item'),
    h('button', { className: 'btn ghost', onClick: () => setFormTrf({}) }, '+ Transformação'),
    h('button', {
      className: 'btn accent', onClick: () => setFormItem({ tipo: 'PRODUTO_ACABADO' }),
    }, '+ Produto'));

  return h('div', null,
    embutido ? acoes : h('div', { className: 'page-head' },
      h('div', null,
        h('p', { className: 'eyebrow' }, 'Engenharia industrial'),
        h('h2', null, 'Produtos')),
      acoes),

    h('div', { className: 'tabs-strip', style: { marginBottom: 16 } },
      ...abas.map((a) => h('button', {
        key: a.id, className: sub === a.id ? 'active' : '',
        onClick: () => { setSub(a.id); setErro(''); setAviso(''); },
      }, a.label))),
    erro ? recado(erro, 'var(--bad)', 'var(--bad-bg)') : null,
    aviso ? recado(aviso, 'var(--ok)', 'var(--ok-bg)') : null,

    sub === 'produtos' && listaProdutos(contexto),
    sub === 'engenharia' && listaEngenharia(contexto),
    sub === 'itens' && listaItens(contexto),
    sub === 'receitas' && listaReceitas(contexto),

    ficha ? fichaDoProduto(contexto) : null,

    formItem ? h(ModalItem, {
      db, ind, dados: formItem, usuario,
      onFechar: () => setFormItem(null),
      onSalvar: (dados) => {
        const r = mexer((d) => salvarItem(d, dados, usuario),
          (resp) => `${resp.item.codigo} ${resp.item.nome} salvo.`);
        if (r && !r.erro) setFormItem(null);
      },
    }) : null,

    formTrf ? h(ModalTransformacao, {
      db, ind, dados: formTrf, usuario, depNome,
      onFechar: () => setFormTrf(null),
      onSalvar: (dados) => {
        const r = mexer((d) => salvarTransformacao(d, dados, usuario),
          (resp) => `${resp.transformacao.codigo} ${resp.transformacao.nome} salva.`);
        if (r && !r.erro) setFormTrf(null);
      },
    }) : null,

    formEstrutura ? h(ModalEstrutura, {
      db, ind, itemId: formEstrutura, item, usuario,
      onFechar: () => setFormEstrutura(null),
      onSalvar: (componentes, motivo) => {
        const r = mexer((d) => salvarEstrutura(d, formEstrutura, componentes, { motivo }, usuario),
          (resp) => `Estrutura gravada na versão ${resp.estrutura.versao}.`);
        if (r && !r.erro) setFormEstrutura(null);
      },
    }) : null);
}

/* ------------------------------------------------------- listas */

function listaProdutos({ db, produtos, mexer, usuario, setFicha, setFormItem, irPara }) {
  if (produtos.length === 0) {
    return bloco('Nenhum produto cadastrado', null, [
      pequeno('Um produto industrial é o item que a carteira promete ao cliente. Ele nasce aqui, '
        + 'ganha estrutura (o que leva dentro) e transformações (como é feito) — e só então a ordem '
        + 'de produção pode abrir.'),
      h('div', { className: 'row-actions' },
        h('button', { className: 'btn accent', onClick: () => setFormItem({ tipo: 'PRODUTO_ACABADO' }) },
          '+ Cadastrar o primeiro produto'),
        h('button', {
          className: 'btn ghost',
          onClick: () => mexer((d) => {
            try { montarDemonstracao(d); return { ok: true }; } catch (e) { return { erro: e.message }; }
          }, 'Demonstração carregada: a camiseta básica, com estrutura e roteiro completos.'),
        }, 'Carregar a demonstração para ver um produto pronto')),
    ]);
  }

  const linhas = produtos.map((p) => {
    const conferencia = conferirEngenharia(db, p.id);
    const custo = conferencia.pronto ? custoPadrao(db, p.id, 1000) : null;
    const acao = h('div', { className: 'row-actions' },
      h('button', { className: 'btn ghost sm', onClick: () => setFicha(p.id) }, 'Ficha'),
      conferencia.pronto ? h('button', {
        className: 'btn sm',
        onClick: () => irEComBilhete(irPara, 'ordens', { produtoId: p.id }),
      }, 'Abrir ordem') : null,
      h('button', {
        className: 'btn ghost sm',
        onClick: () => {
          const nome = prompt(`Nome do novo produto, copiado de ${p.nome}:`, `${p.nome} (cópia)`);
          if (nome) mexer((d) => clonarProduto(d, p.id, nome, usuario), (r) => `${r.item.nome} criado.`);
        },
      }, 'Duplicar'));
    return linha(p.id, [
      [p.codigo, 'small muted'],
      p.nome,
      [custo && !custo.erro ? moeda(custo.porPeca) : '—', 'num'],
      [custo && !custo.erro ? decimal(custo.minutosPorPeca, 2) : '—', 'num'],
      selo(conferencia.pronto ? 'ok' : 'warn',
        conferencia.pronto ? 'pronto para produzir' : `${conferencia.pendencias.length} pendência(s)`),
      acao,
    ]);
  });

  return h('div', null,
    bloco('Produtos', '§4', [
      pequeno('O custo por peça sai da estrutura e do roteiro, para um lote de 1.000 — é o custo '
        + 'padrão, que a ordem depois compara com o realizado.', { marginTop: -6 }),
      tabela(['Código', 'Produto', ['Custo/peça', 'num'], ['Min/peça', 'num'], 'Engenharia', ''], linhas),
    ]));
}

/**
 * A ponte com a Engenharia: o produto já está cadastrado lá, com ficha
 * técnica e roteiro. Aqui ele é trazido — não redigitado.
 */
function listaEngenharia({ db, engenharia, mexer, usuario, setFicha, setSub }) {
  const SITUACAO = {
    fora: ['idle', 'fora do industrial'],
    em_dia: ['ok', 'em dia com a ficha'],
    divergente: ['warn', 'a ficha mudou'],
  };

  const linhas = engenharia.linhas.map((l) => linha(l.produtoId, [
    [l.codigo, 'small muted'],
    l.nome,
    [`${l.materiais} material(is)`, 'small muted'],
    [l.setores.join(' → ') || '—', 'small muted'],
    [decimal(l.minutosPorPeca), 'num'],
    selo(...(SITUACAO[l.situacao] || ['idle', l.situacao])),
    h('div', { className: 'row-actions' },
      l.pendencias.length
        ? h('span', { className: 'small', style: { color: 'var(--bad)' }, title: l.pendencias.join(' · ') },
          l.pendencias[0])
        : h('button', {
          className: l.derivado ? 'btn ghost sm' : 'btn sm',
          onClick: () => mexer(
            (d) => derivarProdutoDaEngenharia(d, l.produtoId, usuario),
            (r) => `${l.codigo} trazido: ${r.criados.itens.length} item(ns), `
              + `${r.criados.subprodutos.length} subproduto(s) e `
              + `${r.criados.transformacoes.length} transformação(ões) criados; `
              + `${r.reusados.itens.length} item(ns) reaproveitado(s).`),
        }, l.derivado ? 'Atualizar da ficha' : 'Trazer para o industrial'),
      l.itemId ? h('button', {
        className: 'btn ghost sm', onClick: () => { if (setSub) setSub('produtos'); setFicha(l.itemId); },
      }, 'Ver ficha industrial') : null),
  ]));

  const divergentes = engenharia.linhas.filter((l) => l.situacao === 'divergente');

  return h('div', null,
    h('div', { className: 'kpis' },
      kpi('Produtos na Engenharia', inteiro(engenharia.total), 'cadastrados no sistema'),
      kpi('Já no industrial', inteiro(engenharia.derivados), 'com estrutura e roteiro derivados'),
      kpi('Fora', inteiro(engenharia.fora), 'ainda não trazidos', engenharia.fora > 0),
      kpi('Ficha mudou', inteiro(engenharia.divergentes), 'precisam ser atualizados',
        engenharia.divergentes > 0)),

    engenharia.total > 0 && engenharia.derivados < engenharia.total ? h('div', {
      className: 'row-actions', style: { marginBottom: 14 },
    },
    h('button', {
      className: 'btn accent',
      onClick: () => mexer((d) => {
        const feitos = [];
        const falhas = [];
        for (const l of produtosDaEngenharia(d).linhas) {
          if (l.derivado || l.pendencias.length) continue;
          const r = derivarProdutoDaEngenharia(d, l.produtoId, usuario);
          if (r.erro) falhas.push(`${l.codigo}: ${r.erro}`);
          else feitos.push(l.codigo);
        }
        return { feitos, falhas, erro: feitos.length === 0 && falhas.length ? falhas[0] : '' };
      }, (r) => `${r.feitos.length} produto(s) trazido(s): ${r.feitos.join(', ')}.`
        + (r.falhas.length ? ` ${r.falhas.length} não vieram.` : '')),
    }, `Trazer os ${engenharia.fora} produtos que faltam`)) : null,

    bloco('Produtos cadastrados na Engenharia', null, [
      pequeno('A ficha técnica diz o que a peça leva e o roteiro diz por onde ela passa — os dois já '
        + 'existem. O industrial deriva daí a estrutura e uma transformação por setor, e completa só '
        + 'o que a ficha não sabe dizer: o ciclo de cada operação, os tipos de tempo e o coproduto. '
        + 'Um material da ficha nunca vira um item novo se já houver item apontando para ele.',
      { marginTop: -6, maxWidth: 780, lineHeight: 1.6 }),
      tabela(['Código', 'Produto', 'Ficha', 'Roteiro', ['Min/peça', 'num'], 'Vínculo', ''], linhas),
    ]),

    divergentes.length ? bloco('A ficha mudou depois de trazida', null, [
      pequeno('O que a Engenharia alterou e o industrial ainda não copiou. Atualizar refaz a '
        + 'derivação sem perder os tempos que você ajustou aqui.', { marginTop: -6 }),
      tabela(['Produto', 'Diferença'], divergentes.flatMap((l) =>
        l.divergencias.map((d, i) => linha(`${l.produtoId}-${i}`, [
          [i === 0 ? l.codigo : '', 'small muted'],
          [d, 'small'],
        ])))),
    ]) : null);
}

function listaItens({ db, ind, itens, depNome, mexer, usuario, setFormItem }) {
  const linhas = itens.map((i) => {
    /* V3 §4 — a tela lê o mesmo resolvedor do MRP: o preço que ela mostra é o
       preço com que a fábrica calcula. */
    const resolvido = resolverMaterialIndustrial(db, i.id);
    const material = resolvido.material;
    const trf = transformacaoQueProduz(db, i.id);
    return linha(i.id, [
      [i.codigo, 'small muted'],
      i.nome,
      [(TIPOS_ITEM.find((t) => t.id === i.tipo) || {}).nome || i.tipo, 'small'],
      [i.unidade, 'small muted'],
      [material ? `almoxarifado · ${moeda(resolvido.custo)}` : (trf ? trf.nome : '—'), 'small muted'],
      [i.materialId ? '' : depNome(i.departamentoId), 'small muted'],
      h('div', { className: 'row-actions' },
        h('button', { className: 'btn ghost sm', onClick: () => setFormItem(i) }, 'Editar'),
        h('button', {
          className: 'btn ghost sm',
          onClick: () => {
            const motivo = prompt(`Por que ${i.nome} sai do cadastro?`);
            if (motivo) mexer((d) => inativarItem(d, i.id, motivo, usuario), `${i.nome} inativado.`);
          },
        }, 'Inativar')),
    ]);
  });

  return bloco('Itens do módulo industrial', '§5', [
    pequeno('Matéria-prima, aviamento e embalagem apontam para o material do almoxarifado — preço e '
      + 'saldo continuam sendo os do cadastro. Subproduto e produto acabado nascem aqui, e precisam '
      + 'dizer em que setor são feitos.', { marginTop: -6 }),
    tabela(['Código', 'Item', 'Tipo', 'Unidade', 'Origem', 'Setor', ''], linhas),
  ]);
}

function listaReceitas({ db, ind, item, depNome, mexer, usuario, setFormTrf }) {
  const receitas = (ind.transformacoes || []).filter((t) => t.ativa !== false);
  if (receitas.length === 0) {
    return bloco('Nenhuma transformação cadastrada', null, [
      pequeno('A transformação é o que faz o corte entregar frente, costas, manga e gola em vez de '
        + '"dar baixa de tecido": ela diz o que entra, o que sai, em que setor e com que tempos.'),
      h('button', { className: 'btn accent', onClick: () => setFormTrf({}) }, '+ Primeira transformação'),
    ]);
  }

  const cartoes = receitas.map((t) => h('div', {
    key: t.id, style: { borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 },
  },
    h('div', { style: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' } },
      h('strong', null, t.nome), selo('info', depNome(t.departamentoId)),
      h('span', { className: 'small muted' }, t.codigo),
      h('div', { className: 'row-actions', style: { marginLeft: 'auto' } },
        h('button', { className: 'btn ghost sm', onClick: () => setFormTrf(t) }, 'Editar'),
        h('button', {
          className: 'btn ghost sm',
          onClick: () => {
            const motivo = prompt(`Por que "${t.nome}" sai de uso?`);
            if (motivo) mexer((d) => inativarTransformacao(d, t.id, motivo, usuario), `${t.nome} inativada.`);
          },
        }, 'Inativar'))),
    h('div', { className: 'small', style: { marginTop: 6, lineHeight: 1.7 } },
      h('strong', null, 'recebe: '),
      t.entradas.map((e) => `${decimal(e.quantidade)} ${(item(e.itemId) || {}).nome || '?'}`
        + `${num(e.perda) ? ` (+${e.perda}% perda)` : ''}`).join(' · ')),
    h('div', { className: 'small', style: { lineHeight: 1.7 } },
      h('strong', null, 'entrega: '),
      t.saidas.map((s) => `${decimal(s.quantidade)} ${(item(s.itemId) || {}).nome || '?'}`
        + `${s.principal ? ' (principal)' : ''}`).join(' · ')),
    h('div', { className: 'small muted', style: { marginTop: 4 } },
      t.operacoes.map((o) => `${o.nome} · ${o.porCiclo === 0 ? 'uma vez por ordem'
        : `ciclo de ${inteiro(o.porCiclo)}`} · ${decimal(
          TIPOS_TEMPO.reduce((s, x) => s + num((o.tempos || {})[x.id]), 0), 2)} min`).join('  |  '))));

  return bloco('Transformações', '§45', [
    pequeno('Cada receita pertence a um setor e tem as suas operações. Tempo por ciclo: o enfesto '
      + 'rende 500 peças de uma vez; a costureira faz uma por vez (ciclo 1); gravar a tela acontece '
      + 'uma vez por ordem (ciclo 0).', { marginTop: -6 }),
    ...cartoes,
  ]);
}

/* -------------------------------------------------- ficha do produto */

function fichaDoProduto({ db, ind, item, ficha, setFicha, setFormEstrutura, setFormTrf, lote, setLote, irPara }) {
  const produto = item(ficha);
  if (!produto) return null;
  const conferencia = conferirEngenharia(db, produto.id);
  const custo = custoPadrao(db, produto.id, num(lote) || 1000);
  const arvore = arvoreDoProduto(db, produto.id, 1);
  const estrutura = estruturaDe(db, produto.id);

  const desenharArvore = (no, chave) => {
    if (!no) return null;
    const filhos = (no.filhos || []).map((f, i) => desenharArvore(f, `${chave}-${i}`));
    return h('div', { key: chave, style: { paddingLeft: no.nivel * 20, lineHeight: 1.9 } },
      h('span', { className: 'small' },
        h('strong', null, `${decimal(no.quantidade, 4)} ${no.unidade}`), ` ${no.nome}`),
      h('span', { className: 'small muted' },
        ` · ${no.tipoNome}${no.setor ? ` · ${no.setor}` : ''}`
        + `${no.perda ? ` · +${no.perda}% perda` : ''}`),
      ...filhos);
  };

  const pendencias = conferencia.pronto
    ? h('p', { className: 'small', style: { color: 'var(--ok)' } },
      '✓ Engenharia completa: a ordem de produção pode abrir.')
    : h('ul', { style: { margin: '6px 0 0', paddingLeft: 18 } },
      ...conferencia.pendencias.map((p, i) => h('li', { key: i, className: 'small' }, p)));

  return h(Modal, { title: `${produto.codigo} · ${produto.nome}`, onClose: () => setFicha(''), wide: true },
    h('div', { className: 'kpis', style: { marginBottom: 14 } },
      kpi('Custo por peça', custo.erro ? '—' : moeda(custo.porPeca), `lote de ${inteiro(lote)}`, true),
      kpi('Material', custo.erro ? '—' : moeda(custo.material / (num(lote) || 1)), 'por peça'),
      kpi('Processo', custo.erro ? '—' : moeda(custo.processo / (num(lote) || 1)), 'por peça'),
      kpi('Tempo', custo.erro ? '—' : `${decimal(custo.minutosPorPeca, 2)} min`, 'por peça')),

    h('div', { className: 'field' },
      h('label', null, 'Lote para a conta do custo'),
      h('input', { type: 'number', value: lote, min: 1, onChange: (e) => setLote(e.target.value) })),

    h('div', { className: 'panel', style: { background: '#fff' } },
      h('h3', null, 'Árvore do produto'),
      pequeno('Cada nível mostra o consumo para uma peça do produto acabado.', { marginTop: -6 }),
      desenharArvore(arvore, 'raiz')),

    h('div', { className: 'panel', style: { background: '#fff' } },
      h('h3', null, 'Engenharia'),
      pendencias,
      h('div', { className: 'row-actions', style: { marginTop: 12 } },
        conferencia.pronto ? h('button', {
          className: 'btn sm',
          onClick: () => { setFicha(''); irEComBilhete(irPara, 'ordens', { produtoId: produto.id }); },
        }, 'Abrir ordem de produção') : null,
        h('button', { className: 'btn ghost sm', onClick: () => setFormEstrutura(produto.id) },
          estrutura ? `Editar estrutura (versão ${estrutura.versao})` : 'Cadastrar estrutura'),
        h('button', {
          className: 'btn ghost sm',
          /* a estrutura já disse o que a peça leva: a transformação nasce com
             essas entradas prontas, o setor do produto e uma operação em
             branco — só faltam os tempos, que é o que ninguém pode adivinhar */
          onClick: () => setFormTrf(transformacaoQueProduz(db, produto.id)
            || {
              nome: `${produto.nome} — montagem`,
              departamentoId: produto.departamentoId || '',
              entradas: (estrutura ? estrutura.componentes : []).map((c) => ({
                itemId: c.itemId, quantidade: num(c.quantidade), perda: num(c.perda),
              })),
              saidas: [{ itemId: produto.id, quantidade: 1, principal: true }],
              operacoes: [{ nome: 'Montagem', porCiclo: 1, pessoas: 1, tempos: {} }],
            }),
        }, transformacaoQueProduz(db, produto.id) ? 'Editar transformação final' : 'Criar transformação final'))),

    custo.erro ? null : h('div', { className: 'panel', style: { background: '#fff' } },
      h('h3', null, `Custo padrão · lote de ${inteiro(lote)}`),
      tabela(['Processo', ['Minutos', 'num'], ['Custo', 'num'], ['Por peça', 'num']],
        custo.processos.map((p) => linha(p.transformacaoId, [
          `${p.departamento} — ${p.nome}`,
          [inteiro(p.minutos), 'num'],
          [moeda(p.total), 'num'],
          [moeda(p.total / (num(lote) || 1)), 'num'],
        ]))),
      h('div', { style: { marginTop: 12 } },
        tabela(['Material', ['Quantidade', 'num'], ['Custo', 'num'], ['Por peça', 'num']],
          custo.materiais.map((m) => linha(m.itemId, [
            m.nome,
            [`${decimal(m.quantidade)} ${m.unidade}`, 'num'],
            [moeda(m.valor), 'num'],
            [moeda(m.valor / (num(lote) || 1)), 'num'],
          ]))))),

    h('div', { className: 'modal-actions' },
      h('button', { className: 'btn', onClick: () => setFicha('') }, 'Fechar')));
}

/* ------------------------------------------------------ formulários */

function ModalItem({ db, ind, dados, usuario, onFechar, onSalvar }) {
  const [f, setF] = React.useState({
    id: dados.id || '',
    nome: dados.nome || '',
    tipo: dados.tipo || 'MATERIA_PRIMA',
    materialId: dados.materialId || '',
    departamentoId: dados.departamentoId || '',
    unidade: dados.unidade || 'UN',
    perdaPadrao: dados.perdaPadrao || 0,
    custoPadrao: dados.custoPadrao || 0,
    descricao: dados.descricao || '',
    motivo: '',
  });
  const set = (campo, valor) => setF((p) => ({ ...p, [campo]: valor }));
  const produzido = ehProduzido({ tipo: f.tipo });

  /* ao escolher o material, o item herda unidade e custo do almoxarifado */
  const escolherMaterial = (id) => {
    const material = (db.materiais || []).find((m) => m.id === id);
    setF((p) => ({ ...p, materialId: id,
      nome: p.nome || (material ? material.nome : ''),
      unidade: material ? material.unidadeEstoque : p.unidade,
      custoPadrao: material ? material.custoMedio : p.custoPadrao }));
  };

  return h(Modal, { title: f.id ? `Editar ${f.nome}` : 'Novo item', onClose: onFechar, wide: true },
    h('div', { className: 'field' },
      h('label', null, 'Tipo'),
      h('select', { value: f.tipo, onChange: (e) => set('tipo', e.target.value) },
        h('optgroup', { label: 'Comprado' },
          ...TIPOS_COMPRADOS.map((t) => h('option', { key: t.id, value: t.id }, `${t.nome} — ${t.ajuda}`))),
        h('optgroup', { label: 'Produzido' },
          ...TIPOS_PRODUZIDOS.map((t) => h('option', { key: t.id, value: t.id }, `${t.nome} — ${t.ajuda}`))))),

    produzido ? null : h('div', { className: 'field' },
      h('label', null, 'Material do almoxarifado'),
      h('select', { value: f.materialId, onChange: (e) => escolherMaterial(e.target.value) },
        h('option', { value: '' }, 'escolha o material…'),
        ...(db.materiais || []).filter((m) => m.ativo !== false).map((m) =>
          h('option', { key: m.id, value: m.id }, `${m.codigo} · ${m.nome} (${m.unidadeEstoque})`))),
      pequeno('Preço, saldo e fornecedor continuam sendo os do cadastro de materiais.')),

    h('div', { className: 'grid2' },
      h('div', { className: 'field' },
        h('label', null, 'Nome'),
        h('input', { value: f.nome, onChange: (e) => set('nome', e.target.value) })),
      h('div', { className: 'field' },
        h('label', null, 'Unidade'),
        h('input', { value: f.unidade, onChange: (e) => set('unidade', e.target.value.toUpperCase()) }))),

    produzido ? h('div', { className: 'field' },
      h('label', null, 'Setor onde nasce'),
      h('select', { value: f.departamentoId, onChange: (e) => set('departamentoId', e.target.value) },
        h('option', { value: '' }, 'escolha o setor…'),
        ...(db.departamentos || []).map((d) => h('option', { key: d.id, value: d.id }, d.nome)))) : null,

    h('div', { className: 'grid2' },
      h('div', { className: 'field' },
        h('label', null, 'Perda padrão (%)'),
        h('input', { type: 'number', value: f.perdaPadrao, min: 0,
          onChange: (e) => set('perdaPadrao', e.target.value) })),
      produzido ? null : h('div', { className: 'field' },
        h('label', null, 'Custo padrão'),
        h('input', { type: 'number', value: f.custoPadrao, min: 0,
          onChange: (e) => set('custoPadrao', e.target.value) }))),

    f.id ? h('div', { className: 'field' },
      h('label', null, 'Motivo da alteração'),
      h('input', { value: f.motivo, onChange: (e) => set('motivo', e.target.value),
        placeholder: 'fica no histórico' })) : null,

    h('div', { className: 'modal-actions' },
      h('button', { className: 'btn ghost', onClick: onFechar }, 'Cancelar'),
      h('button', { className: 'btn accent', onClick: () => onSalvar(f) }, 'Salvar item')));
}

function ModalEstrutura({ db, ind, itemId, item, onFechar, onSalvar }) {
  const atual = estruturaDe(db, itemId);
  const [componentes, setComponentes] = React.useState(
    (atual ? atual.componentes : []).map((c) => ({ ...c })));
  const [motivo, setMotivo] = React.useState('');

  const trocar = (i, campo, valor) => setComponentes((lista) =>
    lista.map((c, k) => (k === i ? { ...c, [campo]: valor } : c)));
  const remover = (i) => setComponentes((lista) => lista.filter((_, k) => k !== i));
  const adicionar = () => setComponentes((lista) => [...lista, { itemId: '', quantidade: 1, perda: 0 }]);

  const opcoes = (ind.itens || []).filter((i) => i.ativo !== false && i.id !== itemId);

  return h(Modal, {
    title: `Estrutura de ${(item(itemId) || {}).nome || ''}`, onClose: onFechar, wide: true,
  },
    pequeno('O que a peça leva dentro. Cada gravação cria uma versão nova — a anterior continua '
      + 'no histórico, porque o custo de ontem foi feito com ela.'),
    ...componentes.map((c, i) => h('div', { key: i, className: 'grid3', style: { alignItems: 'end' } },
      h('div', { className: 'field' },
        h('label', null, 'Componente'),
        h('select', { value: c.itemId, onChange: (e) => trocar(i, 'itemId', e.target.value) },
          h('option', { value: '' }, 'escolha…'),
          ...opcoes.map((o) => h('option', { key: o.id, value: o.id }, `${o.nome} (${o.unidade})`)))),
      h('div', { className: 'field' },
        h('label', null, 'Consumo por peça'),
        h('input', { type: 'number', step: '0.0001', value: c.quantidade,
          onChange: (e) => trocar(i, 'quantidade', e.target.value) })),
      h('div', { className: 'field' },
        h('label', null, 'Perda (%)'),
        h('div', { style: { display: 'flex', gap: 6 } },
          h('input', { type: 'number', value: c.perda || 0,
            onChange: (e) => trocar(i, 'perda', e.target.value) }),
          h('button', { className: 'btn ghost sm', onClick: () => remover(i) }, '×'))))),
    h('button', { className: 'btn ghost sm', onClick: adicionar }, '+ Componente'),
    h('div', { className: 'field', style: { marginTop: 12 } },
      h('label', null, 'O que mudou'),
      h('input', { value: motivo, onChange: (e) => setMotivo(e.target.value),
        placeholder: 'ex.: elástico mais curto' })),
    h('div', { className: 'modal-actions' },
      h('button', { className: 'btn ghost', onClick: onFechar }, 'Cancelar'),
      h('button', { className: 'btn accent', onClick: () => onSalvar(componentes, motivo) },
        'Gravar estrutura')));
}

function ModalTransformacao({ db, ind, dados, depNome, onFechar, onSalvar }) {
  const [f, setF] = React.useState({
    id: dados.id || '',
    nome: dados.nome || '',
    departamentoId: dados.departamentoId || '',
    tipo: dados.tipo || 'transformacao',
    lotePadrao: dados.lotePadrao || 1,
    motivo: '',
  });
  const [entradas, setEntradas] = React.useState(
    (dados.entradas || []).map((e) => ({ ...e })) || []);
  const [saidas, setSaidas] = React.useState(
    (dados.saidas || []).map((s) => ({ ...s })) || []);
  const [operacoes, setOperacoes] = React.useState(
    (dados.operacoes || []).map((o) => ({ ...o, tempos: tempos(o.tempos) })));

  const set = (campo, valor) => setF((p) => ({ ...p, [campo]: valor }));
  const itens = (ind.itens || []).filter((i) => i.ativo !== false);
  const etapas = (db.etapas || []).filter((e) => e.departamentoId === f.departamentoId);

  const trocarLinha = (lista, set_, i, campo, valor) =>
    set_(lista.map((x, k) => (k === i ? { ...x, [campo]: valor } : x)));

  const linhaItem = (lista, set_, i, x, comPerda, comPrincipal) => h('div', {
    key: i, className: 'grid3', style: { alignItems: 'end' },
  },
    h('div', { className: 'field' },
      h('label', null, 'Item'),
      h('select', { value: x.itemId, onChange: (e) => trocarLinha(lista, set_, i, 'itemId', e.target.value) },
        h('option', { value: '' }, 'escolha…'),
        ...itens.map((o) => h('option', { key: o.id, value: o.id }, `${o.nome} (${o.unidade})`)))),
    h('div', { className: 'field' },
      h('label', null, comPrincipal ? 'Sai por rodada' : 'Consome por rodada'),
      h('input', { type: 'number', step: '0.0001', value: x.quantidade,
        onChange: (e) => trocarLinha(lista, set_, i, 'quantidade', e.target.value) })),
    h('div', { className: 'field' },
      h('label', null, comPerda ? 'Perda (%)' : 'Principal'),
      h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
        comPerda
          ? h('input', { type: 'number', value: x.perda || 0,
            onChange: (e) => trocarLinha(lista, set_, i, 'perda', e.target.value) })
          : h('input', { type: 'checkbox', checked: !!x.principal, style: { width: 'auto' },
            onChange: (e) => set_(lista.map((y, k) => ({ ...y, principal: k === i && e.target.checked }))) }),
        h('button', { className: 'btn ghost sm', onClick: () => set_(lista.filter((_, k) => k !== i)) }, '×'))));

  const linhaOperacao = (o, i) => h('div', {
    key: i, className: 'panel', style: { background: '#fff', marginBottom: 10 },
  },
    h('div', { className: 'grid3' },
      h('div', { className: 'field' },
        h('label', null, 'Operação'),
        h('input', { value: o.nome || '',
          onChange: (e) => trocarLinha(operacoes, setOperacoes, i, 'nome', e.target.value) })),
      h('div', { className: 'field' },
        h('label', null, 'Etapa do setor'),
        h('select', { value: o.etapaId || '',
          onChange: (e) => trocarLinha(operacoes, setOperacoes, i, 'etapaId', e.target.value) },
          h('option', { value: '' }, '—'),
          ...etapas.map((e) => h('option', { key: e.id, value: e.id }, e.nome)))),
      h('div', { className: 'field' },
        h('label', null, 'Peças por ciclo (0 = uma vez por ordem)'),
        h('input', { type: 'number', value: o.porCiclo === 0 ? 0 : (o.porCiclo || 1), min: 0,
          onChange: (e) => trocarLinha(operacoes, setOperacoes, i, 'porCiclo', e.target.value) }))),
    h('div', { className: 'grid3' },
      ...TIPOS_TEMPO.map((t) => h('div', { key: t.id, className: 'field' },
        h('label', null, `${t.nome} (min)`),
        h('input', {
          type: 'number', step: '0.01', value: (o.tempos || {})[t.id] || 0, min: 0,
          title: t.ajuda,
          onChange: (e) => trocarLinha(operacoes, setOperacoes, i, 'tempos',
            { ...tempos(o.tempos), [t.id]: e.target.value }),
        })))),
    h('div', { className: 'row-actions' },
      h('button', { className: 'btn ghost sm', onClick: () => setOperacoes(operacoes.filter((_, k) => k !== i)) },
        'Remover operação')));

  return h(Modal, {
    title: f.id ? `Editar ${f.nome}` : 'Nova transformação', onClose: onFechar, wide: true,
  },
    pequeno('Uma transformação recebe itens, executa operações num setor e entrega outros itens. '
      + 'O corte recebe malha e entrega frente, costas, manga e gola — quatro saídas de uma rodada só.'),
    h('div', { className: 'grid2' },
      h('div', { className: 'field' },
        h('label', null, 'Nome'),
        h('input', { value: f.nome, onChange: (e) => set('nome', e.target.value),
          placeholder: 'ex.: Corte da camiseta' })),
      h('div', { className: 'field' },
        h('label', null, 'Setor'),
        h('select', { value: f.departamentoId, onChange: (e) => set('departamentoId', e.target.value) },
          h('option', { value: '' }, 'escolha o setor…'),
          ...(db.departamentos || []).map((d) => h('option', { key: d.id, value: d.id }, d.nome))))),

    h('h3', { style: { marginTop: 10 } }, 'Recebe'),
    ...entradas.map((x, i) => linhaItem(entradas, setEntradas, i, x, true, false)),
    h('button', { className: 'btn ghost sm', onClick: () => setEntradas([...entradas, { itemId: '', quantidade: 1, perda: 0 }]) },
      '+ Entrada'),

    h('h3', { style: { marginTop: 16 } }, 'Entrega'),
    ...saidas.map((x, i) => linhaItem(saidas, setSaidas, i, x, false, true)),
    h('button', { className: 'btn ghost sm', onClick: () => setSaidas([...saidas, { itemId: '', quantidade: 1, principal: saidas.length === 0 }]) },
      '+ Saída'),

    h('h3', { style: { marginTop: 16 } }, 'Operações e tempos'),
    pequeno('Tempo por ciclo: o enfesto rende 500 peças de uma vez, a costureira faz uma por vez '
      + '(ciclo 1), gravar a tela acontece uma vez por ordem (ciclo 0).'),
    ...operacoes.map(linhaOperacao),
    h('button', {
      className: 'btn ghost sm',
      onClick: () => setOperacoes([...operacoes, { nome: '', porCiclo: 1, pessoas: 1, tempos: tempos({}) }]),
    }, '+ Operação'),

    f.id ? h('div', { className: 'field', style: { marginTop: 12 } },
      h('label', null, 'O que mudou'),
      h('input', { value: f.motivo, onChange: (e) => set('motivo', e.target.value) })) : null,

    h('div', { className: 'modal-actions' },
      h('button', { className: 'btn ghost', onClick: onFechar }, 'Cancelar'),
      h('button', {
        className: 'btn accent',
        onClick: () => onSalvar({ ...f, entradas, saidas, operacoes }),
      }, 'Salvar transformação')));
}

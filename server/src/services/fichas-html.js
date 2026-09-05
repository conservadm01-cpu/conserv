/**
 * Impressão das fichas de produção.
 *
 * O documento sai pronto do servidor, em HTML de uma página só, com o CSS de
 * impressão embutido: quem abre manda para a impressora (ou "salvar em PDF") e
 * recebe exatamente o dossiê que a fábrica já usa em papel. Não há dependência
 * de biblioteca de PDF — o navegador é o motor de impressão, e o mesmo arquivo
 * serve para conferir na tela antes de gastar papel.
 *
 * O layout reproduz o dossiê da Conserv: capa da ordem de produção, ficha de
 * preparação e uma via por setor (corte, silk, modelagem, costura, embalagem),
 * cada uma com a sua cor, o seu material, a sua sequência operacional e o seu
 * campo de assinatura.
 */
import { TAMANHOS } from './fichas.js';

/** Cor de cada via — é assim que o chão de fábrica separa as folhas na mesa. */
const CORES = {
  PRODUCAO: '#29abe2',
  PREPARACAO: '#5a5a5a',
  CORTE: '#e8820c',
  SILK: '#e01b24',
  MODELAGEM: '#7b5ea7',
  COSTURA: '#1f6fb2',
  EMBALAGEM: '#0e9f6e',
};

const ROTULO_ETAPA = {
  MATERIA_PRIMA: 'Matéria-prima',
  CORTE: 'Corte',
  SILK: 'Silk',
  COSTURA: 'Costura',
  EMBALAGEM: 'Embalagem',
  NF: 'Nota fiscal',
  ENTREGA: 'Entrega',
};

const escapar = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Só entram imagens embutidas (data URI) ou servidas por HTTPS.
 * A ficha é montada com conteúdo cadastrado por usuário: uma URL arbitrária no
 * atributo src seria um vetor de injeção, e uma imagem que não carrega na
 * impressora é uma via inútil.
 */
const imagemSegura = (src) => /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(src || '')
  || /^https:\/\/[^\s"'<>]+$/i.test(src || '');

const dataBR = (iso) => {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : String(iso);
};

const moeda = (v) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const numero = (v, casas = 2) =>
  v === null || v === undefined || v === ''
    ? ''
    : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Marca de conferência: OK quando a etapa fechou, vazio quando ainda não. */
const marca = (status) => (status === 'CONCLUIDA' ? 'OK' : status === 'EM_ANDAMENTO' ? '…' : '');

function tabelaGrade(ficha, cor) {
  const colunas = TAMANHOS.map((t) => `<th>${t}</th>`).join('');
  const valores = ficha.grade
    .map((g) => `<td class="c grande">${g.quantidade ? numero(g.quantidade, 0) : ''}</td>`)
    .join('');
  return `
  <table class="grade">
    <colgroup>
      <col style="width:24%" />${TAMANHOS.map(() => '<col style="width:8%" />').join('')}<col style="width:12%" />
    </colgroup>
    <tr class="faixa" style="--cor:${cor}">
      <th class="esq">Descrição</th>${colunas}<th>Total</th>
    </tr>
    <tr>
      <td class="produto">${escapar(ficha.produto.descricao)}</td>
      ${valores}
      <td class="c grande">${numero(ficha.total_grade, 0)}</td>
    </tr>
  </table>`;
}

/** Material da via de setor: o que aquele setor consome, com a sua observação. */
function tabelaMateriais(materiais, cor) {
  if (!materiais.length) {
    return `<table class="materiais"><tr class="faixa" style="--cor:${cor}">
      <th class="esq">Material para produção</th></tr>
      <tr><td class="vazio">Sem material desta via na ficha técnica do produto.</td></tr></table>`;
  }
  const linhas = materiais
    .map(
      (m) => `<tr>
        <td>${escapar(m.descricao)}</td>
        <td class="c">${numero(m.consumo_por_peca, 4)}</td>
        <td class="c un">${escapar(m.unidade)}</td>
        <td class="c">${numero(m.quantidade_total, 2)}</td>
        <td class="c un">${escapar(m.unidade)}</td>
        <td class="destaque">${escapar(m.observacao || '')}</td>
      </tr>`
    )
    .join('');
  return `
  <table class="materiais">
    <colgroup>
      <col style="width:32%" /><col style="width:11%" /><col style="width:6%" />
      <col style="width:11%" /><col style="width:6%" /><col style="width:34%" />
    </colgroup>
    <tr class="faixa" style="--cor:${cor}">
      <th class="esq">Material para produção</th>
      <th colspan="2">Consumo p/ peça</th>
      <th colspan="2">Quant. total</th>
      <th>Observação</th>
    </tr>
    ${linhas}
  </table>`;
}

/** Tabela de material da capa: consumo, total, observação e situação de compra. */
function tabelaMateriaisCapa(materiais, cor) {
  const linhas = materiais
    .map(
      (m) => `<tr>
        <td>${escapar(m.descricao)}</td>
        <td class="c">${numero(m.consumo_por_peca, 4)}</td>
        <td class="c un">${escapar(m.unidade)}</td>
        <td class="c">${numero(m.quantidade_total, 2)}</td>
        <td class="c un">${escapar(m.unidade)}</td>
        <td class="destaque">${escapar(m.observacao || '')}</td>
        <td class="c">${escapar(m.pedido_compra || '')}</td>
        <td>${escapar(m.fornecedor || '')}</td>
        <td class="c">${dataBR(m.entrega_compra)}</td>
      </tr>`
    )
    .join('');
  return `
  <table class="materiais">
    <colgroup>
      <col style="width:23%" /><col style="width:8%" /><col style="width:5%" />
      <col style="width:9%" /><col style="width:5%" /><col style="width:16%" />
      <col style="width:8%" /><col style="width:16%" /><col style="width:10%" />
    </colgroup>
    <tr class="faixa" style="--cor:${cor}">
      <th class="esq">Material para produção</th>
      <th colspan="2">Consumo p/ peça</th>
      <th colspan="2">Quant. total</th>
      <th>Observação</th><th>Nº pedido</th><th>Fornecedor</th><th>Data de entrega</th>
    </tr>
    ${linhas || '<tr><td class="vazio" colspan="9">Ficha técnica não cadastrada para este produto.</td></tr>'}
  </table>`;
}

function tabelaSequencia(sequencia, cor, titulo) {
  if (!sequencia.length) return '';
  const linhas = sequencia
    .map(
      (o) => `<tr>
        <td class="seq"><b>${o.sequencia}.</b> ${escapar(o.nome)}</td>
        <td class="c maquina">${escapar(o.maquina || '')}</td>
        <td class="c preencher">${o.inicio ? dataBR(o.inicio) : '__/__/____'}</td>
        <td class="c preencher">${escapar(o.inicio ? String(o.inicio).slice(11, 16) : '__:__')}</td>
        <td class="c preencher">${o.termino ? dataBR(o.termino) : '__/__/____'}</td>
        <td class="c preencher">${escapar(o.termino ? String(o.termino).slice(11, 16) : '__:__')}</td>
        <td class="c preencher">${escapar(o.operador || '')}</td>
      </tr>`
    )
    .join('');
  return `
  <table class="sequencia">
    <colgroup>
      <col style="width:28%" /><col style="width:14%" /><col style="width:12%" /><col style="width:9%" />
      <col style="width:12%" /><col style="width:9%" /><col style="width:16%" />
    </colgroup>
    <tr class="faixa" style="--cor:${cor}">
      <th class="esq">${escapar(titulo)}</th><th>Máquina</th>
      <th>Início</th><th>Hora</th><th>Término</th><th>Hora</th><th>Operador</th>
    </tr>
    ${linhas}
  </table>`;
}

function blocoInstrucoes(instrucoes) {
  if (!instrucoes.length) return '';
  return `<div class="instrucoes">${instrucoes
    .map(
      (i) =>
        `<p class="${i.destaque ? 'grito' : 'nota'}">${escapar(i.texto)}</p>`
    )
    .join('')}</div>`;
}

function blocoImagens(imagens) {
  const validas = imagens.filter((i) => imagemSegura(i.arquivo));
  if (!validas.length) return '';
  return `<div class="imagens">${validas
    .map(
      (i) => `<figure><img src="${escapar(i.arquivo)}" alt="${escapar(i.titulo || '')}" />
        ${i.titulo ? `<figcaption>${escapar(i.titulo)}</figcaption>` : ''}</figure>`
    )
    .join('')}</div>`;
}

function blocoAssinaturas(assinaturas, cor) {
  if (!assinaturas.length) return '';
  return `<table class="assinaturas">${assinaturas
    .map(
      (a) => `<tr><th style="--cor:${cor}">${escapar(a)}</th><td>Assinatura:</td></tr>`
    )
    .join('')}</table>`;
}

/** Cabeçalho comum às vias de setor. */
function cabecalhoVia(ficha, via, cor) {
  return `
  <table class="cabecalho-via">
    <tr>
      <td class="marca" rowspan="2">
        <b>ConServ</b><small>Confecções</small><span class="sistema">CSVSIST</span>
      </td>
      <td class="vendedor">Vendedor(a): <b>${escapar(ficha.vendedor || '—')}</b></td>
    </tr>
    <tr><td class="titulo-via" style="--cor:${cor}">${escapar(via.titulo.toUpperCase())}</td></tr>
    <tr>
      <td colspan="2" class="dados-via">
        <span>Cliente: <b>${escapar(ficha.cliente.nome)}</b></span>
        <span>Nº do pedido: <b>${escapar(ficha.pedido.numero)}</b></span>
        <span>OP: <b>${escapar(ficha.ordem.numero)}</b></span>
        <span>Data de entrega: <b>${dataBR(ficha.pedido.data_entrega || ficha.ordem.data_prevista)}</b></span>
      </td>
    </tr>
  </table>`;
}

/** Capa: a ordem de produção propriamente dita. */
function paginaCapa(ficha, via) {
  const cor = CORES.PRODUCAO;
  const controle = ficha.controle
    .map(
      (c) => `<td><span class="rot">${escapar(ROTULO_ETAPA[c.codigo] || c.etapa)}</span>
        <span class="val">${escapar(marca(c.status))}</span></td>`
    )
    .join('');

  const operacoes = ficha.operacoes.length
    ? ficha.operacoes
        .map(
          (o) => `<tr>
            <td class="c">Nº${o.numero}</td>
            <td>${escapar(o.etapa.toUpperCase())}</td>
            <td class="c">${moeda(o.custo_unitario)}</td>
            <td class="c">${numero(o.quantidade, 0)}</td>
            <td class="c">${moeda(o.custo_total)}</td>
          </tr>`
        )
        .join('')
    : `<tr><td class="vazio" colspan="5">Custo de processo não cadastrado para este produto.</td></tr>`;

  const arte = ficha.arte;
  const marcado = (cond) => (cond ? 'X' : '&nbsp;&nbsp;');

  return `
<section class="via capa">
  <table class="cabecalho-capa">
    <tr>
      <td class="marca" rowspan="5"><b>ConServ</b><small>Confecções</small><span class="sistema">CSVSIST</span></td>
      <td class="faixa-titulo" style="--cor:${cor}">ORDEM DE PRODUÇÃO</td>
      <td class="rot">Nº do pedido:</td><td class="val">${escapar(ficha.pedido.numero)}</td>
      <td class="vendedor-cel" rowspan="5">
        <small>Vendedor(a)</small><b>${escapar(ficha.vendedor || '—')}</b>
      </td>
    </tr>
    <tr>
      <td class="cliente" rowspan="4">
        <small>Cliente:</small>
        <b>${escapar(ficha.cliente.nome)}</b>
        <small class="op">OP ${escapar(ficha.ordem.numero)} · ${escapar(ficha.produto.grupo || '')}</small>
      </td>
      <td class="rot">Data do pedido:</td><td class="val">${dataBR(ficha.pedido.data_pedido)}</td>
    </tr>
    <tr>
      <td class="rot alerta">Data de entrega:</td>
      <td class="val alerta">${dataBR(ficha.pedido.data_entrega || ficha.ordem.data_prevista)}</td>
    </tr>
    <tr>
      <td class="rot">Nº da nota fiscal:</td><td class="val">${escapar(ficha.pedido.nota_fiscal || '')}</td>
    </tr>
    <tr>
      <td class="rot">Data da nota fiscal:</td><td class="val">${dataBR(ficha.pedido.data_nota_fiscal)}</td>
    </tr>
  </table>

  ${tabelaGrade(ficha, cor)}
  ${tabelaMateriaisCapa(ficha.materiais, cor)}

  <div class="confidencial">DISTRIBUIÇÃO DESTA VIA : CONFIDENCIAL</div>

  <table class="operacoes">
    <tr class="faixa" style="--cor:${cor}">
      <th colspan="2" class="esq">Valor da operação</th>
      <th>R$ unitário</th><th>Quant.</th><th>Custo total</th>
    </tr>
    ${operacoes}
    <tr class="total">
      <td colspan="4" class="dir"><b>Valor total MO</b></td>
      <td class="c"><b>${moeda(ficha.total_mo)}</b></td>
    </tr>
  </table>

  <table class="controle">
    <tr class="faixa" style="--cor:${cor}"><th colspan="${Math.max(ficha.controle.length, 1)}">Controle de etapas</th></tr>
    <tr>${controle || '<td class="vazio">Roteiro não gerado.</td>'}</tr>
  </table>

  <div class="rodape-capa">
    <div class="quadro">
      <div class="tit" style="--cor:${cor}">Descrições do logo</div>
      <p>( ${marcado(arte.origem_arte === 'VETOR')} ) Vetor &nbsp;&nbsp; ( ${marcado(arte.origem_arte === 'IMAGEM')} ) Imagem</p>
      <p class="obs">Todas as artes são centralizadas de acordo com o tamanho especificado pelo layout.</p>
      <div class="tit" style="--cor:${cor}">Personalização</div>
      <p>( ${marcado(arte.personalizacao === 'TRANSFER')} ) Transfer &nbsp;&nbsp;
         ( ${marcado(arte.personalizacao === 'SILK')} ) Serigrafia / Silk &nbsp;&nbsp;
         ( ${marcado(arte.personalizacao === 'BORDADO')} ) Bordado</p>
      ${arte.observacao ? `<p class="obs">${escapar(arte.observacao)}</p>` : ''}
      ${
        arte.logos.length
          ? `<table class="logos"><tr><th>Logo</th><th>Posição</th><th>Medida</th><th>Cor</th></tr>
             ${arte.logos
               .map(
                 (l) => `<tr><td>${escapar(l.descricao)}</td><td>${escapar(l.posicao || '')}</td>
                   <td class="c">${numero(l.largura_cm, 1)} × ${numero(l.altura_cm, 1)} cm</td>
                   <td>${escapar(l.cor || '')}</td></tr>`
               )
               .join('')}</table>`
          : ''
      }
    </div>
    <div class="quadro amostra">
      <div class="tit" style="--cor:${cor}">Descrição / amostra virtual</div>
      ${blocoImagens(via.imagens) || '<p class="obs">Sem imagem cadastrada para a ficha deste produto.</p>'}
    </div>
  </div>

  ${blocoAssinaturas(via.assinaturas, cor)}
</section>`;
}

/** Receita das tintas — só a via do silk imprime. */
function blocoTintas(arte, cor) {
  const cores = arte.cores.length
    ? arte.cores
        .map(
          (c) => `<tr><td class="c">Cor ${c.sequencia}</td><td>${escapar(c.nome)}</td>
            <td>${escapar(c.referencia || '')}</td>
            <td class="amostra-cor">${
              /^#[0-9a-f]{3,8}$/i.test(c.hex || '') ? `<span style="background:${escapar(c.hex)}"></span>` : ''
            }</td></tr>`
        )
        .join('')
    : `<tr><td class="vazio" colspan="4">Receita de tinta não cadastrada.</td></tr>`;
  return `
  <table class="tintas">
    <tr class="faixa" style="--cor:${cor}"><th colspan="4" class="esq">Receita das tintas</th></tr>
    <tr class="base"><td colspan="4">
      Tinta base d'água ( ${arte.base_tinta === 'AGUA' ? 'X' : '&nbsp;&nbsp;'} ) &nbsp;
      Tinta base vinílica ( ${arte.base_tinta === 'VINILICA' ? 'X' : '&nbsp;&nbsp;'} ) &nbsp;
      ${arte.tinta_pronta ? '<b>TINTA JÁ PRONTA</b>' : ''}
    </td></tr>
    ${cores}
  </table>`;
}

function paginaSetor(ficha, via) {
  const cor = CORES[via.setor] || '#444';
  return `
<section class="via">
  ${cabecalhoVia(ficha, via, cor)}
  ${blocoInstrucoes(via.instrucoes)}
  ${blocoImagens(via.imagens)}
  ${tabelaGrade(ficha, cor)}
  ${tabelaMateriais(via.materiais, cor)}
  ${tabelaSequencia(via.sequencia, cor, `Sequência operacional ${via.setor.toLowerCase()}`)}
  ${via.setor === 'SILK' ? blocoTintas(ficha.arte, cor) : ''}
  ${blocoAssinaturas(via.assinaturas, cor)}
</section>`;
}

const ESTILO = `
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #111; background: #eceff3; }
  .via { background: #fff; border: 2px solid #111; padding: 6px; margin: 10px auto; width: 200mm; min-height: 281mm; }
  @media print {
    body { background: #fff; }
    .via { margin: 0; width: auto; min-height: 0; border-width: 1.5px; page-break-after: always; }
    .via:last-child { page-break-after: auto; }
    .barra-tela { display: none !important; }
  }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; table-layout: fixed; }
  td, th { border: 1px solid #111; padding: 2px 4px; font-size: 8pt; vertical-align: middle;
           word-wrap: break-word; overflow-wrap: anywhere; }
  th { font-weight: bold; text-align: center; }
  .c { text-align: center; }
  .dir { text-align: right; }
  .esq { text-align: left; }
  .faixa th { background: var(--cor); color: #fff; text-transform: uppercase; letter-spacing: .3px; }
  .vazio { text-align: center; color: #777; font-style: italic; padding: 6px; }
  .un { width: 34px; color: #444; }
  .destaque:not(:empty) { background: #fff7c0; font-weight: bold; text-align: center; }

  .marca { width: 110px; text-align: center; line-height: 1.1; }
  .marca b { display: block; font-size: 15pt; color: #1a4f8a; letter-spacing: -.5px; }
  .marca small { display: block; font-size: 6pt; letter-spacing: 3px; color: #666; text-transform: uppercase; }
  .marca .sistema { display: block; margin-top: 3px; font-size: 6pt; letter-spacing: 2px; color: #999; }

  .cabecalho-capa .faixa-titulo { background: #fff; color: #e01b24; font-weight: bold; text-align: center;
                                  text-transform: uppercase; letter-spacing: 1px; }
  .cabecalho-capa { table-layout: auto; }
  .cabecalho-capa .rot { text-align: right; width: 130px; color: #222; }
  .cabecalho-capa .val { text-align: center; font-weight: bold; }
  .cabecalho-capa .alerta { background: #fff100; }
  .cabecalho-capa .cliente { text-align: center; }
  .cabecalho-capa .cliente b { display: block; font-size: 12pt; }
  .cabecalho-capa .cliente small { color: #555; }
  .cabecalho-capa .cliente .op { display: block; font-size: 7pt; }
  .vendedor-cel { width: 120px; text-align: center; }
  .vendedor-cel b { display: block; font-size: 12pt; }
  .vendedor-cel small { display: block; font-size: 6.5pt; color: #555; text-transform: uppercase; }

  .cabecalho-via .titulo-via { background: var(--cor); color: #fff; font-weight: bold; font-size: 13pt;
                               text-align: center; letter-spacing: 3px; }
  .cabecalho-via .vendedor { text-align: right; }
  .cabecalho-via .dados-via { padding: 4px 6px; }
  .cabecalho-via .dados-via span { display: inline-block; margin-right: 18px; font-size: 8.5pt; }

  .grade .produto { font-weight: bold; text-transform: uppercase; }
  .grade .grande { font-size: 11pt; font-weight: bold; }

  .confidencial { background: #e01b24; color: #fff; text-align: center; font-size: 15pt; font-weight: bold;
                  letter-spacing: 1px; padding: 3px; margin: 6px 0; }

  .operacoes .total td { background: #f1f1f1; }
  .controle td { text-align: center; padding: 3px 2px; }
  .controle .rot { display: block; font-size: 6.5pt; text-transform: uppercase; color: #555; }
  .controle .val { display: block; font-weight: bold; font-size: 10pt; min-height: 14px; }

  .instrucoes { margin: 4px 0; }
  .instrucoes .grito { background: #fff100; color: #d10a0a; font-weight: bold; font-size: 12pt;
                       text-transform: uppercase; margin: 0 0 3px; padding: 3px 6px; }
  .instrucoes .nota { margin: 0 0 3px; padding: 2px 6px; border-left: 4px solid #999; }

  .imagens { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 6px 0; }
  .imagens figure { margin: 0; text-align: center; }
  .imagens img { max-height: 78mm; max-width: 90mm; object-fit: contain; }
  .imagens figcaption { font-size: 7pt; color: #555; }

  .sequencia .seq { text-align: left; }
  .sequencia .maquina { text-transform: uppercase; color: #1f6fb2; font-weight: bold; }
  .sequencia .preencher { color: #d10a0a; letter-spacing: 1px; }

  .tintas .base { text-align: center; }
  .tintas .amostra-cor span { display: inline-block; width: 26px; height: 12px; border: 1px solid #333; }

  .rodape-capa { display: flex; gap: 6px; margin: 6px 0; }
  .rodape-capa .quadro { flex: 1; border: 1px solid #111; padding: 4px; }
  .rodape-capa .amostra { flex: 1.2; }
  .rodape-capa .tit { background: var(--cor); color: #fff; font-weight: bold; text-transform: uppercase;
                      font-size: 7.5pt; padding: 2px 4px; margin: 0 0 4px; }
  .rodape-capa p { margin: 0 0 4px; font-size: 8pt; }
  .rodape-capa .obs { color: #555; font-size: 7pt; }
  .logos th, .logos td { font-size: 7pt; }

  .assinaturas { margin-top: 6px; }
  .assinaturas th { background: #fff; color: var(--cor); text-align: left; text-transform: uppercase; width: 40%; }
  .assinaturas td { color: #555; }

  .barra-tela { position: sticky; top: 0; z-index: 2; background: #111; color: #fff; padding: 8px 14px;
                display: flex; align-items: center; gap: 12px; font-size: 10pt; }
  .barra-tela button { background: #29abe2; color: #fff; border: 0; padding: 6px 14px; border-radius: 4px;
                       font-size: 10pt; cursor: pointer; }
  .barra-tela span { color: #bbb; }
`;

/**
 * Documento completo, pronto para imprimir.
 * @param {object} ficha resultado de montarFicha()
 */
export function fichaHtml(ficha) {
  const paginas = ficha.documentos
    .map((via) => (via.setor === 'PRODUCAO' ? paginaCapa(ficha, via) : paginaSetor(ficha, via)))
    .join('\n');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>CSVSIST · Ficha ${escapar(ficha.ordem.numero)} — ${escapar(ficha.cliente.nome)}</title>
<style>${ESTILO}</style>
</head>
<body>
<div class="barra-tela">
  <button onclick="window.print()">Imprimir / salvar em PDF</button>
  <b>${escapar(ficha.ordem.numero)}</b>
  <span>${escapar(ficha.cliente.nome)} · pedido ${escapar(ficha.pedido.numero)} ·
        ${escapar(ficha.documentos.length)} via(s) · emitido em ${dataBR(ficha.emitido_em)}</span>
</div>
${paginas}
</body>
</html>`;
}

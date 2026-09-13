/* ==========================================================================
   ERP-PCP CONSERV 1.0 — VERSÃO TESTE DA FASE 1
   Carteira real migrada para o banco novo. O que você mexer fica neste
   navegador e não sai daqui.
   ========================================================================== */

const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR');
const fmtDec = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const moeda = (v) => fmtMoeda.format(Number(v) || 0);
const num = (v) => fmtNum.format(Math.round(Number(v) || 0));
const dec = (v) => fmtDec.format(Number(v) || 0);
const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

function moedaCurta(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e6) return `R$ ${dec(n / 1e6)} mi`;
  if (Math.abs(n) >= 1e3) return `R$ ${dec(n / 1e3)} mil`;
  return moeda(n);
}

/* ------------------------------------------------------------- os dados -- */
const C = DADOS.clientes;
const V = DADOS.vendedores;
const GC = DADOS.gruposCliente;
const P = DADOS.produtos;
const GP = DADOS.gruposProduto;
const LN = DADOS.linhas;

const ITENS = DADOS.itens.map(
  ([pedido, numero, cli, gcli, vend, prod, gprod, linha, qtd, preco, liq, dPed, dEnt, status], i) => ({
    i,
    pedido,
    numero,
    cliente: C[cli] ?? '—',
    grupoCliente: GC[gcli] ?? '—',
    vendedor: V[vend] ?? '—',
    produto: P[prod] ?? '—',
    produtoCodigo: DADOS.produtoCodigos[prod] ?? '',
    grupo: GP[gprod] ?? '—',
    linha: LN[linha] ?? '—',
    qtd,
    preco,
    total: Math.round(qtd * preco * 100) / 100,
    liquidacao: liq,
    dataPedido: dPed,
    dataEntrega: dEnt,
    status,
  })
);

const HOJE = DADOS.gerado;

/**
 * Períodos rápidos, contados a partir da data da base.
 *
 * Todos recortam pela data do pedido — é quando a venda entrou. Recortar a
 * carteira pela entrega esconderia justamente o pedido antigo que ainda não
 * saiu, que é o que interessa olhar.
 */
const recuar = (meses) => {
  const d = new Date(HOJE + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().slice(0, 10);
};

const PERIODOS = {
  '3M': { rotulo: '3 meses', de: () => recuar(3) },
  '12M': { rotulo: '12 meses', de: () => recuar(12) },
  ANO: { rotulo: 'Este ano', de: () => HOJE.slice(0, 4) + '-01-01' },
  TUDO: { rotulo: 'Tudo', de: () => '' },
};

/** A janela em vigor: o preset escolhido, ou as datas digitadas à mão. */
function janela() {
  const f = estado.painel;
  if (f.periodo === 'CUSTOM') return { de: f.de || '', ate: f.ate || '' };
  return { de: PERIODOS[f.periodo]?.de() ?? '', ate: '' };
}

/* ------------------------------------------------------------- semáforo -- */
/*
 * O §22 pede semáforo de prazo. Pedido entregue sai da conta — atraso de algo
 * que já foi entregue não é atraso, é histórico.
 */
const ENTREGUES = new Set(['ENTREGUE', 'EXPEDIDO']);

const diasAte = (iso) => {
  if (!iso) return null;
  return Math.round((new Date(iso + 'T00:00:00Z') - new Date(HOJE + 'T00:00:00Z')) / 86400000);
};

function farol(item) {
  if (ENTREGUES.has(item.status)) return { cor: 'ok', rotulo: 'Entregue', dias: null };
  const d = diasAte(item.dataEntrega);
  if (d === null) return { cor: '', rotulo: 'Sem data', dias: null };
  if (d < 0) return { cor: 'ruim', rotulo: `${-d} d de atraso`, dias: d };
  if (d <= 7) return { cor: 'aviso', rotulo: `entrega em ${d} d`, dias: d };
  return { cor: 'ok', rotulo: `entrega em ${d} d`, dias: d };
}

const emCarteira = (i) => !ENTREGUES.has(i.status);

const ROTULO_STATUS = {
  ORCAMENTO: 'Orçamento',
  PEDIDO_RECEBIDO: 'Pedido recebido',
  APROVADO: 'Aprovado',
  AGUARDANDO_ENGENHARIA: 'Aguardando engenharia',
  AGUARDANDO_MATERIAL: 'Aguardando material',
  LIBERADO_PCP: 'Liberado PCP',
  EM_PRODUCAO: 'Em produção',
  QUALIDADE: 'Qualidade',
  EMBALAGEM: 'Embalagem',
  PRONTO: 'Pronto',
  EXPEDIDO: 'Expedido',
  FATURADO: 'Faturado',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

const TOM_STATUS = {
  ENTREGUE: 'ok', EXPEDIDO: 'ok', FATURADO: 'info', LIBERADO_PCP: 'aviso',
  EM_PRODUCAO: 'aviso', PEDIDO_RECEBIDO: '', CANCELADO: '',
};

/* ==========================================================================
   ESTADO
   ========================================================================== */
const CHAVE = 'conserv.pcp.teste.v1';

const CONTAS = [
  { email: 'admin@conserv.com.br', senha: 'conserv123', nome: 'Administrador',
    perfil: 'ADMINISTRADOR', provisoria: false },
  { email: 'renato.monteiro@conserv.com.br', senha: '123', nome: 'Renato Monteiro',
    perfil: 'DIRETOR', provisoria: true },
  { email: 'pcp@conserv.com.br', senha: 'pcp123', nome: 'Leticia (PCP)',
    perfil: 'PCP', provisoria: false },
];

const padrao = () => ({
  tela: 'painel',
  sessao: null,
  trocarSenha: false,
  erro: '',
  filtros: { busca: '', grupoCliente: '', vendedor: '', grupoProduto: '', linha: '', situacao: 'CARTEIRA' },
  // O painel tem os seus: período, situação e cliente respondem juntos.
  painel: { periodo: '12M', de: '', ate: '', status: '', cliente: '' },
  pedidoAberto: null,
  // Cadastro de clientes: só o que mudou fica guardado, não as 448 fichas.
  clientes: { novos: [], edicoes: {}, inativos: [] },
  clienteAberto: null,   // código em visualização
  clienteEditando: null, // código em edição, ou '' para um novo
  // O que foi digitado no formulário. Sem isto, uma validação recusada
  // reconstruiria a ficha em branco e a pessoa perderia tudo.
  rascunho: null,
  falha: '',
});

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return padrao();
    const salvo = JSON.parse(bruto);
    return {
      ...padrao(),
      sessao: salvo.sessao ?? null,
      trocarSenha: Boolean(salvo.trocarSenha),
      clientes: salvo.clientes ?? padrao().clientes,
    };
  } catch { return padrao(); }
}

let estado = carregar();

function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({
      sessao: estado.sessao, trocarSenha: estado.trocarSenha, clientes: estado.clientes,
    }));
  } catch { /* navegador sem armazenamento: a sessão vale só nesta aba */ }
}

/* ==========================================================================
   COMPONENTES
   ========================================================================== */
const indicador = (rotulo, valor, nota, tom) => `
  <div class="ind${tom ? ' t-' + tom : ''}">
    <span class="ind-rot">${esc(rotulo)}</span>
    <span class="ind-val">${valor}</span>
    ${nota ? `<span class="ind-nota">${nota}</span>` : ''}
  </div>`;

const painel = (titulo, corpo, acao) => `
  <section class="painel">
    <header class="painel-cab"><h2>${esc(titulo)}</h2>${acao ?? ''}</header>
    ${corpo}
  </section>`;

const pastilha = (texto, tom = '') => `<span class="pastilha ${tom}">${esc(texto)}</span>`;

const cabecalho = (titulo, sub) => `
  <header class="tela-cab"><h1>${esc(titulo)}</h1><p>${esc(sub)}</p></header>`;

const vazio = (texto) => `<div class="vazio">${esc(texto)}</div>`;

/* ==========================================================================
   1. PAINEL — o dashboard executivo do §4
   ========================================================================== */
/** Aplica período, situação e cliente — os três filtros do painel. */
function itensDoPainel() {
  const f = estado.painel;
  const { de, ate } = janela();
  return ITENS.filter((i) => {
    if (de && (!i.dataPedido || i.dataPedido < de)) return false;
    if (ate && (!i.dataPedido || i.dataPedido > ate)) return false;
    if (f.status && i.status !== f.status) return false;
    if (f.cliente && i.cliente !== f.cliente) return false;
    return true;
  });
}

function barraPainel(base) {
  const f = estado.painel;
  const { de, ate } = janela();

  // Só os clientes que aparecem na janela, e os maiores primeiro: a lista
  // inteira de 448 nomes em ordem alfabética não ajuda ninguém.
  const porCliente = agrupar(base, (i) => i.cliente);
  const clientes = [...porCliente.entries()].sort((a, b) => b[1].valor - a[1].valor);
  const statusPresentes = [...new Set(base.map((i) => i.status))].sort();

  const ativos = [
    f.periodo !== 'TUDO' && (f.periodo === 'CUSTOM'
      ? `${de ? dataBR(de) : 'início'} a ${ate ? dataBR(ate) : 'hoje'}`
      : PERIODOS[f.periodo].rotulo.toLowerCase()),
    f.status && (ROTULO_STATUS[f.status] ?? f.status),
    f.cliente,
  ].filter(Boolean);

  return painel('Filtros', `
    <div class="filtros">
      <div class="filtro-campo">
        <span>Período do pedido</span>
        <div class="periodos">
          ${Object.entries(PERIODOS).map(([k, v]) =>
            `<button data-acao="periodo" data-periodo="${k}"
                     class="${f.periodo === k ? 'ativo' : ''}">${esc(v.rotulo)}</button>`).join('')}
        </div>
      </div>
      <div class="filtro-campo">
        <span>De</span>
        <input type="date" value="${esc(f.de)}" data-painel="de" max="${esc(HOJE)}" />
      </div>
      <div class="filtro-campo">
        <span>Até</span>
        <input type="date" value="${esc(f.ate)}" data-painel="ate" max="${esc(HOJE)}" />
      </div>
      <div class="filtro-campo">
        <span>Situação</span>
        <select data-painel="status">
          <option value="">Todas</option>
          ${statusPresentes.map((st) =>
            `<option value="${esc(st)}"${st === f.status ? ' selected' : ''}>${
              esc(ROTULO_STATUS[st] ?? st)}</option>`).join('')}
        </select>
      </div>
      <div class="filtro-campo">
        <span>Cliente</span>
        <select data-painel="cliente">
          <option value="">Todos (${num(clientes.length)})</option>
          ${clientes.map(([nome, v]) =>
            `<option value="${esc(nome)}"${nome === f.cliente ? ' selected' : ''}>${
              esc(nome)} — ${moedaCurta(v.valor)}</option>`).join('')}
        </select>
      </div>
      <button class="mini" data-acao="limpar-painel">Limpar</button>
    </div>
    ${ativos.length
      ? `<p class="resumo-filtro">Mostrando <b>${num(base.length)}</b> de ${num(ITENS.length)} itens ·
          ${ativos.map((a) => `<b>${esc(a)}</b>`).join(' · ')}</p>`
      : `<p class="resumo-filtro">Mostrando todos os <b>${num(ITENS.length)}</b> itens da base.</p>`}`);
}

function telaPainel() {
  const base = itensDoPainel();
  const carteira = base.filter(emCarteira);
  const valor = carteira.reduce((s, i) => s + i.total, 0);
  const pecas = carteira.reduce((s, i) => s + i.qtd, 0);
  const atrasados = carteira.filter((i) => (farol(i).dias ?? 1) < 0);
  const semana = carteira.filter((i) => { const d = farol(i).dias; return d !== null && d >= 0 && d <= 7; });
  const entregue = base.filter((i) => !emCarteira(i));
  const faturado = entregue.reduce((s, i) => s + i.total, 0);

  const porStatus = agrupar(carteira, (i) => i.status);
  const porGrupo = agrupar(carteira, (i) => i.grupo);
  const porVendedor = agrupar(base, (i) => i.vendedor);
  const porMes = agrupar(base.filter((i) => i.dataPedido), (i) => i.dataPedido.slice(0, 7));

  const meses = [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-18);
  const maiorMes = Math.max(1, ...meses.map(([, v]) => v.valor));

  return `
    ${cabecalho('Painel', `Posição de ${dataBR(HOJE)} — carteira, prazo e faturamento`)}

    ${barraPainel(base)}

    ${base.length === 0 ? vazio('Nenhum item no período e nos filtros escolhidos.') : ''}

    <div class="faixa-ind">
      ${indicador('Peças em carteira', num(pecas), `${num(carteira.length)} itens em aberto`)}
      ${indicador('Valor da carteira', moedaCurta(valor), moeda(valor))}
      ${indicador('Itens atrasados', num(atrasados.length),
        moeda(atrasados.reduce((s, i) => s + i.total, 0)), atrasados.length ? 'ruim' : 'bom')}
      ${indicador('Entregar em 7 dias', num(semana.length),
        moeda(semana.reduce((s, i) => s + i.total, 0)), semana.length ? 'aviso' : 'bom')}
      ${indicador('Já faturado', moedaCurta(faturado), `${num(entregue.length)} itens entregues`)}
      ${indicador('Itens no filtro', num(base.length),
        `de ${num(DADOS.contagem.itens)} na base`)}
    </div>

    <div class="grade-2">
      ${painel('Carteira por situação', porStatus.size === 0 ? vazio('Nada em aberto.') : `
        <div class="barras">
          ${[...porStatus.entries()].sort((a, b) => b[1].valor - a[1].valor).map(([k, v]) => `
            <div class="barra-linha">
              <span class="barra-rot">${esc(ROTULO_STATUS[k] ?? k)}</span>
              <span class="barra-trilho"><span class="barra-marca"
                style="width:${(v.valor / Math.max(...[...porStatus.values()].map((x) => x.valor)) * 100).toFixed(1)}%"></span></span>
              <span class="barra-valor">${moedaCurta(v.valor)}</span>
              <span class="barra-sub">${v.n}</span>
            </div>`).join('')}
        </div>`)}

      ${painel('Carteira por grupo de produto', `
        <div class="barras">
          ${[...porGrupo.entries()].sort((a, b) => b[1].valor - a[1].valor).slice(0, 8).map(([k, v]) => `
            <div class="barra-linha">
              <span class="barra-rot">${esc(k)}</span>
              <span class="barra-trilho"><span class="barra-marca"
                style="width:${(v.valor / Math.max(...[...porGrupo.values()].map((x) => x.valor)) * 100).toFixed(1)}%"></span></span>
              <span class="barra-valor">${moedaCurta(v.valor)}</span>
              <span class="barra-sub">${num(v.pecas)}</span>
            </div>`).join('')}
        </div>`, '<small>peças à direita</small>')}
    </div>

    ${painel('Pedidos por mês', `
      <div class="colunas" role="img" aria-label="Faturamento por mês dos últimos 14 meses">
        ${meses.map(([mes, v]) => `
          <div class="coluna-mes" data-dica="${esc(mes)} · ${moeda(v.valor)} · ${num(v.pecas)} peças">
            <span class="coluna-barra" style="height:${(v.valor / maiorMes * 100).toFixed(1)}%"></span>
            <span class="coluna-rot">${esc(mes.slice(5))}/${esc(mes.slice(2, 4))}</span>
          </div>`).join('')}
      </div>`, `<small>${meses.length} ${meses.length === 1 ? 'mês' : 'meses'} · passe o mouse</small>`)}

    ${painel('Atrasados — os dez mais antigos', atrasados.length === 0
      ? vazio('Nenhum item atrasado.')
      : `<div class="rolagem">
          <table>
            <thead><tr><th>Entrega</th><th>Pedido</th><th>Cliente</th><th>Produto</th>
              <th class="n">Peças</th><th class="n">Valor</th><th>Prazo</th></tr></thead>
            <tbody>${atrasados.sort((a, b) => (a.dataEntrega ?? '').localeCompare(b.dataEntrega ?? ''))
              .slice(0, 10).map((i) => linhaItem(i)).join('')}</tbody>
          </table>
        </div>`)}

    ${painel('Vendedores', `
      <div class="rolagem">
        <table>
          <thead><tr><th>Vendedor</th><th class="n">Itens</th><th class="n">Peças</th>
            <th class="n">Valor</th><th class="n">Ticket médio</th></tr></thead>
          <tbody>${[...porVendedor.entries()].sort((a, b) => b[1].valor - a[1].valor).map(([k, v]) => `
            <tr><td>${esc(k)}</td><td class="n mono">${num(v.n)}</td>
              <td class="n mono">${num(v.pecas)}</td>
              <td class="n mono">${moeda(v.valor)}</td>
              <td class="n mono">${moeda(v.valor / v.n)}</td></tr>`).join('')}</tbody>
        </table>
      </div>`)}`;
}

function agrupar(lista, chave) {
  const mapa = new Map();
  for (const i of lista) {
    const k = chave(i) || '—';
    const atual = mapa.get(k) ?? { n: 0, valor: 0, pecas: 0 };
    atual.n += 1; atual.valor += i.total; atual.pecas += i.qtd;
    mapa.set(k, atual);
  }
  return mapa;
}

/* ==========================================================================
   2. CARTEIRA — a tela do §22, com semáforo e os filtros do §4
   ========================================================================== */
function filtrar() {
  const f = estado.filtros;
  const termo = f.busca.trim().toLowerCase();
  return ITENS.filter((i) => {
    if (f.situacao === 'CARTEIRA' && !emCarteira(i)) return false;
    if (f.situacao === 'ATRASADOS' && !((farol(i).dias ?? 1) < 0)) return false;
    if (f.situacao === 'ENTREGUES' && emCarteira(i)) return false;
    if (f.grupoCliente && i.grupoCliente !== f.grupoCliente) return false;
    if (f.vendedor && i.vendedor !== f.vendedor) return false;
    if (f.grupoProduto && i.grupo !== f.grupoProduto) return false;
    if (f.linha && i.linha !== f.linha) return false;
    if (termo && !(`${i.cliente} ${i.produto} ${i.numero} ${i.pedido}`.toLowerCase().includes(termo))) return false;
    return true;
  });
}

function linhaItem(i) {
  const f = farol(i);
  return `<tr class="${f.cor === 'ruim' ? 'risco-ruim' : f.cor === 'aviso' ? 'risco-aviso' : ''}"
              data-acao="abrir-pedido" data-pedido="${esc(i.pedido)}">
    <td class="mono">${dataBR(i.dataEntrega)}</td>
    <td class="mono">${esc(i.numero ?? '—')}<span class="sub">${esc(i.pedido)}</span></td>
    <td>${esc(i.cliente.slice(0, 30))}<span class="sub">${esc(i.grupoCliente)}</span></td>
    <td>${esc(i.produto.slice(0, 34))}<span class="sub mono">${esc(i.produtoCodigo)}</span></td>
    <td class="n mono">${num(i.qtd)}</td>
    <td class="n mono">${moeda(i.total)}</td>
    <td>${pastilha(f.rotulo, f.cor)}</td>
  </tr>`;
}

function telaCarteira() {
  const lista = filtrar();
  const valor = lista.reduce((s, i) => s + i.total, 0);
  const pecas = lista.reduce((s, i) => s + i.qtd, 0);
  const atrasados = lista.filter((i) => (farol(i).dias ?? 1) < 0).length;
  const f = estado.filtros;

  const opcoes = (lista, valorAtual) =>
    lista.filter(Boolean).sort().map((v) =>
      `<option value="${esc(v)}"${v === valorAtual ? ' selected' : ''}>${esc(v)}</option>`).join('');

  return `
    ${cabecalho('Carteira de pedidos', 'Semáforo de prazo: vermelho é atraso, âmbar entrega em até sete dias')}

    <div class="faixa-ind">
      ${indicador('Itens listados', num(lista.length))}
      ${indicador('Peças', num(pecas))}
      ${indicador('Valor', moedaCurta(valor), moeda(valor))}
      ${indicador('Atrasados', num(atrasados), atrasados ? 'precisam de decisão hoje' : 'nenhum', atrasados ? 'ruim' : 'bom')}
    </div>

    ${painel('Filtros', `
      <div class="filtros">
        <input type="search" placeholder="Cliente, produto ou número do pedido"
          value="${esc(f.busca)}" data-filtro="busca" />
        <select data-filtro="situacao">
          <option value="CARTEIRA"${f.situacao === 'CARTEIRA' ? ' selected' : ''}>Em carteira</option>
          <option value="ATRASADOS"${f.situacao === 'ATRASADOS' ? ' selected' : ''}>Só atrasados</option>
          <option value="ENTREGUES"${f.situacao === 'ENTREGUES' ? ' selected' : ''}>Entregues</option>
          <option value="TODOS"${f.situacao === 'TODOS' ? ' selected' : ''}>Todos</option>
        </select>
        <select data-filtro="grupoCliente">
          <option value="">Todo grupo de cliente</option>${opcoes(GC, f.grupoCliente)}
        </select>
        <select data-filtro="vendedor">
          <option value="">Todo vendedor</option>${opcoes(V, f.vendedor)}
        </select>
        <select data-filtro="grupoProduto">
          <option value="">Todo grupo de produto</option>${opcoes(GP, f.grupoProduto)}
        </select>
        <select data-filtro="linha">
          <option value="">Toda linha</option>${opcoes(LN, f.linha)}
        </select>
        <button class="mini" data-acao="limpar-filtros">Limpar</button>
      </div>`)}

    ${painel(`Itens (${num(lista.length)})`, lista.length === 0
      ? vazio('Nenhum item com estes filtros.')
      : `<div class="rolagem alta">
          <table>
            <thead><tr><th>Entrega</th><th>Pedido</th><th>Cliente</th><th>Produto</th>
              <th class="n">Peças</th><th class="n">Valor</th><th>Prazo</th></tr></thead>
            <tbody>${lista.slice(0, 400).map((i) => linhaItem(i)).join('')}</tbody>
            <tfoot><tr><td colspan="4">${lista.length > 400
              ? `Mostrando 400 de ${num(lista.length)}` : 'Total'}</td>
              <td class="n mono forte">${num(pecas)}</td>
              <td class="n mono forte">${moeda(valor)}</td><td></td></tr></tfoot>
          </table>
        </div>`, '<small>clique na linha para abrir o pedido</small>')}`;
}

/* ==========================================================================
   3. CLIENTES  ·  4. PRODUTOS
   ========================================================================== */
/* ==========================================================================
   CLIENTES — inserir, ver, editar e excluir
   ========================================================================== */

/**
 * Campos do §6. O que a migração trouxe é nome, código, grupo e vendedor; o
 * resto nasce vazio e é preenchido aqui — por isso o formulário existe.
 */
const CAMPOS_CLIENTE = [
  { chave: 'razao_social', rotulo: 'Razão social', exigido: true, largo: true },
  { chave: 'nome_fantasia', rotulo: 'Nome fantasia', largo: true },
  { chave: 'cnpj', rotulo: 'CNPJ' },
  { chave: 'cpf', rotulo: 'CPF' },
  { chave: 'inscricao_estadual', rotulo: 'Inscrição estadual' },
  { chave: 'grupo', rotulo: 'Grupo', tipo: 'lista', opcoes: () => GC },
  { chave: 'vendedor', rotulo: 'Vendedor', tipo: 'lista', opcoes: () => V },
  { chave: 'contato', rotulo: 'Contato' },
  { chave: 'telefone', rotulo: 'Telefone' },
  { chave: 'whatsapp', rotulo: 'WhatsApp' },
  { chave: 'email', rotulo: 'E-mail', tipo: 'email' },
  { chave: 'cep', rotulo: 'CEP' },
  { chave: 'endereco', rotulo: 'Endereço', largo: true },
  { chave: 'numero', rotulo: 'Número' },
  { chave: 'bairro', rotulo: 'Bairro' },
  { chave: 'cidade', rotulo: 'Cidade' },
  { chave: 'uf', rotulo: 'UF' },
  { chave: 'condicao_pagamento', rotulo: 'Condição de pagamento' },
  { chave: 'prazo_pagamento_dias', rotulo: 'Prazo (dias)', tipo: 'numero' },
  { chave: 'limite_credito', rotulo: 'Limite de crédito', tipo: 'numero' },
  { chave: 'observacao', rotulo: 'Observação', largo: true, area: true },
];

/** A base migrada, já como objeto. */
const CLIENTES_BASE = DADOS.cadastroClientes.map(
  ([razao_social, codigo, grupo, vendedor, pedidos, valor, ultimo]) =>
    ({ razao_social, codigo, grupo, vendedor, pedidos, valor, ultimo, ativo: 1 })
);

/**
 * Lista em vigor: a base, com as edições por cima, os novos no fim e os
 * inativados marcados. Nada some da lista — inativo continua visível, porque
 * cliente com histórico não se apaga.
 */
function clientesLista() {
  const { novos, edicoes, inativos } = estado.clientes;
  const inativo = new Set(inativos);
  const base = CLIENTES_BASE.map((c) => ({
    ...c, ...(edicoes[c.codigo] ?? {}), ativo: inativo.has(c.codigo) ? 0 : 1,
  }));
  const criados = novos
    .filter((c) => !estado.clientes.removidosDeVez?.includes(c.codigo))
    .map((c) => ({ pedidos: 0, valor: 0, ultimo: null, ...c,
                   ...(edicoes[c.codigo] ?? {}), ativo: inativo.has(c.codigo) ? 0 : 1 }));
  return [...criados, ...base];
}

const acharCliente = (codigo) => clientesLista().find((c) => c.codigo === codigo) ?? null;

/** Próximo código livre, no mesmo formato da migração. */
function proximoCodigoCliente() {
  const maior = clientesLista().reduce((m, c) => {
    const n = Number(String(c.codigo).replace(/\D/g, ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return 'CLI-' + String(maior + 1).padStart(6, '0');
}

function telaClientes() {
  const termo = (estado.filtros.busca ?? '').trim().toLowerCase();
  const todos = clientesLista();
  const lista = todos.filter((c) =>
    !termo || `${c.razao_social} ${c.codigo} ${c.nome_fantasia ?? ''} ${c.cidade ?? ''}`
      .toLowerCase().includes(termo));

  const ativos = todos.filter((c) => c.ativo).length;
  const criados = estado.clientes.novos.length;
  const editados = Object.keys(estado.clientes.edicoes).length;

  return `
    ${cabecalho('Clientes', 'Cadastro completo: inserir, abrir, editar e inativar')}

    <div class="faixa-ind">
      ${indicador('Clientes', num(todos.length), `${num(ativos)} ativos`)}
      ${indicador('Listados', num(lista.length))}
      ${indicador('Grupos', num(GC.length))}
      ${indicador('Alterados por você', num(criados + editados),
        criados || editados ? `${criados} novos · ${editados} editados` : 'nada alterado ainda')}
    </div>

    ${estado.falha && estado.clienteEditando === null
      ? `<div class="aviso-erro">${esc(estado.falha)}</div>` : ''}

    ${painel('Cadastro', `
      <div class="filtros">
        <input type="search" placeholder="Nome, código, fantasia ou cidade"
               value="${esc(estado.filtros.busca)}" data-filtro="busca" />
        <button class="mini primario" data-acao="novo-cliente">+ Novo cliente</button>
      </div>
      <div class="rolagem alta">
        <table>
          <thead><tr><th>Código</th><th>Cliente</th><th>Grupo</th><th>Vendedor</th>
            <th class="n">Pedidos</th><th class="n">Valor</th><th>Último pedido</th>
            <th class="acoes-col">Ações</th></tr></thead>
          <tbody>${lista.slice(0, 300).map((c) => `<tr class="${c.ativo ? '' : 'apagada'}">
            <td class="mono">${esc(c.codigo)}</td>
            <td>${esc(c.razao_social)}
              ${c.nome_fantasia ? `<span class="sub">${esc(c.nome_fantasia)}</span>` : ''}
              ${c.ativo ? '' : ' ' + pastilha('inativo', '')}
              ${estado.clientes.edicoes[c.codigo] ? ' ' + pastilha('editado', 'aviso') : ''}
            </td>
            <td>${esc(c.grupo ?? '—')}</td>
            <td>${esc(c.vendedor ?? '—')}</td>
            <td class="n mono">${num(c.pedidos)}</td>
            <td class="n mono">${moeda(c.valor)}</td>
            <td class="mono">${dataBR(c.ultimo)}</td>
            <td class="acoes-col">
              <button class="mini" data-acao="ver-cliente" data-codigo="${esc(c.codigo)}">Abrir</button>
              <button class="mini" data-acao="editar-cliente" data-codigo="${esc(c.codigo)}">Editar</button>
              <button class="mini perigo" data-acao="excluir-cliente" data-codigo="${esc(c.codigo)}">
                ${c.pedidos > 0 ? 'Inativar' : 'Excluir'}</button>
            </td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`,
      `<small>${lista.length > 300 ? '300 primeiros de ' + num(lista.length) : num(lista.length) + ' clientes'}</small>`)}`;
}

/* ---------------------------------------------------- ficha e formulário -- */

function gavetaCliente() {
  const codigo = estado.clienteAberto;
  const c = acharCliente(codigo);
  if (!c) return '';
  const pedidos = ITENS.filter((i) => i.cliente === c.razao_social);
  const emAberto = pedidos.filter(emCarteira);

  const linha = (rotulo, valor) => valor
    ? `<tr><td>${esc(rotulo)}</td><td class="n">${esc(valor)}</td></tr>` : '';

  return `
    <div class="gaveta-fundo" data-acao="fechar-cliente"></div>
    <aside class="gaveta" role="dialog" aria-label="Cliente ${esc(c.razao_social)}">
      <header class="gaveta-cab">
        <div>
          <span class="gaveta-op mono">${esc(c.codigo)}</span>
          <h2>${esc(c.razao_social)}</h2>
          <p>${esc(c.nome_fantasia || c.grupo || '—')}${c.vendedor ? ` · ${esc(c.vendedor)}` : ''}</p>
        </div>
        <button class="fechar" data-acao="fechar-cliente" aria-label="Fechar">×</button>
      </header>
      <div class="gaveta-corpo">
        <div class="faixa-ind compacta">
          ${indicador('Pedidos', num(c.pedidos))}
          ${indicador('Valor', moedaCurta(c.valor), moeda(c.valor))}
          ${indicador('Em aberto', num(emAberto.length),
            emAberto.length ? moeda(emAberto.reduce((s, i) => s + i.total, 0)) : 'nada pendente')}
        </div>

        <h3>Ficha</h3>
        <table class="compacta">
          <tbody>
            ${linha('Grupo', c.grupo)}
            ${linha('Vendedor', c.vendedor)}
            ${linha('CNPJ', c.cnpj)}
            ${linha('CPF', c.cpf)}
            ${linha('Inscrição estadual', c.inscricao_estadual)}
            ${linha('Contato', c.contato)}
            ${linha('Telefone', c.telefone)}
            ${linha('WhatsApp', c.whatsapp)}
            ${linha('E-mail', c.email)}
            ${linha('Endereço', [c.endereco, c.numero, c.bairro].filter(Boolean).join(', '))}
            ${linha('Cidade', [c.cidade, c.uf].filter(Boolean).join('/'))}
            ${linha('CEP', c.cep)}
            ${linha('Condição de pagamento', c.condicao_pagamento)}
            ${linha('Prazo', c.prazo_pagamento_dias ? c.prazo_pagamento_dias + ' dias' : '')}
            ${linha('Limite de crédito', c.limite_credito ? moeda(c.limite_credito) : '')}
            ${linha('Situação', c.ativo ? 'Ativo' : 'Inativo')}
          </tbody>
        </table>
        ${c.observacao ? `<h3>Observação</h3><p class="ajuda">${esc(c.observacao)}</p>` : ''}

        <h3>Últimos pedidos</h3>
        ${pedidos.length === 0 ? vazio('Nenhum pedido para este cliente.') : `
          <table class="compacta">
            <thead><tr><th>Entrega</th><th>Produto</th><th class="n">Peças</th><th class="n">Valor</th></tr></thead>
            <tbody>${pedidos.slice(0, 12).map((i) => `<tr>
              <td class="mono">${dataBR(i.dataEntrega)}</td>
              <td>${esc(i.produto.slice(0, 30))}</td>
              <td class="n mono">${num(i.qtd)}</td>
              <td class="n mono">${moeda(i.total)}</td>
            </tr>`).join('')}</tbody>
          </table>`}

        <div class="gaveta-acoes">
          <button class="mini" data-acao="editar-cliente" data-codigo="${esc(c.codigo)}">Editar</button>
          <button class="mini perigo" data-acao="excluir-cliente" data-codigo="${esc(c.codigo)}">
            ${c.pedidos > 0 ? 'Inativar' : 'Excluir'}</button>
        </div>
      </div>
    </aside>`;
}

function gavetaFormulario() {
  const codigo = estado.clienteEditando;
  const novo = codigo === '';
  const base = novo ? { codigo: proximoCodigoCliente(), ativo: 1 } : acharCliente(codigo);
  if (!base) return '';
  // O rascunho só vale para o formulário que está aberto.
  const c = estado.rascunho && estado.rascunho.codigo === base.codigo
    ? { ...base, ...estado.rascunho.dados }
    : base;

  const campo = (def) => {
    const valor = c[def.chave] ?? '';
    const id = 'cli-' + def.chave;
    if (def.area) {
      return `<label class="campo largo" for="${id}"><span>${esc(def.rotulo)}</span>
        <textarea id="${id}" name="${def.chave}" rows="2">${esc(valor)}</textarea></label>`;
    }
    if (def.tipo === 'lista') {
      const opcoes = def.opcoes();
      return `<label class="campo" for="${id}"><span>${esc(def.rotulo)}</span>
        <input id="${id}" name="${def.chave}" list="lista-${def.chave}" value="${esc(valor)}" />
        <datalist id="lista-${def.chave}">${opcoes.map((o) =>
          `<option value="${esc(o)}"></option>`).join('')}</datalist></label>`;
    }
    const tipo = def.tipo === 'numero' ? 'number' : def.tipo === 'email' ? 'email' : 'text';
    return `<label class="campo${def.largo ? ' largo' : ''}" for="${id}">
      <span>${esc(def.rotulo)}${def.exigido ? ' *' : ''}</span>
      <input id="${id}" name="${def.chave}" type="${tipo}" value="${esc(valor)}"
             ${def.exigido ? 'required' : ''} ${def.tipo === 'numero' ? 'step="any" min="0"' : ''} /></label>`;
  };

  return `
    <div class="gaveta-fundo" data-acao="cancelar-cliente"></div>
    <aside class="gaveta larga" role="dialog" aria-label="${novo ? 'Novo cliente' : 'Editar cliente'}">
      <form data-form="cliente" data-codigo="${esc(c.codigo)}" data-novo="${novo ? '1' : ''}">
        <header class="gaveta-cab">
          <div>
            <span class="gaveta-op mono">${esc(c.codigo)}</span>
            <h2>${novo ? 'Novo cliente' : 'Editar cliente'}</h2>
            <p>${novo ? 'O código é gerado pelo sistema' : esc(c.razao_social)}</p>
          </div>
          <button type="button" class="fechar" data-acao="cancelar-cliente" aria-label="Fechar">×</button>
        </header>
        <div class="gaveta-corpo">
          ${estado.falha ? `<div class="aviso-erro">${esc(estado.falha)}</div>` : ''}
          <div class="campos">${CAMPOS_CLIENTE.map(campo).join('')}</div>
        </div>
        <footer class="gaveta-pe">
          <button type="button" class="mini" data-acao="cancelar-cliente">Cancelar</button>
          <button type="submit" class="mini primario">${novo ? 'Criar cliente' : 'Salvar alterações'}</button>
        </footer>
      </form>
    </aside>`;
}

function telaProdutos() {
  const termo = (estado.filtros.busca ?? '').trim().toLowerCase();
  const lista = DADOS.cadastroProdutos
    .map(([codigo, descricao, grupo, linha, preco, vezes, pecas, valor, ficha]) =>
      ({ codigo, descricao, grupo, linha, preco, vezes, pecas, valor, ficha }))
    .filter((p) => !termo || `${p.descricao} ${p.codigo}`.toLowerCase().includes(termo));

  const semFicha = DADOS.cadastroProdutos.filter((p) => !p[8]).length;

  return `
    ${cabecalho('Produtos', 'Código automático pelo grupo — AVE-000001 diz o que é antes de abrir')}
    <div class="faixa-ind">
      ${indicador('Produtos', num(DADOS.cadastroProdutos.length))}
      ${indicador('Grupos', num(GP.length))}
      ${indicador('Sem ficha técnica', num(semFicha), 'entram na Fase 2', semFicha ? 'aviso' : 'bom')}
      ${indicador('Modelos', num(DADOS.contagem.modelos))}
    </div>
    ${painel('Cadastro', `
      <div class="filtros">
        <input type="search" placeholder="Produto ou código" value="${esc(estado.filtros.busca)}"
          data-filtro="busca" />
      </div>
      <div class="rolagem alta">
        <table>
          <thead><tr><th>Código</th><th>Produto</th><th>Grupo</th><th>Linha</th>
            <th class="n">Vezes vendido</th><th class="n">Peças</th><th class="n">Valor</th>
            <th>Ficha técnica</th></tr></thead>
          <tbody>${lista.slice(0, 300).map((p) => `<tr>
            <td class="mono">${esc(p.codigo)}</td>
            <td>${esc(p.descricao)}</td>
            <td>${esc(p.grupo ?? '—')}</td>
            <td>${esc(p.linha ?? '—')}</td>
            <td class="n mono">${num(p.vezes)}</td>
            <td class="n mono">${num(p.pecas)}</td>
            <td class="n mono">${moeda(p.valor)}</td>
            <td>${p.ficha ? pastilha('ativa', 'ok') : pastilha('pendente', 'aviso')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`)}`;
}

/* ==========================================================================
   5. ENGENHARIA — o catálogo de operações que a Fase 2 vai usar
   ========================================================================== */
function telaEngenharia() {
  return `
    ${cabecalho('Engenharia', 'Catálogo de operações e centros de trabalho — a base do roteiro por produto')}

    ${painel('Operações', `
      <p class="ajuda">Corte e embalagem têm custo fixo por peça em todo produto. Silk e costura
      ficam zerados aqui de propósito: variam de R$ 0,65 a R$ 7,71 conforme a peça, e quem define
      é o roteiro do produto — não o catálogo.</p>
      <div class="rolagem">
        <table>
          <thead><tr><th>Código</th><th>Operação</th><th>Centro de trabalho</th>
            <th class="n">Custo por peça</th><th class="n">Ordem</th></tr></thead>
          <tbody>${DADOS.operacoes.map(([codigo, nome, centro, custo, ordem]) => `<tr>
            <td class="mono">${esc(codigo)}</td>
            <td>${esc(nome)}</td>
            <td>${esc(centro ?? '—')}</td>
            <td class="n mono">${custo > 0 ? moeda(custo) : '<span class="sub">pelo roteiro</span>'}</td>
            <td class="n mono">${ordem}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`)}

    ${painel('Mão de obra por grupo, colhida da planilha', `
      <p class="ajuda">Mediana do custo por peça em ${num(ITENS.length)} itens migrados. É a regra
      que a Conserv já pratica — e a prova de que o roteiro precisa ser por produto.</p>
      <div class="rolagem">
        <table>
          <thead><tr><th>Grupo</th><th class="n">Corte</th><th class="n">Silk</th>
            <th class="n">Costura</th><th class="n">Embalagem</th><th class="n">Total por peça</th></tr></thead>
          <tbody>${[
            ['AVENTAL', 0.25, 1.00, 1.50, 0.50], ['CAMISETA', 0.25, 1.00, 1.50, 0.50],
            ['CAPA', 0.25, 1.00, 1.50, 0.50], ['FAIXA', 0.25, 1.00, 1.20, 0.50],
            ['SACO', 0.25, 0.65, 0.80, 0.50], ['NECESSAIRE', 0.25, 1.50, 1.50, 0.50],
            ['SACOLA', 0.25, 1.50, 1.50, 0.50], ['CALÇA', 0.25, 1.00, 3.00, 0.50],
            ['KIMONO', 0.25, 1.50, 5.20, 0.50], ['JALECO', 0.25, 1.25, 7.71, 0.50],
          ].map(([g, c, s, co, e]) => `<tr>
            <td>${esc(g)}</td><td class="n mono">${dec(c)}</td><td class="n mono">${dec(s)}</td>
            <td class="n mono">${dec(co)}</td><td class="n mono">${dec(e)}</td>
            <td class="n mono forte">${dec(c + s + co + e)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`)}`;
}

/* ==========================================================================
   6. MIGRAÇÃO — o relatório da importação
   ========================================================================== */
function telaMigracao() {
  const total = DADOS.importacoes.reduce((a, i) => ({
    lidas: a.lidas + i.lidas, ok: a.ok + i.ok, erro: a.erro + i.erro,
  }), { lidas: 0, ok: 0, erro: 0 });

  return `
    ${cabecalho('Migração da planilha', 'Prévia, validação e importação — e o que foi recusado, com o motivo')}

    <div class="faixa-ind">
      ${indicador('Linhas lidas', num(total.lidas))}
      ${indicador('Importadas', num(total.ok), 'viraram item de pedido', 'bom')}
      ${indicador('Recusadas', num(total.erro), 'com motivo registrado', total.erro ? 'aviso' : 'bom')}
      ${indicador('Tabelas no banco', num(DADOS.contagem.tabelas), 'do modelo normalizado')}
    </div>

    ${painel('Importações', `
      <div class="rolagem">
        <table>
          <thead><tr><th>Arquivo</th><th>Aba</th><th class="n">Lidas</th><th class="n">OK</th>
            <th class="n">Recusadas</th><th>Situação</th></tr></thead>
          <tbody>${DADOS.importacoes.map((i) => `<tr>
            <td class="mono">${esc(i.arquivo)}</td>
            <td>${esc(i.aba)}</td>
            <td class="n mono">${num(i.lidas)}</td>
            <td class="n mono">${num(i.ok)}</td>
            <td class="n mono">${i.erro ? pastilha(String(i.erro), 'aviso') : '—'}</td>
            <td>${pastilha(i.status, 'ok')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`)}

    ${painel('Linhas recusadas, com o motivo', `
      <p class="ajuda">As duas recusadas na aba CARTEIRA são o rodapé de <code>SUBTOTAL</code> da
      própria planilha — e era essa célula que fazia a primeira conferência acusar 24.489 peças
      a mais do que existiam.</p>
      <div class="rolagem">
        <table>
          <thead><tr><th>Aba</th><th class="n">Linha</th><th>Motivo</th></tr></thead>
          <tbody>${DADOS.importacoes.flatMap((imp) => imp.erros.map((e) => `<tr>
            <td>${esc(imp.aba)}</td>
            <td class="n mono">${e.linha}</td>
            <td><span class="sub">${esc(e.erros.join(' · '))}</span></td>
          </tr>`)).join('') || '<tr><td colspan="3">Nenhuma.</td></tr>'}</tbody>
        </table>
      </div>`)}

    ${painel('Conferência contra a origem', `
      <div class="rolagem">
        <table>
          <thead><tr><th>Medida</th><th class="n">Na planilha</th><th class="n">No banco</th><th>Confere</th></tr></thead>
          <tbody>
            <tr><td>Valor da carteira (QTD × VALOR UNID)</td>
              <td class="n mono">R$ 6.026.593,37</td><td class="n mono">R$ 6.026.593,37</td>
              <td>${pastilha('centavo a centavo', 'ok')}</td></tr>
            <tr><td>Peças</td><td class="n mono">344.696</td><td class="n mono">344.696</td>
              <td>${pastilha('exato', 'ok')}</td></tr>
            <tr><td>Linhas de dados</td><td class="n mono">1.621</td><td class="n mono">1.621</td>
              <td>${pastilha('exato', 'ok')}</td></tr>
          </tbody>
        </table>
      </div>`, '<small>aba CARTEIRA</small>')}`;
}

/* ==========================================================================
   7. ACESSOS — perfis do §36
   ========================================================================== */
const VERBOS = ['VISUALIZAR', 'CRIAR', 'EDITAR', 'EXCLUIR', 'APROVAR', 'EXPORTAR'];

function telaAcessos() {
  const escolhido = estado.perfilAberto ?? DADOS.perfis[0].codigo;
  const perfil = DADOS.perfis.find((p) => p.codigo === escolhido) ?? DADOS.perfis[0];

  return `
    ${cabecalho('Perfis de acesso', 'Permissão por módulo e por verbo — quem não tem, não vê')}

    ${painel('Perfis', `
      <div class="fichas-perfil">
        ${DADOS.perfis.map((p) => `
          <button class="ficha-perfil${p.codigo === perfil.codigo ? ' ativo' : ''}"
                  data-acao="perfil" data-perfil="${esc(p.codigo)}">
            <b>${esc(p.nome)}</b>
            <span>${Object.keys(p.permissoes).length} módulos</span>
          </button>`).join('')}
      </div>`)}

    ${painel(`O que ${perfil.nome} alcança`, `
      <p class="ajuda">${esc(perfil.descricao ?? '')}</p>
      <div class="rolagem">
        <table>
          <thead><tr><th>Módulo</th>${VERBOS.map((v) =>
            `<th class="n">${esc(v.slice(0, 3))}</th>`).join('')}</tr></thead>
          <tbody>${DADOS.modulos.map((m) => {
            const tem = perfil.permissoes[m] ?? [];
            if (tem.length === 0) return `<tr class="apagada"><td>${esc(m)}</td>${
              VERBOS.map(() => '<td class="n sub">—</td>').join('')}</tr>`;
            return `<tr><td>${esc(m)}</td>${VERBOS.map((v) =>
              `<td class="n">${tem.includes(v) ? '<b class="sim">●</b>' : '<span class="sub">·</span>'}</td>`
            ).join('')}</tr>`;
          }).join('')}</tbody>
        </table>
      </div>`)}`;
}

/* ==========================================================================
   GAVETA DO PEDIDO
   ========================================================================== */
function gavetaPedido() {
  const codigo = estado.pedidoAberto;
  const itens = ITENS.filter((i) => i.pedido === codigo);
  if (itens.length === 0) return '';
  const p = itens[0];
  const valor = itens.reduce((s, i) => s + i.total, 0);
  const pecas = itens.reduce((s, i) => s + i.qtd, 0);
  const f = farol(p);

  return `
    <div class="gaveta-fundo" data-acao="fechar-gaveta"></div>
    <aside class="gaveta" role="dialog" aria-label="Pedido ${esc(p.numero)}">
      <header class="gaveta-cab">
        <div>
          <span class="gaveta-op mono">${esc(p.pedido)}</span>
          <h2>${esc(p.cliente)}</h2>
          <p>Pedido ${esc(p.numero ?? '—')} · ${esc(p.vendedor)} · ${esc(p.grupoCliente)}</p>
        </div>
        <button class="fechar" data-acao="fechar-gaveta" aria-label="Fechar">×</button>
      </header>
      <div class="gaveta-corpo">
        <div class="faixa-ind compacta">
          ${indicador('Peças', num(pecas))}
          ${indicador('Valor', moeda(valor))}
          ${indicador('Prazo', f.rotulo, '', f.cor === 'ruim' ? 'ruim' : f.cor === 'aviso' ? 'aviso' : 'bom')}
        </div>

        <h3>Datas</h3>
        <table class="compacta">
          <tbody>
            <tr><td>Pedido</td><td class="n mono">${dataBR(p.dataPedido)}</td></tr>
            <tr><td>Entrega combinada</td><td class="n mono">${dataBR(p.dataEntrega)}</td></tr>
            <tr><td>Situação</td><td class="n">${pastilha(ROTULO_STATUS[p.status] ?? p.status,
              TOM_STATUS[p.status] ?? '')}</td></tr>
          </tbody>
        </table>

        <h3>Itens (${itens.length})</h3>
        <table class="compacta">
          <thead><tr><th>Produto</th><th class="n">Qtd</th><th class="n">Preço</th><th class="n">Total</th></tr></thead>
          <tbody>${itens.map((i) => `<tr>
            <td>${esc(i.produto)}<span class="sub mono">${esc(i.produtoCodigo)}</span></td>
            <td class="n mono">${num(i.qtd)}</td>
            <td class="n mono">${moeda(i.preco)}</td>
            <td class="n mono">${moeda(i.total)}</td>
          </tr>`).join('')}
          <tr class="total"><td>Total</td><td class="n mono">${num(pecas)}</td><td></td>
            <td class="n mono">${moeda(valor)}</td></tr></tbody>
        </table>

        <h3>Produção</h3>
        <p class="ajuda">A ordem de produção nasce na Fase 5, com as operações do roteiro deste
        produto — e só com elas. É o que substitui as colunas fixas de corte, silk, costura e
        embalagem da planilha.</p>
      </div>
    </aside>`;
}

/* ==========================================================================
   ENTRADA
   ========================================================================== */
function telaLogin() {
  return `
    <div class="portao">
      <form class="portao-caixa" data-form="entrar">
        <b class="portao-marca">CONSERV</b>
        <span class="portao-sub">ERP industrial + PCP · versão teste da Fase 1</span>
        ${estado.erro ? `<p class="portao-erro">${esc(estado.erro)}</p>` : ''}
        <label for="email">E-mail
          <input id="email" name="email" type="email" value="admin@conserv.com.br" required
                 autocomplete="username" />
        </label>
        <label for="senha">Senha
          <input id="senha" name="senha" type="password" required autocomplete="current-password" />
        </label>
        <button class="portao-botao" type="submit">Entrar</button>

        <div class="portao-contas">
          <span class="portao-titulo">Contas para experimentar</span>
          ${CONTAS.map((c) => `
            <button type="button" class="portao-conta" data-acao="preencher"
                    data-email="${esc(c.email)}" data-senha="${esc(c.senha)}">
              <b>${esc(c.nome)}</b>
              <span>${esc(c.email)} · senha <code>${esc(c.senha)}</code></span>
              <span class="sub">${c.provisoria
                ? 'senha provisória — o sistema exige a troca na entrada'
                : `perfil ${c.perfil}`}</span>
            </button>`).join('')}
        </div>
        <p class="portao-nota">
          Demonstração: a senha é conferida neste navegador, porque a página inteira está no seu
          computador. No sistema a senha vira hash bcrypt no servidor e o log guarda o evento,
          nunca a senha.
        </p>
      </form>
    </div>`;
}

function telaPrimeiroAcesso() {
  const nome = estado.sessao?.nome?.split(' ')[0] ?? '';
  return `
    <div class="portao">
      <form class="portao-caixa" data-form="definir-senha">
        <b class="portao-marca">Bem-vindo, ${esc(nome)}</b>
        <span class="portao-sub">
          Você entrou com uma senha provisória. Escolha a sua para continuar — ela não fica
          visível para ninguém, nem para quem administra o sistema.
        </span>
        ${estado.erro ? `<p class="portao-erro">${esc(estado.erro)}</p>` : ''}
        <label for="atual">Senha provisória
          <input id="atual" name="atual" type="password" required autocomplete="current-password" />
        </label>
        <label for="nova">Nova senha (mínimo de 6 caracteres)
          <input id="nova" name="nova" type="password" required autocomplete="new-password" />
        </label>
        <label for="rep">Repita a nova senha
          <input id="rep" name="rep" type="password" required autocomplete="new-password" />
        </label>
        <button class="portao-botao" type="submit">Definir minha senha e entrar</button>
        <button type="button" class="portao-sair" data-acao="sair">Sair</button>
      </form>
    </div>`;
}

/* ==========================================================================
   MOLDURA
   ========================================================================== */
const TELAS = {
  painel: { nome: 'Painel', grupo: 'Visão geral', render: telaPainel },
  carteira: { nome: 'Carteira', grupo: 'Visão geral', render: telaCarteira },
  clientes: { nome: 'Clientes', grupo: 'Cadastros', render: telaClientes },
  produtos: { nome: 'Produtos', grupo: 'Cadastros', render: telaProdutos },
  engenharia: { nome: 'Engenharia', grupo: 'Cadastros', render: telaEngenharia },
  migracao: { nome: 'Migração', grupo: 'Sistema', render: telaMigracao },
  acessos: { nome: 'Perfis de acesso', grupo: 'Sistema', render: telaAcessos },
};

function navegacao() {
  const grupos = [];
  for (const [id, tela] of Object.entries(TELAS)) {
    let g = grupos.find((x) => x.nome === tela.grupo);
    if (!g) grupos.push((g = { nome: tela.grupo, itens: [] }));
    g.itens.push({ id, ...tela });
  }
  return grupos.map((g) => `
    <div class="nav-grupo">
      <span class="nav-titulo">${esc(g.nome)}</span>
      ${g.itens.map((i) => `<button class="nav-item${estado.tela === i.id ? ' ativo' : ''}"
        data-acao="tela" data-tela="${i.id}">${esc(i.nome)}</button>`).join('')}
    </div>`).join('');
}

function render() {
  const app = document.querySelector('.app');
  const portao = document.getElementById('portao');

  if (!estado.sessao || estado.trocarSenha) {
    app.hidden = true;
    portao.hidden = false;
    portao.innerHTML = estado.trocarSenha ? telaPrimeiroAcesso() : telaLogin();
    portao.querySelector('input[name=senha], input[name=atual]')?.focus();
    return;
  }
  app.hidden = false;
  portao.hidden = true;
  portao.innerHTML = '';

  document.getElementById('nav').innerHTML = navegacao();
  document.getElementById('sessao').innerHTML = `
    <div class="sessao"><b>${esc(estado.sessao.nome)}</b><span>${esc(estado.sessao.perfil)}</span></div>
    <button data-acao="sair">Sair</button>`;
  document.getElementById('area').innerHTML = TELAS[estado.tela].render();
  document.getElementById('gaveta').innerHTML =
      estado.clienteEditando !== null ? gavetaFormulario()
    : estado.clienteAberto ? gavetaCliente()
    : estado.pedidoAberto ? gavetaPedido()
    : '';
  document.querySelector('.gaveta input, .gaveta textarea')?.focus();
  document.getElementById('area').scrollTop = 0;
}

/* ------------------------------------------------------------ interação -- */
document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('[data-form]');
  if (!form) return;
  ev.preventDefault();

  if (form.dataset.form === 'entrar') {
    const email = form.email.value.trim().toLowerCase();
    const conta = CONTAS.find((c) => c.email === email && c.senha === form.senha.value);
    if (!conta) {
      // Mesma resposta para e-mail inexistente e senha errada, como no sistema.
      estado.erro = 'E-mail ou senha inválidos.';
      render();
      return;
    }
    estado.erro = '';
    estado.sessao = { email: conta.email, nome: conta.nome, perfil: conta.perfil };
    estado.trocarSenha = conta.provisoria;
    estado.tela = 'painel';
    salvar();
    render();
    return;
  }

  if (form.dataset.form === 'cliente') {
    salvarCliente(form);
    return;
  }

  if (form.dataset.form === 'definir-senha') {
    const conta = CONTAS.find((c) => c.email === estado.sessao?.email);
    const nova = form.nova.value;
    estado.erro =
      form.atual.value !== conta?.senha ? 'A senha provisória não confere.'
      : nova.length < 6 ? 'A nova senha precisa de ao menos 6 caracteres.'
      : nova !== form.rep.value ? 'A repetição não confere com a nova senha.'
      : nova === conta.senha ? 'A nova senha precisa ser diferente da provisória.'
      : '';
    if (estado.erro) { render(); return; }
    conta.senha = nova;
    conta.provisoria = false;
    estado.trocarSenha = false;
    salvar();
    render();
  }
});

document.addEventListener('click', (ev) => {
  const preencher = ev.target.closest('[data-acao="preencher"]');
  if (preencher) {
    const form = preencher.closest('form');
    form.email.value = preencher.dataset.email;
    form.senha.value = preencher.dataset.senha;
    form.senha.focus();
    return;
  }

  const alvo = ev.target.closest('[data-acao]');
  if (!alvo) return;
  const acao = alvo.dataset.acao;

  if (acao === 'sair') {
    estado.sessao = null; estado.trocarSenha = false; estado.erro = '';
    salvar(); render();
  } else if (acao === 'tela') {
    estado.tela = alvo.dataset.tela;
    estado.pedidoAberto = null;
    estado.clienteAberto = null;
    estado.clienteEditando = null;
    estado.rascunho = null;
    estado.falha = '';
    estado.filtros.busca = '';
    render();
  } else if (acao === 'abrir-pedido') {
    estado.pedidoAberto = alvo.dataset.pedido;
    render();
  } else if (acao === 'fechar-gaveta') {
    estado.pedidoAberto = null;
    render();
  } else if (acao === 'perfil') {
    estado.perfilAberto = alvo.dataset.perfil;
    render();
  } else if (acao === 'limpar-filtros') {
    estado.filtros = padrao().filtros;
    render();
  } else if (acao === 'periodo') {
    estado.painel.periodo = alvo.dataset.periodo;
    estado.painel.de = '';
    estado.painel.ate = '';
    render();
  } else if (acao === 'limpar-painel') {
    estado.painel = padrao().painel;
    render();
  } else if (acao === 'novo-cliente') {
    estado.clienteEditando = '';
    estado.clienteAberto = null;
    estado.rascunho = null;
    estado.falha = '';
    render();
  } else if (acao === 'ver-cliente') {
    estado.clienteAberto = alvo.dataset.codigo;
    estado.clienteEditando = null;
    render();
  } else if (acao === 'editar-cliente') {
    estado.clienteEditando = alvo.dataset.codigo;
    estado.clienteAberto = null;
    estado.rascunho = null;
    estado.falha = '';
    render();
  } else if (acao === 'cancelar-cliente') {
    estado.clienteEditando = null;
    estado.rascunho = null;
    estado.falha = '';
    render();
  } else if (acao === 'fechar-cliente') {
    estado.clienteAberto = null;
    render();
  } else if (acao === 'excluir-cliente') {
    excluirCliente(alvo.dataset.codigo);
  } else if (acao === 'tema') {
    const atual = document.documentElement.dataset.tema;
    const novo = atual === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.dataset.tema = novo;
    try { localStorage.setItem(CHAVE + '.tema', novo); } catch { /* sem armazenamento */ }
  }
});

/**
 * Gravar o cliente.
 *
 * Razão social é o mínimo, e não pode repetir — dois cadastros com o mesmo
 * nome é exatamente o problema que a tela de qualidade existe para limpar.
 */
function salvarCliente(form) {
  const dados = {};
  for (const def of CAMPOS_CLIENTE) {
    const bruto = form.elements[def.chave]?.value?.trim() ?? '';
    dados[def.chave] = def.tipo === 'numero' ? (Number(bruto) || 0) : bruto;
  }
  const codigo = form.dataset.codigo;
  const novo = form.dataset.novo === '1';
  // Guardado antes de validar: se a validação recusar, o formulário volta
  // com o que a pessoa escreveu, não em branco.
  estado.rascunho = { codigo, dados };

  if (!dados.razao_social) {
    estado.falha = 'Informe a razão social.';
    render();
    return;
  }
  const repetido = clientesLista().find((c) =>
    c.codigo !== codigo &&
    c.razao_social.toLocaleUpperCase('pt-BR') === dados.razao_social.toLocaleUpperCase('pt-BR'));
  if (repetido) {
    estado.falha = `Já existe o cliente "${repetido.razao_social}" (${repetido.codigo}).`;
    render();
    return;
  }

  if (novo) {
    estado.clientes.novos.unshift({ codigo, ...dados, ativo: 1 });
  } else {
    estado.clientes.edicoes[codigo] = { ...(estado.clientes.edicoes[codigo] ?? {}), ...dados };
  }
  estado.falha = '';
  estado.rascunho = null;
  estado.clienteEditando = null;
  estado.clienteAberto = codigo;
  salvar();
  render();
}

/**
 * Cliente com pedido vira inativo; sem pedido, sai da lista.
 *
 * Apagar quem tem histórico deixaria pedido órfão — a mesma regra que o banco
 * do sistema aplica com ON DELETE RESTRICT.
 */
function excluirCliente(codigo) {
  const c = acharCliente(codigo);
  if (!c) return;

  if (c.pedidos > 0) {
    if (!confirm(`"${c.razao_social}" tem ${c.pedidos} pedido(s).\n\n` +
                 'Cadastro com histórico não é apagado: ele fica inativo e some das listas ' +
                 'de escolha, mas os pedidos continuam apontando para ele. Inativar?')) return;
    const jaInativo = estado.clientes.inativos.includes(codigo);
    estado.clientes.inativos = jaInativo
      ? estado.clientes.inativos.filter((x) => x !== codigo)
      : [...estado.clientes.inativos, codigo];
  } else {
    if (!confirm(`Excluir "${c.razao_social}"?\n\nNão tem pedido nenhum, então some de vez.`)) return;
    const eraNovo = estado.clientes.novos.some((x) => x.codigo === codigo);
    if (eraNovo) {
      estado.clientes.novos = estado.clientes.novos.filter((x) => x.codigo !== codigo);
    } else {
      estado.clientes.inativos = [...new Set([...estado.clientes.inativos, codigo])];
    }
    delete estado.clientes.edicoes[codigo];
  }
  estado.clienteAberto = null;
  estado.clienteEditando = null;
  salvar();
  render();
}

document.addEventListener('input', (ev) => {
  const campo = ev.target.closest('[data-filtro]');
  if (!campo) return;
  estado.filtros[campo.dataset.filtro] = campo.value;
  const foco = campo.dataset.filtro;
  render();
  const devolver = document.querySelector(`[data-filtro="${foco}"]`);
  if (devolver) { devolver.focus(); devolver.setSelectionRange?.(9999, 9999); }
});

document.addEventListener('change', (ev) => {
  const campo = ev.target.closest('select[data-filtro]');
  if (campo) {
    estado.filtros[campo.dataset.filtro] = campo.value;
    render();
    return;
  }
  const doPainel = ev.target.closest('[data-painel]');
  if (!doPainel) return;
  const qual = doPainel.dataset.painel;
  estado.painel[qual] = doPainel.value;
  // Digitar uma data manda no botão de período: os dois não podem discordar.
  if (qual === 'de' || qual === 'ate') estado.painel.periodo = 'CUSTOM';
  render();
});

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (estado.clienteEditando !== null) {
    estado.clienteEditando = null; estado.rascunho = null; estado.falha = ''; render();
  }
  else if (estado.clienteAberto) { estado.clienteAberto = null; render(); }
  else if (estado.pedidoAberto) { estado.pedidoAberto = null; render(); }
});

/* dica flutuante do gráfico de meses */
const dica = document.getElementById('dica');
document.addEventListener('mouseover', (ev) => {
  const alvo = ev.target.closest('[data-dica]');
  if (!alvo) return;
  dica.textContent = alvo.dataset.dica;
  dica.hidden = false;
});
document.addEventListener('mousemove', (ev) => {
  if (dica.hidden) return;
  dica.style.left = Math.min(ev.clientX + 14, window.innerWidth - dica.offsetWidth - 12) + 'px';
  dica.style.top = Math.max(8, ev.clientY - dica.offsetHeight - 12) + 'px';
});
document.addEventListener('mouseout', (ev) => {
  if (ev.target.closest('[data-dica]')) dica.hidden = true;
});

try {
  const tema = localStorage.getItem(CHAVE + '.tema');
  if (tema) document.documentElement.dataset.tema = tema;
} catch { /* sem armazenamento: usa o tema do sistema */ }

render();

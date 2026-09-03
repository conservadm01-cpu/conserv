import ExcelJS from 'exceljs';
import { getDb } from '../db/index.js';
import { limpar, chave, maiuscula } from '../lib/text.js';
import { toNumber, round2 } from '../lib/numbers.js';
import { toISODate } from '../lib/dates.js';
import { badRequest } from '../lib/errors.js';
import { abrirOrdem } from '../services/producao.js';

/**
 * Mapeamento entre os cabeçalhos usados nas planilhas da Conserv e os campos do ERP.
 * A mesma informação aparece com nomes diferentes em cada aba ("PEDIDO"/"Nº PEDIDO",
 * "QTD"/"QUANTIDADE"), então cada campo aceita várias grafias.
 */
const COLUNAS = {
  vendedor: ['VENDEDOR'],
  numero: ['PEDIDO', 'N PEDIDO', 'NO PEDIDO', 'NUM PEDIDO'],
  data_pedido: ['DATA DO PEDIDO', 'DATA DE ENTRADA', 'DATA PEDIDO', 'DATA ENTRADA'],
  categoria: ['CATEGORIA', 'GRUPO DE CLIENTE'],
  cliente: ['CLIENTE'],
  produto: ['PRODUTO'],
  grupo: ['GRUPO'],
  linha: ['LINHA'],
  quantidade: ['QTD', 'QUANTIDADE'],
  preco: ['VALOR UNID', 'PRECO UNITARIO', 'VALOR UNITARIO', 'PRECO UNIT'],
  total: ['TOTAL'],
  liquidacao: ['LIQUIDACAO'],
  data_entrega: ['DATA ENTREGA', 'DATA DE ENTREGA'],
  materia_prima: ['MATERIA PRIMA'],
  corte: ['CORTE', 'MO CORTE'],
  silk: ['SILK', 'MO SILK'],
  costura: ['COSTURA', 'MO COSTURA'],
  embalagem: ['EMBALAGEM', 'MO EMBALAGEM'],
  nf: ['NF', 'NOTA FISCAL'],
  entrega: ['ENTREGA'],
  status: ['STATUS'],
};

/** Colunas de MO que trazem valor em R$ (aba "PCP + MO"), não marcação "OK". */
const COLUNAS_MO = {
  corte: 'CORTE',
  silk: 'SILK',
  costura: 'COSTURA',
  embalagem: 'EMBALAGEM',
};

/** Localiza a linha de cabeçalho e devolve {indices, headerRow}. */
function detectarCabecalho(sheet, maxLinhas = 12) {
  for (let r = 1; r <= Math.min(maxLinhas, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    const celulas = [];
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const texto = chave(cell.value);
      if (texto) celulas.push({ col, texto });
    });
    const indices = {};
    for (const [campo, apelidos] of Object.entries(COLUNAS)) {
      const achado = celulas.find((c) => apelidos.includes(c.texto));
      if (achado) indices[campo] = achado.col;
    }
    // Cabeçalho válido é o que identifica cliente, produto e quantidade.
    if (indices.cliente && indices.produto && indices.quantidade) {
      return { indices, headerRow: r };
    }
  }
  return null;
}

/** Cache de "chave normalizada → id" para não consultar o banco a cada linha. */
function criarResolvedor(db, tabela, extras = () => ({})) {
  const cache = new Map();
  for (const row of db.prepare(`SELECT id, nome FROM ${tabela}`).all()) {
    cache.set(chave(row.nome), row.id);
  }
  return (nome) => {
    const k = chave(nome);
    if (!k) return null;
    if (cache.has(k)) return cache.get(k);
    const valores = { nome: maiuscula(nome), ...extras(nome) };
    const cols = Object.keys(valores);
    const info = db
      .prepare(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`)
      .run(valores);
    cache.set(k, info.lastInsertRowid);
    return info.lastInsertRowid;
  };
}

const LINHAS_VALIDAS = new Set(['LEVE', 'PESADA', 'AMBAS']);

/**
 * Importa uma planilha de carteira/PCP para o ERP.
 *
 * Cria os cadastros que faltarem (cliente, vendedor, produto, grupo, categoria),
 * grava pedidos e itens, e — quando `abrirOrdens` — abre a OP de cada item com o
 * roteiro já preenchido a partir das colunas de etapa e de custo de mão de obra.
 *
 * @param {string|Buffer} arquivo caminho ou buffer do .xlsx
 * @param {object} opts
 * @param {string[]} [opts.abas]  nomes das abas a importar (padrão: todas as reconhecíveis)
 * @param {boolean} [opts.abrirOrdens=true]
 * @param {boolean} [opts.simular=false]  processa e relata sem gravar
 */
export async function importarPlanilha(arquivo, opts = {}) {
  const { abas = null, abrirOrdens = true, simular = false } = opts;
  const db = getDb();

  const workbook = new ExcelJS.Workbook();
  if (Buffer.isBuffer(arquivo)) await workbook.xlsx.load(arquivo);
  else await workbook.xlsx.readFile(arquivo);

  const candidatas = workbook.worksheets.filter((s) => (abas ? abas.includes(s.name) : true));
  if (candidatas.length === 0) throw badRequest('Nenhuma aba encontrada na planilha');

  // A mesma venda aparece em várias abas. Processando primeiro as mais completas
  // (as que trazem custo de mão de obra e acompanhamento de etapa), a versão rica
  // do registro entra no ERP e as repetições nas outras abas são descartadas.
  const colunasMapeadas = (c) => Object.keys(c?.indices ?? {}).length;
  const alvos = candidatas
    .map((sheet) => ({ sheet, cabecalho: detectarCabecalho(sheet) }))
    .sort((a, b) => colunasMapeadas(b.cabecalho) - colunasMapeadas(a.cabecalho));

  const relatorio = {
    arquivo: Buffer.isBuffer(arquivo) ? '(upload)' : arquivo,
    simulacao: simular,
    abas: [],
    totais: { pedidos: 0, itens: 0, ordens: 0, clientes: 0, produtos: 0, ignoradas: 0, duplicadas: 0 },
    avisos: [],
  };

  const executar = db.transaction(() => {
    const resolverVendedor = criarResolvedor(db, 'vendedores');
    const resolverCategoria = criarResolvedor(db, 'categorias_cliente');
    const resolverGrupo = criarResolvedor(db, 'grupos_produto');

    const etapas = db.prepare(`SELECT * FROM etapas`).all();
    const etapaPorCodigo = new Map(etapas.map((e) => [e.codigo, e]));

    const antesClientes = db.prepare(`SELECT COUNT(*) AS n FROM clientes`).get().n;
    const antesProdutos = db.prepare(`SELECT COUNT(*) AS n FROM produtos`).get().n;

    for (const { sheet, cabecalho } of alvos) {
      if (!cabecalho) {
        relatorio.abas.push({ aba: sheet.name, importada: false, motivo: 'Cabeçalho não reconhecido' });
        continue;
      }
      const resumoAba = importarAba({
        db, sheet, cabecalho, etapaPorCodigo,
        resolverVendedor, resolverCategoria, resolverGrupo,
        abrirOrdens, relatorio,
      });
      relatorio.abas.push({ aba: sheet.name, importada: true, ...resumoAba });
    }

    relatorio.totais.clientes = db.prepare(`SELECT COUNT(*) AS n FROM clientes`).get().n - antesClientes;
    relatorio.totais.produtos = db.prepare(`SELECT COUNT(*) AS n FROM produtos`).get().n - antesProdutos;

    if (simular) throw new RollbackSimulacao();
  });

  try {
    executar();
  } catch (err) {
    if (!(err instanceof RollbackSimulacao)) throw err;
  }

  return relatorio;
}

class RollbackSimulacao extends Error {}

function importarAba(ctx) {
  const {
    db, sheet, cabecalho, etapaPorCodigo,
    resolverVendedor, resolverCategoria, resolverGrupo, abrirOrdens, relatorio,
  } = ctx;
  const { indices, headerRow } = cabecalho;

  const buscarCliente = db.prepare(`SELECT id FROM clientes WHERE nome = ?`);
  const inserirCliente = db.prepare(`INSERT INTO clientes (nome, categoria_id) VALUES (?, ?)`);
  const buscarProduto = db.prepare(`SELECT id FROM produtos WHERE descricao = ?`);
  const inserirProduto = db.prepare(
    `INSERT INTO produtos (descricao, grupo_id, linha, preco_padrao) VALUES (?, ?, ?, ?)`
  );
  const buscarPedido = db.prepare(
    `SELECT id FROM pedidos WHERE numero = ? AND cliente_id = ? AND data_pedido = ?`
  );
  const inserirPedido = db.prepare(
    `INSERT INTO pedidos (numero, cliente_id, vendedor_id, data_pedido, data_entrega, situacao, nota_fiscal)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const inserirItem = db.prepare(
    `INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario, liquidacao, data_entrega)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const contarItens = db.prepare(
    `SELECT COUNT(*) AS n FROM pedido_itens
     WHERE pedido_id = ? AND produto_id = ? AND quantidade = ? AND preco_unitario = ?`
  );
  // Uma aba pode repetir a mesma combinação de propósito (grades de tamanho, por exemplo).
  // Contamos quantas cópias já existiam antes desta aba e só descartamos até esse limite.
  const jaExistiam = new Map();
  const inseridosNestaAba = new Map();

  const resumo = { linhas: 0, pedidos: 0, itens: 0, ordens: 0, ignoradas: 0, duplicadas: 0 };
  const valor = (row, campo) => (indices[campo] ? row.getCell(indices[campo]).value : null);

  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const nomeCliente = limpar(valor(row, 'cliente'));
    const nomeProduto = limpar(valor(row, 'produto'));
    const quantidade = toNumber(valor(row, 'quantidade'));

    if (!nomeCliente || !nomeProduto || !quantidade || quantidade <= 0) {
      if (nomeCliente || nomeProduto) {
        resumo.ignoradas++;
        relatorio.totais.ignoradas++;
        if (relatorio.avisos.length < 50) {
          relatorio.avisos.push(
            `${sheet.name} linha ${r}: ignorada (cliente/produto/quantidade incompletos)`
          );
        }
      }
      continue;
    }
    resumo.linhas++;

    // --- cadastros ---------------------------------------------------------
    const categoriaId = resolverCategoria(valor(row, 'categoria'));
    const clienteNome = maiuscula(nomeCliente);
    let clienteId = buscarCliente.get(clienteNome)?.id;
    if (!clienteId) clienteId = inserirCliente.run(clienteNome, categoriaId).lastInsertRowid;
    else if (categoriaId) {
      db.prepare(`UPDATE clientes SET categoria_id = COALESCE(categoria_id, ?) WHERE id = ?`)
        .run(categoriaId, clienteId);
    }

    const grupoId = resolverGrupo(valor(row, 'grupo'));
    const linhaProduto = maiuscula(valor(row, 'linha'));
    const produtoDescricao = maiuscula(nomeProduto);
    const preco = toNumber(valor(row, 'preco')) ?? 0;

    let produtoId = buscarProduto.get(produtoDescricao)?.id;
    if (!produtoId) {
      produtoId = inserirProduto.run(
        produtoDescricao,
        grupoId,
        LINHAS_VALIDAS.has(linhaProduto) ? linhaProduto : 'LEVE',
        preco
      ).lastInsertRowid;
    }

    // --- pedido ------------------------------------------------------------
    const dataPedido = toISODate(valor(row, 'data_pedido')) || toISODate(new Date());
    const dataEntrega = toISODate(valor(row, 'data_entrega'));
    const numero = String(limpar(valor(row, 'numero')) ?? `S/N-${r}`);
    const nf = limpar(valor(row, 'nf'));
    const entregue = chave(valor(row, 'entrega')) === 'ENTREGUE';

    let pedidoId = buscarPedido.get(numero, clienteId, dataPedido)?.id;
    if (!pedidoId) {
      pedidoId = inserirPedido.run(
        numero,
        clienteId,
        resolverVendedor(valor(row, 'vendedor')),
        dataPedido,
        dataEntrega,
        entregue ? 'ENTREGUE' : 'ABERTO',
        nf && /^\d+$/.test(nf) ? nf : null
      ).lastInsertRowid;
      resumo.pedidos++;
      relatorio.totais.pedidos++;
    }

    // --- item --------------------------------------------------------------
    const chaveItem = `${pedidoId}|${produtoId}|${quantidade}|${preco}`;
    if (!jaExistiam.has(chaveItem)) {
      jaExistiam.set(chaveItem, contarItens.get(pedidoId, produtoId, quantidade, preco).n);
    }
    const usados = inseridosNestaAba.get(chaveItem) ?? 0;
    inseridosNestaAba.set(chaveItem, usados + 1);
    if (usados < jaExistiam.get(chaveItem)) {
      resumo.duplicadas++;
      relatorio.totais.duplicadas++;
      continue;
    }
    const liquidacao = toNumber(valor(row, 'liquidacao')) ?? 0;
    const itemId = inserirItem.run(pedidoId, produtoId, quantidade, preco, liquidacao, dataEntrega)
      .lastInsertRowid;
    resumo.itens++;
    relatorio.totais.itens++;

    // --- ordem de produção + roteiro ---------------------------------------
    if (abrirOrdens) {
      const ordem = abrirOrdem(itemId, { dataPrevista: dataEntrega }, db);
      resumo.ordens++;
      relatorio.totais.ordens++;
      aplicarRoteiro({ db, row, valor, ordem, etapaPorCodigo, entregue, nf });
    }
  }

  return resumo;
}

/**
 * Traduz as colunas de acompanhamento da planilha para o roteiro da OP:
 * célula "OK" (ou valor de MO preenchido) = etapa concluída; vazia = pendente.
 */
function aplicarRoteiro({ db, row, valor, ordem, etapaPorCodigo, entregue, nf }) {
  const atualizar = db.prepare(
    `UPDATE ordem_etapas SET status = ?, custo_mo = ?, concluido_em = ? WHERE ordem_id = ? AND etapa_id = ?`
  );

  const marcar = (codigo, concluida, custo, data) => {
    const etapa = etapaPorCodigo.get(codigo);
    if (!etapa) return;
    const atual = db
      .prepare(`SELECT * FROM ordem_etapas WHERE ordem_id = ? AND etapa_id = ?`)
      .get(ordem.id, etapa.id);
    if (!atual) return;
    atualizar.run(
      concluida ? 'CONCLUIDA' : 'PENDENTE',
      custo != null ? round2(custo) : atual.custo_mo,
      concluida ? data ?? ordem.data_prevista ?? null : null,
      ordem.id,
      etapa.id
    );
  };

  const concluida = (campo) => {
    const bruto = chave(valor(row, campo));
    return bruto === 'OK' || bruto === 'SIM' || bruto === 'CONCLUIDO';
  };

  marcar('MATERIA_PRIMA', concluida('materia_prima'), null);

  for (const [campo, codigo] of Object.entries(COLUNAS_MO)) {
    const bruto = valor(row, campo);
    const custo = toNumber(bruto);
    // A aba de carteira marca "OK"; a de PCP traz o valor de MO — ambos indicam etapa feita.
    marcar(codigo, concluida(campo) || (custo != null && custo > 0), custo);
  }

  marcar('NF', Boolean(nf), null);
  marcar('ENTREGA', entregue, null);

  const etapasFinais = db
    .prepare(
      `SELECT oe.status, e.codigo FROM ordem_etapas oe JOIN etapas e ON e.id = oe.etapa_id
       WHERE oe.ordem_id = ?`
    )
    .all(ordem.id);
  const todasOk = etapasFinais.every((e) => e.status === 'CONCLUIDA');
  const alguma = etapasFinais.some((e) => e.status === 'CONCLUIDA');
  const status = entregue ? 'ENTREGUE' : todasOk ? 'CONCLUIDA' : alguma ? 'EM_PRODUCAO' : 'ABERTA';
  db.prepare(`UPDATE ordens_producao SET status = ? WHERE id = ?`).run(status, ordem.id);
}

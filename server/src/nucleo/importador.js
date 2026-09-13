import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { getDb } from './db.js';
import { novoId, proximoCodigo, codigoDeProduto } from './codigos.js';
import { registrarCriacao } from './auditoria.js';
import { badRequest } from '../lib/errors.js';
import { toNumber } from '../lib/numbers.js';
import { toISODate } from '../lib/dates.js';

/**
 * Importador de planilha.
 *
 * Três passos separados, como o §33 pede: prévia, validação e importação. A
 * prévia não escreve nada; a importação nunca apaga o que já existe — casa
 * pelo código natural e atualiza, ou cria.
 *
 * O mapa de colunas é aprendido: na segunda vez que a mesma planilha aparecer,
 * as colunas já vêm ligadas. A "mesma planilha" é reconhecida pela assinatura
 * dos cabeçalhos, não pelo nome do arquivo — que muda todo mês.
 */

const normalizar = (t) =>
  String(t ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Campos de cada destino, com as grafias já vistas nas planilhas da Conserv.
 * A mesma informação aparece como "QTD" numa aba e "QUANTIDADE" na outra.
 */
export const DESTINOS = {
  carteira: {
    rotulo: 'Carteira de pedidos',
    campos: {
      vendedor:        { rotulo: 'Vendedor', alias: ['VENDEDOR'] },
      numero_pedido:   { rotulo: 'Número do pedido', alias: ['PEDIDO', 'N PEDIDO', 'NUM PEDIDO'], exigido: true },
      data_pedido:     { rotulo: 'Data do pedido', alias: ['DATA DO PEDIDO', 'DATA DE ENTRADA', 'DATA PEDIDO', 'DATA ENTRADA'] },
      categoria:       { rotulo: 'Grupo do cliente', alias: ['CATEGORIA', 'GRUPO DE CLIENTE'] },
      cliente:         { rotulo: 'Cliente', alias: ['CLIENTE'], exigido: true },
      produto:         { rotulo: 'Produto', alias: ['PRODUTO'], exigido: true },
      grupo:           { rotulo: 'Grupo do produto', alias: ['GRUPO'] },
      linha:           { rotulo: 'Linha', alias: ['LINHA'] },
      quantidade:      { rotulo: 'Quantidade', alias: ['QTD', 'QUANTIDADE'], exigido: true },
      preco_unitario:  { rotulo: 'Preço unitário', alias: ['VALOR UNID', 'PRECO UNITARIO', 'VALOR UNITARIO'] },
      total:           { rotulo: 'Total', alias: ['TOTAL'] },
      liquidacao:      { rotulo: 'Liquidação', alias: ['LIQUIDACAO'] },
      data_entrega:    { rotulo: 'Data de entrega', alias: ['DATA ENTREGA', 'DATA DE ENTREGA'] },
      data_saida:      { rotulo: 'Data de saída', alias: ['DATA DE SAIDA', 'DATA SAIDA'] },
      status_planilha: { rotulo: 'Status', alias: ['STATUS'] },
      materia_prima:   { rotulo: 'Matéria-prima', alias: ['MATERIA PRIMA'] },
      entrega:         { rotulo: 'Entrega', alias: ['ENTREGA'] },
      nota_fiscal:     { rotulo: 'Nota fiscal', alias: ['NF', 'NOTA FISCAL'] },
      mo_corte:        { rotulo: 'MO corte', alias: ['MO CORTE', 'CORTE'] },
      mo_silk:         { rotulo: 'MO silk', alias: ['MO SILK', 'SILK'] },
      mo_costura:      { rotulo: 'MO costura', alias: ['MO COSTURA', 'COSTURA'] },
      mo_embalagem:    { rotulo: 'MO embalagem', alias: ['MO EMBALAGEM', 'EMBALAGEM'] },
    },
  },
};

/* ========================================================== leitura ===== */

/** Abre o arquivo e devolve cabeçalhos e linhas de cada aba, sem interpretar nada. */
export async function lerPlanilha(caminho) {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.readFile(caminho);

  return livro.worksheets.map((aba) => {
    const linhas = [];
    let cabecalhos = [];

    aba.eachRow({ includeEmpty: false }, (linha, numero) => {
      const valores = [];
      linha.eachCell({ includeEmpty: true }, (celula, coluna) => {
        valores[coluna - 1] = celula.value;
      });
      if (numero === 1) {
        cabecalhos = valores.map((v) => (v == null ? '' : String(v).trim()));
        return;
      }
      if (valores.every((v) => v == null || v === '')) return;
      linhas.push({ numero, valores });
    });

    return { nome: aba.name, cabecalhos, linhas };
  });
}

/**
 * Assinatura dos cabeçalhos. É o que reconhece "a mesma planilha de sempre"
 * mesmo quando o arquivo se chama PEDIDOS_EM_CARTEIRA_0926 em vez de _0825.
 */
export const assinatura = (cabecalhos) =>
  crypto.createHash('sha1')
    .update(cabecalhos.map(normalizar).filter(Boolean).sort().join('|'))
    .digest('hex')
    .slice(0, 16);

/**
 * Sugere o mapa de colunas: primeiro o que já foi aprendido, depois o
 * casamento por nome. Colunas que ninguém reconheceu ficam de fora e
 * aparecem na prévia para a pessoa decidir.
 */
export function sugerirMapa(destino, cabecalhos, db = getDb()) {
  const definicao = DESTINOS[destino];
  if (!definicao) throw badRequest(`Destino desconhecido: ${destino}`);

  const aprendido = db
    .prepare(`SELECT mapa FROM importacao_mapeamentos WHERE destino = ? AND assinatura = ?`)
    .get(destino, assinatura(cabecalhos));
  if (aprendido) {
    return { mapa: JSON.parse(aprendido.mapa), origem: 'aprendido' };
  }

  const mapa = {};
  const usados = new Set();
  for (const [campo, { alias }] of Object.entries(definicao.campos)) {
    const alvos = alias.map(normalizar);
    const indice = cabecalhos.findIndex(
      (h, i) => !usados.has(i) && h && alvos.includes(normalizar(h))
    );
    if (indice >= 0) {
      mapa[campo] = indice;
      usados.add(indice);
    }
  }
  return { mapa, origem: 'sugerido' };
}

/** Guarda o mapa confirmado para a próxima vez. */
export function aprenderMapa(destino, cabecalhos, mapa, db = getDb()) {
  const assinada = assinatura(cabecalhos);
  db.prepare(
    `INSERT INTO importacao_mapeamentos (id, destino, assinatura, mapa, usos)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT (destino, assinatura)
     DO UPDATE SET mapa = excluded.mapa, usos = usos + 1`
  ).run(novoId(), destino, assinada, JSON.stringify(mapa));
  return assinada;
}

/* ======================================================= interpretação == */

const texto = (v) => {
  if (v == null) return null;
  // ExcelJS devolve fórmula e hyperlink como objeto; o que interessa é o valor.
  const bruto = typeof v === 'object'
    ? (v.result ?? v.text ?? v.richText?.map((p) => p.text).join('') ?? '')
    : v;
  const limpo = String(bruto).trim();
  return limpo === '' ? null : limpo;
};

/**
 * `OK` na coluna NF significa "faturado, número desconhecido"; um número
 * significa o número. São dois fatos diferentes que a planilha guarda na
 * mesma coluna, e separá-los é metade do trabalho da migração.
 */
function lerNotaFiscal(valor) {
  const t = texto(valor);
  if (!t) return { faturado: false, numero: null };
  if (/^OK$/i.test(t)) return { faturado: true, numero: null };
  return { faturado: true, numero: t };
}

/** `OK`, `ok`, número e `#REF!` na mesma coluna: só o OK afirma alguma coisa. */
const marcado = (valor) => /^OK$/i.test(texto(valor) ?? '');

function lerLinha(linha, mapa) {
  const pegar = (campo) => (mapa[campo] === undefined ? null : linha.valores[mapa[campo]]);
  const nf = lerNotaFiscal(pegar('nota_fiscal'));

  return {
    linha: linha.numero,
    vendedor: texto(pegar('vendedor')),
    numero_pedido: texto(pegar('numero_pedido')),
    data_pedido: toISODate(pegar('data_pedido')),
    categoria: texto(pegar('categoria')),
    cliente: texto(pegar('cliente')),
    produto: texto(pegar('produto')),
    grupo: texto(pegar('grupo')),
    linha_produto: texto(pegar('linha')),
    quantidade: toNumber(pegar('quantidade')),
    preco_unitario: toNumber(pegar('preco_unitario')),
    total: toNumber(pegar('total')),
    liquidacao: toNumber(pegar('liquidacao')) ?? 0,
    data_entrega: toISODate(pegar('data_entrega')),
    data_saida: toISODate(pegar('data_saida')),
    entregue: /ENTREGUE/i.test(texto(pegar('entrega')) ?? ''),
    material_ok: marcado(pegar('materia_prima')),
    faturado: nf.faturado,
    nota_fiscal: nf.numero,
    mo: {
      CORTE: toNumber(pegar('mo_corte')),
      SILK: toNumber(pegar('mo_silk')),
      COSTURA: toNumber(pegar('mo_costura')),
      EMBALAGEM: toNumber(pegar('mo_embalagem')),
    },
  };
}

function validar(registro) {
  const erros = [];
  if (!registro.cliente) erros.push('sem cliente');
  if (!registro.produto) erros.push('sem produto');
  if (!registro.numero_pedido) erros.push('sem número de pedido');
  if (!(registro.quantidade > 0)) erros.push('quantidade inválida');
  if (registro.data_entrega && registro.data_pedido && registro.data_entrega < registro.data_pedido) {
    // Não invalida a linha: é erro de digitação conhecido e a tela de
    // qualidade do cadastro sabe corrigir depois.
    erros.push('aviso: entrega anterior ao pedido');
  }
  return erros;
}

/**
 * Prévia: lê, interpreta e valida sem escrever nada.
 *
 * Devolve as primeiras linhas já traduzidas para os campos do sistema, o
 * total por situação e as colunas da planilha que ninguém reconheceu.
 */
export async function previa({ caminho, aba = null, destino = 'carteira', mapa = null, amostra = 10 },
                             db = getDb()) {
  const abas = await lerPlanilha(caminho);
  const escolhida = aba ? abas.find((a) => a.nome === aba) : abas[0];
  if (!escolhida) throw badRequest(`Aba não encontrada: ${aba}`);

  const sugestao = mapa ? { mapa, origem: 'informado' } : sugerirMapa(destino, escolhida.cabecalhos, db);
  const definicao = DESTINOS[destino];

  const faltando = Object.entries(definicao.campos)
    .filter(([campo, def]) => def.exigido && sugestao.mapa[campo] === undefined)
    .map(([, def]) => def.rotulo);

  const ligadas = new Set(Object.values(sugestao.mapa));
  const naoReconhecidas = escolhida.cabecalhos
    .map((h, i) => ({ coluna: i, cabecalho: h }))
    .filter(({ coluna, cabecalho }) => cabecalho && !ligadas.has(coluna));

  const registros = escolhida.linhas.map((l) => {
    const r = lerLinha(l, sugestao.mapa);
    return { ...r, erros: validar(r) };
  });
  const invalidos = registros.filter((r) => r.erros.some((e) => !e.startsWith('aviso')));

  return {
    aba: escolhida.nome,
    abas: abas.map((a) => ({ nome: a.nome, linhas: a.linhas.length })),
    cabecalhos: escolhida.cabecalhos,
    mapa: sugestao.mapa,
    origem_mapa: sugestao.origem,
    campos: definicao.campos,
    exigidos_faltando: faltando,
    colunas_nao_reconhecidas: naoReconhecidas,
    linhas_lidas: registros.length,
    linhas_ok: registros.length - invalidos.length,
    linhas_erro: invalidos.length,
    avisos: registros.filter((r) => r.erros.some((e) => e.startsWith('aviso'))).length,
    amostra: registros.slice(0, amostra),
    erros: invalidos.slice(0, 50).map((r) => ({ linha: r.linha, erros: r.erros })),
  };
}

/* ========================================================= importação == */

/** Acha pelo nome normalizado ou cria. É o que evita duplicar a cada importação. */
function garantir(db, tabela, { chaveCampo, chaveValor, colunas, entidadeCodigo }) {
  const achado = db
    .prepare(`SELECT * FROM ${tabela} WHERE UPPER(${chaveCampo}) = UPPER(?)`)
    .get(chaveValor);
  if (achado) return { registro: achado, criado: false };

  const codigo = entidadeCodigo ? proximoCodigo(entidadeCodigo, { db }) : null;
  const dados = { id: novoId(), ...(codigo ? { codigo } : {}), ...colunas };
  const campos = Object.keys(dados);
  db.prepare(
    `INSERT INTO ${tabela} (${campos.join(', ')}) VALUES (${campos.map((c) => `@${c}`).join(', ')})`
  ).run(dados);
  return { registro: db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(dados.id), criado: true };
}

/**
 * Prefixo do grupo de produto: AVENTAL → AVE, NECESSAIRE → NEC.
 *
 * Três letras colidem mais do que parece — SACO e SACOLA dão as mesmas — então
 * o prefixo cresce até ficar livre, e só aí recorre a um sufixo numérico.
 */
function prefixoDe(nome, db) {
  const limpo = normalizar(nome).replace(/[^A-Z]/g, '') || 'PRD';
  const tomado = (p) => db.prepare(`SELECT id FROM grupos_produto WHERE codigo = ?`).get(p);

  for (let tamanho = 3; tamanho <= Math.max(3, limpo.length); tamanho += 1) {
    const tentativa = limpo.slice(0, tamanho).padEnd(3, 'X');
    if (!tomado(tentativa)) return tentativa;
  }
  const base = limpo.slice(0, 3).padEnd(3, 'X');
  for (let n = 2; n < 100; n += 1) {
    if (!tomado(`${base}${n}`)) return `${base}${n}`;
  }
  throw badRequest(`Sem prefixo livre para o grupo "${nome}"`);
}

/**
 * Importa a carteira.
 *
 * Cada linha da planilha vira um item de pedido. Pedidos com o mesmo número
 * para o mesmo cliente na mesma data são o mesmo pedido — é assim que as
 * linhas se agrupam sem inventar um pedido por item.
 *
 * Nada é apagado: rodar a importação duas vezes atualiza, não duplica.
 */
export async function importarCarteira(
  { caminho, aba = null, mapa = null, destino = 'carteira', autor = null, aprender = true },
  db = getDb()
) {
  const abas = await lerPlanilha(caminho);
  const escolhida = aba ? abas.find((a) => a.nome === aba) : abas[0];
  if (!escolhida) throw badRequest(`Aba não encontrada: ${aba}`);

  const sugestao = mapa ? { mapa } : sugerirMapa(destino, escolhida.cabecalhos, db);
  const usado = sugestao.mapa;

  const importacaoId = novoId();
  db.prepare(
    `INSERT INTO importacoes (id, arquivo, aba, destino, status, usuario_id)
     VALUES (?, ?, ?, ?, 'PREVIA', ?)`
  ).run(importacaoId, caminho.split('/').pop(), escolhida.nome, destino, autor?.id ?? null);

  const contagem = {
    linhas_lidas: 0, linhas_ok: 0, linhas_erro: 0,
    clientes: 0, produtos: 0, pedidos: 0, itens: 0, atualizados: 0,
  };
  const erros = [];
  // Custo de mão de obra por peça, colhido da planilha para semear as operações.
  const maoDeObra = new Map();
  // Quantas vezes cada item idêntico já apareceu nesta importação.
  const vistos = new Map();

  const rodar = db.transaction(() => {
    for (const bruta of escolhida.linhas) {
      contagem.linhas_lidas += 1;
      const r = lerLinha(bruta, usado);
      const problemas = validar(r).filter((e) => !e.startsWith('aviso'));
      if (problemas.length) {
        contagem.linhas_erro += 1;
        if (erros.length < 200) erros.push({ linha: r.linha, erros: problemas });
        continue;
      }

      /* --- cadastros de apoio ------------------------------------------- */
      const grupoCliente = r.categoria
        ? garantir(db, 'grupos_cliente', {
            chaveCampo: 'nome', chaveValor: r.categoria,
            colunas: { codigo: normalizar(r.categoria).slice(0, 12).replace(/ /g, '_'), nome: r.categoria },
          }).registro
        : null;

      const vendedor = r.vendedor
        ? garantir(db, 'vendedores', {
            chaveCampo: 'nome', chaveValor: r.vendedor,
            colunas: { nome: r.vendedor }, entidadeCodigo: 'vendedor',
          }).registro
        : null;

      const cliente = garantir(db, 'clientes', {
        chaveCampo: 'razao_social', chaveValor: r.cliente,
        colunas: {
          razao_social: r.cliente,
          grupo_id: grupoCliente?.id ?? null,
          vendedor_id: vendedor?.id ?? null,
        },
        entidadeCodigo: 'cliente',
      });
      if (cliente.criado) contagem.clientes += 1;

      const grupoProduto = r.grupo
        ? garantir(db, 'grupos_produto', {
            chaveCampo: 'nome', chaveValor: r.grupo,
            colunas: { codigo: prefixoDe(r.grupo, db), nome: r.grupo },
          }).registro
        : null;

      const linhaProduto = r.linha_produto
        ? garantir(db, 'linhas_produto', {
            chaveCampo: 'nome', chaveValor: r.linha_produto,
            colunas: { codigo: normalizar(r.linha_produto).slice(0, 10), nome: r.linha_produto },
          }).registro
        : null;

      // O modelo é a descrição como a fábrica a escreve; a variação sai dela
      // depois, na Fase 2, quando houver ficha técnica para desdobrar.
      const modelo = garantir(db, 'modelos', {
        chaveCampo: 'nome', chaveValor: r.produto,
        colunas: { nome: r.produto, grupo_id: grupoProduto?.id ?? null },
        entidadeCodigo: 'modelo',
      }).registro;

      let produto = db.prepare(`SELECT * FROM produtos WHERE UPPER(descricao) = UPPER(?)`).get(r.produto);
      if (!produto) {
        const id = novoId();
        db.prepare(
          `INSERT INTO produtos (id, codigo, descricao, modelo_id, grupo_id, linha_id, preco_padrao)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(id, codigoDeProduto(grupoProduto?.codigo ?? 'PRD', db), r.produto,
              modelo.id, grupoProduto?.id ?? null, linhaProduto?.id ?? null, r.preco_unitario ?? 0);
        produto = db.prepare(`SELECT * FROM produtos WHERE id = ?`).get(id);
        contagem.produtos += 1;
      }

      /* --- pedido -------------------------------------------------------- */
      const dataPedido = r.data_pedido ?? r.data_entrega ?? null;
      let pedido = db
        .prepare(
          `SELECT * FROM pedidos
           WHERE numero_cliente = ? AND cliente_id = ? AND IFNULL(data_pedido,'') = IFNULL(?,'')`
        )
        .get(r.numero_pedido, cliente.registro.id, dataPedido);

      if (!pedido) {
        const id = novoId();
        db.prepare(
          `INSERT INTO pedidos
             (id, codigo, numero_cliente, cliente_id, vendedor_id, data_pedido, data_entrega,
              data_saida, status, criado_por)
           VALUES (@id, @codigo, @numero, @cliente, @vendedor, @data, @entrega, @saida, @status, @autor)`
        ).run({
          id,
          codigo: proximoCodigo('pedido', { db, data: dataPedido ? new Date(dataPedido) : new Date() }),
          numero: r.numero_pedido,
          cliente: cliente.registro.id,
          vendedor: vendedor?.id ?? null,
          data: dataPedido,
          entrega: r.data_entrega,
          saida: r.data_saida,
          status: situacaoDoPedido(r),
          autor: autor?.id ?? null,
        });
        pedido = db.prepare(`SELECT * FROM pedidos WHERE id = ?`).get(id);
        contagem.pedidos += 1;
        registrarCriacao({ entidade: 'pedidos', registro: pedido, autor, origem: 'importacao' }, db);
      }

      /* --- item ---------------------------------------------------------- */
      /*
       * Duas linhas idênticas na planilha costumam ser duas linhas de verdade
       * — duas cores do mesmo item, lançadas separadas. Casar só por
       * pedido+produto+quantidade+preço engoliria a segunda, então a chave
       * leva também a ordem de aparição: a primeira casa com a primeira, a
       * segunda com a segunda. Reimportar atualiza; nunca duplica nem perde.
       */
      const chaveItem = `${pedido.id}|${produto.id}|${r.quantidade}|${r.preco_unitario ?? 0}`;
      const ordinal = vistos.get(chaveItem) ?? 0;
      vistos.set(chaveItem, ordinal + 1);

      const jaTem = db
        .prepare(
          `SELECT * FROM pedido_itens
           WHERE pedido_id = ? AND produto_id = ? AND quantidade = ? AND preco_unitario = ?
           ORDER BY sequencia LIMIT 1 OFFSET ?`
        )
        .get(pedido.id, produto.id, r.quantidade, r.preco_unitario ?? 0, ordinal);

      if (jaTem) {
        db.prepare(
          `UPDATE pedido_itens SET liquidacao = ?, data_entrega = ?, origem_linha = ?
           WHERE id = ?`
        ).run(r.liquidacao ?? 0, r.data_entrega, r.linha, jaTem.id);
        contagem.atualizados += 1;
      } else {
        const sequencia = db
          .prepare(`SELECT COUNT(*) AS n FROM pedido_itens WHERE pedido_id = ?`)
          .get(pedido.id).n + 1;
        db.prepare(
          `INSERT INTO pedido_itens
             (id, pedido_id, sequencia, produto_id, descricao, quantidade, preco_unitario,
              liquidacao, data_entrega, importacao_id, origem_linha)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(novoId(), pedido.id, sequencia, produto.id, r.produto, r.quantidade,
              r.preco_unitario ?? 0, r.liquidacao ?? 0, r.data_entrega, importacaoId, r.linha);
        contagem.itens += 1;
      }

      /* --- mão de obra revelada pela planilha ----------------------------- */
      if (grupoProduto && r.quantidade > 0) {
        for (const [operacao, valor] of Object.entries(r.mo)) {
          if (!(valor > 0)) continue;
          const chave = `${grupoProduto.nome}|${operacao}`;
          if (!maoDeObra.has(chave)) maoDeObra.set(chave, []);
          maoDeObra.get(chave).push(valor / r.quantidade);
        }
      }

      contagem.linhas_ok += 1;
    }

    db.prepare(
      `UPDATE importacoes
       SET status = 'IMPORTADA', linhas_lidas = @lidas, linhas_ok = @ok, linhas_erro = @erro,
           criados = @criados, atualizados = @atualizados, relatorio = @relatorio,
           concluido_em = datetime('now')
       WHERE id = @id`
    ).run({
      id: importacaoId,
      lidas: contagem.linhas_lidas,
      ok: contagem.linhas_ok,
      erro: contagem.linhas_erro,
      criados: contagem.pedidos + contagem.itens,
      atualizados: contagem.atualizados,
      relatorio: JSON.stringify({ contagem, erros }),
    });
  });

  rodar();
  if (aprender) aprenderMapa(destino, escolhida.cabecalhos, usado, db);

  return {
    importacao_id: importacaoId,
    aba: escolhida.nome,
    ...contagem,
    erros: erros.slice(0, 50),
    mao_de_obra: resumirMaoDeObra(maoDeObra),
  };
}

/**
 * Situação do pedido a partir do que a planilha afirma.
 *
 * A coluna STATUS não serve: 180 das 181 linhas dizem ATRASO. O que informa
 * de verdade é a entrega, a nota e a matéria-prima — nessa ordem.
 */
function situacaoDoPedido(r) {
  if (r.entregue) return 'ENTREGUE';
  if (r.faturado) return 'FATURADO';
  if (r.material_ok) return 'LIBERADO_PCP';
  return 'PEDIDO_RECEBIDO';
}

/** Mediana por grupo e operação — é o que vira custo por peça da operação. */
function resumirMaoDeObra(mapa) {
  const saida = [];
  for (const [chave, valores] of mapa) {
    const [grupo, operacao] = chave.split('|');
    const ordenados = [...valores].sort((a, b) => a - b);
    const meio = Math.floor(ordenados.length / 2);
    const mediana = ordenados.length % 2
      ? ordenados[meio]
      : (ordenados[meio - 1] + ordenados[meio]) / 2;
    saida.push({
      grupo,
      operacao,
      amostras: valores.length,
      custo_por_peca: Math.round(mediana * 10000) / 10000,
    });
  }
  return saida.sort((a, b) => a.grupo.localeCompare(b.grupo) || a.operacao.localeCompare(b.operacao));
}

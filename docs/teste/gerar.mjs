/** Exporta o núcleo para o JSON colunar que a versão teste embute. */
import fs from 'node:fs';
process.env.NUCLEO_DB_PATH = '/home/user/conserv/data/nucleo.db';
const { getDb } = await import('/home/user/conserv/server/src/nucleo/db.js');
const db = getDb();
const todos = (sql, ...p) => db.prepare(sql).all(...p);
const um = (sql, ...p) => db.prepare(sql).get(...p);
const r = (n, c = 2) => (n == null ? 0 : Number(Number(n).toFixed(c)));

/* Listas de apoio viram índice: o nome do cliente aparece 1.801 vezes. */
const indice = () => {
  const lista = [];
  const mapa = new Map();
  return {
    lista,
    de(v) {
      if (v == null) return -1;
      if (!mapa.has(v)) { mapa.set(v, lista.length); lista.push(v); }
      return mapa.get(v);
    },
  };
};

const clientes = indice();
const vendedores = indice();
const gruposCliente = indice();
const produtos = indice();
const gruposProduto = indice();
const linhas = indice();

const itens = todos(`
  SELECT p.codigo AS pedido, p.numero_cliente AS numero, p.data_pedido, p.data_entrega,
         p.data_saida, p.status,
         c.razao_social AS cliente, gc.nome AS grupo_cliente, v.nome AS vendedor,
         pr.descricao AS produto, pr.codigo AS produto_codigo,
         gp.nome AS grupo_produto, lp.nome AS linha,
         i.quantidade, i.preco_unitario, i.liquidacao, i.origem_linha
  FROM pedido_itens i
  JOIN pedidos p   ON p.id = i.pedido_id
  JOIN clientes c  ON c.id = p.cliente_id
  LEFT JOIN grupos_cliente gc ON gc.id = c.grupo_id
  LEFT JOIN vendedores v      ON v.id = p.vendedor_id
  LEFT JOIN produtos pr       ON pr.id = i.produto_id
  LEFT JOIN grupos_produto gp ON gp.id = pr.grupo_id
  LEFT JOIN linhas_produto lp ON lp.id = pr.linha_id
  ORDER BY p.data_entrega, p.codigo
`).map((i) => [
  i.pedido, i.numero, clientes.de(i.cliente), gruposCliente.de(i.grupo_cliente),
  vendedores.de(i.vendedor), produtos.de(i.produto), gruposProduto.de(i.grupo_produto),
  linhas.de(i.linha), r(i.quantidade), r(i.preco_unitario, 4), r(i.liquidacao),
  i.data_pedido, i.data_entrega, i.status,
]);

/* Códigos de produto, na mesma ordem do índice de produtos. */
const codigoProduto = new Map(
  todos(`SELECT descricao, codigo FROM produtos`).map((p) => [p.descricao, p.codigo])
);

const cadastroClientes = todos(`
  SELECT c.razao_social AS nome, c.codigo, gc.nome AS grupo, v.nome AS vendedor,
         (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = c.id) AS pedidos,
         (SELECT ROUND(SUM(i.quantidade * i.preco_unitario), 2)
            FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
           WHERE p.cliente_id = c.id) AS valor,
         (SELECT MAX(p.data_pedido) FROM pedidos p WHERE p.cliente_id = c.id) AS ultimo
  FROM clientes c
  LEFT JOIN grupos_cliente gc ON gc.id = c.grupo_id
  LEFT JOIN vendedores v      ON v.id = c.vendedor_id
  ORDER BY valor DESC NULLS LAST
`).map((c) => [c.nome, c.codigo, c.grupo, c.vendedor, c.pedidos, r(c.valor), c.ultimo]);

const cadastroProdutos = todos(`
  SELECT pr.codigo, pr.descricao, gp.nome AS grupo, lp.nome AS linha, pr.preco_padrao,
         (SELECT COUNT(*) FROM pedido_itens i WHERE i.produto_id = pr.id) AS vezes,
         (SELECT ROUND(SUM(i.quantidade), 0) FROM pedido_itens i WHERE i.produto_id = pr.id) AS pecas,
         (SELECT ROUND(SUM(i.quantidade * i.preco_unitario), 2) FROM pedido_itens i
           WHERE i.produto_id = pr.id) AS valor,
         (SELECT COUNT(*) FROM produto_versoes v WHERE v.produto_id = pr.id AND v.status = 'ATIVA') AS ficha
  FROM produtos pr
  LEFT JOIN grupos_produto gp ON gp.id = pr.grupo_id
  LEFT JOIN linhas_produto lp ON lp.id = pr.linha_id
  ORDER BY valor DESC NULLS LAST
`).map((p) => [p.codigo, p.descricao, p.grupo, p.linha, r(p.preco_padrao), p.vezes,
               r(p.pecas, 0), r(p.valor), p.ficha]);

const operacoes = todos(`
  SELECT o.codigo, o.nome, ct.nome AS centro, o.custo_por_peca, o.ordem_padrao
  FROM operacoes o LEFT JOIN centros_trabalho ct ON ct.id = o.centro_id
  ORDER BY o.ordem_padrao, o.nome
`).map((o) => [o.codigo, o.nome, o.centro, r(o.custo_por_peca, 4), o.ordem_padrao]);

const perfis = todos(`SELECT id, codigo, nome, descricao FROM perfis ORDER BY codigo`).map((p) => ({
  codigo: p.codigo,
  nome: p.nome,
  descricao: p.descricao,
  permissoes: todos(`SELECT modulo, verbo FROM permissoes WHERE perfil_id = ?`, p.id)
    .reduce((acc, x) => { (acc[x.modulo] ??= []).push(x.verbo); return acc; }, {}),
}));

const importacoes = todos(`
  SELECT arquivo, aba, destino, status, linhas_lidas, linhas_ok, linhas_erro,
         criados, atualizados, relatorio, criado_em
  FROM importacoes ORDER BY criado_em
`).map((i) => ({
  arquivo: i.arquivo, aba: i.aba, status: i.status,
  lidas: i.linhas_lidas, ok: i.linhas_ok, erro: i.linhas_erro,
  criados: i.criados, atualizados: i.atualizados,
  erros: (JSON.parse(i.relatorio || '{}').erros ?? []).slice(0, 10),
}));

/* Mão de obra por grupo e operação, recalculada a partir do que foi migrado. */
const maoDeObra = todos(`
  SELECT gp.nome AS grupo, COUNT(*) AS pedidos
  FROM pedido_itens i JOIN produtos pr ON pr.id = i.produto_id
  JOIN grupos_produto gp ON gp.id = pr.grupo_id GROUP BY gp.nome ORDER BY COUNT(*) DESC
`);

const dados = {
  gerado: new Date().toISOString().slice(0, 10),
  clientes: clientes.lista,
  vendedores: vendedores.lista,
  gruposCliente: gruposCliente.lista,
  produtos: produtos.lista,
  produtoCodigos: produtos.lista.map((d) => codigoProduto.get(d) ?? ''),
  gruposProduto: gruposProduto.lista,
  linhas: linhas.lista,
  itens,
  cadastroClientes,
  cadastroProdutos,
  operacoes,
  perfis,
  importacoes,
  maoDeObra,
  modulos: ['DASHBOARD','COMERCIAL','CLIENTES','PRODUTOS','ENGENHARIA','MATERIAIS','ESTOQUE',
            'COMPRAS','PCP','PRODUCAO','QUALIDADE','EXPEDICAO','FINANCEIRO','RELATORIOS',
            'BI','CONFIGURACOES'],
  parametros: um(`SELECT * FROM parametros LIMIT 1`),
  contagem: um(`
    SELECT (SELECT COUNT(*) FROM clientes) clientes,
           (SELECT COUNT(*) FROM produtos) produtos,
           (SELECT COUNT(*) FROM pedidos) pedidos,
           (SELECT COUNT(*) FROM pedido_itens) itens,
           (SELECT COUNT(*) FROM modelos) modelos,
           (SELECT COUNT(*) FROM grupos_produto) grupos,
           (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%') tabelas
  `),
};

const json = JSON.stringify(dados);
fs.writeFileSync(process.argv[2], json);
console.log('bytes:', json.length, '(' + Math.round(json.length / 1024) + ' KB)');
console.log('itens:', itens.length, '| clientes:', clientes.lista.length,
            '| produtos:', produtos.lista.length);

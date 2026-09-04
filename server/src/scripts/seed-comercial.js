/**
 * Reconstrói o comercial a partir do histórico: cada pedido recente vira um
 * orçamento aprovado com a oportunidade que o originou, e alguns negócios
 * ficam em aberto no funil para a tela ter movimento.
 */
import { migrate, getDb } from '../db/index.js';
import { criarOrcamento, registrarInteracao, resumoComercial } from '../services/comercial.js';
import { custoCompletoProduto } from '../services/custeio.js';
import { round2 } from '../lib/numbers.js';

const db = migrate(getDb());

if (db.prepare(`SELECT COUNT(*) AS n FROM oportunidades`).get().n > 0) {
  console.log('O funil já tem oportunidades — nada a fazer.');
  process.exit(0);
}

const etapa = (nome) => db.prepare(`SELECT id FROM etapas_funil WHERE nome = ?`).get(nome).id;
const ETAPAS = {
  contato: etapa('Contato inicial'), levantamento: etapa('Levantamento'),
  enviado: etapa('Orçamento enviado'), negociacao: etapa('Negociação'),
  ganha: etapa('Ganha'), perdida: etapa('Perdida'),
};

const somarDias = (iso, dias) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const HOJE = new Date().toISOString().slice(0, 10);

const vendedores = db.prepare(`SELECT id, nome FROM vendedores WHERE ativo = 1`).all();
const vendedorDe = (i) => vendedores[i % Math.max(vendedores.length, 1)]?.id ?? null;

const ORIGENS = ['INDICACAO', 'CLIENTE_ATIVO', 'SITE', 'PROSPECCAO', 'FEIRA', 'REDES'];
const MOTIVOS_PERDA = [
  'Preço acima do concorrente', 'Prazo de entrega longo', 'Cliente adiou o projeto',
  'Fechou com fornecedor atual', 'Quantidade abaixo do mínimo',
];

const inserirOportunidade = db.prepare(
  `INSERT INTO oportunidades
     (titulo, cliente_id, vendedor_id, etapa_id, origem, valor_estimado, previsao_fechamento,
      motivo_perda, fechada_em, criado_em, atualizado_em)
   VALUES (@titulo, @cliente_id, @vendedor_id, @etapa_id, @origem, @valor_estimado, @previsao,
      @motivo_perda, @fechada_em, @criado_em, @atualizado_em)`
);

/* ---- Pedidos recentes viram oportunidade ganha + orçamento aprovado ---- */
const pedidos = db
  .prepare(
    `SELECT p.id, p.numero, p.cliente_id, p.vendedor_id, p.data_pedido, c.nome AS cliente,
            ROUND(SUM(i.quantidade * i.preco_unitario), 2) AS total
     FROM pedidos p
     JOIN clientes c ON c.id = p.cliente_id
     JOIN pedido_itens i ON i.pedido_id = p.id
     WHERE p.situacao <> 'CANCELADO' AND p.data_pedido >= date('now', '-8 month')
     GROUP BY p.id HAVING total > 0
     ORDER BY p.data_pedido DESC LIMIT 60`
  )
  .all();

let ganhas = 0;
let orcados = 0;

db.transaction(() => {
  pedidos.forEach((p, i) => {
    const abertura = somarDias(p.data_pedido, -12);
    const info = inserirOportunidade.run({
      titulo: `${p.cliente} — reposição ${p.data_pedido.slice(0, 7)}`,
      cliente_id: p.cliente_id,
      vendedor_id: p.vendedor_id ?? vendedorDe(i),
      etapa_id: ETAPAS.ganha,
      origem: ORIGENS[i % ORIGENS.length],
      valor_estimado: p.total,
      previsao: p.data_pedido,
      motivo_perda: null,
      fechada_em: p.data_pedido,
      criado_em: abertura,
      atualizado_em: p.data_pedido,
    });
    const oportunidadeId = info.lastInsertRowid;
    ganhas++;

    const itens = db
      .prepare(
        `SELECT produto_id, quantidade, preco_unitario FROM pedido_itens WHERE pedido_id = ?`
      )
      .all(p.id)
      .map((it) => ({
        produto_id: it.produto_id,
        quantidade: it.quantidade,
        preco_unitario: it.preco_unitario,
      }));

    const [orcamento] = [
      criarOrcamento(
        {
          cliente_id: p.cliente_id,
          oportunidade_id: oportunidadeId,
          vendedor_id: p.vendedor_id ?? vendedorDe(i),
          data: somarDias(p.data_pedido, -7),
          validade: somarDias(p.data_pedido, 8),
          prazo_entrega_dias: 28,
          condicao_pagamento: '28 dias',
          status: 'APROVADO',
          itens,
        },
        db
      ),
    ];
    db.prepare(`UPDATE orcamentos SET pedido_id = ? WHERE id = ?`).run(p.id, orcamento.id);
    db.prepare(`UPDATE pedidos SET orcamento_id = ?, oportunidade_id = ? WHERE id = ?`)
      .run(orcamento.id, oportunidadeId, p.id);
    orcados++;

    registrarInteracao(
      {
        oportunidade_id: oportunidadeId,
        tipo: 'PROPOSTA',
        data: somarDias(p.data_pedido, -7),
        resumo: `Orçamento ${orcamento.numero} enviado por e-mail.`,
      },
      db
    );
  });
})();

/* ---- Negócios ainda em aberto, para o funil não nascer vazio ---- */
const clientes = db
  .prepare(`SELECT id, nome FROM clientes WHERE ativo = 1 ORDER BY RANDOM() LIMIT 26`)
  .all();
const produtos = db
  .prepare(
    `SELECT p.id, p.descricao, p.preco_padrao FROM produtos p
     WHERE p.ativo = 1 AND p.preco_padrao > 0
       AND EXISTS (SELECT 1 FROM produto_processo pp WHERE pp.produto_id = p.id)
     ORDER BY RANDOM() LIMIT 40`
  )
  .all();

const ABERTAS = [
  { etapa: ETAPAS.contato, quantas: 7, diasParado: [1, 9] },
  { etapa: ETAPAS.levantamento, quantas: 6, diasParado: [2, 18] },
  { etapa: ETAPAS.enviado, quantas: 6, diasParado: [3, 25] },
  { etapa: ETAPAS.negociacao, quantas: 4, diasParado: [1, 12] },
];

let abertas = 0;
let indice = 0;
db.transaction(() => {
  for (const grupo of ABERTAS) {
    for (let n = 0; n < grupo.quantas; n++) {
      const cliente = clientes[indice % clientes.length];
      const produto = produtos[indice % produtos.length];
      const quantidade = [120, 250, 400, 600, 1000, 1500][indice % 6];
      const valor = round2(quantidade * produto.preco_padrao);
      const parado = grupo.diasParado[0] + ((indice * 5) % (grupo.diasParado[1] - grupo.diasParado[0] + 1));

      const info = inserirOportunidade.run({
        titulo: `${cliente.nome} — ${produto.descricao.slice(0, 34)}`,
        cliente_id: cliente.id,
        vendedor_id: vendedorDe(indice),
        etapa_id: grupo.etapa,
        origem: ORIGENS[indice % ORIGENS.length],
        valor_estimado: valor,
        previsao: somarDias(HOJE, 10 + (indice % 45)),
        motivo_perda: null,
        fechada_em: null,
        criado_em: somarDias(HOJE, -30 - (indice % 40)),
        atualizado_em: somarDias(HOJE, -parado),
      });
      const oportunidadeId = info.lastInsertRowid;
      abertas++;

      registrarInteracao(
        {
          oportunidade_id: oportunidadeId,
          tipo: ['LIGACAO', 'VISITA', 'WHATSAPP', 'REUNIAO'][indice % 4],
          data: somarDias(HOJE, -parado),
          resumo: 'Cliente pediu proposta para reposição do uniforme da equipe.',
          proximo_passo: 'Retornar com a proposta ajustada',
          proxima_data: somarDias(HOJE, (indice % 12) - 2),
        },
        db
      );

      // A partir de "orçamento enviado" existe proposta de verdade no sistema.
      if (grupo.etapa === ETAPAS.enviado || grupo.etapa === ETAPAS.negociacao) {
        const custo = custoCompletoProduto(produto.id, db).total;
        criarOrcamento(
          {
            cliente_id: cliente.id,
            oportunidade_id: oportunidadeId,
            vendedor_id: vendedorDe(indice),
            data: somarDias(HOJE, -parado),
            validade: somarDias(HOJE, 15),
            prazo_entrega_dias: 30,
            condicao_pagamento: '30 dias',
            status: grupo.etapa === ETAPAS.negociacao ? 'EM_NEGOCIACAO' : 'ENVIADO',
            itens: [{
              produto_id: produto.id,
              quantidade,
              preco_unitario: produto.preco_padrao,
              custo_unitario: custo,
            }],
          },
          db
        );
        orcados++;
      }
      indice++;
    }
  }

  // Alguns perdidos, com motivo — é o que alimenta a análise de perda.
  for (let n = 0; n < 6; n++) {
    const cliente = clientes[(indice + n) % clientes.length];
    const produto = produtos[(indice + n) % produtos.length];
    inserirOportunidade.run({
      titulo: `${cliente.nome} — ${produto.descricao.slice(0, 34)}`,
      cliente_id: cliente.id,
      vendedor_id: vendedorDe(n),
      etapa_id: ETAPAS.perdida,
      origem: ORIGENS[n % ORIGENS.length],
      valor_estimado: round2(300 * produto.preco_padrao),
      previsao: somarDias(HOJE, -20 + n),
      motivo_perda: MOTIVOS_PERDA[n % MOTIVOS_PERDA.length],
      fechada_em: somarDias(HOJE, -18 + n),
      criado_em: somarDias(HOJE, -70 + n),
      atualizado_em: somarDias(HOJE, -18 + n),
    });
  }
})();

const resumo = resumoComercial({}, db);
console.log(`Oportunidades: ${ganhas} ganhas, ${abertas} em aberto, ${resumo.perdidas} perdidas.`);
console.log(`Orçamentos: ${orcados}.`);
console.log(`Funil aberto: R$ ${resumo.valor_aberto.toFixed(2)} (ponderado R$ ${resumo.valor_ponderado.toFixed(2)})`);
console.log(`Conversão: ${resumo.conversao}%`);

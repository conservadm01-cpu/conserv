import { getDb } from '../db/index.js';
import { badRequest, notFound, conflict } from '../lib/errors.js';

/**
 * Higiene do cadastro: encontra o mesmo cliente escrito de duas formas, nomes
 * que trazem lixo de digitação e pedidos que nunca foram baixados.
 *
 * Nada aqui decide sozinho. A rotina classifica o que achou por confiança e
 * quem opera confirma — "JL COMERCIO DE ALIMENTOS" e "ZF ALIMENTOS" são
 * parecidos no papel e empresas diferentes na vida.
 */

/** Só maiúsculas e dígitos: dois nomes com a mesma chave são o mesmo nome. */
export const chaveEstrita = (nome) =>
  nome.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

const SUFIXOS = /\b(LTDA|ME|EPP|EIRELI|SA|COMERCIO|COMERCIAL|INDUSTRIA|DISTRIBUIDORA|E|DE|DA|DO|DOS|DAS)\b/g;

/** Núcleo do nome: sem acento, sem pontuação, sem parênteses e sem sufixo societário. */
export const nucleo = (nome) =>
  nome
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\((.*?)\)/g, ' $1 ')
    .replace(SUFIXOS, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Distância de edição, com corte: acima do limite não interessa quanto é. */
export function distancia(a, b, limite = 3) {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  let anterior = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(
        anterior[j] + 1,
        atual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (atual[j] < menor) menor = atual[j];
    }
    if (menor > limite) return limite + 1;
    anterior = atual;
  }
  return anterior[b.length];
}

const escaparRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MOVIMENTO = `
  (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = c.id) AS pedidos,
  (SELECT COUNT(*) FROM orcamentos o WHERE o.cliente_id = c.id) AS orcamentos,
  (SELECT COUNT(*) FROM oportunidades op WHERE op.cliente_id = c.id) AS oportunidades,
  (SELECT COUNT(*) FROM titulos t WHERE t.cliente_id = c.id) AS titulos,
  (SELECT MAX(p.data_pedido) FROM pedidos p WHERE p.cliente_id = c.id) AS ultimo_pedido`;

/**
 * Grupos de clientes que parecem ser a mesma empresa.
 *
 * - `identico`: mesma chave estrita — só muda acento, ponto ou espaço.
 * - `nucleo`:   mesmo núcleo — muda também um "LTDA" ou um parêntese.
 * - `parecido`: o núcleo difere por uma ou duas letras (BOSO / BOZO).
 *
 * A primeira faixa é fato; as outras duas são palpite e precisam de olho humano.
 */
export function duplicatasClientes({ incluirParecidos = true } = {}, db = getDb()) {
  // Quem já foi juntado a outro não volta à lista: o caso está resolvido.
  const clientes = db
    .prepare(
      `SELECT c.id, c.nome, c.cnpj, c.cidade, c.uf, c.ativo, ${MOVIMENTO}
       FROM clientes c WHERE c.mesclado_em IS NULL ORDER BY c.nome`
    )
    .all()
    .map((c) => ({ ...c, chave: chaveEstrita(c.nome), nucleo: nucleo(c.nome) }));

  const grupos = [];
  const jaAgrupado = new Set();

  const agrupar = (campo, confianca) => {
    const mapa = new Map();
    for (const c of clientes) {
      if (jaAgrupado.has(c.id)) continue;
      const k = c[campo];
      if (!k) continue;
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(c);
    }
    for (const membros of mapa.values()) {
      if (membros.length < 2) continue;
      membros.forEach((m) => jaAgrupado.add(m.id));
      grupos.push(montarGrupo(membros, confianca));
    }
  };

  agrupar('chave', 'identico');
  agrupar('nucleo', 'nucleo');

  if (incluirParecidos) {
    // O último passo é quadrático; só entra quem sobrou dos dois anteriores.
    const restantes = clientes.filter((c) => !jaAgrupado.has(c.id) && c.nucleo.length >= 8);
    for (let i = 0; i < restantes.length; i++) {
      if (jaAgrupado.has(restantes[i].id)) continue;
      const parecidos = [restantes[i]];
      for (let j = i + 1; j < restantes.length; j++) {
        if (jaAgrupado.has(restantes[j].id)) continue;
        if (distancia(restantes[i].nucleo, restantes[j].nucleo, 2) <= 2) parecidos.push(restantes[j]);
      }
      if (parecidos.length < 2) continue;
      parecidos.forEach((m) => jaAgrupado.add(m.id));
      grupos.push(montarGrupo(parecidos, 'parecido'));
    }
  }

  const ordem = { identico: 0, nucleo: 1, parecido: 2 };
  return grupos.sort((a, b) => ordem[a.confianca] - ordem[b.confianca] || b.movimento - a.movimento);
}

/** O sugerido para ficar é quem tem mais história — e, no empate, o cadastro mais completo. */
function montarGrupo(membros, confianca) {
  const peso = (c) =>
    c.pedidos * 100 + c.orcamentos * 10 + c.oportunidades * 5 + c.titulos +
    (c.cnpj ? 3 : 0) + (c.cidade ? 1 : 0) + (c.ativo ? 1 : 0);
  const ordenados = [...membros].sort((a, b) => peso(b) - peso(a) || a.id - b.id);
  return {
    confianca,
    chave: ordenados[0].chave,
    manter: ordenados[0].id,
    membros: ordenados,
    movimento: membros.reduce((s, c) => s + c.pedidos + c.orcamentos + c.oportunidades + c.titulos, 0),
  };
}

/**
 * Junta clientes repetidos: tudo que aponta para os que saem passa a apontar
 * para o que fica, e os que saem viram inativos com a marca de para onde foram.
 *
 * Ficam inativos em vez de sumir porque o histórico importado ainda cita o nome
 * antigo; apagar tiraria a pista de quem quisesse conferir depois.
 */
export function mesclarClientes(destinoId, origemIds, db = getDb()) {
  const destino = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(destinoId);
  if (!destino) throw notFound('Cliente de destino não encontrado');

  const origens = origemIds
    .filter((id) => Number(id) !== destino.id)
    .map((id) => {
      const c = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id);
      if (!c) throw notFound(`Cliente ${id} não encontrado`);
      return c;
    });
  if (origens.length === 0) throw badRequest('Informe ao menos um cliente para juntar ao destino');

  const movidos = { pedidos: 0, orcamentos: 0, oportunidades: 0, titulos: 0, interacoes: 0 };
  const renumerados = [];

  db.transaction(() => {
    for (const origem of origens) {
      // pedidos tem UNIQUE (numero, cliente_id, data_pedido): se o destino já
      // tem o mesmo número na mesma data, o pedido movido ganha um sufixo.
      const colisoes = db
        .prepare(
          `SELECT o.id, o.numero, o.data_pedido FROM pedidos o
           WHERE o.cliente_id = @origem
             AND EXISTS (SELECT 1 FROM pedidos d
                         WHERE d.cliente_id = @destino AND d.numero = o.numero
                           AND d.data_pedido = o.data_pedido)`
        )
        .all({ origem: origem.id, destino: destino.id });

      for (const p of colisoes) {
        let sufixo = 2;
        let novo = `${p.numero}-${sufixo}`;
        const existe = db.prepare(
          `SELECT 1 FROM pedidos WHERE numero = ? AND cliente_id = ? AND data_pedido = ?`
        );
        while (existe.get(novo, destino.id, p.data_pedido)) novo = `${p.numero}-${++sufixo}`;
        db.prepare(`UPDATE pedidos SET numero = ? WHERE id = ?`).run(novo, p.id);
        renumerados.push({ de: p.numero, para: novo });
      }

      movidos.pedidos += db.prepare(`UPDATE pedidos SET cliente_id = ? WHERE cliente_id = ?`)
        .run(destino.id, origem.id).changes;
      movidos.orcamentos += db.prepare(`UPDATE orcamentos SET cliente_id = ? WHERE cliente_id = ?`)
        .run(destino.id, origem.id).changes;
      movidos.oportunidades += db.prepare(`UPDATE oportunidades SET cliente_id = ? WHERE cliente_id = ?`)
        .run(destino.id, origem.id).changes;
      movidos.titulos += db.prepare(`UPDATE titulos SET cliente_id = ? WHERE cliente_id = ?`)
        .run(destino.id, origem.id).changes;
      movidos.interacoes += db.prepare(`UPDATE interacoes SET cliente_id = ? WHERE cliente_id = ?`)
        .run(destino.id, origem.id).changes;

      // O que o destino não tem e a origem tem é aproveitado.
      for (const campo of ['cnpj', 'contato', 'email', 'telefone', 'cidade', 'uf', 'categoria_id']) {
        if (!destino[campo] && origem[campo]) {
          db.prepare(`UPDATE clientes SET ${campo} = ? WHERE id = ?`).run(origem[campo], destino.id);
          destino[campo] = origem[campo];
        }
      }

      const nota = `Cadastro duplicado — juntado a "${destino.nome}" (#${destino.id})`;
      db.prepare(`UPDATE clientes SET ativo = 0, mesclado_em = ?, observacao = ? WHERE id = ?`)
        .run(destino.id, origem.observacao ? `${origem.observacao}\n${nota}` : nota, origem.id);
    }
  })();

  return {
    destino: db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(destino.id),
    inativados: origens.map((o) => ({ id: o.id, nome: o.nome })),
    movidos,
    renumerados,
  };
}

/** Nomes com lixo de digitação: número de pedido colado na frente, espaço duplo, sobra de pontuação. */
export function nomesSuspeitos(db = getDb()) {
  const achados = [];
  for (const c of db.prepare(`SELECT id, nome FROM clientes ORDER BY nome`).all()) {
    let sugestao = c.nome;
    const motivos = [];

    // "69PATAGONIA CAFÉ" — dígitos grudados numa palavra que continua em letra.
    const grudado = /^(\d{1,5})(?=[A-Za-zÀ-ÿ]{3,})/.exec(sugestao);
    if (grudado) {
      sugestao = sugestao.slice(grudado[1].length);
      motivos.push(`número "${grudado[1]}" colado no início do nome`);
    }
    if (/\s{2,}/.test(sugestao)) {
      sugestao = sugestao.replace(/\s{2,}/g, ' ');
      motivos.push('espaços repetidos');
    }
    if (sugestao !== sugestao.trim()) {
      sugestao = sugestao.trim();
      motivos.push('espaço nas pontas');
    }
    if (/[,;.\-]$/.test(sugestao)) {
      sugestao = sugestao.replace(/[,;.\-]+$/, '').trim();
      motivos.push('pontuação sobrando no fim');
    }

    if (motivos.length && sugestao && sugestao !== c.nome) {
      const conflito = db.prepare(`SELECT id, nome FROM clientes WHERE nome = ? AND id <> ?`)
        .get(sugestao, c.id);
      achados.push({ id: c.id, nome: c.nome, sugestao, motivos, conflito: conflito ?? null });
    }
  }
  return achados;
}

/** Aplica a sugestão de nome. Se já existe alguém com o nome limpo, é caso de junção, não de renomear. */
export function corrigirNome(id, nome, db = getDb()) {
  const cliente = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id);
  if (!cliente) throw notFound('Cliente não encontrado');
  const limpo = String(nome).trim();
  if (!limpo) throw badRequest('O nome não pode ficar vazio');

  const ocupado = db.prepare(`SELECT id FROM clientes WHERE nome = ? AND id <> ?`).get(limpo, id);
  if (ocupado) {
    throw conflict(`Já existe o cliente "${limpo}" (#${ocupado.id}). Junte os dois cadastros em vez de renomear.`);
  }
  db.prepare(`UPDATE clientes SET nome = ? WHERE id = ?`).run(limpo, id);
  return db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id);
}

/**
 * Pedidos que passaram muito da data de entrega e ninguém baixou.
 *
 * Não são necessariamente atraso: quase sempre é venda antiga que foi entregue
 * e o sistema nunca soube. Enquanto estiverem assim, sujam a carteira e o
 * indicador de atraso — o pedido de 2024 aparece com 900 dias de espera.
 *
 * A produção conta junto: pedido com ordem ainda em andamento provavelmente é
 * atraso de verdade, e não esquecimento de baixa.
 */
export function pedidosParados({ dias = 180 } = {}, db = getDb()) {
  return db
    .prepare(
      `SELECT p.id, p.numero, p.data_pedido, p.data_entrega, p.situacao,
              c.nome AS cliente,
              COUNT(i.id)                                     AS itens,
              ROUND(SUM(i.quantidade), 2)                     AS pecas,
              ROUND(SUM(i.quantidade * i.preco_unitario), 2)  AS valor,
              MIN(COALESCE(i.data_entrega, p.data_entrega))    AS primeira_entrega,
              CAST(julianday('now')
                   - julianday(MAX(COALESCE(i.data_entrega, p.data_entrega))) AS INTEGER) AS dias_atraso,
              (SELECT COUNT(*) FROM ordens_producao op
                JOIN pedido_itens pi ON pi.id = op.pedido_item_id
                WHERE pi.pedido_id = p.id
                  AND op.status NOT IN ('ENTREGUE','CANCELADA'))            AS ordens_abertas
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       JOIN pedido_itens i ON i.pedido_id = p.id
       WHERE p.situacao NOT IN ('ENTREGUE', 'CANCELADO')
       GROUP BY p.id
       HAVING MAX(COALESCE(i.data_entrega, p.data_entrega)) IS NOT NULL
          AND MAX(COALESCE(i.data_entrega, p.data_entrega)) < date('now', ?)
       ORDER BY dias_atraso DESC`
    )
    .all(`-${Number(dias) || 180} day`);
}

/**
 * Baixa em lote dos pedidos escolhidos.
 *
 * Marca o pedido como entregue e fecha junto as ordens que ainda estavam
 * abertas — deixar OP viva de um pedido baixado só devolveria o problema
 * pela tela de produção.
 */
export function encerrarPedidos(ids, db = getDb()) {
  if (!ids?.length) throw badRequest('Informe os pedidos a encerrar');

  let pedidos = 0;
  let ordens = 0;
  db.transaction(() => {
    const baixarPedido = db.prepare(
      `UPDATE pedidos SET situacao = 'ENTREGUE'
       WHERE id = ? AND situacao NOT IN ('ENTREGUE','CANCELADO')`
    );
    const baixarOrdens = db.prepare(
      `UPDATE ordens_producao SET status = 'ENTREGUE'
       WHERE status NOT IN ('ENTREGUE','CANCELADA')
         AND pedido_item_id IN (SELECT id FROM pedido_itens WHERE pedido_id = ?)`
    );
    for (const id of ids) {
      const mudou = baixarPedido.run(id).changes;
      if (!mudou) continue;
      pedidos += mudou;
      ordens += baixarOrdens.run(id).changes;
    }
  })();
  return { pedidos, ordens };
}

/**
 * Entrega marcada antes da venda — o pedido de 16/12/2024 com entrega em
 * 17/01/2024. Quase sempre é o ano digitado errado na importação, e é o que
 * faz um pedido aparecer com 961 dias de atraso.
 */
export function datasInvertidas(db = getDb()) {
  return db
    .prepare(
      `SELECT i.id AS item_id, p.id AS pedido_id, p.numero, c.nome AS cliente,
              pr.descricao AS produto, p.data_pedido,
              COALESCE(i.data_entrega, p.data_entrega) AS data_entrega,
              i.data_entrega IS NOT NULL AS no_item,
              CAST(julianday(p.data_pedido)
                   - julianday(COALESCE(i.data_entrega, p.data_entrega)) AS INTEGER) AS dias
       FROM pedidos p
       JOIN pedido_itens i ON i.pedido_id = p.id
       JOIN produtos pr ON pr.id = i.produto_id
       JOIN clientes c ON c.id = p.cliente_id
       WHERE COALESCE(i.data_entrega, p.data_entrega) < p.data_pedido
       ORDER BY dias DESC`
    )
    .all()
    .map((linha) => ({
      ...linha,
      // Um ano a mais quase sempre resolve; quando não resolve, o palpite fica de fora.
      sugestao: adiantarUmAno(linha.data_entrega, linha.data_pedido),
    }));
}

const adiantarUmAno = (entrega, pedido) => {
  const proposta = `${Number(entrega.slice(0, 4)) + 1}${entrega.slice(4)}`;
  return proposta >= pedido ? proposta : null;
};

/** Grava a data de entrega corrigida no item (ou no pedido, quando o item não tem a sua). */
export function corrigirEntrega(itemId, data, db = getDb()) {
  const item = db
    .prepare(`SELECT i.*, p.data_pedido FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id WHERE i.id = ?`)
    .get(itemId);
  if (!item) throw notFound('Item de pedido não encontrado');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) throw badRequest('Data inválida');
  if (data < item.data_pedido) throw badRequest('A entrega não pode ser anterior à data do pedido');

  if (item.data_entrega !== null) {
    db.prepare(`UPDATE pedido_itens SET data_entrega = ? WHERE id = ?`).run(data, item.id);
  } else {
    db.prepare(`UPDATE pedidos SET data_entrega = ? WHERE id = ?`).run(data, item.pedido_id);
  }
  return { ok: true, item_id: item.id, data_entrega: data };
}

/**
 * A mesma venda lançada duas vezes.
 *
 * Aparece quando o cliente estava repetido no cadastro e cada cópia recebeu o
 * pedido, ou quando a planilha trouxe a mesma linha em dois formatos — um com
 * o produto quebrado por tamanho, outro consolidado. Some do olho porque os
 * números batem: é preciso comparar cliente, data e valor ao mesmo tempo.
 */
export function pedidosDuplicados(db = getDb()) {
  const pedidos = db
    .prepare(
      `SELECT p.id, p.numero, p.cliente_id, c.nome AS cliente, p.data_pedido, p.situacao,
              COUNT(i.id)                                    AS itens,
              ROUND(SUM(i.quantidade), 2)                    AS pecas,
              ROUND(SUM(i.quantidade * i.preco_unitario), 2) AS valor,
              (SELECT COUNT(*) FROM ordens_producao o
                JOIN pedido_itens pi ON pi.id = o.pedido_item_id
                WHERE pi.pedido_id = p.id) AS ordens,
              (SELECT COUNT(*) FROM apontamentos a
                JOIN ordens_producao o ON o.id = a.ordem_id
                JOIN pedido_itens pi ON pi.id = o.pedido_item_id
                WHERE pi.pedido_id = p.id) AS apontamentos,
              (SELECT COUNT(*) FROM titulos t WHERE t.pedido_id = p.id) AS titulos
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       JOIN pedido_itens i ON i.pedido_id = p.id
       WHERE p.situacao <> 'CANCELADO'
       GROUP BY p.id`
    )
    .all();

  // Candidatos só se comparam dentro do mesmo cliente e da mesma data; o balde
  // é pequeno, então vale comparar par a par em vez de inventar chave de texto.
  const baldes = new Map();
  for (const p of pedidos) {
    const k = `${p.cliente_id}|${p.data_pedido}`;
    if (!baldes.has(k)) baldes.set(k, []);
    baldes.get(k).push(p);
  }

  // "1057" e "1057-2" são o mesmo número: o sufixo nasceu da junção de cadastros.
  // A comparação é pelo prefixo inteiro, para não picar um "R-500" legítimo.
  const mesmoNumero = (a, b) => {
    const x = String(a.numero);
    const y = String(b.numero);
    return x === y || new RegExp(`^${escaparRegex(x)}-\\d+$`).test(y)
                   || new RegExp(`^${escaparRegex(y)}-\\d+$`).test(x);
  };
  const mesmoValor = (a, b) => Math.abs(a.valor - b.valor) < 0.005;

  const achados = [];
  for (const balde of baldes.values()) {
    if (balde.length < 2) continue;
    const usados = new Set();

    // Duas passadas: primeiro o critério forte, depois o fraco com o que sobrou.
    for (const [combina, confianca, motivo] of [
      [mesmoNumero, 'repetido', 'Mesmo cliente, mesma data e mesmo número de pedido.'],
      [mesmoValor, 'confira',
       'Mesmo cliente, mesma data e mesmo valor, com números diferentes — pode ser uma segunda compra.'],
    ]) {
      for (const p of balde) {
        if (usados.has(p.id)) continue;
        const membros = balde.filter((o) => !usados.has(o.id) && (o.id === p.id || combina(p, o)));
        if (membros.length < 2) continue;
        membros.forEach((m) => usados.add(m.id));
        achados.push({
          confianca,
          motivo,
          chave: membros.map((m) => m.id).sort((a, b) => a - b).join(','),
          cliente: membros[0].cliente,
          data_pedido: membros[0].data_pedido,
          valor: Math.max(...membros.map((m) => m.valor)),
          // Quem já produziu ou faturou é o que fica; empatado, vale o lançamento
          // mais completo — é o que costuma ser o pedido de verdade.
          manter: [...membros].sort(
            (a, b) => (b.apontamentos - a.apontamentos) || (b.titulos - a.titulos)
                   || (b.itens - a.itens) || (b.valor - a.valor) || (a.id - b.id)
          )[0].id,
          membros,
        });
      }
    }
  }

  const ordem = { repetido: 0, confira: 1 };
  return achados.sort((a, b) => ordem[a.confianca] - ordem[b.confianca] || b.valor - a.valor);
}

/**
 * Cancela o pedido repetido. Cancelar e não apagar porque a numeração é a
 * ponte com a planilha de origem: sumindo com ela, ninguém mais reconcilia.
 */
export function cancelarPedidos(ids, db = getDb()) {
  if (!ids?.length) throw badRequest('Informe os pedidos a cancelar');

  let cancelados = 0;
  let ordens = 0;
  const recusados = [];
  db.transaction(() => {
    for (const id of ids) {
      const pedido = db.prepare(`SELECT * FROM pedidos WHERE id = ?`).get(id);
      if (!pedido) throw notFound(`Pedido ${id} não encontrado`);

      // Produção apontada é trabalho que aconteceu; cancelar apagaria o registro dele.
      const { apontamentos } = db
        .prepare(
          `SELECT COUNT(*) AS apontamentos FROM apontamentos a
             JOIN ordens_producao o ON o.id = a.ordem_id
             JOIN pedido_itens i ON i.id = o.pedido_item_id
            WHERE i.pedido_id = ?`
        )
        .get(id);
      if (apontamentos > 0) {
        recusados.push({ id, numero: pedido.numero, motivo: `tem ${apontamentos} apontamento(s) de produção` });
        continue;
      }

      cancelados += db.prepare(`UPDATE pedidos SET situacao = 'CANCELADO' WHERE id = ?`).run(id).changes;
      ordens += db
        .prepare(
          `UPDATE ordens_producao SET status = 'CANCELADA'
            WHERE status <> 'CANCELADA'
              AND pedido_item_id IN (SELECT id FROM pedido_itens WHERE pedido_id = ?)`
        )
        .run(id).changes;
    }
  })();
  return { cancelados, ordens, recusados };
}

/** Um retrato do estado do cadastro, para a tela abrir já dizendo o que há. */
export function resumoQualidade(db = getDb()) {
  const grupos = duplicatasClientes({}, db);
  const nomes = nomesSuspeitos(db);
  const parados = pedidosParados({}, db);
  const invertidas = datasInvertidas(db);
  const repetidos = pedidosDuplicados(db);
  return {
    duplicatas: {
      grupos: grupos.length,
      cadastros: grupos.reduce((s, g) => s + g.membros.length, 0),
      identicos: grupos.filter((g) => g.confianca === 'identico').length,
      a_confirmar: grupos.filter((g) => g.confianca !== 'identico').length,
    },
    nomes: nomes.length,
    parados: {
      pedidos: parados.length,
      valor: Math.round(parados.reduce((s, p) => s + p.valor, 0) * 100) / 100,
      com_ordem_aberta: parados.filter((p) => p.ordens_abertas > 0).length,
      maior_atraso: parados[0]?.dias_atraso ?? 0,
    },
    datas: {
      itens: invertidas.length,
      com_sugestao: invertidas.filter((d) => d.sugestao).length,
    },
    pedidos_repetidos: {
      grupos: repetidos.length,
      repetidos: repetidos.filter((g) => g.confianca === 'repetido').length,
      a_confirmar: repetidos.filter((g) => g.confianca !== 'repetido').length,
      valor: Math.round(
        repetidos.filter((g) => g.confianca === 'repetido').reduce((s, g) => s + g.valor, 0) * 100
      ) / 100,
    },
  };
}

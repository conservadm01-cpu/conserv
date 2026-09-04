import { getDb } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { round2 } from '../lib/numbers.js';
import { custoMinutoDepartamento, jornada } from './custeio.js';
import { recalcularStatusOrdem } from './producao.js';

/**
 * Registra produção de uma etapa da ordem.
 *
 * O custo de mão de obra do apontamento é calculado aqui e congelado na linha:
 * é o que a hora daquele setor custava no dia. Se amanhã a folha mudar, o
 * histórico continua contando a verdade de ontem.
 *
 * Quando o apontador não informa os minutos, usamos o tempo padrão do roteiro
 * do produto — melhor uma estimativa coerente do que zero.
 */
export function registrarApontamento(dados, db = getDb()) {
  const ordem = db
    .prepare(
      `SELECT o.*, i.produto_id FROM ordens_producao o
       JOIN pedido_itens i ON i.id = o.pedido_item_id WHERE o.id = ?`
    )
    .get(dados.ordem_id);
  if (!ordem) throw notFound('Ordem de produção não encontrada');
  if (ordem.status === 'CANCELADA') throw badRequest('Ordem cancelada não aceita apontamento');

  const etapa = db
    .prepare(`SELECT e.*, d.id AS depto FROM etapas e LEFT JOIN departamentos d ON d.id = e.departamento_id WHERE e.id = ?`)
    .get(dados.etapa_id);
  if (!etapa) throw notFound('Etapa não encontrada');

  const naOrdem = db
    .prepare(`SELECT id FROM ordem_etapas WHERE ordem_id = ? AND etapa_id = ?`)
    .get(ordem.id, etapa.id);
  if (!naOrdem) throw badRequest('Esta etapa não faz parte do roteiro da ordem');

  const quantidade = Number(dados.quantidade ?? 0);
  const refugo = Number(dados.refugo ?? 0);
  if (quantidade <= 0 && refugo <= 0) {
    throw badRequest('Informe a quantidade produzida ou o refugo');
  }

  const jaProduzido = db
    .prepare(`SELECT COALESCE(SUM(quantidade + refugo), 0) AS n FROM apontamentos WHERE ordem_id = ? AND etapa_id = ?`)
    .get(ordem.id, etapa.id).n;
  if (jaProduzido + quantidade + refugo > ordem.quantidade + 1e-9) {
    throw badRequest(
      `Apontamento acima do saldo da etapa: a ordem tem ${ordem.quantidade} peças e ` +
      `${round2(jaProduzido)} já foram apontadas em ${etapa.nome}`
    );
  }

  const minutos = Number(dados.minutos ?? 0) > 0
    ? Number(dados.minutos)
    : minutosPadrao(ordem.produto_id, etapa.id, quantidade + refugo, db);

  const custoMinuto = etapa.depto ? custoMinutoDepartamento(etapa.depto, db).custo_minuto : 0;

  const info = db
    .prepare(
      `INSERT INTO apontamentos
         (ordem_id, etapa_id, colaborador_id, equipamento_id, data, quantidade, refugo, minutos, custo_mo, observacao, usuario_id)
       VALUES (@ordem_id, @etapa_id, @colaborador_id, @equipamento_id, @data, @quantidade, @refugo, @minutos, @custo_mo, @observacao, @usuario_id)`
    )
    .run({
      ordem_id: ordem.id,
      etapa_id: etapa.id,
      colaborador_id: dados.colaborador_id ?? null,
      equipamento_id: dados.equipamento_id ?? null,
      data: dados.data || new Date().toISOString().slice(0, 10),
      quantidade,
      refugo,
      minutos: round2(minutos),
      custo_mo: round2(minutos * custoMinuto),
      observacao: dados.observacao ?? null,
      usuario_id: dados.usuario_id ?? null,
    });

  avancarEtapaPeloApontado(ordem, etapa.id, db);
  return db.prepare(`SELECT * FROM apontamentos WHERE id = ?`).get(info.lastInsertRowid);
}

/** Tempo padrão do roteiro do produto para aquela etapa, em minutos. */
function minutosPadrao(produtoId, etapaId, pecas, db) {
  const linha = db
    .prepare(`SELECT tempo_por_peca_min FROM produto_processo WHERE produto_id = ? AND etapa_id = ?`)
    .get(produtoId, etapaId);
  return (linha?.tempo_por_peca_min ?? 0) * pecas;
}

/**
 * A etapa entra em andamento no primeiro apontamento e conclui sozinha quando
 * o total apontado alcança a quantidade da ordem. Quem produz não precisa
 * lembrar de mudar o status na mão.
 */
function avancarEtapaPeloApontado(ordem, etapaId, db) {
  const { n: apontado } = db
    .prepare(`SELECT COALESCE(SUM(quantidade + refugo), 0) AS n FROM apontamentos WHERE ordem_id = ? AND etapa_id = ?`)
    .get(ordem.id, etapaId);

  const concluida = apontado >= ordem.quantidade - 1e-9;
  const hoje = new Date().toISOString().slice(0, 10);
  const { n: custo } = db
    .prepare(`SELECT COALESCE(SUM(custo_mo), 0) AS n FROM apontamentos WHERE ordem_id = ? AND etapa_id = ?`)
    .get(ordem.id, etapaId);

  db.prepare(
    `UPDATE ordem_etapas
     SET status = ?, custo_mo = ?, iniciado_em = COALESCE(iniciado_em, ?), concluido_em = ?
     WHERE ordem_id = ? AND etapa_id = ?`
  ).run(
    concluida ? 'CONCLUIDA' : 'EM_ANDAMENTO',
    round2(custo),
    hoje,
    concluida ? hoje : null,
    ordem.id,
    etapaId
  );

  recalcularStatusOrdem(ordem.id, db);
}

export function excluirApontamento(id, db = getDb()) {
  const apont = db.prepare(`SELECT * FROM apontamentos WHERE id = ?`).get(id);
  if (!apont) throw notFound('Apontamento não encontrado');
  const ordem = db.prepare(`SELECT * FROM ordens_producao WHERE id = ?`).get(apont.ordem_id);
  db.prepare(`DELETE FROM apontamentos WHERE id = ?`).run(id);
  if (ordem) avancarEtapaPeloApontado(ordem, apont.etapa_id, db);
  return { ok: true };
}

/** Produtividade por colaborador no período: peças, minutos e custo. */
export function produtividade({ de, ate }, db = getDb()) {
  return db
    .prepare(
      `SELECT c.id, c.nome AS colaborador, d.nome AS departamento,
              COUNT(a.id) AS apontamentos,
              ROUND(SUM(a.quantidade), 2) AS pecas,
              ROUND(SUM(a.refugo), 2) AS refugo,
              ROUND(SUM(a.minutos), 1) AS minutos,
              ROUND(SUM(a.custo_mo), 2) AS custo_mo,
              ROUND(CASE WHEN SUM(a.minutos) > 0 THEN SUM(a.quantidade) / (SUM(a.minutos) / 60.0) ELSE 0 END, 2) AS pecas_hora
       FROM apontamentos a
       JOIN colaboradores c ON c.id = a.colaborador_id
       LEFT JOIN departamentos d ON d.id = c.departamento_id
       WHERE (? IS NULL OR a.data >= ?) AND (? IS NULL OR a.data <= ?)
       GROUP BY c.id ORDER BY pecas DESC`
    )
    .all(de ?? null, de ?? null, ate ?? null, ate ?? null);
}

/**
 * Eficiência do dia por setor: minutos apontados contra a capacidade
 * disponível, descontando o tempo parado registrado em ocorrências.
 */
export function eficienciaPorSetor({ de, ate }, db = getDb()) {
  const j = jornada(db);
  return db
    .prepare(
      `SELECT d.id, d.nome AS departamento,
              (SELECT COUNT(*) FROM colaboradores c
                WHERE c.departamento_id = d.id AND c.status = 'ATIVO' AND c.ativo = 1 AND c.produtivo = 1) AS pessoas,
              COALESCE((SELECT SUM(a.minutos) FROM apontamentos a
                JOIN etapas e ON e.id = a.etapa_id
                WHERE e.departamento_id = d.id
                  AND (? IS NULL OR a.data >= ?) AND (? IS NULL OR a.data <= ?)), 0) AS minutos_produzidos,
              COALESCE((SELECT SUM(o.minutos_parado) FROM ocorrencias o
                WHERE o.departamento_id = d.id
                  AND (? IS NULL OR o.data >= ?) AND (? IS NULL OR o.data <= ?)), 0) AS minutos_parados
       FROM departamentos d WHERE d.ativo = 1 AND d.produtivo = 1
       ORDER BY d.nome`
    )
    .all(de ?? null, de ?? null, ate ?? null, ate ?? null, de ?? null, de ?? null, ate ?? null, ate ?? null)
    .map((linha) => {
      const dias = diasEntre(de, ate);
      const disponivel = linha.pessoas * j.minutos_produtivos * dias;
      return {
        ...linha,
        dias,
        minutos_disponiveis: disponivel,
        eficiencia_percentual: disponivel > 0 ? round2((linha.minutos_produzidos / disponivel) * 100) : 0,
        parada_percentual: disponivel > 0 ? round2((linha.minutos_parados / disponivel) * 100) : 0,
      };
    });
}

/** Dias corridos do intervalo (mínimo 1) — base do cálculo de capacidade. */
function diasEntre(de, ate) {
  if (!de || !ate) return 1;
  const dias = Math.round((new Date(`${ate}T00:00:00Z`) - new Date(`${de}T00:00:00Z`)) / 86400000) + 1;
  return dias > 0 ? dias : 1;
}

/**
 * Programação semanal da fábrica — o "SEMANA DE ENTREGA" da planilha virado PCP.
 *
 * A carteira da ConServ é planejada por semana: cada pedido nasce numa semana e
 * promete entrega em outra. Até aqui o ERP sabia em que etapa cada ordem estava
 * parada (o quadro), mas não respondia à pergunta que decide se dá para aceitar o
 * pedido: *quanto de trabalho já está prometido para a semana 37 e cabe na costura?*
 *
 * O plano confronta as duas pontas:
 *   carga    = etapas ainda pendentes das ordens em aberto × tempo padrão da peça;
 *   capacidade = gente produtiva do setor × jornada × dias da semana × ocupação.
 *
 * A carga é lançada na semana da data prometida — é quando ela tem de estar pronta.
 * Ordem vencida não some do plano: entra na primeira semana, porque é trabalho que
 * a fábrica ainda deve e que disputa a mesma máquina da semana que começa agora.
 */
import { getDb } from '../db/index.js';
import { round2 } from '../lib/numbers.js';
import { badRequest } from '../lib/errors.js';
import {
  hoje, semanaISO, anoISO, inicioSemana, fimSemana, somarDias, semanasEntre,
} from '../lib/dates.js';
import { jornada } from './custeio.js';

/** Acima disso a semana está vendida: sobra pouco para o improviso do dia a dia. */
const LIMITE_APERTADO = 85;

const SEM_SETOR = 'SEM SETOR';

/**
 * Minutos que cada setor produz numa semana.
 *
 * Só entra quem produz: supervisão e administrativo já são custo indireto, e
 * contá-los como capacidade faria a fábrica parecer maior do que é. Sábado só
 * conta quando está na jornada, e hora extra fica de fora da capacidade — é
 * folga que o PCP decide usar, não o normal.
 */
export function capacidadeSemanal(db = getDb()) {
  const j = jornada(db);
  const dias = String(j.dias_semana ?? '')
    .split(',')
    .map((d) => Number(String(d).trim()))
    .filter((d) => d >= 1 && d <= 7);

  const diasNormais = dias.filter((d) => d !== 6).length;
  const temSabado = dias.includes(6);
  const minutosSabado = temSabado ? j.minutos_sabado || j.minutos_produtivos : 0;
  const minutosPessoa = j.minutos_produtivos * diasNormais + minutosSabado;
  const ocupacao = j.ocupacao_percentual / 100;

  const setores = db
    .prepare(
      `SELECT d.id, d.nome,
              (SELECT COUNT(*) FROM colaboradores c
                WHERE c.departamento_id = d.id AND c.ativo = 1
                  AND c.status = 'ATIVO' AND c.produtivo = 1) AS pessoas
       FROM departamentos d
       WHERE d.ativo = 1 AND d.produtivo = 1
       ORDER BY d.nome`
    )
    .all();

  return {
    dias_uteis_semana: diasNormais + (temSabado ? 1 : 0),
    minutos_dia: j.minutos_produtivos,
    minutos_sabado: minutosSabado,
    minutos_pessoa_semana: minutosPessoa,
    ocupacao_percentual: j.ocupacao_percentual,
    setores: setores.map((s) => {
      const minutos = Math.round(s.pessoas * minutosPessoa * ocupacao);
      return {
        departamento_id: s.id,
        setor: s.nome,
        pessoas: s.pessoas,
        minutos_semana: minutos,
        horas_semana: round2(minutos / 60),
        // Quanto a mais caberia esticando a jornada — o plano B do PCP.
        minutos_extra_semana: Math.round(s.pessoas * j.minutos_extensao * diasNormais * ocupacao),
        sem_equipe: s.pessoas === 0,
      };
    }),
  };
}

/** Etapas ainda por fazer das ordens em aberto, já com o tempo padrão da peça. */
function cargaPendente(db) {
  return db
    .prepare(
      `SELECT o.id AS ordem_id, o.numero, o.quantidade, o.data_prevista, o.status,
              v.cliente, v.produto, v.grupo, v.pedido_numero, v.total AS valor,
              e.codigo AS etapa_codigo, e.nome AS etapa_nome, e.ordem AS etapa_ordem,
              COALESCE(d.nome, ?) AS setor,
              oe.status AS etapa_status, oe.custo_mo,
              COALESCE(pp.tempo_por_peca_min, 0) AS tempo_por_peca_min
       FROM ordens_producao o
       JOIN vw_itens v ON v.item_id = o.pedido_item_id
       JOIN ordem_etapas oe ON oe.ordem_id = o.id
       JOIN etapas e ON e.id = oe.etapa_id
       LEFT JOIN departamentos d ON d.id = e.departamento_id
       LEFT JOIN produto_processo pp ON pp.produto_id = v.produto_id AND pp.etapa_id = e.id
       WHERE o.status IN ('ABERTA','EM_PRODUCAO')
         AND oe.status IN ('PENDENTE','EM_ANDAMENTO')
       ORDER BY o.data_prevista IS NULL, o.data_prevista, o.numero, e.ordem`
    )
    .all(SEM_SETOR);
}

const balde = () => ({ ordens: new Set(), pecas: 0, valor: 0, minutos: 0 });

function totalizar(b) {
  return {
    ordens: b.ordens.size,
    pecas: round2(b.pecas),
    valor: round2(b.valor),
    horas: round2(b.minutos / 60),
  };
}

/**
 * Plano das próximas semanas: carga × capacidade, setor a setor.
 *
 * @param {object} opts
 * @param {number} [opts.semanas=8]  tamanho do horizonte
 * @param {string} [opts.de]         data dentro da primeira semana (padrão: hoje)
 */
export function programacaoSemanal({ semanas = 8, de = null } = {}, db = getDb()) {
  const total = Math.min(Math.max(Number(semanas) || 8, 1), 52);
  const referencia = de || hoje();
  const primeira = inicioSemana(referencia);
  if (!primeira) throw badRequest('Data inicial inválida');

  const capacidade = capacidadeSemanal(db);
  const capacidadePorSetor = new Map(capacidade.setores.map((s) => [s.setor, s]));

  const semanasPlano = Array.from({ length: total }, (_, i) => {
    const inicio = somarDias(primeira, i * 7);
    return {
      indice: i,
      inicio,
      fim: fimSemana(inicio),
      semana: semanaISO(inicio),
      ano: anoISO(inicio),
      rotulo: `S${semanaISO(inicio)}`,
      atrasadas: 0,
      setores: new Map(),
      geral: balde(),
    };
  });

  const foraDoHorizonte = balde();
  const semData = balde();
  const fila = new Map();
  const semTempo = new Map();

  for (const linha of cargaPendente(db)) {
    const minutos = linha.quantidade * linha.tempo_por_peca_min;

    // Fila total do setor: tudo que está prometido, dentro ou fora do horizonte.
    const f = fila.get(linha.setor) ?? { setor: linha.setor, minutos: 0, ordens: new Set() };
    f.minutos += minutos;
    f.ordens.add(linha.ordem_id);
    fila.set(linha.setor, f);

    if (linha.tempo_por_peca_min <= 0) {
      const s = semTempo.get(linha.setor) ?? new Set();
      s.add(linha.ordem_id);
      semTempo.set(linha.setor, s);
    }

    if (!linha.data_prevista) {
      semData.ordens.add(linha.ordem_id);
      semData.minutos += minutos;
      continue;
    }

    const distancia = semanasEntre(primeira, inicioSemana(linha.data_prevista));
    if (distancia >= total) {
      foraDoHorizonte.ordens.add(linha.ordem_id);
      foraDoHorizonte.minutos += minutos;
      continue;
    }

    // Vencida ou desta semana: a primeira semana é a que tem de dar conta.
    const alvo = semanasPlano[Math.max(distancia, 0)];
    const setor = alvo.setores.get(linha.setor) ?? { ...balde(), setor: linha.setor, sem_tempo: 0 };
    setor.minutos += minutos;
    setor.pecas += linha.quantidade;
    setor.ordens.add(linha.ordem_id);
    if (linha.tempo_por_peca_min <= 0) setor.sem_tempo++;
    alvo.setores.set(linha.setor, setor);

    if (!alvo.geral.ordens.has(linha.ordem_id)) {
      alvo.geral.pecas += linha.quantidade;
      alvo.geral.valor += linha.valor ?? 0;
      if (distancia < 0) alvo.atrasadas++;
    }
    alvo.geral.ordens.add(linha.ordem_id);
    alvo.geral.minutos += minutos;
  }

  const ordemDosSetores = [...capacidade.setores.map((s) => s.setor), SEM_SETOR];
  const posicao = (setor) => {
    const i = ordemDosSetores.indexOf(setor);
    return i < 0 ? ordemDosSetores.length : i;
  };

  const plano = semanasPlano.map((s) => ({
    indice: s.indice,
    semana: s.semana,
    ano: s.ano,
    rotulo: s.rotulo,
    inicio: s.inicio,
    fim: s.fim,
    atrasadas: s.atrasadas,
    ...totalizar(s.geral),
    setores: [...s.setores.values()]
      .map((c) => {
        const cap = capacidadePorSetor.get(c.setor);
        const disponivel = cap?.minutos_semana ?? 0;
        return {
          setor: c.setor,
          ordens: c.ordens.size,
          pecas: round2(c.pecas),
          minutos: Math.round(c.minutos),
          horas: round2(c.minutos / 60),
          sem_tempo: c.sem_tempo,
          capacidade_minutos: disponivel,
          capacidade_horas: round2(disponivel / 60),
          ocupacao_percentual: disponivel > 0 ? Math.round((c.minutos / disponivel) * 100) : null,
          excedente_horas: disponivel > 0 ? round2(Math.max(c.minutos - disponivel, 0) / 60) : 0,
          sem_capacidade: disponivel === 0,
        };
      })
      .sort((a, b) => posicao(a.setor) - posicao(b.setor)),
  }));

  return {
    gerado_em: hoje(),
    de: primeira,
    ate: fimSemana(somarDias(primeira, (total - 1) * 7)),
    semanas: total,
    jornada: {
      minutos_dia: capacidade.minutos_dia,
      dias_uteis_semana: capacidade.dias_uteis_semana,
      ocupacao_percentual: capacidade.ocupacao_percentual,
    },
    capacidade: capacidade.setores,
    plano,
    fora_do_horizonte: totalizar(foraDoHorizonte),
    sem_data: totalizar(semData),
    fila: [...fila.values()]
      .map((f) => {
        const disponivel = capacidadePorSetor.get(f.setor)?.minutos_semana ?? 0;
        return {
          setor: f.setor,
          ordens: f.ordens.size,
          horas: round2(f.minutos / 60),
          capacidade_horas: round2(disponivel / 60),
          semanas_fila: disponivel > 0 ? round2(f.minutos / disponivel) : null,
        };
      })
      .sort((a, b) => posicao(a.setor) - posicao(b.setor)),
    alertas: montarAlertas(plano, capacidade, semTempo),
  };
}

/** O que o PCP precisa ver sem ler a tabela inteira. */
function montarAlertas(plano, capacidade, semTempo) {
  const alertas = [];

  for (const semana of plano) {
    for (const setor of semana.setores) {
      if (setor.ocupacao_percentual != null && setor.ocupacao_percentual > 100) {
        alertas.push({
          tipo: 'EXCEDIDA',
          setor: setor.setor,
          semana: semana.semana,
          texto:
            `${setor.setor} na semana ${semana.semana} está com ${setor.ocupacao_percentual}% ` +
            `da capacidade — faltam ${setor.excedente_horas}h.`,
        });
      }
    }
  }

  for (const setor of capacidade.setores) {
    if (setor.sem_equipe) {
      alertas.push({
        tipo: 'SEM_EQUIPE',
        setor: setor.setor,
        texto: `${setor.setor} não tem ninguém produtivo cadastrado: a capacidade sai zerada.`,
      });
    }
  }

  for (const [setor, ordens] of semTempo) {
    alertas.push({
      tipo: 'SEM_TEMPO',
      setor,
      ordens: ordens.size,
      texto: `${setor}: ${ordens.size} ${ordens.size === 1 ? 'ordem' : 'ordens'}`,
    });
  }

  return alertas;
}

/**
 * Ordens de uma semana do plano, para abrir a célula da grade.
 *
 * `atrasadas` inclui o que venceu antes da semana — é o mesmo critério da
 * primeira coluna do plano, que puxa o vencido para agora.
 */
export function ordensDaSemana(
  { inicio = null, setor = null, atrasadas = false, limite = 200 } = {},
  db = getDb()
) {
  const comeco = inicioSemana(inicio || hoje());
  if (!comeco) throw badRequest('Semana inválida');
  const fim = fimSemana(comeco);

  const linhas = cargaPendente(db).filter((l) => {
    if (!l.data_prevista) return false;
    if (setor && l.setor !== setor) return false;
    if (l.data_prevista > fim) return false;
    return atrasadas ? true : l.data_prevista >= comeco;
  });

  const ordens = new Map();
  for (const l of linhas) {
    const atual = ordens.get(l.ordem_id) ?? {
      ordem_id: l.ordem_id,
      numero: l.numero,
      cliente: l.cliente,
      produto: l.produto,
      grupo: l.grupo,
      pedido_numero: l.pedido_numero,
      quantidade: l.quantidade,
      valor: l.valor,
      data_prevista: l.data_prevista,
      status: l.status,
      atrasada: l.data_prevista < comeco,
      minutos: 0,
      etapas: [],
    };
    atual.minutos += l.quantidade * l.tempo_por_peca_min;
    atual.etapas.push({
      etapa: l.etapa_nome,
      codigo: l.etapa_codigo,
      setor: l.setor,
      status: l.etapa_status,
      horas: round2((l.quantidade * l.tempo_por_peca_min) / 60),
      custo_mo: l.custo_mo,
    });
    ordens.set(l.ordem_id, atual);
  }

  return {
    inicio: comeco,
    fim,
    semana: semanaISO(comeco),
    ano: anoISO(comeco),
    setor,
    ordens: [...ordens.values()]
      .map((o) => ({ ...o, horas: round2(o.minutos / 60) }))
      .sort((a, b) => String(a.data_prevista).localeCompare(String(b.data_prevista)))
      .slice(0, Math.min(Number(limite) || 200, 500)),
  };
}

export { LIMITE_APERTADO };

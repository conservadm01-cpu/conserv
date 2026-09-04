/**
 * Estrutura de fábrica de exemplo: equipe por setor, máquinas, custos fixos e o
 * tempo padrão de cada operação. Com isso o custeio completo (material + mão de
 * obra + indireto) passa a ter números reais em vez de zeros.
 *
 * São valores plausíveis para uma confecção deste porte — troque pelos seus.
 */
import { migrate, getDb } from '../db/index.js';
import { recalcularCustosMO } from '../services/producao.js';
import { custoMinutoDepartamento, taxaCustoIndireto, jornada } from '../services/custeio.js';

const db = migrate(getDb());

const EQUIPE = [
  ['ALMOXARIFADO', [['Almoxarife', 2400, 264]]],
  ['CORTE', [['Encarregado de corte', 3600, 264], ['Cortador', 2600, 264], ['Auxiliar de corte', 2100, 264]]],
  ['SILK', [['Serigrafista', 2900, 264], ['Auxiliar de silk', 2000, 264]]],
  ['COSTURA', [
    ['Encarregada de costura', 3400, 264], ['Costureira', 2300, 264], ['Costureira', 2300, 264],
    ['Costureira', 2250, 264], ['Costureira', 2200, 264], ['Costureira', 2200, 264],
    ['Costureira', 2150, 264], ['Auxiliar de costura', 1900, 264],
  ]],
  ['EMBALAGEM', [['Auxiliar de embalagem', 1950, 264], ['Auxiliar de embalagem', 1950, 264]]],
  ['EXPEDICAO', [['Expedição e faturamento', 2800, 264]]],
];

const EQUIPAMENTOS = [
  ['Mesa de corte 10m', 'Corte', 'CORTE', 1],
  ['Máquina de corte vertical', 'Corte', 'CORTE', 2],
  ['Carrossel de silk 6 cores', 'Serigrafia', 'SILK', 1],
  ['Túnel de cura', 'Serigrafia', 'SILK', 1],
  ['Máquina reta', 'Costura', 'COSTURA', 8],
  ['Overloque', 'Costura', 'COSTURA', 4],
  ['Galoneira', 'Costura', 'COSTURA', 2],
  ['Travete', 'Costura', 'COSTURA', 1],
  ['Mesa de embalagem', 'Acabamento', 'EMBALAGEM', 2],
];

const CUSTOS_FIXOS = [
  ['Aluguel do galpão', 'ALUGUEL', 8500],
  ['Energia elétrica', 'ENERGIA', 3200],
  ['Água e esgoto', 'AGUA', 480],
  ['Manutenção de máquinas', 'MANUTENCAO', 1200],
  ['Administrativo e contabilidade', 'ADMINISTRATIVO', 4800],
  ['Internet e sistemas', 'SOFTWARE', 650],
  ['Seguro predial', 'SEGURO', 380],
  ['Depreciação de máquinas', 'DEPRECIACAO', 1500],
];

/** Tempo padrão de cada operação, em minutos por peça, por grupo de produto. */
const PROCESSO_POR_GRUPO = {
  AVENTAL:    { MATERIA_PRIMA: 0.3, CORTE: 0.8, SILK: 1.2, COSTURA: 4.5, EMBALAGEM: 0.6, NF: 0.1, ENTREGA: 0.1 },
  CAMISETA:   { MATERIA_PRIMA: 0.2, CORTE: 0.6, SILK: 1.5, COSTURA: 5.0, EMBALAGEM: 0.5, NF: 0.1, ENTREGA: 0.1 },
  JALECO:     { MATERIA_PRIMA: 0.4, CORTE: 1.2, SILK: 1.5, COSTURA: 12.0, EMBALAGEM: 0.8, NF: 0.1, ENTREGA: 0.1 },
  KIMONO:     { MATERIA_PRIMA: 0.4, CORTE: 1.0, SILK: 1.2, COSTURA: 9.0, EMBALAGEM: 0.7, NF: 0.1, ENTREGA: 0.1 },
  SACOLA:     { MATERIA_PRIMA: 0.2, CORTE: 0.5, SILK: 1.0, COSTURA: 3.0, EMBALAGEM: 0.4, NF: 0.1, ENTREGA: 0.1 },
  CAPA:       { MATERIA_PRIMA: 0.2, CORTE: 0.6, SILK: 0.8, COSTURA: 2.5, EMBALAGEM: 0.4, NF: 0.1, ENTREGA: 0.1 },
  NECESSAIRE: { MATERIA_PRIMA: 0.2, CORTE: 0.4, SILK: 0.9, COSTURA: 2.8, EMBALAGEM: 0.4, NF: 0.1, ENTREGA: 0.1 },
  TOUCA:      { MATERIA_PRIMA: 0.1, CORTE: 0.3, SILK: 0.4, COSTURA: 1.6, EMBALAGEM: 0.3, NF: 0.1, ENTREGA: 0.1 },
  SACO:       { MATERIA_PRIMA: 0.2, CORTE: 0.4, SILK: 0.7, COSTURA: 2.2, EMBALAGEM: 0.3, NF: 0.1, ENTREGA: 0.1 },
  JALECO_PET: { MATERIA_PRIMA: 0.4, CORTE: 1.2, SILK: 1.5, COSTURA: 12.0, EMBALAGEM: 0.8, NF: 0.1, ENTREGA: 0.1 },
};

const idDepto = (nome) => db.prepare(`SELECT id FROM departamentos WHERE nome = ?`).get(nome)?.id ?? null;

db.transaction(() => {
  const insColab = db.prepare(
    `INSERT INTO colaboradores (nome, cargo, departamento_id, salario, vale_transporte, produtivo, data_admissao, status)
     VALUES (?, ?, ?, ?, ?, ?, date('now','-1 year'), 'ATIVO')
     ON CONFLICT(nome) DO UPDATE SET
       cargo = excluded.cargo, departamento_id = excluded.departamento_id,
       salario = excluded.salario, vale_transporte = excluded.vale_transporte`
  );
  let n = 1;
  for (const [setor, pessoas] of EQUIPE) {
    const deptoId = idDepto(setor);
    for (const [cargo, salario, vt] of pessoas) {
      // Nome sequencial só para diferenciar as linhas do cadastro de exemplo.
      insColab.run(`${cargo} ${String(n).padStart(2, '0')}`, cargo, deptoId, salario, vt, 1);
      n++;
    }
  }
})();

db.transaction(() => {
  const ins = db.prepare(
    `INSERT INTO equipamentos (nome, tipo, departamento_id, quantidade) VALUES (?, ?, ?, ?)
     ON CONFLICT(nome) DO UPDATE SET tipo = excluded.tipo,
       departamento_id = excluded.departamento_id, quantidade = excluded.quantidade`
  );
  for (const [nome, tipo, setor, qtd] of EQUIPAMENTOS) ins.run(nome, tipo, idDepto(setor), qtd);
})();

db.transaction(() => {
  const existe = db.prepare(`SELECT 1 FROM custos_fixos WHERE descricao = ?`);
  const ins = db.prepare(`INSERT INTO custos_fixos (descricao, tipo, valor_mensal) VALUES (?, ?, ?)`);
  for (const [descricao, tipo, valor] of CUSTOS_FIXOS) {
    if (!existe.get(descricao)) ins.run(descricao, tipo, valor);
  }
})();

// Processo produtivo por grupo de produto.
const etapas = new Map(db.prepare(`SELECT id, codigo, ordem FROM etapas`).all().map((e) => [e.codigo, e]));
let linhas = 0;
db.transaction(() => {
  const upsert = db.prepare(
    `INSERT INTO produto_processo (produto_id, etapa_id, sequencia, tempo_por_peca_min)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(produto_id, etapa_id) DO UPDATE SET tempo_por_peca_min = excluded.tempo_por_peca_min`
  );
  for (const [grupo, tempos] of Object.entries(PROCESSO_POR_GRUPO)) {
    const produtos = db
      .prepare(`SELECT p.id FROM produtos p JOIN grupos_produto g ON g.id = p.grupo_id WHERE g.nome = ?`)
      .all(grupo.replace('_', ' '));
    for (const produto of produtos) {
      for (const [codigo, minutos] of Object.entries(tempos)) {
        const etapa = etapas.get(codigo);
        if (!etapa || minutos <= 0) continue;
        upsert.run(produto.id, etapa.id, etapa.ordem, minutos);
        linhas++;
      }
    }
  }
})();

// Ordens abertas passam a valer o custo da engenharia.
const ordens = db.prepare(`SELECT id FROM ordens_producao WHERE status IN ('ABERTA','EM_PRODUCAO')`).all();
db.transaction(() => {
  for (const o of ordens) recalcularCustosMO(o.id, db);
})();

const j = jornada(db);
const taxa = taxaCustoIndireto(db);
console.log(`Jornada: ${j.minutos_produtivos} min/dia · ${j.dias_uteis_mes} dias · ${j.minutos_mes} min/mês`);
console.log('Custo por minuto de cada setor:');
for (const d of db.prepare(`SELECT id, nome FROM departamentos ORDER BY nome`).all()) {
  const c = custoMinutoDepartamento(d.id, db);
  console.log(`  ${d.nome.padEnd(14)} ${c.pessoas} pessoas · R$ ${c.custo_hora.toFixed(2)}/h · R$ ${c.custo_minuto.toFixed(4)}/min`);
}
console.log(`Custo fixo: R$ ${taxa.total.toFixed(2)}/mês · R$ ${taxa.por_minuto.toFixed(4)}/min de fábrica`);
console.log(`Processo cadastrado em ${linhas} operações; ${ordens.length} ordens recalculadas.`);

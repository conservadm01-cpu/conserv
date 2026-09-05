import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { aplicarMigracoes } from './migracoes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let instance = null;

/** Abre (e cria, se necessário) a conexão única com o banco. */
export function getDb() {
  if (instance) return instance;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  instance = new Database(config.dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  return instance;
}

/** Aplica o schema, as migrações incrementais e os dados fixos. Idempotente. */
export function migrate(db = getDb()) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
  aplicarMigracoes(db);
  seedEtapas(db);
  seedEstruturaFabrica(db);
  seedOperacoesSetor(db);
  return db;
}

/**
 * Etapas do processo produtivo da Conserv, na ordem em que acontecem no chão de fábrica.
 * São dados estruturais (o PCP inteiro se apoia nelas), por isso vivem na migração.
 */
export const ETAPAS_PADRAO = [
  { codigo: 'MATERIA_PRIMA', nome: 'Matéria-prima', ordem: 1, consome_material: 1, setor: 'ALMOXARIFADO' },
  { codigo: 'CORTE',         nome: 'Corte',         ordem: 2, consome_material: 0, setor: 'CORTE' },
  { codigo: 'SILK',          nome: 'Silk',          ordem: 3, consome_material: 0, setor: 'SILK' },
  { codigo: 'COSTURA',       nome: 'Costura',       ordem: 4, consome_material: 0, setor: 'COSTURA' },
  { codigo: 'EMBALAGEM',     nome: 'Embalagem',     ordem: 5, consome_material: 0, setor: 'EMBALAGEM' },
  { codigo: 'NF',            nome: 'Nota fiscal',   ordem: 6, consome_material: 0, setor: 'EXPEDICAO' },
  { codigo: 'ENTREGA',       nome: 'Entrega',       ordem: 7, consome_material: 0, setor: 'EXPEDICAO' },
];

/**
 * Estrutura mínima para o custeio funcionar: um setor por etapa do roteiro,
 * um local de estoque e a linha única de parâmetros da fábrica.
 */
function seedEstruturaFabrica(db) {
  db.prepare(
    `INSERT INTO parametros (id) VALUES (1) ON CONFLICT(id) DO NOTHING`
  ).run();

  db.prepare(
    `INSERT INTO locais_estoque (nome, tipo) VALUES ('ALMOXARIFADO', 'ALMOXARIFADO')
     ON CONFLICT(nome) DO NOTHING`
  ).run();

  // Funil comercial padrão. As probabilidades ponderam o valor da carteira
  // de oportunidades — é o que separa "pipeline" de "lista de desejos".
  const inserirFunil = db.prepare(
    `INSERT INTO etapas_funil (nome, ordem, probabilidade, tipo) VALUES (?, ?, ?, ?)
     ON CONFLICT(nome) DO NOTHING`
  );
  for (const e of ETAPAS_FUNIL_PADRAO) inserirFunil.run(e.nome, e.ordem, e.probabilidade, e.tipo);

  const inserirDepto = db.prepare(
    `INSERT INTO departamentos (nome, produtivo) VALUES (?, 1) ON CONFLICT(nome) DO NOTHING`
  );
  const vincular = db.prepare(
    `UPDATE etapas SET departamento_id = (SELECT id FROM departamentos WHERE nome = ?)
     WHERE codigo = ? AND departamento_id IS NULL`
  );
  const tx = db.transaction(() => {
    for (const e of ETAPAS_PADRAO) {
      if (!e.setor) continue;
      inserirDepto.run(e.setor);
      vincular.run(e.setor, e.codigo);
    }
  });
  tx();
}

export const ETAPAS_FUNIL_PADRAO = [
  { nome: 'Contato inicial', ordem: 1, probabilidade: 10, tipo: 'ABERTA' },
  { nome: 'Levantamento',    ordem: 2, probabilidade: 25, tipo: 'ABERTA' },
  { nome: 'Orçamento enviado', ordem: 3, probabilidade: 50, tipo: 'ABERTA' },
  { nome: 'Negociação',      ordem: 4, probabilidade: 75, tipo: 'ABERTA' },
  { nome: 'Ganha',           ordem: 5, probabilidade: 100, tipo: 'GANHA' },
  { nome: 'Perdida',         ordem: 6, probabilidade: 0, tipo: 'PERDIDA' },
];

function seedEtapas(db) {
  const insert = db.prepare(
    `INSERT INTO etapas (codigo, nome, ordem, consome_material) VALUES (?, ?, ?, ?)
     ON CONFLICT(codigo) DO UPDATE SET nome = excluded.nome, ordem = excluded.ordem`
  );
  const tx = db.transaction((etapas) => {
    for (const e of etapas) insert.run(e.codigo, e.nome, e.ordem, e.consome_material);
  });
  tx(ETAPAS_PADRAO);
}

/**
 * Sequência operacional padrão de cada setor.
 *
 * É o roteiro interno que aparece na via impressa — o corte não recebe "corte",
 * recebe preparar o tecido, conferir o risco, enfestar e cortar, cada passo com
 * a sua máquina e o seu horário. Serve de ponto de partida: a tabela é editável
 * e a ordem guarda a cópia do dia em que foi aberta.
 */
export const OPERACOES_SETOR_PADRAO = [
  { setor: 'CORTE', sequencia: 1, nome: 'Preparação do tecido', maquina: 'MANUAL' },
  { setor: 'CORTE', sequencia: 2, nome: 'Conferência do risco', maquina: 'MANUAL' },
  { setor: 'CORTE', sequencia: 3, nome: 'Enfesto', maquina: 'MANUAL' },
  { setor: 'CORTE', sequencia: 4, nome: 'Corte', maquina: 'MAQUINA DE CORTE' },

  { setor: 'SILK', sequencia: 1, nome: 'Conferência do fotolito', maquina: 'MANUAL' },
  { setor: 'SILK', sequencia: 2, nome: 'Gravação das telas', maquina: 'MESA/LUZ' },
  { setor: 'SILK', sequencia: 3, nome: 'Preparação das tintas', maquina: 'MANUAL' },
  { setor: 'SILK', sequencia: 4, nome: 'Preparar peças nos berços', maquina: 'MANUAL' },
  { setor: 'SILK', sequencia: 5, nome: 'Estampar', maquina: 'MANUAL' },

  { setor: 'PREPARACAO', sequencia: 1, nome: 'Separação do material', maquina: 'MANUAL' },
  { setor: 'PREPARACAO', sequencia: 2, nome: 'Conferência das peças cortadas', maquina: 'MANUAL' },
  { setor: 'PREPARACAO', sequencia: 3, nome: 'Preparação de partes e alças', maquina: 'MANUAL' },

  { setor: 'MODELAGEM', sequencia: 1, nome: 'Conferência da ficha e do molde', maquina: 'MANUAL' },
  { setor: 'MODELAGEM', sequencia: 2, nome: 'Risco do molde', maquina: 'MANUAL' },
  { setor: 'MODELAGEM', sequencia: 3, nome: 'Peça piloto', maquina: 'RETA' },

  { setor: 'COSTURA', sequencia: 1, nome: 'Preparação das máquinas', maquina: 'RETA/OVERLOQUE' },
  { setor: 'COSTURA', sequencia: 2, nome: 'Costura em série', maquina: 'RETA/OVERLOQUE' },
  { setor: 'COSTURA', sequencia: 3, nome: 'Arremate e limpeza de linhas', maquina: 'MANUAL' },
  { setor: 'COSTURA', sequencia: 4, nome: 'Revisão da peça', maquina: 'MANUAL' },

  { setor: 'EMBALAGEM', sequencia: 1, nome: 'Conferência da quantidade', maquina: 'MANUAL' },
  { setor: 'EMBALAGEM', sequencia: 2, nome: 'Dobra', maquina: 'MANUAL' },
  { setor: 'EMBALAGEM', sequencia: 3, nome: 'Ensacamento', maquina: 'MANUAL' },
  { setor: 'EMBALAGEM', sequencia: 4, nome: 'Encaixotamento e pesagem', maquina: 'BALANCA' },
];

function seedOperacoesSetor(db) {
  const insert = db.prepare(
    `INSERT INTO operacoes_setor (setor, sequencia, nome, maquina) VALUES (?, ?, ?, ?)
     ON CONFLICT(setor, nome) DO NOTHING`
  );
  const tx = db.transaction((linhas) => {
    for (const o of linhas) insert.run(o.setor, o.sequencia, o.nome, o.maquina);
  });
  tx(OPERACOES_SETOR_PADRAO);
}

import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import { badRequest } from '../lib/errors.js';

/**
 * Identidade dupla: UUID interno e código humano.
 *
 * O UUID é a chave — imutável, gerado sem consultar o banco, seguro para
 * sincronizar entre bases. O código é o que se fala ao telefone e se escreve
 * no romaneio, e por isso nunca serve de chave: a Conserv já tem o pedido
 * 1057 repetido para clientes diferentes.
 */
export const novoId = () => randomUUID();

/** Máscaras de fábrica. Todas configuráveis na tabela `sequencias`. */
export const MASCARAS = {
  pedido: 'PED-{ANO}-{SEQ:6}',
  orcamento: 'ORC-{ANO}-{SEQ:4}',
  oportunidade: 'OPO-{ANO}-{SEQ:4}',
  ordem_producao: 'OP-{ANO}-{SEQ:6}',
  lote_producao: 'LOTE-{ANO}-{SEQ:5}',
  pedido_compra: 'PC-{ANO}-{SEQ:4}',
  requisicao: 'RC-{ANO}-{SEQ:5}',
  cotacao: 'COT-{ANO}-{SEQ:4}',
  recebimento: 'REC-{ANO}-{SEQ:5}',
  movimento: 'MOV-{SEQ:8}',
  inventario: 'INV-{ANO}-{SEQ:3}',
  romaneio: 'ROM-{ANO}-{SEQ:5}',
  inspecao: 'INS-{ANO}-{SEQ:5}',
  apontamento: 'APO-{SEQ:8}',
  ocorrencia: 'OCO-{ANO}-{SEQ:4}',
  estudo_tempo: 'ET-{ANO}-{SEQ:4}',
  titulo: 'TIT-{ANO}-{SEQ:6}',
  cliente: 'CLI-{SEQ:6}',
  fornecedor: 'FOR-{SEQ:5}',
  colaborador: 'COL-{SEQ:4}',
  usuario: 'USU-{SEQ:4}',
  vendedor: 'VEN-{SEQ:3}',
  transportadora: 'TRA-{SEQ:3}',
  centro_trabalho: 'CT-{SEQ:3}',
  maquina: 'MAQ-{SEQ:4}',
  operacao: 'OPR-{SEQ:3}',
  local_estoque: 'LOC-{SEQ:3}',
  lote: 'LT-{SEQ:6}',
  modelo: 'MOD-{SEQ:5}',
  centro_custo: 'CC-{SEQ:3}',
  custo_fixo: 'CF-{SEQ:3}',
};

/** Sequências anuais reiniciam em janeiro; as demais correm para sempre. */
const ANUAL = /\{ANO\}/;

/**
 * Próximo código de uma entidade.
 *
 * Roda dentro de transação para que dois pedidos criados no mesmo instante
 * não recebam o mesmo número — a sequência é lida e incrementada de uma vez.
 */
export function proximoCodigo(entidade, { db = getDb(), data = new Date() } = {}) {
  const mascara = MASCARAS[entidade];
  if (!mascara) throw badRequest(`Sem máscara de código para "${entidade}"`);

  const ano = String(data.getFullYear());
  const escopo = ANUAL.test(mascara) ? ano : '';

  const gerar = db.transaction(() => {
    let linha = db.prepare(`SELECT * FROM sequencias WHERE entidade = ? AND escopo = ?`)
      .get(entidade, escopo);

    if (!linha) {
      db.prepare(
        `INSERT INTO sequencias (id, entidade, escopo, mascara, proximo) VALUES (?, ?, ?, ?, 1)`
      ).run(randomUUID(), entidade, escopo, mascara);
      linha = { proximo: 1, mascara };
    }
    db.prepare(
      `UPDATE sequencias SET proximo = proximo + 1, atualizado_em = datetime('now')
       WHERE entidade = ? AND escopo = ?`
    ).run(entidade, escopo);
    return linha.proximo;
  });

  return aplicarMascara(mascara, gerar(), ano);
}

/** `PED-{ANO}-{SEQ:6}` + 42 → `PED-2026-000042`. */
export function aplicarMascara(mascara, sequencia, ano) {
  return mascara
    .replace('{ANO}', ano)
    .replace(/\{SEQ:(\d+)\}/, (_, casas) => String(sequencia).padStart(Number(casas), '0'));
}

/**
 * Código estruturado de material, do §9: GRUPO-TIPO-CARACTERÍSTICA-SEQ.
 *
 * `TEC-MAL-PV-001` se lê sem consultar ninguém: tecido, malha, PV. A sequência
 * é por combinação, não global — o primeiro PV é 001 mesmo que já existam
 * duzentos tecidos cadastrados.
 */
export function codigoDeMaterial({ grupo, tipo, caracteristica }, db = getDb()) {
  const partes = [grupo, tipo, caracteristica]
    .map((p) => (p ? String(p).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '').slice(0, 6) : ''))
    .filter(Boolean);
  if (partes.length === 0) throw badRequest('Informe ao menos o grupo do material');

  const prefixo = partes.join('-');
  const usados = db.prepare(`SELECT codigo FROM materiais WHERE codigo LIKE ?`).all(`${prefixo}-%`);
  const maior = usados.reduce((maximo, { codigo }) => {
    const n = Number(codigo.slice(prefixo.length + 1));
    return Number.isFinite(n) && n > maximo ? n : maximo;
  }, 0);
  return `${prefixo}-${String(maior + 1).padStart(3, '0')}`;
}

/**
 * Código de produto: prefixo do grupo + sequência.
 *
 * O grupo já traz o prefixo (AVENTAL → AVE), então `AVE-000001` diz o que é
 * antes de abrir o cadastro.
 */
export function codigoDeProduto(prefixoGrupo, db = getDb()) {
  const prefixo = String(prefixoGrupo || 'PRD').toUpperCase().slice(0, 4);
  const usados = db.prepare(`SELECT codigo FROM produtos WHERE codigo LIKE ?`).all(`${prefixo}-%`);
  const maior = usados.reduce((maximo, { codigo }) => {
    const n = Number(codigo.slice(prefixo.length + 1));
    return Number.isFinite(n) && n > maximo ? n : maximo;
  }, 0);
  return `${prefixo}-${String(maior + 1).padStart(6, '0')}`;
}

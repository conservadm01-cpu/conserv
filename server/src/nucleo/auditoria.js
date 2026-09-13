import { getDb } from './db.js';
import { novoId } from './codigos.js';

/**
 * Trilha de auditoria.
 *
 * Uma linha por campo alterado, não por operação. É a diferença entre
 * responder "quem mudou a quantidade do pedido 1050 de 500 para 600, e
 * quando" e entregar um JSON para alguém comparar no olho.
 *
 * O nome de quem fez fica congelado na linha: desligar o funcionário não
 * pode apagar o rastro do que ele fez enquanto estava aqui.
 */

/** Campos que nunca entram na trilha, por ruído ou por sigilo. */
const IGNORADOS = new Set([
  'id', 'criado_em', 'atualizado_em', 'senha_hash', 'atualizado_por',
]);

const texto = (v) => (v === null || v === undefined ? null : String(v));

/**
 * Compara antes e depois e grava só o que mudou.
 *
 * Devolve a lista de campos alterados — vazia quando nada mudou, e nesse caso
 * nenhuma linha é escrita. Um UPDATE que não muda nada não é história.
 */
export function registrarAlteracao(
  { entidade, antes, depois, acao = 'ALTERACAO', autor = null, origem = null },
  db = getDb()
) {
  const alterados = [];
  for (const campo of Object.keys(depois ?? {})) {
    if (IGNORADOS.has(campo)) continue;
    const de = texto(antes?.[campo]);
    const para = texto(depois[campo]);
    if (de === para) continue;
    alterados.push({ campo, de, para });
  }
  if (alterados.length === 0) return [];

  const inserir = db.prepare(
    `INSERT INTO auditoria
       (id, entidade, entidade_id, codigo, acao, campo, valor_anterior, valor_novo,
        usuario_id, usuario_nome, origem)
     VALUES (@id, @entidade, @entidade_id, @codigo, @acao, @campo, @valor_anterior,
             @valor_novo, @usuario_id, @usuario_nome, @origem)`
  );
  const gravar = db.transaction(() => {
    for (const { campo, de, para } of alterados) {
      inserir.run({
        id: novoId(),
        entidade,
        entidade_id: depois.id ?? antes?.id,
        codigo: depois.codigo ?? antes?.codigo ?? null,
        acao,
        campo,
        valor_anterior: de,
        valor_novo: para,
        usuario_id: autor?.id ?? null,
        usuario_nome: autor?.nome ?? 'sistema',
        origem,
      });
    }
  });
  gravar();
  return alterados;
}

/**
 * Criação: uma linha só, sem repetir cada campo do registro novo.
 *
 * O estado inicial inteiro já está na própria tabela; o que a trilha precisa
 * marcar é o instante e o autor.
 */
export function registrarCriacao({ entidade, registro, autor = null, origem = null }, db = getDb()) {
  db.prepare(
    `INSERT INTO auditoria
       (id, entidade, entidade_id, codigo, acao, usuario_id, usuario_nome, origem)
     VALUES (?, ?, ?, ?, 'CRIACAO', ?, ?, ?)`
  ).run(novoId(), entidade, registro.id, registro.codigo ?? null,
        autor?.id ?? null, autor?.nome ?? 'sistema', origem);
}

/** Cancelamento, inativação e estorno — o que substitui o DELETE. */
export function registrarBaixa(
  { entidade, registro, acao = 'CANCELAMENTO', motivo = null, autor = null, origem = null },
  db = getDb()
) {
  db.prepare(
    `INSERT INTO auditoria
       (id, entidade, entidade_id, codigo, acao, campo, valor_novo,
        usuario_id, usuario_nome, origem)
     VALUES (?, ?, ?, ?, ?, 'motivo', ?, ?, ?, ?)`
  ).run(novoId(), entidade, registro.id, registro.codigo ?? null, acao, motivo,
        autor?.id ?? null, autor?.nome ?? 'sistema', origem);
}

/** O histórico de um registro, do mais recente para o mais antigo. */
export function historico(entidade, entidadeId, { limite = 200 } = {}, db = getDb()) {
  return db
    .prepare(
      `SELECT * FROM auditoria
       WHERE entidade = ? AND entidade_id = ?
       ORDER BY criado_em DESC, rowid DESC LIMIT ?`
    )
    .all(entidade, entidadeId, Math.min(Number(limite) || 200, 2000));
}

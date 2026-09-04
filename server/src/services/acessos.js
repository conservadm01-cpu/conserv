import bcrypt from 'bcryptjs';
import { getDb } from '../db/index.js';
import { badRequest, notFound, conflict } from '../lib/errors.js';

/**
 * Acesso ao sistema: quem entra, com que senha e o rastro de tudo isso.
 *
 * A senha nunca aparece aqui em lugar nenhum — nem no retorno, nem no log. O
 * que fica registrado é o evento: senha criada, trocada, redefinida pelo
 * administrador, entrada aceita, tentativa recusada. É o suficiente para
 * auditar ("quem redefiniu a senha do Renato e quando") sem virar uma segunda
 * cópia do cofre.
 */

/** Senha escolhida pela própria pessoa: a regra cheia. */
export const MINIMO_SENHA = 6;
/** Senha provisória entregue pelo administrador: vale uma vez e cai na troca. */
export const MINIMO_PROVISORIA = 3;

/** Só o essencial do pedido, e cortado: o log é trilha, não arquivo de tráfego. */
export function contexto(req) {
  if (!req) return { origem: null, agente: null };
  const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress || null;
  const agente = req.headers?.['user-agent'] ?? null;
  return { origem: ip, agente: agente ? String(agente).slice(0, 180) : null };
}

/**
 * Grava um evento de acesso.
 *
 * Nunca recebe senha. `detalhe` é texto livre para o motivo — "senha provisória
 * criada pelo administrador", "senha incorreta" — e é escrito por quem chama,
 * não montado a partir do que o usuário digitou.
 */
export function registrar({ usuario, evento, autor = null, req = null, detalhe = null }, db = getDb()) {
  const { origem, agente } = contexto(req);
  db.prepare(
    `INSERT INTO log_senhas
       (usuario_id, usuario_nome, evento, autor_id, autor_nome, origem, agente, detalhe)
     VALUES (@usuario_id, @usuario_nome, @evento, @autor_id, @autor_nome, @origem, @agente, @detalhe)`
  ).run({
    usuario_id: usuario?.id ?? null,
    // O nome fica congelado: a trilha sobrevive à exclusão do cadastro.
    usuario_nome: usuario?.nome ?? usuario?.email ?? 'desconhecido',
    evento,
    autor_id: autor?.id ?? null,
    autor_nome: autor?.nome ?? null,
    origem,
    agente,
    detalhe,
  });
}

/** O histórico, filtrável por pessoa, evento e período. */
export function logDeSenhas({ usuario_id = null, evento = null, de = null, ate = null, limite = 200 } = {},
                            db = getDb()) {
  const where = [];
  const params = [];
  if (usuario_id) { where.push('l.usuario_id = ?'); params.push(Number(usuario_id)); }
  if (evento) { where.push('l.evento = ?'); params.push(evento); }
  if (de) { where.push('date(l.criado_em) >= ?'); params.push(de); }
  if (ate) { where.push('date(l.criado_em) <= ?'); params.push(ate); }

  return db
    .prepare(
      `SELECT l.*, u.email AS usuario_email, u.ativo AS usuario_ativo
       FROM log_senhas l
       LEFT JOIN usuarios u ON u.id = l.usuario_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY l.criado_em DESC, l.id DESC LIMIT ?`
    )
    .all(...params, Math.min(Number(limite) || 200, 2000));
}

/** Contagem por evento, para a tela abrir dizendo se há algo estranho. */
export function resumoAcessos(db = getDb()) {
  const porEvento = db
    .prepare(
      `SELECT evento, COUNT(*) AS total, MAX(criado_em) AS ultimo
       FROM log_senhas WHERE criado_em >= datetime('now', '-30 day')
       GROUP BY evento ORDER BY total DESC`
    )
    .all();

  return {
    por_evento: porEvento,
    falhas_24h: db
      .prepare(`SELECT COUNT(*) AS n FROM log_senhas
                WHERE evento = 'FALHA' AND criado_em >= datetime('now', '-1 day')`)
      .get().n,
    provisorias: db
      .prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE senha_provisoria = 1 AND ativo = 1`)
      .get().n,
    sem_troca: db
      .prepare(
        `SELECT COUNT(*) AS n FROM usuarios
         WHERE ativo = 1 AND senha_provisoria = 0
           AND (senha_alterada_em IS NULL OR senha_alterada_em < datetime('now', '-180 day'))`
      )
      .get().n,
    nunca_entraram: db
      .prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE ativo = 1 AND ultimo_acesso IS NULL`)
      .get().n,
  };
}

const emailValido = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

/** E-mail a partir do nome, quando o cadastro do colaborador não tem um. */
export function sugerirEmail(nome, dominio = 'conserv.com.br') {
  const partes = String(nome)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 1 && !['de', 'da', 'do', 'dos', 'das', 'e'].includes(p));
  if (partes.length === 0) return null;
  const conta = partes.length === 1 ? partes[0] : `${partes[0]}.${partes[partes.length - 1]}`;
  return `${conta}@${dominio}`;
}

/**
 * Cria o acesso de uma pessoa, com senha provisória.
 *
 * A senha provisória aceita ser curta de propósito: quem entrega é o
 * administrador, ela vale uma entrada só e o sistema exige a troca antes de
 * abrir qualquer tela. A regra de tamanho cheia vale para a senha que a pessoa
 * escolhe depois.
 */
export async function criarAcesso(dados, { autor = null, req = null } = {}, db = getDb()) {
  const nome = String(dados.nome ?? '').trim();
  if (!nome) throw badRequest('Informe o nome');

  const email = String(dados.email ?? '').trim().toLowerCase();
  if (!email) throw badRequest('Informe o e-mail de acesso');
  if (!emailValido(email)) throw badRequest(`"${email}" não parece um e-mail válido`);

  const senha = String(dados.senha ?? '');
  const provisoria = dados.provisoria !== false;
  const minimo = provisoria ? MINIMO_PROVISORIA : MINIMO_SENHA;
  if (senha.length < minimo) {
    throw badRequest(
      provisoria
        ? `A senha provisória precisa de ao menos ${minimo} caracteres`
        : `A senha precisa de ao menos ${minimo} caracteres`
    );
  }

  const ocupado = db.prepare(`SELECT id, nome FROM usuarios WHERE email = ?`).get(email);
  if (ocupado) throw conflict(`O e-mail ${email} já é usado por "${ocupado.nome}"`);

  if (dados.colaborador_id) {
    const colaborador = db.prepare(`SELECT * FROM colaboradores WHERE id = ?`).get(dados.colaborador_id);
    if (!colaborador) throw notFound('Colaborador não encontrado');
    const jaTem = db.prepare(`SELECT id, email FROM usuarios WHERE colaborador_id = ? AND ativo = 1`)
      .get(dados.colaborador_id);
    if (jaTem) throw conflict(`"${colaborador.nome}" já tem acesso pelo e-mail ${jaTem.email}`);
  }

  const hash = await bcrypt.hash(senha, 10);
  const info = db
    .prepare(
      `INSERT INTO usuarios
         (nome, email, senha_hash, perfil, nivel_acesso, colaborador_id, senha_provisoria)
       VALUES (@nome, @email, @senha_hash, @perfil, @nivel_acesso, @colaborador_id, @provisoria)`
    )
    .run({
      nome,
      email,
      senha_hash: hash,
      perfil: dados.perfil ?? 'OPERADOR',
      nivel_acesso: dados.nivel_acesso ?? 'consulta',
      colaborador_id: dados.colaborador_id ?? null,
      provisoria: provisoria ? 1 : 0,
    });

  const usuario = db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(info.lastInsertRowid);
  registrar({ usuario, evento: 'CRIACAO', autor, req, detalhe: `acesso criado com perfil ${usuario.perfil}` }, db);
  if (provisoria) {
    registrar(
      { usuario, evento: 'PROVISORIA', autor, req, detalhe: 'senha provisória — troca exigida na primeira entrada' },
      db
    );
  }
  return publico(usuario);
}

/** Redefinição pelo administrador: a nova senha entra como provisória. */
export async function redefinirSenha(usuarioId, senha, { autor = null, req = null, provisoria = true } = {},
                                     db = getDb()) {
  const usuario = db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(usuarioId);
  if (!usuario) throw notFound('Usuário não encontrado');

  const minimo = provisoria ? MINIMO_PROVISORIA : MINIMO_SENHA;
  if (String(senha).length < minimo) throw badRequest(`A senha precisa de ao menos ${minimo} caracteres`);

  db.prepare(
    `UPDATE usuarios SET senha_hash = ?, senha_provisoria = ?, senha_alterada_em = datetime('now')
     WHERE id = ?`
  ).run(await bcrypt.hash(String(senha), 10), provisoria ? 1 : 0, usuario.id);

  registrar({
    usuario, evento: 'RESET', autor, req,
    detalhe: provisoria ? 'senha provisória — troca exigida na próxima entrada' : 'senha redefinida',
  }, db);
  return { ok: true, provisoria };
}

/** Troca feita pela própria pessoa. Derruba a marca de provisória. */
export async function trocarSenha(usuarioId, { senha_atual, senha_nova }, { req = null } = {}, db = getDb()) {
  const usuario = db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(usuarioId);
  if (!usuario) throw notFound('Usuário não encontrado');

  if (!(await bcrypt.compare(String(senha_atual), usuario.senha_hash))) {
    registrar({ usuario, evento: 'FALHA', req, detalhe: 'senha atual incorreta na troca' }, db);
    return { ok: false, motivo: 'senha_atual' };
  }
  if (String(senha_nova).length < MINIMO_SENHA) {
    throw badRequest(`A nova senha precisa de ao menos ${MINIMO_SENHA} caracteres`);
  }
  if (await bcrypt.compare(String(senha_nova), usuario.senha_hash)) {
    throw badRequest('A nova senha precisa ser diferente da atual');
  }

  db.prepare(
    `UPDATE usuarios SET senha_hash = ?, senha_provisoria = 0, senha_alterada_em = datetime('now')
     WHERE id = ?`
  ).run(await bcrypt.hash(String(senha_nova), 10), usuario.id);

  registrar({
    usuario,
    evento: usuario.senha_provisoria ? 'PRIMEIRO_ACESSO' : 'TROCA',
    req,
    detalhe: usuario.senha_provisoria ? 'senha definida no primeiro acesso' : 'senha trocada pelo usuário',
  }, db);
  return { ok: true };
}

/** Carimba a entrada aceita — é o que alimenta "nunca entraram". */
export function registrarEntrada(usuario, req, db = getDb()) {
  db.prepare(`UPDATE usuarios SET ultimo_acesso = datetime('now') WHERE id = ?`).run(usuario.id);
  registrar({ usuario, evento: 'LOGIN', req }, db);
}

/** Situação do acesso de cada pessoa, para a tela de usuários. */
export function situacaoAcessos(db = getDb()) {
  return db
    .prepare(
      `SELECT u.id, u.nome, u.email, u.perfil, u.nivel_acesso, u.ativo,
              u.senha_provisoria, u.senha_alterada_em, u.ultimo_acesso, u.criado_em,
              c.nome AS colaborador, c.cargo,
              (SELECT COUNT(*) FROM log_senhas l
                WHERE l.usuario_id = u.id AND l.evento = 'FALHA'
                  AND l.criado_em >= datetime('now', '-7 day')) AS falhas_7d
       FROM usuarios u
       LEFT JOIN colaboradores c ON c.id = u.colaborador_id
       ORDER BY u.ativo DESC, u.nome`
    )
    .all();
}

/** Nunca devolve o hash: o que sai daqui pode ir para a tela. */
const publico = (u) => ({
  id: u.id, nome: u.nome, email: u.email, perfil: u.perfil,
  nivel_acesso: u.nivel_acesso, colaborador_id: u.colaborador_id,
  senha_provisoria: u.senha_provisoria, ativo: u.ativo, criado_em: u.criado_em,
});

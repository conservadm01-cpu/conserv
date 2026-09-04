import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { unauthorized, forbidden } from '../lib/errors.js';
import { getDb } from '../db/index.js';
import { permissoesDe, nomeDaArea } from '../lib/permissoes.js';

export function assinarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
    config.jwtSecret,
    { expiresIn: config.jwtExpires }
  );
}

export function autenticar(req, _res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');
  if (tipo !== 'Bearer' || !token) return next(unauthorized('Informe o token de acesso'));
  let sessao;
  try {
    sessao = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(unauthorized('Sessão expirada ou token inválido'));
  }

  // As permissões vêm do banco a cada requisição: revogar acesso tem efeito
  // imediato, sem esperar o token do usuário expirar.
  const atual = getDb()
    .prepare(`SELECT id, nome, email, perfil, nivel_acesso, permissoes, ativo FROM usuarios WHERE id = ?`)
    .get(sessao.sub);
  if (!atual || !atual.ativo) return next(unauthorized('Usuário inativo ou removido'));

  req.usuario = { ...sessao, ...atual, sub: atual.id };
  req.permissoes = permissoesDe(atual);
  next();
}

/** Restringe a rota aos perfis informados (ADMIN sempre passa). */
export const exigirPerfil = (...perfis) => (req, _res, next) => {
  if (!req.usuario) return next(unauthorized());
  if (req.usuario.perfil === 'ADMIN' || perfis.includes(req.usuario.perfil)) return next();
  next(forbidden(`Ação restrita aos perfis: ${perfis.join(', ')}`));
};

/** Exige uma das áreas informadas — basta uma para liberar a rota. */
export const exigir = (...areas) => (req, _res, next) => {
  if (!req.usuario) return next(unauthorized());
  if (areas.some((a) => req.permissoes?.[a])) return next();
  next(forbidden(`Sem permissão para: ${areas.map(nomeDaArea).join(' ou ')}`));
};

/**
 * Libera leitura para quem tem a área de consulta e escrita só para quem tem a
 * de edição. Evita repetir dois middlewares em cada CRUD.
 */
export const exigirLeituraEscrita = (areaLeitura, areaEscrita) => (req, _res, next) => {
  if (!req.usuario) return next(unauthorized());
  const somenteLendo = req.method === 'GET' || req.method === 'HEAD';
  const area = somenteLendo ? areaLeitura : areaEscrita;
  if (req.permissoes?.[area] || (somenteLendo && req.permissoes?.[areaEscrita])) return next();
  next(forbidden(`Sem permissão para: ${nomeDaArea(area)}`));
};

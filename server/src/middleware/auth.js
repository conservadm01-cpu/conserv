import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { unauthorized, forbidden } from '../lib/errors.js';

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
  try {
    req.usuario = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(unauthorized('Sessão expirada ou token inválido'));
  }
}

/** Restringe a rota aos perfis informados (ADMIN sempre passa). */
export const exigirPerfil = (...perfis) => (req, _res, next) => {
  if (!req.usuario) return next(unauthorized());
  if (req.usuario.perfil === 'ADMIN' || perfis.includes(req.usuario.perfil)) return next();
  next(forbidden(`Ação restrita aos perfis: ${perfis.join(', ')}`));
};

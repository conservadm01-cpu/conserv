import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { asyncHandler, unauthorized, notFound, badRequest } from '../lib/errors.js';
import { assinarToken, autenticar, exigir } from '../middleware/auth.js';
import { crudRouter } from '../lib/crud.js';
import { AREAS, NIVEIS, TODAS, permissoesDe, nivelPorId } from '../lib/permissoes.js';

export const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, senha } = z
      .object({ email: z.string().trim().min(1), senha: z.string().min(1) })
      .parse(req.body);

    const usuario = getDb()
      .prepare(`SELECT * FROM usuarios WHERE email = ? AND ativo = 1`)
      .get(email.toLowerCase());
    if (!usuario || !(await bcrypt.compare(senha, usuario.senha_hash))) {
      throw unauthorized('E-mail ou senha inválidos');
    }

    res.json({
      token: assinarToken(usuario),
      usuario: {
        id: usuario.id, nome: usuario.nome, email: usuario.email,
        perfil: usuario.perfil, nivel_acesso: usuario.nivel_acesso,
      },
      permissoes: permissoesDe(usuario),
    });
  })
);

router.get('/eu', autenticar, (req, res) =>
  res.json({
    id: req.usuario.sub, nome: req.usuario.nome, email: req.usuario.email,
    perfil: req.usuario.perfil, nivel_acesso: req.usuario.nivel_acesso,
    permissoes: req.permissoes,
  })
);

/** O catálogo de áreas e níveis — a tela de permissões se monta a partir daqui. */
router.get('/areas', autenticar, (_req, res) =>
  res.json({ areas: AREAS, niveis: NIVEIS, todas: TODAS })
);

router.put(
  '/senha',
  autenticar,
  asyncHandler(async (req, res) => {
    const { senha_atual, senha_nova } = z
      .object({ senha_atual: z.string().min(1), senha_nova: z.string().min(6, 'Mínimo de 6 caracteres') })
      .parse(req.body);
    const db = getDb();
    const usuario = db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(req.usuario.sub);
    if (!usuario) throw notFound('Usuário não encontrado');
    if (!(await bcrypt.compare(senha_atual, usuario.senha_hash))) throw unauthorized('Senha atual incorreta');
    db.prepare(`UPDATE usuarios SET senha_hash = ? WHERE id = ?`)
      .run(await bcrypt.hash(senha_nova, 10), usuario.id);
    res.json({ ok: true });
  })
);

// Gestão de usuários — restrita a ADMIN.
const PERFIS = ['ADMIN', 'GESTOR', 'PCP', 'ALMOXARIFE', 'VENDEDOR', 'OPERADOR'];

const usuariosRouter = crudRouter({
  tabela: 'usuarios',
  campos: ['nome', 'email', 'perfil', 'nivel_acesso', 'colaborador_id', 'ativo'],
  schema: z.object({
    nome: z.string().trim().min(1),
    email: z.string().trim().min(1),
    perfil: z.enum(PERFIS).optional(),
    nivel_acesso: z.string().trim().optional(),
    colaborador_id: z.number().int().nullish(),
    ativo: z.number().int().optional(),
  }),
  listaSql: `SELECT u.id, u.nome, u.email, u.perfil, u.nivel_acesso, u.ativo, u.criado_em,
                    u.colaborador_id, u.permissoes, c.nome AS colaborador
             FROM usuarios u LEFT JOIN colaboradores c ON c.id = u.colaborador_id`,
  ordem: 'u.nome',
  busca: ['u.nome', 'u.email'],
});

/** Permissões efetivas de um usuário, com os ajustes já aplicados sobre o nível. */
usuariosRouter.get(
  '/:id/permissoes',
  asyncHandler((req, res) => {
    const usuario = getDb().prepare(`SELECT * FROM usuarios WHERE id = ?`).get(req.params.id);
    if (!usuario) throw notFound('Usuário não encontrado');
    res.json({
      nivel_acesso: usuario.nivel_acesso,
      nivel: nivelPorId(usuario.nivel_acesso),
      ajustes: usuario.permissoes ? JSON.parse(usuario.permissoes) : {},
      efetivas: permissoesDe(usuario),
    });
  })
);

/**
 * Grava o nível e os ajustes por área. Só as diferenças em relação ao nível são
 * guardadas — assim, trocar de nível depois já traz o conjunto novo por inteiro.
 */
usuariosRouter.put(
  '/:id/permissoes',
  asyncHandler((req, res) => {
    const dados = z
      .object({
        nivel_acesso: z.string().trim().optional(),
        areas: z.record(z.string(), z.boolean()).optional(),
      })
      .parse(req.body);

    const db = getDb();
    const usuario = db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(req.params.id);
    if (!usuario) throw notFound('Usuário não encontrado');

    const nivelId = dados.nivel_acesso ?? usuario.nivel_acesso;
    const nivel = nivelPorId(nivelId);
    if (!nivel) throw badRequest(`Nível de acesso desconhecido: ${nivelId}`);

    const ajustes = {};
    for (const [area, valor] of Object.entries(dados.areas ?? {})) {
      if (!TODAS.includes(area)) continue;
      if (nivel.areas.includes(area) !== valor) ajustes[area] = valor;
    }

    db.prepare(`UPDATE usuarios SET nivel_acesso = ?, permissoes = ? WHERE id = ?`)
      .run(nivelId, Object.keys(ajustes).length ? JSON.stringify(ajustes) : null, usuario.id);

    const atualizado = db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(usuario.id);
    res.json({ nivel_acesso: nivelId, ajustes, efetivas: permissoesDe(atualizado) });
  })
);

/** Redefinição de senha pelo administrador. */
usuariosRouter.put(
  '/:id/senha',
  asyncHandler(async (req, res) => {
    const { senha } = z.object({ senha: z.string().min(6, 'Mínimo de 6 caracteres') }).parse(req.body);
    const info = getDb()
      .prepare(`UPDATE usuarios SET senha_hash = ? WHERE id = ?`)
      .run(await bcrypt.hash(senha, 10), req.params.id);
    if (info.changes === 0) throw notFound('Usuário não encontrado');
    res.json({ ok: true });
  })
);

usuariosRouter.post(
  '/novo',
  asyncHandler(async (req, res) => {
    const dados = z
      .object({
        nome: z.string().trim().min(1),
        email: z.string().trim().min(1),
        senha: z.string().min(6, 'Mínimo de 6 caracteres'),
        perfil: z.enum(PERFIS).default('OPERADOR'),
        nivel_acesso: z.string().trim().default('consulta'),
        colaborador_id: z.number().int().nullish(),
      })
      .parse(req.body);
    if (!nivelPorId(dados.nivel_acesso)) throw badRequest(`Nível de acesso desconhecido: ${dados.nivel_acesso}`);

    const info = getDb()
      .prepare(
        `INSERT INTO usuarios (nome, email, senha_hash, perfil, nivel_acesso, colaborador_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(dados.nome, dados.email.toLowerCase(), await bcrypt.hash(dados.senha, 10),
           dados.perfil, dados.nivel_acesso, dados.colaborador_id ?? null);
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

export const usuarios = Router();
usuarios.use(autenticar, exigir('admin', 'pessoas.permissoes'), usuariosRouter);

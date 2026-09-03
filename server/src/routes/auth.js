import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { asyncHandler, unauthorized, notFound } from '../lib/errors.js';
import { assinarToken, autenticar, exigirPerfil } from '../middleware/auth.js';
import { crudRouter } from '../lib/crud.js';

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
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
    });
  })
);

router.get('/eu', autenticar, (req, res) => res.json(req.usuario));

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
const usuariosRouter = crudRouter({
  tabela: 'usuarios',
  campos: ['nome', 'email', 'perfil', 'ativo'],
  schema: z.object({
    nome: z.string().trim().min(1),
    email: z.string().trim().min(1),
    perfil: z.enum(['ADMIN', 'GESTOR', 'PCP', 'ALMOXARIFE', 'VENDEDOR', 'OPERADOR']).optional(),
    ativo: z.number().int().optional(),
  }),
  ordem: 'nome',
  busca: ['nome', 'email'],
});

usuariosRouter.post(
  '/novo',
  asyncHandler(async (req, res) => {
    const dados = z
      .object({
        nome: z.string().trim().min(1),
        email: z.string().trim().min(1),
        senha: z.string().min(6, 'Mínimo de 6 caracteres'),
        perfil: z.enum(['ADMIN', 'GESTOR', 'PCP', 'ALMOXARIFE', 'VENDEDOR', 'OPERADOR']).default('OPERADOR'),
      })
      .parse(req.body);
    const info = getDb()
      .prepare(`INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)`)
      .run(dados.nome, dados.email.toLowerCase(), await bcrypt.hash(dados.senha, 10), dados.perfil);
    res.status(201).json({ id: info.lastInsertRowid });
  })
);

export const usuarios = Router();
usuarios.use(autenticar, exigirPerfil('ADMIN'), usuariosRouter);

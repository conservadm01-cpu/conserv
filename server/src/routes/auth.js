import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { asyncHandler, unauthorized, notFound, badRequest } from '../lib/errors.js';
import { assinarToken, autenticar, exigir } from '../middleware/auth.js';
import { crudRouter } from '../lib/crud.js';
import { AREAS, NIVEIS, TODAS, permissoesDe, nivelPorId } from '../lib/permissoes.js';
import {
  registrar, registrarEntrada, criarAcesso, redefinirSenha, trocarSenha,
  logDeSenhas, resumoAcessos, situacaoAcessos, sugerirEmail, MINIMO_SENHA,
} from '../services/acessos.js';

export const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, senha } = z
      .object({ email: z.string().trim().min(1), senha: z.string().min(1) })
      .parse(req.body);

    const db = getDb();
    const usuario = db.prepare(`SELECT * FROM usuarios WHERE email = ?`).get(email.toLowerCase());

    if (!usuario || !usuario.ativo || !(await bcrypt.compare(senha, usuario.senha_hash))) {
      // O log distingue os motivos; a resposta, não — dizer "esse e-mail existe"
      // entrega meio caminho para quem está tentando adivinhar.
      registrar({
        usuario: usuario ?? { nome: email.toLowerCase() },
        evento: usuario && !usuario.ativo ? 'BLOQUEIO' : 'FALHA',
        req,
        detalhe: !usuario ? 'e-mail não cadastrado'
               : !usuario.ativo ? 'acesso inativo'
               : 'senha incorreta',
      }, db);
      throw unauthorized('E-mail ou senha inválidos');
    }

    registrarEntrada(usuario, req, db);

    res.json({
      token: assinarToken(usuario),
      usuario: {
        id: usuario.id, nome: usuario.nome, email: usuario.email,
        perfil: usuario.perfil, nivel_acesso: usuario.nivel_acesso,
        // A tela usa isto para exigir a troca antes de abrir qualquer coisa.
        senha_provisoria: usuario.senha_provisoria,
      },
      permissoes: permissoesDe(usuario),
    });
  })
);

router.get('/eu', autenticar, (req, res) => {
  const eu = getDb().prepare(`SELECT senha_provisoria FROM usuarios WHERE id = ?`).get(req.usuario.sub);
  res.json({
    id: req.usuario.sub, nome: req.usuario.nome, email: req.usuario.email,
    perfil: req.usuario.perfil, nivel_acesso: req.usuario.nivel_acesso,
    senha_provisoria: eu?.senha_provisoria ?? 0,
    permissoes: req.permissoes,
  });
});

/** O catálogo de áreas e níveis — a tela de permissões se monta a partir daqui. */
router.get('/areas', autenticar, (_req, res) =>
  res.json({ areas: AREAS, niveis: NIVEIS, todas: TODAS })
);

router.put(
  '/senha',
  autenticar,
  asyncHandler(async (req, res) => {
    const dados = z
      .object({
        senha_atual: z.string().min(1),
        senha_nova: z.string().min(MINIMO_SENHA, `Mínimo de ${MINIMO_SENHA} caracteres`),
      })
      .parse(req.body);
    const r = await trocarSenha(req.usuario.sub, dados, { req });
    if (!r.ok) throw unauthorized('Senha atual incorreta');
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
  ocultar: ['senha_hash'],
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

/**
 * Redefinição pelo administrador. Por padrão entra como provisória: quem
 * redefine não deveria ficar sabendo a senha definitiva de ninguém.
 */
usuariosRouter.put(
  '/:id/senha',
  asyncHandler(async (req, res) => {
    const { senha, provisoria } = z
      .object({ senha: z.string().min(1), provisoria: z.boolean().optional() })
      .parse(req.body);
    res.json(
      await redefinirSenha(Number(req.params.id), senha, {
        autor: { id: req.usuario.sub, nome: req.usuario.nome },
        req,
        provisoria: provisoria !== false,
      })
    );
  })
);

/**
 * Rotas próprias de usuários.
 *
 * Ficam num router à parte, montado antes do CRUD: o genérico tem um "/:id" que
 * casaria com "/situacao" e "/log-senhas" e devolveria "usuário não encontrado".
 */
const extras = Router();

/** Situação do acesso de cada pessoa: quem nunca entrou, quem está com provisória. */
extras.get('/situacao', asyncHandler((_req, res) => res.json(situacaoAcessos())));

/** Histórico de senha e acesso. Nunca traz senha — só o evento. */
extras.get(
  '/log-senhas',
  asyncHandler((req, res) =>
    res.json(logDeSenhas({
      usuario_id: req.query.usuario_id ?? null,
      evento: req.query.evento ?? null,
      de: req.query.de ?? null,
      ate: req.query.ate ?? null,
      limite: req.query.limite,
    })))
);

extras.get('/log-senhas/resumo', asyncHandler((_req, res) => res.json(resumoAcessos())));

/** E-mail sugerido a partir do nome, para a tela já vir preenchida. */
extras.get(
  '/sugerir-email',
  asyncHandler((req, res) => res.json({ email: sugerirEmail(String(req.query.nome ?? '')) }))
);

/**
 * Um usuário pelo id, sem o hash da senha.
 *
 * Vem antes do CRUD de propósito: o genérico faz "SELECT *", que traria
 * senha_hash junto. O hash não tem o que fazer fora do servidor, nem para o
 * administrador.
 */
extras.get(
  '/:id',
  asyncHandler((req, res) => {
    const u = getDb()
      .prepare(
        `SELECT u.id, u.nome, u.email, u.perfil, u.nivel_acesso, u.ativo, u.criado_em,
                u.colaborador_id, u.permissoes, u.senha_provisoria, u.senha_alterada_em,
                u.ultimo_acesso, c.nome AS colaborador
         FROM usuarios u LEFT JOIN colaboradores c ON c.id = u.colaborador_id
         WHERE u.id = ?`
      )
      .get(req.params.id);
    if (!u) throw notFound('Usuário não encontrado');
    res.json(u);
  })
);

usuariosRouter.post(
  '/novo',
  asyncHandler(async (req, res) => {
    const dados = z
      .object({
        nome: z.string().trim().min(1),
        email: z.string().trim().min(1),
        senha: z.string().min(1),
        perfil: z.enum(PERFIS).default('OPERADOR'),
        nivel_acesso: z.string().trim().default('consulta'),
        colaborador_id: z.number().int().nullish(),
        // Senha entregue pelo administrador; a pessoa troca ao entrar.
        provisoria: z.boolean().optional(),
      })
      .parse(req.body);
    if (!nivelPorId(dados.nivel_acesso)) throw badRequest(`Nível de acesso desconhecido: ${dados.nivel_acesso}`);

    res.status(201).json(
      await criarAcesso(dados, { autor: { id: req.usuario.sub, nome: req.usuario.nome }, req })
    );
  })
);

export const usuarios = Router();
usuarios.use(autenticar, exigir('admin', 'pessoas.permissoes'), extras, usuariosRouter);

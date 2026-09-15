/**
 * A base do app: entrar e guardar.
 *
 * São as únicas rotas que o app usa. Tudo o mais que ele faz — estoque,
 * ordens, engenharia — acontece dentro do documento, e chega aqui como uma
 * gravação só.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, unauthorized } from '../lib/errors.js';
import {
  lerEstado, gravarEstado, abrirSessao, emInstalacao,
  assinarTokenApp, verificarTokenApp,
} from '../services/estado.js';

export const router = Router();

const sessaoDoPedido = (req) => {
  const [tipo, token] = String(req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) throw unauthorized('Informe o token de acesso');
  return verificarTokenApp(token);
};

const sessaoSchema = z.object({
  usuario: z.string().trim().min(1, 'Informe o usuário'),
  senha: z.string().min(1, 'Informe a senha'),
});

router.post(
  '/sessao',
  asyncHandler((req, res) => res.json(abrirSessao(sessaoSchema.parse(req.body))))
);

/**
 * Lê a base.
 *
 * Fábrica recém-instalada não tem ninguém cadastrado — e portanto ninguém que
 * possa entrar para cadastrar o primeiro. Nesse caso a base vazia é aberta
 * junto com um token de instalação, e o próprio app conduz o primeiro acesso.
 * Assim que existir uma pessoa com senha, esta porta fecha.
 */
router.get(
  '/estado',
  asyncHandler((req, res) => {
    const estado = lerEstado();
    if (emInstalacao(estado.documento)) {
      return res.json({ ...estado, instalacao: true, token: assinarTokenApp(null) });
    }
    sessaoDoPedido(req);
    res.json({ ...estado, instalacao: false });
  })
);

const gravacaoSchema = z.object({
  documento: z.record(z.string(), z.unknown()),
  versao: z.number().int().min(0),
});

router.put(
  '/estado',
  asyncHandler((req, res) => {
    const sessao = sessaoDoPedido(req);
    const { documento, versao } = gravacaoSchema.parse(req.body);
    res.json(gravarEstado({ documento, versao, autor: sessao.nome ?? null }));
  })
);

/**
 * Sessão: cookie httpOnly com um segredo aleatório; no banco fica só o
 * resumo dele. O cookie não carrega papel nem comum — nada que o navegador
 * possa alterar para ganhar acesso.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { comoUsuario, prisma } from './banco.ts';
import { escopoDoUsuario, type EscopoDoUsuario } from './autorizacao.ts';

const NOME_DO_COOKIE = 'estudos_sessao';
const DURACAO_HORAS = 12;

const resumo = (token: string) => createHash('sha256').update(token).digest('hex');

export async function abrirSessao(usuarioId: string, dados: { ipHash?: string; navegador?: string } = {}) {
  const token = randomBytes(32).toString('base64url');
  const expiraEm = new Date(Date.now() + DURACAO_HORAS * 3600 * 1000);

  // Já autenticado: a gravação roda no contexto do próprio usuário, e as
  // políticas continuam valendo (ninguém abre sessão em nome de outro).
  await comoUsuario(usuarioId, async (banco) => {
    await banco.sessao.create({
      data: { usuarioId, tokenHash: resumo(token), expiraEm, ipHash: dados.ipHash, navegador: dados.navegador },
    });
    await banco.usuario.update({ where: { id: usuarioId }, data: { ultimoAcessoEm: new Date() } });
  });

  const armazem = await cookies();
  armazem.set(NOME_DO_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiraEm,
  });
  return { token, expiraEm };
}

export async function encerrarSessao() {
  const armazem = await cookies();
  const token = armazem.get(NOME_DO_COOKIE)?.value;
  if (token) {
    const dono = await donoDaSessao(resumo(token));
    if (dono) {
      await comoUsuario(dono.usuario_id, (banco) => banco.sessao.updateMany({
        where: { tokenHash: resumo(token), encerradaEm: null },
        data: { encerradaEm: new Date() },
      }));
    }
  }
  armazem.delete(NOME_DO_COOKIE);
}

/**
 * Troca o resumo do cookie pelo usuário, por função de banco de escopo
 * estreito: é o único ponto em que se lê a sessão sem contexto — porque é
 * justamente ele que estabelece o contexto.
 */
async function donoDaSessao(tokenHash: string) {
  const linhas = await prisma.$queryRaw<{
    usuario_id: string; nome_completo: string; email: string; deve_trocar_senha: boolean;
  }[]>`SELECT * FROM app.usuario_da_sessao(${tokenHash})`;
  return linhas[0] ?? null;
}

export interface UsuarioAutenticado {
  id: string;
  nomeCompleto: string;
  email: string;
  /** Senha ainda é a provisória de quem cadastrou. Nenhuma tela abre até trocar. */
  deveTrocarSenha: boolean;
  escopo: EscopoDoUsuario;
}

/** Devolve o usuário da requisição, ou null. Valida prazo e encerramento. */
export async function usuarioDaRequisicao(): Promise<UsuarioAutenticado | null> {
  const armazem = await cookies();
  const token = armazem.get(NOME_DO_COOKIE)?.value;
  if (!token) return null;

  const dono = await donoDaSessao(resumo(token));
  if (!dono) return null;

  return {
    id: dono.usuario_id,
    nomeCompleto: dono.nome_completo,
    email: dono.email,
    deveTrocarSenha: dono.deve_trocar_senha,
    escopo: await escopoDoUsuario(dono.usuario_id),
  };
}

/**
 * O usuário da requisição para uma tela comum.
 *
 * Manda para a entrada quem não tem sessão e para a troca de senha quem ainda
 * usa a provisória — antes de qualquer consulta. É o guarda único: uma tela
 * nova que o chame já nasce protegida nos dois casos.
 */
export async function usuarioDaTela(): Promise<UsuarioAutenticado> {
  const usuario = await usuarioDaRequisicao();
  if (!usuario) redirect('/entrar');
  if (usuario.deveTrocarSenha) redirect('/trocar-senha');
  return usuario;
}

export async function exigirUsuario(): Promise<UsuarioAutenticado> {
  const usuario = await usuarioDaRequisicao();
  if (!usuario) throw new Error('SESSAO_AUSENTE');
  return usuario;
}

/** Comparação em tempo constante para tokens vindos de fora do cookie. */
export function tokensIguais(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Senhas: derivação com scrypt, do próprio Node — sem dependência externa.
 * Guarda-se apenas o resumo, com sal por usuário e parâmetros embutidos, para
 * que o custo possa ser elevado no futuro sem invalidar as senhas existentes.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivar = promisify(scrypt) as (
  senha: string, sal: Buffer, tamanho: number,
  opcoes: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// N=2^15 com r=8 pede 32 MB por derivação; o teto precisa ser declarado.
const PADRAO = { N: 2 ** 15, r: 8, p: 1, tamanho: 32 };
const TETO_DE_MEMORIA = 96 * 1024 * 1024;

export async function gerarHashDeSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await derivar(senha.normalize('NFKC'), sal, PADRAO.tamanho, { ...PADRAO, maxmem: TETO_DE_MEMORIA });
  return `scrypt$${PADRAO.N}$${PADRAO.r}$${PADRAO.p}$${sal.toString('base64')}$${chave.toString('base64')}`;
}

export async function conferirSenha(senha: string, hashGuardado: string): Promise<boolean> {
  const partes = hashGuardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, salBase64, chaveBase64] = partes;
  const sal = Buffer.from(salBase64, 'base64');
  const esperada = Buffer.from(chaveBase64, 'base64');
  const obtida = await derivar(senha.normalize('NFKC'), sal, esperada.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: TETO_DE_MEMORIA,
  });
  return obtida.length === esperada.length && timingSafeEqual(obtida, esperada);
}

/** Regras mínimas de senha. Mensagem em português, para exibir ao usuário. */
export function validarSenha(senha: string): string | null {
  const limpa = String(senha ?? '');
  if (limpa.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(limpa)) return 'A senha precisa ter pelo menos uma letra.';
  if (!/[0-9]/.test(limpa)) return 'A senha precisa ter pelo menos um número.';
  if (/^\s|\s$/.test(limpa)) return 'A senha não pode começar nem terminar com espaço.';
  return null;
}

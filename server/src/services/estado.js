/**
 * A base do CSVSIST, guardada no servidor.
 *
 * O app trabalha com um documento só — um JSON com todas as coleções. Aqui ele
 * é guardado inteiro, com número de versão, e é isso que transforma um sistema
 * de um computador num sistema de fábrica:
 *
 * - **Todo mundo vê o mesmo dado.** Antes, cada navegador tinha a sua base e
 *   duas pessoas nunca viam o mesmo estoque.
 * - **Backup é copiar um arquivo.** O documento vive no mesmo SQLite do resto.
 * - **Gravação concorrente não some em silêncio.** Quem grava informa a versão
 *   que leu; se alguém gravou no meio, a gravação é recusada em vez de passar
 *   por cima do trabalho do outro.
 *
 * A senha é conferida aqui, não no navegador: antes do login, nada da empresa
 * sai do servidor. O hash é o mesmo que o app já usava nos cadastros
 * existentes (SHA-256 sobre `salt::senha`), para que ninguém precise
 * redefinir senha por causa da mudança.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, unauthorized, conflict } from '../lib/errors.js';

/** Documento vazio: o app preenche o resto na primeira gravação. */
const DOCUMENTO_VAZIO = { colaboradores: [], seq: {} };

/** Mesmo hash do app, para não invalidar as senhas já cadastradas. */
export const hashSenha = (senha, salt) =>
  crypto.createHash('sha256').update(`${salt}::${senha}`).digest('hex');

export function lerEstado(db = getDb()) {
  const linha = db.prepare(`SELECT documento, versao, atualizado_em, atualizado_por FROM app_estado WHERE id = 1`).get();
  if (!linha) {
    return { documento: DOCUMENTO_VAZIO, versao: 0, atualizado_em: null, atualizado_por: null };
  }
  return { ...linha, documento: JSON.parse(linha.documento) };
}

/**
 * Grava a base. `versao` é a que o navegador leu: se não for a atual, alguém
 * gravou no meio do caminho e a gravação é recusada com a versão de agora.
 */
export function gravarEstado({ documento, versao, autor = null }, db = getDb()) {
  if (!documento || typeof documento !== 'object' || Array.isArray(documento)) {
    throw badRequest('O documento da base precisa ser um objeto.');
  }
  const atual = lerEstado(db);
  if (Number(versao) !== atual.versao) {
    throw conflict('A base mudou desde que você abriu.', {
      versao_atual: atual.versao,
      versao_enviada: Number(versao),
    });
  }

  const novaVersao = atual.versao + 1;
  db.prepare(
    `INSERT INTO app_estado (id, documento, versao, atualizado_em, atualizado_por)
     VALUES (1, @documento, @versao, datetime('now'), @autor)
     ON CONFLICT(id) DO UPDATE SET
       documento = excluded.documento, versao = excluded.versao,
       atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`
  ).run({ documento: JSON.stringify(documento), versao: novaVersao, autor });

  return { versao: novaVersao };
}

/** Pessoas que conseguem entrar: as que já têm senha definida e estão ativas. */
export function colaboradoresComSenha(documento) {
  return (documento?.colaboradores ?? []).filter(
    (c) => c && c.status !== 'Inativo' && (c.senhaHash && c.senhaSalt) || (c?.senha && String(c.senha).length > 0)
  );
}

/** Fábrica recém-instalada: ninguém para entrar, e ninguém para cadastrar. */
export const emInstalacao = (documento) => colaboradoresComSenha(documento).length === 0;

const identificacao = (c) => [c.usuario, c.email, c.nome, c.cpf].filter(Boolean).map((v) => String(v).trim().toLowerCase());

export function assinarTokenApp(usuario) {
  return jwt.sign(
    { app: true, sub: usuario?.id ?? null, nome: usuario?.nome ?? null, perfil: usuario?.perfil ?? null },
    config.jwtSecret,
    { expiresIn: config.jwtExpires }
  );
}

export function verificarTokenApp(token) {
  try {
    const sessao = jwt.verify(token, config.jwtSecret);
    if (!sessao.app) throw new Error('token de outra área');
    return sessao;
  } catch {
    throw unauthorized('Sessão expirada ou token inválido');
  }
}

/**
 * Confere usuário e senha contra a base guardada.
 *
 * A mensagem de recusa é a mesma para usuário inexistente e senha errada: dizer
 * qual dos dois falhou entrega metade da credencial a quem está tentando.
 */
export function abrirSessao({ usuario, senha }, db = getDb()) {
  const { documento, versao } = lerEstado(db);
  const candidatos = colaboradoresComSenha(documento);
  const procurado = String(usuario || '').trim().toLowerCase();
  const colab = candidatos.find((c) => identificacao(c).includes(procurado));

  const recusa = () => unauthorized('Usuário ou senha incorretos.');
  if (!procurado || !colab) throw recusa();

  const confere =
    colab.senhaHash && colab.senhaSalt
      ? hashSenha(String(senha ?? ''), colab.senhaSalt) === colab.senhaHash
      : String(colab.senha) === String(senha ?? ''); // cadastro antigo, ainda em texto
  if (!confere) throw recusa();

  const pessoa = { id: colab.id, nome: colab.nome, perfil: colab.perfil ?? 'Colaborador' };
  return { token: assinarTokenApp(pessoa), usuario: pessoa, documento, versao, instalacao: false };
}

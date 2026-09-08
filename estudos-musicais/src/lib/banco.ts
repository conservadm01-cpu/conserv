// Conexão com o banco.
//
// Duas identidades, de propósito:
//   • a aplicação usa o papel `estudos_app`, que NÃO ignora RLS — toda
//     consulta é filtrada pelo banco a partir de quem está autenticado;
//   • migrações, importação e seeds usam o papel dono do schema, por fora
//     das políticas, e nunca atendem requisição de usuário.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../gerado/prisma/client.js';

const urlAplicacao = process.env.DATABASE_URL;
if (!urlAplicacao) throw new Error('Defina DATABASE_URL (papel da aplicação, sem BYPASSRLS).');

const global_ = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Tamanho do pool. Em servidor próprio, um pool por processo; em ambiente sem
 * servidor (Vercel), cada invocação é um processo curto e o pooler do banco é
 * quem multiplexa — abrir mais de uma conexão por invocação só esgota o
 * limite do pooler mais rápido.
 */
const SEM_SERVIDOR = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const CONEXOES = Number(process.env.BANCO_MAX_CONEXOES ?? (SEM_SERVIDOR ? 1 : 10));

export const prisma = global_.prisma ?? new PrismaClient({
  adapter: new PrismaPg({ connectionString: urlAplicacao, max: CONEXOES }),
});

if (process.env.NODE_ENV !== 'production') global_.prisma = prisma;

/**
 * Executa as consultas dentro de uma transação que declara ao banco QUEM é o
 * usuário. É só isto que o cliente informa: o identificador da sessão já
 * validada. Papel, comum e região são resolvidos pelas políticas de RLS.
 */
export async function comoUsuario<T>(usuarioId: string, executar: (tx: TransacaoPrisma) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SELECT set_config($1, $2, true)', 'app.usuario_id', usuarioId);
    return executar(tx as TransacaoPrisma);
  });
}

/** Consulta sem usuário autenticado: só enxerga o que a RLS abre a anônimos. */
export async function semUsuario<T>(executar: (tx: TransacaoPrisma) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SELECT set_config($1, $2, true)', 'app.usuario_id', '');
    return executar(tx as TransacaoPrisma);
  });
}

export type TransacaoPrisma = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

/** Cliente administrativo (dono do schema) — só para migração, importação e seed. */
export function clienteAdministrativo(): PrismaClient {
  const url = process.env.DATABASE_URL_MIGRACAO ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL_MIGRACAO para tarefas administrativas.');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

// Conexão com o banco.
//
// Duas identidades, de propósito:
//   • a aplicação usa o papel `estudos_app`, que NÃO ignora RLS — toda
//     consulta é filtrada pelo banco a partir de quem está autenticado;
//   • migrações, importação e seeds usam o papel dono do schema, por fora
//     das políticas, e nunca atendem requisição de usuário.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../gerado/prisma/client.js';

const global_ = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Tamanho do pool. Em servidor próprio, um pool por processo; em ambiente sem
 * servidor (Vercel), cada invocação é um processo curto e o pooler do banco é
 * quem multiplexa — abrir mais de uma conexão por invocação só esgota o
 * limite do pooler mais rápido.
 */
const SEM_SERVIDOR = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const CONEXOES = Number(process.env.BANCO_MAX_CONEXOES ?? (SEM_SERVIDOR ? 1 : 10));

/**
 * O cliente é criado na primeira consulta, não ao carregar o módulo.
 *
 * Parece detalhe e não é: enquanto isto acontecia no topo do arquivo, QUALQUER
 * módulo que importasse este — mesmo só para pegar um tipo — exigia
 * DATABASE_URL definida. Os testes de regra pura, que não tocam no banco,
 * quebravam por falta de variável de ambiente. Falta de conexão deve impedir
 * consultar, não impedir carregar.
 */
function criarCliente(): PrismaClient {
  const urlAplicacao = process.env.DATABASE_URL;
  if (!urlAplicacao) throw new Error('Defina DATABASE_URL (papel da aplicação, sem BYPASSRLS).');
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: urlAplicacao, max: CONEXOES }),
  });
}

export function cliente(): PrismaClient {
  if (!global_.prisma) global_.prisma = criarCliente();
  return global_.prisma;
}

/**
 * `prisma.usuario.findMany(...)` continua funcionando como antes: o acesso a
 * qualquer propriedade abre a conexão na hora, e não no carregamento.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_alvo, propriedade) {
    const real = cliente() as unknown as Record<string | symbol, unknown>;
    const valor = real[propriedade];
    return typeof valor === 'function' ? valor.bind(real) : valor;
  },
});

/**
 * Executa as consultas dentro de uma transação que declara ao banco QUEM é o
 * usuário. É só isto que o cliente informa: o identificador da sessão já
 * validada. Papel, comum e região são resolvidos pelas políticas de RLS.
 */
export async function comoUsuario<T>(usuarioId: string, executar: (tx: TransacaoPrisma) => Promise<T>): Promise<T> {
  return cliente().$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SELECT set_config($1, $2, true)', 'app.usuario_id', usuarioId);
    return executar(tx as TransacaoPrisma);
  });
}

/** Consulta sem usuário autenticado: só enxerga o que a RLS abre a anônimos. */
export async function semUsuario<T>(executar: (tx: TransacaoPrisma) => Promise<T>): Promise<T> {
  return cliente().$transaction(async (tx) => {
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

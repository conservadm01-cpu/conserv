/**
 * Permissões do papel da aplicação sobre um banco já migrado.
 *
 * Precisa rodar DEPOIS DE CADA MIGRAÇÃO, e não só na primeira: tabela nova
 * criada por uma migração não chega sozinha ao papel do servidor web, e função
 * recriada perde o GRANT que tinha. Sem este passo o login falha com
 * "permission denied for function credenciais_para_login" — que é um erro de
 * provisionamento, não de senha.
 *
 * É Node, e não psql, de propósito: o mesmo comando roda na máquina de quem
 * desenvolve e no processo de publicação (Vercel, contêiner, o que for), onde
 * o cliente de linha de comando do PostgreSQL não existe.
 *
 * Uso:
 *   node --experimental-strip-types scripts/permissoes.ts
 *
 * Variáveis:
 *   DATABASE_URL_MIGRACAO  conexão do dono do schema (obrigatória)
 *   PAPEL_APLICACAO        papel do servidor web (padrão: estudos_app)
 */

import { Client } from 'pg';

const PAPEL = process.env.PAPEL_APLICACAO ?? 'estudos_app';

/** Nome de papel é identificador, não valor: precisa ser aspeado, não parametrizado. */
function identificador(nome: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(nome)) {
    throw new Error(`Nome de papel inválido: ${JSON.stringify(nome)}.`);
  }
  return `"${nome}"`;
}

export function comandosDePermissao(papel: string): string[] {
  const p = identificador(papel);
  return [
    `GRANT USAGE ON SCHEMA public, app TO ${p}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${p}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${p}`,
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${p}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${p}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${p}`,
    // Portas estreitas do handshake de autenticação: o login precisa ler a
    // credencial antes de existir sessão, e a RLS ainda não tem por quem filtrar.
    `GRANT EXECUTE ON FUNCTION app.credenciais_para_login(text) TO ${p}`,
    `GRANT EXECUTE ON FUNCTION app.usuario_da_sessao(text) TO ${p}`,
    // Conferência pública de certificado: a função é de escopo estreito e
    // devolve só o que o próprio papel impresso já mostra.
    `GRANT EXECUTE ON FUNCTION app.certificado_publico(text) TO ${p}`,
  ];
}

/** O psql entende `?schema=`; o driver `pg` não. */
export const urlSemParametrosDoPrisma = (url: string) =>
  url.replace(/[?&]schema=[^&]*/g, (achado) => (achado.startsWith('?') ? '?' : '')).replace(/[?&]$/, '');

export async function aplicarPermissoes(url: string, papel = PAPEL) {
  const cliente = new Client({ connectionString: urlSemParametrosDoPrisma(url) });
  await cliente.connect();
  try {
    for (const comando of comandosDePermissao(papel)) await cliente.query(comando);
  } finally {
    await cliente.end();
  }
  return comandosDePermissao(papel).length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL_MIGRACAO ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL_MIGRACAO (conexão do dono do schema).');
  const quantos = await aplicarPermissoes(url);
  console.log(`Permissões aplicadas ao papel ${PAPEL}: ${quantos} comandos.`);
}

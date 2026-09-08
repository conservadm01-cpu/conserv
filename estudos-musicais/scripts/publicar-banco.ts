/**
 * Preparo do banco na publicação: migrar, permitir e iniciar.
 *
 * É um comando só porque os três passos precisam andar juntos e nesta ordem —
 * cada migração pode criar tabela nova (que o papel da aplicação ainda não
 * enxerga) e recriar função (que perde o GRANT). Rodar migração sem as
 * permissões deixa o sistema de pé e o login quebrado.
 *
 * Roda no processo de publicação (Vercel, contêiner, servidor próprio) e é
 * seguro repetir: migração aplicada não reaplica, permissão é idempotente e a
 * partida só cria o primeiro administrador quando não existe nenhum usuário.
 *
 * Uso:
 *   node --experimental-strip-types scripts/publicar-banco.ts
 */

import { execFileSync } from 'node:child_process';
import { clienteAdministrativo } from '../src/lib/banco.ts';
import { aplicarPermissoes } from './permissoes.ts';
import { iniciar } from './iniciar.ts';

const url = process.env.DATABASE_URL_MIGRACAO;
if (!url) throw new Error('Defina DATABASE_URL_MIGRACAO: conexão DIRETA (sem pooler) do dono do schema.');

console.log('1/3  migrações');
execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' });

console.log('2/3  permissões do papel da aplicação');
const quantos = await aplicarPermissoes(url);
console.log(`     ${quantos} comandos aplicados.`);

console.log('3/3  primeiro administrador');
const prisma = clienteAdministrativo();
try {
  const resultado = await iniciar(prisma);
  console.log(resultado.criado
    ? `     criado: ${resultado.login} (troca de senha exigida na primeira entrada).`
    : `     nada a fazer — ${resultado.motivo}`);
} finally {
  await prisma.$disconnect();
}

console.log('\nBanco pronto.');

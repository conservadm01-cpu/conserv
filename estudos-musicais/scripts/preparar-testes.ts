/**
 * Prepara o banco de testes: aplica migrações, provisiona o papel da
 * aplicação e semeia território, métodos e jornadas. Os testes de integração
 * precisam de dados reais em comuns, regiões E MÉTODOS diferentes para tentar
 * (e falhar em) atravessar escopo territorial e isolamento pedagógico.
 *
 * A semente já faz a análise dos documentos que encontrar em dados/ e a
 * confirmação registrada — não há passo de importação separado aqui.
 */

import { execFileSync } from 'node:child_process';

const url = process.env.DATABASE_URL_TESTES;
if (!url) throw new Error('Defina DATABASE_URL_TESTES apontando para um banco exclusivo de testes.');

const rodar = (comando: string, argumentos: string[], ambiente: Record<string, string> = {}) =>
  execFileSync(comando, argumentos, {
    stdio: 'inherit',
    env: { ...process.env, ...ambiente, DATABASE_URL_MIGRACAO: url, DATABASE_URL: url },
  });

console.log('Preparando banco de testes…');
rodar('npx', ['prisma', 'migrate', 'deploy']);
rodar('npx', ['prisma', 'generate']);
// Toda migração pode ter criado tabela nova; sem este passo o papel da
// aplicação não a enxerga e os testes falham por permissão, não por política.
// O psql não entende o parâmetro `schema=` que o Prisma usa na URL.
const urlDoPsql = url.replace(/[?&]schema=[^&]*/, '');
rodar('psql', [urlDoPsql, '-v', 'ON_ERROR_STOP=1', '-q', '-f', 'prisma/infra/permissoes-aplicacao.sql']);
rodar('node', ['--experimental-strip-types', 'scripts/semear.ts']);
console.log('Banco de testes pronto.');

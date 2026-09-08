/**
 * Prepara o banco de testes: aplica migrações, provisiona o papel da
 * aplicação, importa o índice do MSA e semeia o território de demonstração.
 * Os testes de integração precisam de dados reais em comuns e regiões
 * diferentes para tentar (e falhar em) atravessar o escopo.
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
rodar('node', ['--experimental-strip-types', 'scripts/importar-msa.ts', 'dados/MSA_indice.xlsx', '--aplicar']);
rodar('node', ['--experimental-strip-types', 'scripts/semear.ts']);
console.log('Banco de testes pronto.');

import path from 'node:path';
import { migrate, getDb } from '../db/index.js';
import { importarPlanilha } from '../import/planilha.js';

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith('--'));

if (!arquivo) {
  console.error(`Uso: npm run import -- <arquivo.xlsx> [--abas="Aba A,Aba B"] [--sem-ordens] [--simular]`);
  process.exit(1);
}

const abasArg = args.find((a) => a.startsWith('--abas='));
const opcoes = {
  abas: abasArg ? abasArg.slice(7).replace(/^["']|["']$/g, '').split(',').map((s) => s.trim()) : null,
  abrirOrdens: !args.includes('--sem-ordens'),
  simular: args.includes('--simular'),
};

// npm workspaces roda o script dentro de server/; INIT_CWD é o diretório do usuário.
const caminho = path.resolve(process.env.INIT_CWD || process.cwd(), arquivo);

migrate(getDb());

const inicio = Date.now();
const relatorio = await importarPlanilha(caminho, opcoes);

console.log(`\n=== Importação ${relatorio.simulacao ? '(SIMULAÇÃO — nada foi gravado)' : ''} ===`);
console.log(`Arquivo: ${relatorio.arquivo}`);
for (const aba of relatorio.abas) {
  if (!aba.importada) {
    console.log(`  - ${aba.aba}: ignorada (${aba.motivo})`);
    continue;
  }
  console.log(
    `  - ${aba.aba}: ${aba.itens} itens, ${aba.pedidos} pedidos, ${aba.ordens} ordens` +
      (aba.duplicadas ? `, ${aba.duplicadas} duplicadas` : '') +
      (aba.ignoradas ? `, ${aba.ignoradas} linhas incompletas` : '')
  );
}
console.log('\nTotais:', relatorio.totais);
if (relatorio.avisos.length) {
  console.log(`\nAvisos (${relatorio.avisos.length} primeiros):`);
  relatorio.avisos.slice(0, 10).forEach((a) => console.log(`  ! ${a}`));
}
console.log(`\nConcluído em ${((Date.now() - inicio) / 1000).toFixed(1)}s`);

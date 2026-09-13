/**
 * Sobe o CSVSIST em modo de teste, do zero, num comando.
 *
 * É o caminho para quem quer *usar* o sistema antes de decidir: monta a base de
 * demonstração se ainda não houver uma, compila a interface e deixa o servidor
 * no ar com os acessos de teste prontos. Nada aqui é exclusivo do teste — é o
 * mesmo sistema que vai para produção, com dados de exemplo dentro.
 *
 * Não passa por cima de dado de verdade: se o banco já tem pedidos, ele apenas
 * sobe o que existe, sem semear nada.
 *
 *   npm run teste              # monta (se preciso) e sobe
 *   npm run teste -- --recriar # apaga o banco e monta a demonstração de novo
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config, rootDir } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const recriar = process.argv.includes('--recriar');

const passo = (texto) => console.log(`\n\x1b[36m› ${texto}\x1b[0m`);
const rodar = (comando, args) =>
  execFileSync(comando, args, { stdio: 'inherit', cwd: rootDir, env: { ...process.env } });

/** Quantos pedidos já existem no banco — em processo à parte, para não abrir a conexão aqui. */
function pedidosNoBanco() {
  if (!fs.existsSync(config.dbPath)) return 0;
  const saida = execFileSync(process.execPath, ['-e', `
    const Database = require('better-sqlite3');
    const db = new Database(process.argv[1], { readonly: true, fileMustExist: true });
    const tem = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pedidos'").get();
    console.log(tem ? db.prepare('SELECT COUNT(*) n FROM pedidos').get().n : 0);
  `, config.dbPath], { encoding: 'utf8', cwd: rootDir });
  return Number(saida.trim()) || 0;
}

const existentes = recriar ? 0 : pedidosNoBanco();

if (existentes > 0) {
  passo(`Banco já tem ${existentes.toLocaleString('pt-BR')} pedidos — subindo com os dados que estão lá.`);
} else {
  passo('Montando a base de demonstração (carteira, fábrica, financeiro, compras e acessos de teste)…');
  rodar(process.execPath, [path.join(__dirname, 'seed-demo.js'), ...(recriar ? ['--recriar'] : [])]);
}

passo('Compilando a interface…');
rodar('npm', ['run', 'build']);

const linha = '─'.repeat(64);
console.log(`\n${linha}`);
console.log(`  CSVSIST em modo de teste — http://localhost:${config.port}`);
console.log(linha);
console.log(`  Administrador   ${process.env.ADMIN_EMAIL || 'admin@conserv.com.br'} / ${process.env.ADMIN_SENHA || 'conserv123'}`);
console.log(`  PCP             pcp@teste.local / teste123`);
console.log(`  Comercial       comercial@teste.local / teste123`);
console.log(`  Chão de fábrica chao-de-fabrica@teste.local / teste123`);
console.log(`  (e mais: gerencial, almoxarifado, financeiro, consulta, total — todos @teste.local)`);
console.log(`\n  Banco: ${config.dbPath}`);
console.log(`  Para parar: Ctrl+C. Para começar do zero: npm run teste -- --recriar`);
console.log(`${linha}\n`);

passo('Subindo o servidor…');
const servidor = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
  stdio: 'inherit',
  cwd: rootDir,
  env: { ...process.env },
});
// Ctrl+C no terminal tem de derrubar o servidor junto, não deixar a porta presa.
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => servidor.kill(sinal));
servidor.on('exit', (codigo) => process.exit(codigo ?? 0));

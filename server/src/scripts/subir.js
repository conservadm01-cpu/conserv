/**
 * Entrada do contêiner: prepara o banco e sobe o servidor.
 *
 * Duas formas de hospedar mudam o que precisa acontecer antes de servir:
 *
 * - **Com disco** (o jeito de valer): o banco sobrevive ao deploy. Aqui só o
 *   `init-db` roda, e ele é idempotente — cria schema, administrador e plano de
 *   contas na primeira vez e não faz nada nas seguintes.
 * - **Sem disco** (plano gratuito, para experimentar): o banco nasce vazio a
 *   cada partida. Com `SEMEAR_DEMO=true`, o ambiente se remonta sozinho com a
 *   carteira da planilha e os acessos de teste, em vez de subir uma tela vazia.
 *   O que for digitado ali se perde na reinicialização — é ambiente de olhar,
 *   não de usar.
 */
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config, rootDir } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const semear = /^(1|true|sim)$/i.test(String(process.env.SEMEAR_DEMO ?? ''));

const rodar = (script, args = []) =>
  execFileSync(process.execPath, [path.join(__dirname, script), ...args], {
    stdio: 'inherit',
    cwd: rootDir,
    env: process.env,
  });

/** Pedidos já gravados, em processo à parte para não abrir a conexão principal aqui. */
function pedidosNoBanco() {
  try {
    const saida = execFileSync(process.execPath, ['-e', `
      const Database = require('better-sqlite3');
      const db = new Database(process.argv[1], { readonly: true, fileMustExist: true });
      const tem = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pedidos'").get();
      console.log(tem ? db.prepare('SELECT COUNT(*) n FROM pedidos').get().n : 0);
    `, config.dbPath], { encoding: 'utf8', cwd: rootDir });
    return Number(saida.trim()) || 0;
  } catch {
    return 0; // banco ainda não existe
  }
}

rodar('init-db.js');

if (semear) {
  const existentes = pedidosNoBanco();
  if (existentes > 0) {
    console.log(`SEMEAR_DEMO ligado, mas o banco já tem ${existentes} pedidos — nada foi semeado.`);
  } else {
    console.log('SEMEAR_DEMO ligado e banco vazio: remontando a base de demonstração…');
    try {
      rodar('seed-demo.js');
    } catch (erro) {
      // Semear é conveniência: falhar aqui não pode impedir o sistema de subir.
      console.error('Não foi possível montar a demonstração:', erro.message);
    }
  }
}

const servidor = spawn(process.execPath, [path.join(__dirname, '..', 'index.js')], {
  stdio: 'inherit',
  cwd: rootDir,
  env: process.env,
});
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => servidor.kill(sinal));
servidor.on('exit', (codigo) => process.exit(codigo ?? 0));

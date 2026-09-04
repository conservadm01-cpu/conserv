import bcrypt from 'bcryptjs';
import { getDb, migrate } from '../db/index.js';
import { config } from '../config.js';

const db = migrate(getDb());

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@conserv.com.br';
const ADMIN_SENHA = process.env.ADMIN_SENHA || 'conserv123';

const existente = db.prepare(`SELECT id FROM usuarios WHERE email = ?`).get(ADMIN_EMAIL);
if (!existente) {
  db.prepare(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, nivel_acesso)
     VALUES (?, ?, ?, 'ADMIN', 'total')`
  ).run('Administrador', ADMIN_EMAIL, bcrypt.hashSync(ADMIN_SENHA, 10));
  console.log(`Usuário administrador criado: ${ADMIN_EMAIL} / ${ADMIN_SENHA}`);
} else {
  // Bancos criados antes das permissões granulares ficariam sem nível nenhum.
  db.prepare(`UPDATE usuarios SET nivel_acesso = 'total' WHERE perfil = 'ADMIN' AND nivel_acesso = 'consulta'`).run();
  console.log(`Usuário administrador já existe: ${ADMIN_EMAIL}`);
}

// Plano de contas mínimo, para o financeiro já abrir com onde classificar.
const CATEGORIAS = [
  ['Venda de produção', 'RECEBER', 'Operacional'],
  ['Serviço de facção', 'RECEBER', 'Operacional'],
  ['Outras receitas', 'RECEBER', 'Não operacional'],
  ['Compra de tecido', 'PAGAR', 'Matéria-prima'],
  ['Compra de aviamentos', 'PAGAR', 'Matéria-prima'],
  ['Serviço de terceiros', 'PAGAR', 'Produção'],
  ['Folha e encargos', 'PAGAR', 'Pessoal'],
  ['Aluguel e condomínio', 'PAGAR', 'Estrutura'],
  ['Energia, água e internet', 'PAGAR', 'Estrutura'],
  ['Manutenção de máquinas', 'PAGAR', 'Estrutura'],
  ['Impostos e taxas', 'PAGAR', 'Tributos'],
  ['Frete e entrega', 'PAGAR', 'Operacional'],
  ['Outras despesas', 'PAGAR', 'Não operacional'],
];
const insCategoria = db.prepare(
  `INSERT INTO categorias_financeiras (nome, tipo, grupo) VALUES (?, ?, ?) ON CONFLICT(nome) DO NOTHING`
);
db.transaction(() => { for (const c of CATEGORIAS) insCategoria.run(...c); })();

db.prepare(
  `INSERT INTO contas_bancarias (nome, tipo) VALUES ('CAIXA', 'CAIXA') ON CONFLICT(nome) DO NOTHING`
).run();
console.log(`Plano de contas: ${db.prepare('SELECT COUNT(*) n FROM categorias_financeiras').get().n} categorias.`);

console.log(`Banco pronto em ${config.dbPath}`);

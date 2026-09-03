import bcrypt from 'bcryptjs';
import { getDb, migrate } from '../db/index.js';
import { config } from '../config.js';

const db = migrate(getDb());

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@conserv.com.br';
const ADMIN_SENHA = process.env.ADMIN_SENHA || 'conserv123';

const existente = db.prepare(`SELECT id FROM usuarios WHERE email = ?`).get(ADMIN_EMAIL);
if (!existente) {
  db.prepare(`INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, 'ADMIN')`)
    .run('Administrador', ADMIN_EMAIL, bcrypt.hashSync(ADMIN_SENHA, 10));
  console.log(`Usuário administrador criado: ${ADMIN_EMAIL} / ${ADMIN_SENHA}`);
} else {
  console.log(`Usuário administrador já existe: ${ADMIN_EMAIL}`);
}

console.log(`Banco pronto em ${config.dbPath}`);

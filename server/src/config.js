import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, '..', '..');

/**
 * Banco padrão do CSVSIST.
 *
 * O sistema nasceu com o arquivo `conserv.db`; quem já rodava com ele continua
 * abrindo o mesmo banco, porque trocar o nome do arquivo numa versão nova
 * significaria subir com a base vazia e a fábrica achando que perdeu tudo.
 */
function bancoPadrao() {
  const pasta = path.join(rootDir, 'data');
  const atual = path.join(pasta, 'csvsist.db');
  const anterior = path.join(pasta, 'conserv.db');
  if (!fs.existsSync(atual) && fs.existsSync(anterior)) return anterior;
  return atual;
}

export const config = {
  port: Number(process.env.PORT || 3333),
  dbPath: process.env.DB_PATH || bancoPadrao(),
  jwtSecret: process.env.JWT_SECRET || 'csvsist-dev-secret-troque-em-producao',
  jwtExpires: process.env.JWT_EXPIRES || '12h',
  webDist: path.join(rootDir, 'web', 'dist'),
  isProd: process.env.NODE_ENV === 'production',
};

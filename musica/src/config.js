import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT || 3400),
  dbPath: process.env.DB_PATH || path.join(rootDir, 'data', 'clave.db'),
  publicDir: path.join(rootDir, 'public'),
};

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, '..', '..');

export const config = {
  port: Number(process.env.PORT || 3333),
  dbPath: process.env.DB_PATH || path.join(rootDir, 'data', 'conserv.db'),
  jwtSecret: process.env.JWT_SECRET || 'conserv-erp-dev-secret-troque-em-producao',
  jwtExpires: process.env.JWT_EXPIRES || '12h',
  webDist: path.join(rootDir, 'web', 'dist'),
  isProd: process.env.NODE_ENV === 'production',
};

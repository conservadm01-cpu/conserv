// Configuração do Prisma 7: a URL de conexão do Migrate vive aqui, e o
// cliente da aplicação recebe o adaptador em src/lib/banco.ts.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --experimental-strip-types scripts/semear.ts',
  },
  datasource: {
    url: env('DATABASE_URL_MIGRACAO'),
  },
});

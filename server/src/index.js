/**
 * Servidor do CSVSIST.
 *
 * O sistema é o app em `app/`: ele traz as telas e as regras, e o servidor faz
 * as duas coisas que um navegador não faz sozinho — guardar a base da fábrica
 * inteira e conferir quem entra.
 *
 * Por isso a API é pequena de propósito: `/api/app/sessao` e `/api/app/estado`.
 * Tudo o que acontece dentro do sistema (estoque, ordens, engenharia) chega
 * aqui como uma gravação da base, com a versão que foi lida.
 */
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { migrate } from './db/index.js';
import { naoEncontrado, tratarErros } from './middleware/erros.js';
import { router as appRouter } from './routes/app.js';

export function criarApp() {
  migrate();

  const app = express();
  app.use(cors());
  // A base viaja inteira a cada gravação: o limite acompanha o teto do app.
  app.use(express.json({ limit: '32mb' }));

  app.get('/api/saude', (_req, res) => res.json({ ok: true, versao: '2.0.0' }));
  app.use('/api/app', appRouter);
  app.use('/api', naoEncontrado);

  // O mesmo processo serve o sistema.
  if (fs.existsSync(config.appDir)) {
    app.use(express.static(config.appDir, { index: 'index.html' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(config.appDir, 'index.html')));
  }

  app.use(tratarErros);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = criarApp();
  app.listen(config.port, () => {
    console.log(`CSVSIST rodando em http://localhost:${config.port}`);
    console.log(`Banco de dados: ${config.dbPath}`);
  });
}

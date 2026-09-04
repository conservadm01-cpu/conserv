import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { migrate } from './db/index.js';
import { autenticar, exigir } from './middleware/auth.js';
import { naoEncontrado, tratarErros } from './middleware/erros.js';
import { router as authRouter, usuarios as usuariosRouter } from './routes/auth.js';
import { router as cadastrosRouter } from './routes/cadastros.js';
import { router as materiaisRouter } from './routes/materiais.js';
import { router as pedidosRouter } from './routes/pedidos.js';
import { router as producaoRouter } from './routes/producao.js';
import { router as indicadoresRouter } from './routes/indicadores.js';
import { router as importacaoRouter } from './routes/importacao.js';
import { router as engenhariaRouter } from './routes/engenharia.js';
import { router as pessoasRouter } from './routes/pessoas.js';
import { router as apontamentosRouter, ocorrencias as ocorrenciasRouter } from './routes/apontamentos.js';
import { router as canalRouter, publico as canalPublicoRouter } from './routes/canal.js';
import { router as financeiroRouter } from './routes/financeiro.js';
import { crm as crmRouter, orcamentos as orcamentosRouter } from './routes/comercial.js';
import { router as comprasRouter } from './routes/compras.js';
import { router as qualidadeRouter } from './routes/qualidade.js';

export function criarApp() {
  migrate();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/saude', (_req, res) => res.json({ ok: true, versao: '1.0.0' }));
  app.use('/api/auth', authRouter);
  app.use('/api/usuarios', usuariosRouter);
  // Conversa aberta: quem registra uma sugestão ou um risco não precisa ter login.
  app.use('/api/canal', canalPublicoRouter);

  // Todo o resto exige sessão, e cada área exige a sua permissão.
  app.use('/api', autenticar);

  app.use('/api/materiais', exigir('materiais.ver'), materiaisRouter);
  app.use('/api/pedidos', exigir('pedidos.ver'), pedidosRouter);
  app.use('/api/ordens', exigir('producao.ver'), producaoRouter);
  app.use('/api/engenharia', exigir('engenharia.ver'), engenhariaRouter);
  app.use('/api/colaboradores', exigir('pessoas.ver'), pessoasRouter);
  app.use('/api/apontamentos', exigir('producao.ver'), apontamentosRouter);
  app.use('/api/ocorrencias', exigir('producao.ver'), ocorrenciasRouter);
  app.use('/api/canal', exigir('canal.tratar'), canalRouter);
  app.use('/api/importacao', exigir('importacao'), importacaoRouter);
  app.use('/api/financeiro', exigir('financeiro.ver'), financeiroRouter);
  app.use('/api/crm', exigir('crm.ver'), crmRouter);
  app.use('/api/orcamentos', exigir('orcamentos.ver'), orcamentosRouter);
  app.use('/api/compras', exigir('compras.ver'), comprasRouter);
  app.use('/api/qualidade', exigir('cadastros.ver'), qualidadeRouter);
  app.use('/api/indicadores', exigir('producao.ver', 'pedidos.ver', 'financeiro.ver', 'orcamentos.ver'), indicadoresRouter);
  app.use('/api', cadastrosRouter);

  app.use('/api', naoEncontrado);

  // Em produção o mesmo processo serve o front compilado.
  if (fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  }

  app.use(tratarErros);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = criarApp();
  app.listen(config.port, () => {
    console.log(`ERP Conserv rodando em http://localhost:${config.port}`);
    console.log(`Banco de dados: ${config.dbPath}`);
  });
}

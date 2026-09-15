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
import { router as fichasRouter, operacoesPadrao as operacoesPadraoRouter } from './routes/fichas.js';
import { router as relatoriosRouter } from './routes/relatorios.js';
import { router as appRouter } from './routes/app.js';

export function criarApp() {
  migrate();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/saude', (_req, res) => res.json({ ok: true, versao: '2.0.0' }));

  /*
   * A base do app tem sessão própria: quem entra é colaborador cadastrado
   * dentro do documento, e não usuário da tabela do sistema anterior.
   */
  app.use('/api/app', appRouter);
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
  // Fichas de produção: quem acompanha a produção lê; a escrita é conferida rota a rota.
  app.use('/api/fichas', exigir('producao.ver'), fichasRouter);
  app.use('/api/operacoes-setor', exigir('engenharia.ver', 'producao.ver'), operacoesPadraoRouter);
  app.use('/api/relatorios', exigir('pedidos.ver', 'producao.ver'), relatoriosRouter);
  app.use('/api/indicadores', exigir('producao.ver', 'pedidos.ver', 'financeiro.ver', 'orcamentos.ver'), indicadoresRouter);
  app.use('/api', cadastrosRouter);

  app.use('/api', naoEncontrado);

  /*
   * O sistema é o app: ele é servido na raiz. A interface anterior continua de
   * pé em /legado enquanto os módulos que só existem lá — fichas impressas,
   * financeiro, compras e a carteira de pedidos — não forem portados.
   */
  if (fs.existsSync(config.appDir)) {
    app.use(express.static(config.appDir, { index: 'index.html' }));
  }
  if (fs.existsSync(config.webDist)) {
    app.use('/legado', express.static(config.webDist));
    app.get(/^\/legado(?:\/.*)?$/, (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  }
  if (fs.existsSync(config.appDir)) {
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(config.appDir, 'index.html')));
  }

  app.use(tratarErros);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = criarApp();
  app.listen(config.port, () => {
    console.log(`CSVSIST rodando em http://localhost:${config.port}`);
    console.log(`Interface anterior (fichas, financeiro, compras): http://localhost:${config.port}/legado`);
    console.log(`Banco de dados: ${config.dbPath}`);
  });
}

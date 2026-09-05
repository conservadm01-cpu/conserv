import { config } from './config.js';
import { migrar } from './db/index.js';
import { criarHandler, criarRoteador } from './lib/http.js';
import { registrar as registrarAlunos } from './routes/alunos.js';
import { registrar as registrarTrilhas } from './routes/trilhas.js';
import { registrar as registrarMatriculas } from './routes/matriculas.js';
import { registrar as registrarIndicadores } from './routes/indicadores.js';
import { registrar as registrarBoletim } from './routes/boletim.js';

export function criarApp() {
  migrar();
  const rota = criarRoteador();
  rota.get('/api/saude', () => ({ ok: true, app: 'clave', versao: '1.0.0' }));
  registrarAlunos(rota);
  registrarTrilhas(rota);
  registrarMatriculas(rota);
  registrarIndicadores(rota);
  registrarBoletim(rota);
  return criarHandler(rota, { publicDir: config.publicDir });
}

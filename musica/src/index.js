import http from 'node:http';
import { config } from './config.js';
import { criarApp } from './app.js';

const servidor = http.createServer(criarApp());
servidor.listen(config.port, () => {
  console.log(`CLAVE no ar em http://localhost:${config.port}`);
  console.log(`Banco: ${config.dbPath}`);
});

import { config } from '../config.js';
import { migrar, fechar } from '../db/index.js';

migrar();
fechar();
console.log(`Banco pronto em ${config.dbPath}`);

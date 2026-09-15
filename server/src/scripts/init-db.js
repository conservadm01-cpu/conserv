/**
 * Cria o banco do CSVSIST.
 *
 * Não há usuário para semear: quem entra é colaborador cadastrado dentro da
 * base, e a primeira pessoa é criada pelo próprio sistema, no primeiro acesso.
 * Por isso este script só garante que o arquivo existe com o schema aplicado.
 */
import { getDb, migrate } from '../db/index.js';
import { config } from '../config.js';

const db = migrate(getDb());
const estado = db.prepare(`SELECT versao, length(documento) AS tamanho FROM app_estado WHERE id = 1`).get();

console.log(`Banco pronto em ${config.dbPath}`);
if (estado) {
  console.log(`Base existente: versão ${estado.versao} · ${(estado.tamanho / 1024).toFixed(0)} KB`);
} else {
  console.log('Base vazia. Abra o sistema e defina a senha do Administrador no primeiro acesso.');
}

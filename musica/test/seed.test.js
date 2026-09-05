import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A base de demonstração precisa reproduzir o boletim que originou o app:
 * formação musical na fase 4 com 82%, violino na fase 2 com 74% e repertório
 * iniciante com 68%. Se alguém mexer nos pesos ou na escala sem querer, é aqui
 * que aparece.
 */
test('a base de demonstração reproduz o boletim do Carlos', () => {
  const banco = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clave-')), 'teste.db');
  const saida = spawnSync(process.execPath, ['--no-warnings', 'src/scripts/seed.js'], {
    cwd: raiz,
    env: { ...process.env, DB_PATH: banco },
    encoding: 'utf8',
  });

  assert.equal(saida.status, 0, saida.stderr);
  assert.match(saida.stdout, /Formação musical\s+fase 4 — 82%/);
  assert.match(saida.stdout, /Violino\s+fase 2 — 74%/);
  assert.match(saida.stdout, /Repertório\s+fase 1 — 68%/);
  assert.ok(fs.existsSync(banco), 'o banco foi criado no caminho pedido');

  // Rodar de novo não duplica: o seed limpa antes de escrever.
  const denovo = spawnSync(process.execPath, ['--no-warnings', 'src/scripts/seed.js'], {
    cwd: raiz,
    env: { ...process.env, DB_PATH: banco },
    encoding: 'utf8',
  });
  assert.equal(denovo.status, 0, denovo.stderr);
  assert.match(denovo.stdout, /Alunos: 3 · trilhas: 3/);
  fs.rmSync(path.dirname(banco), { recursive: true, force: true });
});

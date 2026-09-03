import { HttpError } from '../lib/errors.js';

export function naoEncontrado(_req, res) {
  res.status(404).json({ erro: 'Rota não encontrada' });
}

export function tratarErros(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ erro: err.message, detalhes: err.details });
  }
  if (err?.name === 'ZodError') {
    const detalhes = err.issues.map((i) => ({ campo: i.path.join('.'), erro: i.message }));
    return res.status(400).json({ erro: 'Dados inválidos', detalhes });
  }
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ erro: 'Já existe um registro com esses dados', detalhes: err.message });
  }
  if (err?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(409).json({ erro: 'Registro está em uso e não pode ser removido' });
  }
  if (err?.code?.startsWith?.('SQLITE_CONSTRAINT')) {
    return res.status(400).json({ erro: 'Violação de regra do banco de dados', detalhes: err.message });
  }
  console.error('[erro nao tratado]', err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
}

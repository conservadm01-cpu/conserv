export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Não autenticado') => new HttpError(401, msg);
export const forbidden = (msg = 'Sem permissão para esta ação') => new HttpError(403, msg);
export const notFound = (msg = 'Registro não encontrado') => new HttpError(404, msg);
export const conflict = (msg, details) => new HttpError(409, msg, details);

/** Envolve um handler async para que erros caiam no middleware de erro do Express. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

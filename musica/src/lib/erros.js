/** Erro de regra de negócio: vira resposta 4xx com mensagem legível. */
export class ErroApp extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

export const naoEncontrado = (o) => new ErroApp(`${o} não encontrado(a).`, 404);
export const conflito = (m) => new ErroApp(m, 409);

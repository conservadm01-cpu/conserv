import { boletimHtml } from '../services/boletim-html.js';

export function registrar(rota) {
  // Sai HTML já paginado em A4: o navegador imprime ou salva em PDF, sem
  // gerador de PDF no servidor.
  rota.get('/boletim/:id', ({ params }) => ({ html: boletimHtml(Number(params.id)) }));
}

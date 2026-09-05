import { um, rodar } from '../db/index.js';
import { naoEncontrado } from '../lib/erros.js';
import { criado } from '../lib/http.js';
import { texto, inteiro, data } from '../lib/validacao.js';
import {
  NIVEIS,
  avancarFase,
  historico,
  lancarAvaliacao,
  progressoMatricula,
} from '../services/progresso.js';

export function registrar(rota) {
  rota.get('/api/niveis', () => NIVEIS);

  rota.get('/api/matriculas/:id', ({ params }) => progressoMatricula(Number(params.id)));

  rota.get('/api/matriculas/:id/historico', ({ params, query }) =>
    historico(Number(params.id), query.objetivo_id ? Number(query.objetivo_id) : null),
  );

  rota.post('/api/matriculas/:id/avaliacoes', ({ params, corpo }) =>
    criado(
      lancarAvaliacao(Number(params.id), {
        objetivo_id: inteiro(corpo.objetivo_id, 'o objetivo', { obrigatorio: true }),
        nivel: inteiro(corpo.nivel, 'o nível', { obrigatorio: true, min: 0, max: 4 }),
        data: data(corpo.data, 'a data da avaliação'),
        professor: texto(corpo.professor, 'o professor'),
        observacao: texto(corpo.observacao, 'a observação', { max: 1000 }),
      }),
    ),
  );

  rota.post('/api/matriculas/:id/avancar', ({ params, corpo }) =>
    avancarFase(Number(params.id), {
      data: data(corpo.data, 'a data do fechamento'),
      forcar: corpo.forcar === true || corpo.forcar === 'true',
      justificativa: texto(corpo.justificativa, 'a justificativa', { max: 1000 }),
    }),
  );

  rota.delete('/api/matriculas/:id', ({ params }) => {
    const id = Number(params.id);
    if (!um('SELECT id FROM matricula WHERE id = ?', id)) throw naoEncontrado('Matrícula');
    rodar('DELETE FROM matricula WHERE id = ?', id);
    return { removido: true };
  });
}

import { todos, um, inserir, atualizar, rodar } from '../db/index.js';
import { ErroApp, naoEncontrado } from '../lib/erros.js';
import { criado } from '../lib/http.js';
import { texto, numero, inteiro, booleano } from '../lib/validacao.js';

function montarTrilha(trilha) {
  const fases = todos('SELECT * FROM fase WHERE trilha_id = ? ORDER BY numero', trilha.id).map((fase) => ({
    ...fase,
    objetivos: todos(
      'SELECT * FROM objetivo WHERE fase_id = ? AND ativo = 1 ORDER BY ordem, id',
      fase.id,
    ),
  }));
  return { ...trilha, fases };
}

export function registrar(rota) {
  rota.get('/api/trilhas', () =>
    todos('SELECT * FROM trilha ORDER BY nome').map((t) => ({
      ...montarTrilha(t),
      alunos: um('SELECT COUNT(*) AS n FROM matricula WHERE trilha_id = ?', t.id).n,
    })),
  );

  rota.get('/api/trilhas/:id', ({ params }) => {
    const trilha = um('SELECT * FROM trilha WHERE id = ?', Number(params.id));
    if (!trilha) throw naoEncontrado('Trilha');
    return montarTrilha(trilha);
  });

  rota.post('/api/trilhas', ({ corpo }) =>
    criado(
      inserir('trilha', {
        nome: texto(corpo.nome, 'o nome da trilha', { obrigatorio: true }),
        metodo: texto(corpo.metodo, 'o método'),
        descricao: texto(corpo.descricao, 'a descrição', { max: 1000 }),
        minimo_avanco: numero(corpo.minimo_avanco, 'o mínimo para avançar', { min: 0, max: 100 }) ?? undefined,
      }),
    ),
  );

  rota.put('/api/trilhas/:id', ({ params, corpo }) => {
    const id = Number(params.id);
    if (!um('SELECT id FROM trilha WHERE id = ?', id)) throw naoEncontrado('Trilha');
    return atualizar('trilha', id, {
      nome: corpo.nome === undefined ? undefined : texto(corpo.nome, 'o nome da trilha', { obrigatorio: true }),
      metodo: corpo.metodo === undefined ? undefined : texto(corpo.metodo, 'o método'),
      descricao: corpo.descricao === undefined ? undefined : texto(corpo.descricao, 'a descrição', { max: 1000 }),
      minimo_avanco:
        corpo.minimo_avanco === undefined
          ? undefined
          : numero(corpo.minimo_avanco, 'o mínimo para avançar', { obrigatorio: true, min: 0, max: 100 }),
      ativo: corpo.ativo === undefined ? undefined : booleano(corpo.ativo),
    });
  });

  rota.post('/api/trilhas/:id/fases', ({ params, corpo }) => {
    const trilhaId = Number(params.id);
    if (!um('SELECT id FROM trilha WHERE id = ?', trilhaId)) throw naoEncontrado('Trilha');
    const ultima = um('SELECT MAX(numero) AS n FROM fase WHERE trilha_id = ?', trilhaId).n ?? 0;
    return criado(
      inserir('fase', {
        trilha_id: trilhaId,
        numero: inteiro(corpo.numero, 'o número da fase', { min: 1 }) ?? ultima + 1,
        nome: texto(corpo.nome, 'o nome da fase', { obrigatorio: true }),
        descricao: texto(corpo.descricao, 'a descrição', { max: 1000 }),
      }),
    );
  });

  rota.put('/api/fases/:id', ({ params, corpo }) => {
    const id = Number(params.id);
    if (!um('SELECT id FROM fase WHERE id = ?', id)) throw naoEncontrado('Fase');
    return atualizar('fase', id, {
      nome: corpo.nome === undefined ? undefined : texto(corpo.nome, 'o nome da fase', { obrigatorio: true }),
      descricao: corpo.descricao === undefined ? undefined : texto(corpo.descricao, 'a descrição', { max: 1000 }),
    });
  });

  rota.delete('/api/fases/:id', ({ params }) => {
    const id = Number(params.id);
    if (!um('SELECT id FROM fase WHERE id = ?', id)) throw naoEncontrado('Fase');
    const emUso = um('SELECT COUNT(*) AS n FROM matricula WHERE fase_id = ?', id).n;
    if (emUso) throw new ErroApp(`${emUso} matrícula(s) estão nessa fase agora.`, 409);
    const fechada = um('SELECT COUNT(*) AS n FROM fase_concluida WHERE fase_id = ?', id).n;
    if (fechada) throw new ErroApp('Essa fase já foi concluída por alguém e faz parte do histórico.', 409);
    rodar('DELETE FROM fase WHERE id = ?', id);
    return { removido: true };
  });

  rota.post('/api/fases/:id/objetivos', ({ params, corpo }) => {
    const faseId = Number(params.id);
    if (!um('SELECT id FROM fase WHERE id = ?', faseId)) throw naoEncontrado('Fase');
    const ultima = um('SELECT MAX(ordem) AS n FROM objetivo WHERE fase_id = ?', faseId).n ?? 0;
    return criado(
      inserir('objetivo', {
        fase_id: faseId,
        ordem: inteiro(corpo.ordem, 'a ordem', { min: 1 }) ?? ultima + 1,
        titulo: texto(corpo.titulo, 'o objetivo', { obrigatorio: true, max: 400 }),
        peso: numero(corpo.peso, 'o peso', { min: 0.1, max: 100 }) ?? undefined,
      }),
    );
  });

  rota.put('/api/objetivos/:id', ({ params, corpo }) => {
    const id = Number(params.id);
    if (!um('SELECT id FROM objetivo WHERE id = ?', id)) throw naoEncontrado('Objetivo');
    return atualizar('objetivo', id, {
      titulo:
        corpo.titulo === undefined
          ? undefined
          : texto(corpo.titulo, 'o objetivo', { obrigatorio: true, max: 400 }),
      peso: corpo.peso === undefined ? undefined : numero(corpo.peso, 'o peso', { obrigatorio: true, min: 0.1, max: 100 }),
      ordem: corpo.ordem === undefined ? undefined : inteiro(corpo.ordem, 'a ordem', { min: 1 }),
    });
  });

  rota.delete('/api/objetivos/:id', ({ params }) => {
    const id = Number(params.id);
    if (!um('SELECT id FROM objetivo WHERE id = ?', id)) throw naoEncontrado('Objetivo');
    const avaliado = um('SELECT COUNT(*) AS n FROM avaliacao WHERE objetivo_id = ?', id).n;
    if (avaliado) {
      // Objetivo já avaliado sai da conta da fase, mas continua no histórico.
      rodar('UPDATE objetivo SET ativo = 0 WHERE id = ?', id);
      return { inativado: true, avaliacoes: avaliado };
    }
    rodar('DELETE FROM objetivo WHERE id = ?', id);
    return { removido: true };
  });
}

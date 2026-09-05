import { todos, um, inserir, atualizar, rodar } from '../db/index.js';
import { ErroApp, naoEncontrado } from '../lib/erros.js';
import { criado } from '../lib/http.js';
import { texto, data, inteiro, opcao, booleano } from '../lib/validacao.js';
import { boletim, frequencia, matricular, progressoMatricula, arredondar } from '../services/progresso.js';

const PRESENCAS = ['Presente', 'Falta', 'Falta justificada', 'Reposição'];

function camposDoAluno(corpo, { novo }) {
  return {
    nome: texto(corpo.nome, 'o nome do aluno', { obrigatorio: novo }),
    nascimento: data(corpo.nascimento, 'a data de nascimento'),
    responsavel: texto(corpo.responsavel, 'o responsável'),
    contato: texto(corpo.contato, 'o contato', { max: 120 }),
    professor: texto(corpo.professor, 'o professor'),
    inicio: data(corpo.inicio, 'a data de início'),
    observacao: texto(corpo.observacao, 'a observação', { max: 2000 }),
    ativo: corpo.ativo === undefined ? undefined : booleano(corpo.ativo),
  };
}

function semVazios(dados) {
  return Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== null && v !== undefined));
}

export function registrar(rota) {
  rota.get('/api/alunos', ({ query }) => {
    const busca = query.busca ? `%${query.busca.trim().toLowerCase()}%` : null;
    const alunos = todos(
      `SELECT * FROM aluno
        WHERE (? IS NULL OR lower(nome) LIKE ?)
          AND (? IS NULL OR ativo = ?)
        ORDER BY nome`,
      busca,
      busca,
      query.ativo === undefined ? null : 1,
      query.ativo === undefined ? null : booleano(query.ativo),
    );
    return alunos.map((aluno) => {
      const matriculas = todos(
        "SELECT id FROM matricula WHERE aluno_id = ? AND situacao = 'Em curso'",
        aluno.id,
      ).map((m) => progressoMatricula(m.id));
      const media = matriculas.length
        ? arredondar(matriculas.reduce((s, t) => s + t.percentual, 0) / matriculas.length)
        : null;
      return {
        ...aluno,
        trilhas: matriculas.length,
        media_geral: media,
        pode_avancar: matriculas.filter((t) => t.pode_avancar).length,
        frequencia: frequencia(aluno.id).percentual,
        resumo: matriculas.map((t) => ({
          trilha: t.trilha,
          fase_numero: t.fase_numero,
          percentual: t.percentual,
        })),
      };
    });
  });

  rota.post('/api/alunos', ({ corpo }) =>
    criado(inserir('aluno', semVazios(camposDoAluno(corpo, { novo: true })))),
  );

  rota.get('/api/alunos/:id', ({ params }) => boletim(Number(params.id)));

  rota.put('/api/alunos/:id', ({ params, corpo }) => {
    const aluno = um('SELECT id FROM aluno WHERE id = ?', Number(params.id));
    if (!aluno) throw naoEncontrado('Aluno');
    const campos = camposDoAluno(corpo, { novo: false });
    // No PUT, campo ausente fica como está; campo enviado vazio limpa o valor.
    const mudancas = Object.fromEntries(
      Object.entries(campos).filter(([chave]) => corpo[chave] !== undefined),
    );
    return atualizar('aluno', Number(params.id), mudancas);
  });

  rota.delete('/api/alunos/:id', ({ params }) => {
    const id = Number(params.id);
    const aluno = um('SELECT id FROM aluno WHERE id = ?', id);
    if (!aluno) throw naoEncontrado('Aluno');
    const avaliacoes = um(
      `SELECT COUNT(*) AS n FROM avaliacao a
         JOIN matricula m ON m.id = a.matricula_id
        WHERE m.aluno_id = ?`,
      id,
    ).n;
    if (avaliacoes) {
      // Histórico de avaliação é registro escolar: some com o aluno da lista,
      // não do banco.
      rodar('UPDATE aluno SET ativo = 0 WHERE id = ?', id);
      return { inativado: true, avaliacoes };
    }
    rodar('DELETE FROM aluno WHERE id = ?', id);
    return { removido: true };
  });

  rota.post('/api/alunos/:id/matriculas', ({ params, corpo }) =>
    criado(
      matricular(Number(params.id), inteiro(corpo.trilha_id, 'a trilha', { obrigatorio: true }), {
        inicio: data(corpo.inicio, 'a data de início'),
      }),
    ),
  );

  rota.get('/api/alunos/:id/aulas', ({ params }) =>
    todos('SELECT * FROM aula WHERE aluno_id = ? ORDER BY data DESC, id DESC', Number(params.id)),
  );

  rota.post('/api/alunos/:id/aulas', ({ params, corpo }) => {
    const id = Number(params.id);
    if (!um('SELECT id FROM aluno WHERE id = ?', id)) throw naoEncontrado('Aluno');
    const dia = data(corpo.data, 'a data da aula');
    if (dia && dia > new Date().toISOString().slice(0, 10)) {
      throw new ErroApp('A aula não pode ser lançada com data no futuro.');
    }
    return criado(
      inserir('aula', {
        aluno_id: id,
        data: dia ?? undefined,
        duracao_min: inteiro(corpo.duracao_min, 'a duração', { min: 5, max: 480 }) ?? undefined,
        presenca: opcao(corpo.presenca, 'a presença', PRESENCAS, { padrao: 'Presente' }),
        conteudo: texto(corpo.conteudo, 'o conteúdo da aula', { max: 2000 }),
        professor: texto(corpo.professor, 'o professor'),
      }),
    );
  });

  rota.delete('/api/aulas/:id', ({ params }) => {
    const info = rodar('DELETE FROM aula WHERE id = ?', Number(params.id));
    if (!info.changes) throw naoEncontrado('Aula');
    return { removido: true };
  });
}

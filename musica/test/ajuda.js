/**
 * Helpers dos testes. Cada arquivo de teste roda em processo próprio, então o
 * banco em memória é criado antes de importar qualquer módulo que leia a config.
 */
process.env.DB_PATH = ':memory:';

const { migrar, inserir, rodar } = await import('../src/db/index.js');
const progresso = await import('../src/services/progresso.js');

export { progresso };
export const { matricular, progressoMatricula, percentualFase, lancarAvaliacao, avancarFase, boletim } = progresso;
export const bd = await import('../src/db/index.js');

export function prepararBanco() {
  migrar();
  for (const t of ['avaliacao', 'fase_concluida', 'aula', 'matricula', 'objetivo', 'fase', 'trilha', 'aluno']) {
    rodar(`DELETE FROM ${t}`);
  }
}

/**
 * Cria uma trilha com fases e objetivos.
 * `fases` = [[ 'nome da fase', [[titulo, peso], ...] ], ...]
 */
export function criarTrilha(nome, fases, { minimo_avanco = 80, metodo = 'Método de teste' } = {}) {
  const trilha = inserir('trilha', { nome, metodo, minimo_avanco });
  const criadas = fases.map(([nomeFase, objetivos], i) => {
    const fase = inserir('fase', { trilha_id: trilha.id, numero: i + 1, nome: nomeFase });
    const objs = objetivos.map(([titulo, peso], j) =>
      inserir('objetivo', { fase_id: fase.id, ordem: j + 1, titulo, peso }));
    return { ...fase, objetivos: objs };
  });
  return { ...trilha, fases: criadas };
}

export const criarAluno = (nome = 'Aluno de teste') => inserir('aluno', { nome });

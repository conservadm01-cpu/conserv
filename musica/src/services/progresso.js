import { todos, um, inserir, rodar, transacao } from '../db/index.js';
import { ErroApp, naoEncontrado } from '../lib/erros.js';

/**
 * Escala de avaliação. O percentual é a média dos níveis ponderada pelo peso do
 * objetivo — por isso o nível máximo importa: ele é o denominador da conta.
 */
export const NIVEIS = [
  { nivel: 0, rotulo: 'Não iniciado', descricao: 'ainda não foi trabalhado' },
  { nivel: 1, rotulo: 'Introduzido', descricao: 'visto em aula, ainda depende do professor' },
  { nivel: 2, rotulo: 'Em desenvolvimento', descricao: 'executa com apoio e erros frequentes' },
  { nivel: 3, rotulo: 'Consolidado', descricao: 'executa sozinho no andamento de estudo' },
  { nivel: 4, rotulo: 'Dominado', descricao: 'executa com segurança e musicalidade' },
];

export const NIVEL_MAXIMO = 4;

export const arredondar = (n, casas = 1) => {
  const f = 10 ** casas;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/**
 * Objetivos da fase com a avaliação vigente de cada um.
 *
 * Vigente é a última lançada (data, depois id) — o histórico inteiro fica no
 * banco, mas quem conta para o percentual de hoje é a última leitura de hoje.
 */
export function objetivosDaFase(matriculaId, faseId) {
  return todos(
    `SELECT o.id, o.titulo, o.peso, o.ordem,
            a.id AS avaliacao_id, a.nivel, a.data, a.professor, a.observacao
       FROM objetivo o
       LEFT JOIN avaliacao a
         ON a.id = (
              SELECT a2.id FROM avaliacao a2
               WHERE a2.objetivo_id = o.id AND a2.matricula_id = ?
               ORDER BY a2.data DESC, a2.id DESC
               LIMIT 1
            )
      WHERE o.fase_id = ? AND o.ativo = 1
      ORDER BY o.ordem, o.id`,
    matriculaId,
    faseId,
  ).map((o) => ({
    id: o.id,
    titulo: o.titulo,
    peso: o.peso,
    ordem: o.ordem,
    nivel: o.nivel === null || o.nivel === undefined ? null : o.nivel,
    rotulo_nivel: o.nivel === null || o.nivel === undefined ? 'Não avaliado' : NIVEIS[o.nivel].rotulo,
    avaliado_em: o.data ?? null,
    professor: o.professor ?? null,
    observacao: o.observacao ?? null,
  }));
}

/**
 * Percentual da fase. Objetivo sem avaliação entra como zero: um item que
 * ninguém olhou não é crédito, e a cobertura ao lado avisa quanto da fase
 * ainda não foi avaliado, para o número não parecer pior do que o aluno é.
 */
export function percentualFase(matriculaId, faseId) {
  const objetivos = objetivosDaFase(matriculaId, faseId);
  const pesoTotal = objetivos.reduce((s, o) => s + o.peso, 0);
  if (!pesoTotal) {
    return { percentual: 0, cobertura: 0, peso_total: 0, objetivos };
  }
  const pontos = objetivos.reduce((s, o) => s + o.peso * (o.nivel ?? 0), 0);
  const avaliado = objetivos.filter((o) => o.nivel !== null).reduce((s, o) => s + o.peso, 0);
  return {
    percentual: arredondar((pontos / (pesoTotal * NIVEL_MAXIMO)) * 100),
    cobertura: arredondar((avaliado / pesoTotal) * 100),
    peso_total: arredondar(pesoTotal, 2),
    objetivos,
  };
}

function matriculaCompleta(matriculaId) {
  const matricula = um(
    `SELECT m.*, t.nome AS trilha, t.metodo, t.minimo_avanco, f.numero AS fase_numero, f.nome AS fase_nome
       FROM matricula m
       JOIN trilha t ON t.id = m.trilha_id
       JOIN fase f ON f.id = m.fase_id
      WHERE m.id = ?`,
    matriculaId,
  );
  if (!matricula) throw naoEncontrado('Matrícula');
  return matricula;
}

/** Uma trilha do boletim: fase atual, percentual dela e a caminhada na trilha. */
export function progressoMatricula(matriculaId) {
  const m = matriculaCompleta(matriculaId);
  const fase = percentualFase(m.id, m.fase_id);
  const totalFases = um('SELECT COUNT(*) AS n FROM fase WHERE trilha_id = ?', m.trilha_id).n;
  const concluidas = todos(
    `SELECT fc.fase_id, fc.percentual, fc.data, f.numero, f.nome
       FROM fase_concluida fc JOIN fase f ON f.id = fc.fase_id
      WHERE fc.matricula_id = ?
      ORDER BY f.numero`,
    m.id,
  );
  const encerrada = m.situacao === 'Concluída';
  // A trilha anda por fases inteiras; a fase atual entra pela fração já feita.
  const progressoTrilha = totalFases
    ? ((concluidas.length + (encerrada ? 0 : fase.percentual / 100)) / totalFases) * 100
    : 0;

  return {
    matricula_id: m.id,
    trilha_id: m.trilha_id,
    trilha: m.trilha,
    metodo: m.metodo,
    situacao: m.situacao,
    inicio: m.inicio,
    fase_id: m.fase_id,
    fase_numero: m.fase_numero,
    fase_nome: m.fase_nome,
    total_fases: totalFases,
    percentual: fase.percentual,
    cobertura: fase.cobertura,
    minimo_avanco: m.minimo_avanco,
    pode_avancar: m.situacao === 'Em curso' && fase.percentual >= m.minimo_avanco,
    falta_para_avancar: arredondar(Math.max(0, m.minimo_avanco - fase.percentual)),
    progresso_trilha: arredondar(Math.min(100, progressoTrilha)),
    fases_concluidas: concluidas,
    objetivos: fase.objetivos,
  };
}

/** Frequência do aluno: reposição conta como aula dada, falta justificada não. */
export function frequencia(alunoId) {
  const linha = um(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN presenca IN ('Presente', 'Reposição') THEN 1 ELSE 0 END) AS presentes
       FROM aula WHERE aluno_id = ?`,
    alunoId,
  );
  const total = linha?.total ?? 0;
  return {
    aulas: total,
    presencas: linha?.presentes ?? 0,
    percentual: total ? arredondar((linha.presentes / total) * 100) : null,
  };
}

/** Boletim do aluno: o que a secretaria imprime e o professor abre na aula. */
export function boletim(alunoId) {
  const aluno = um('SELECT * FROM aluno WHERE id = ?', alunoId);
  if (!aluno) throw naoEncontrado('Aluno');
  const matriculas = todos(
    `SELECT m.id FROM matricula m
       JOIN trilha t ON t.id = m.trilha_id
      WHERE m.aluno_id = ? ORDER BY t.nome`,
    alunoId,
  );
  const trilhas = matriculas.map((m) => progressoMatricula(m.id));
  const emCurso = trilhas.filter((t) => t.situacao === 'Em curso');
  // Média geral sem peso entre trilhas: nenhuma delas manda mais que a outra.
  const media = emCurso.length
    ? arredondar(emCurso.reduce((s, t) => s + t.percentual, 0) / emCurso.length)
    : null;
  return {
    aluno,
    trilhas,
    media_geral: media,
    frequencia: frequencia(alunoId),
    ultimas_aulas: todos(
      'SELECT * FROM aula WHERE aluno_id = ? ORDER BY data DESC, id DESC LIMIT 8',
      alunoId,
    ),
  };
}

/** Onde o objetivo mora: fase encerrada, fase atual ou fase futura. */
function situacaoDoObjetivo(matricula, objetivoId) {
  const objetivo = um(
    `SELECT o.id, o.fase_id, f.trilha_id, f.numero
       FROM objetivo o JOIN fase f ON f.id = o.fase_id
      WHERE o.id = ?`,
    objetivoId,
  );
  if (!objetivo) throw naoEncontrado('Objetivo');
  if (objetivo.trilha_id !== matricula.trilha_id) {
    throw new ErroApp('Esse objetivo é de outra trilha.');
  }
  if (objetivo.fase_id === matricula.fase_id) return 'atual';
  const concluida = um(
    'SELECT 1 AS ok FROM fase_concluida WHERE matricula_id = ? AND fase_id = ?',
    matricula.id,
    objetivo.fase_id,
  );
  return concluida ? 'encerrada' : 'futura';
}

export function lancarAvaliacao(matriculaId, dados) {
  const matricula = matriculaCompleta(matriculaId);
  if (matricula.situacao !== 'Em curso') {
    throw new ErroApp(`Matrícula ${matricula.situacao.toLowerCase()}: não aceita avaliação.`);
  }
  const onde = situacaoDoObjetivo(matricula, dados.objetivo_id);
  if (onde === 'encerrada') {
    throw new ErroApp('Fase já encerrada: o percentual dela ficou congelado no fechamento.');
  }
  if (onde === 'futura') {
    throw new ErroApp('Objetivo de uma fase que o aluno ainda não começou.');
  }
  return inserir('avaliacao', {
    matricula_id: matriculaId,
    objetivo_id: dados.objetivo_id,
    nivel: dados.nivel,
    data: dados.data ?? undefined,
    professor: dados.professor,
    observacao: dados.observacao,
  });
}

export function historico(matriculaId, objetivoId = null) {
  const filtro = objetivoId ? 'AND a.objetivo_id = ?' : '';
  const params = objetivoId ? [matriculaId, objetivoId] : [matriculaId];
  return todos(
    `SELECT a.*, o.titulo AS objetivo, f.numero AS fase_numero
       FROM avaliacao a
       JOIN objetivo o ON o.id = a.objetivo_id
       JOIN fase f ON f.id = o.fase_id
      WHERE a.matricula_id = ? ${filtro}
      ORDER BY a.data DESC, a.id DESC`,
    ...params,
  );
}

/**
 * Avança a fase. O mínimo da trilha é o portão: abaixo dele, não passa — e o
 * erro diz quanto falta, em vez de só recusar. O percentual do fechamento é
 * congelado, para o histórico não mudar quando o currículo mudar.
 */
export function avancarFase(matriculaId, { data = null, forcar = false, justificativa = null } = {}) {
  return transacao(() => {
    const matricula = matriculaCompleta(matriculaId);
    if (matricula.situacao !== 'Em curso') {
      throw new ErroApp(`Matrícula ${matricula.situacao.toLowerCase()}: não há fase a avançar.`);
    }
    const { percentual } = percentualFase(matricula.id, matricula.fase_id);
    if (percentual < matricula.minimo_avanco && !forcar) {
      throw new ErroApp(
        `Fase ${matricula.fase_numero} está em ${percentual}% e a trilha ${matricula.trilha} exige ` +
          `${matricula.minimo_avanco}% para avançar. Faltam ${arredondar(matricula.minimo_avanco - percentual)} pontos.`,
      );
    }
    if (forcar && percentual < matricula.minimo_avanco && !justificativa) {
      throw new ErroApp('Para avançar abaixo do mínimo, escreva a justificativa.');
    }

    inserir('fase_concluida', {
      matricula_id: matricula.id,
      fase_id: matricula.fase_id,
      percentual,
      data: data ?? undefined,
    });

    const proxima = um(
      `SELECT * FROM fase WHERE trilha_id = ? AND numero > ? ORDER BY numero LIMIT 1`,
      matricula.trilha_id,
      matricula.fase_numero,
    );
    if (proxima) {
      rodar('UPDATE matricula SET fase_id = ? WHERE id = ?', proxima.id, matricula.id);
    } else {
      // Última fase fechada: a trilha acabou. A matrícula guarda a fase final.
      rodar("UPDATE matricula SET situacao = 'Concluída' WHERE id = ?", matricula.id);
    }
    return {
      fase_encerrada: { numero: matricula.fase_numero, nome: matricula.fase_nome, percentual },
      justificativa: justificativa ?? null,
      progresso: progressoMatricula(matricula.id),
    };
  });
}

export function matricular(alunoId, trilhaId, { inicio = null } = {}) {
  const aluno = um('SELECT id FROM aluno WHERE id = ?', alunoId);
  if (!aluno) throw naoEncontrado('Aluno');
  const trilha = um('SELECT id FROM trilha WHERE id = ?', trilhaId);
  if (!trilha) throw naoEncontrado('Trilha');
  const jaTem = um('SELECT id FROM matricula WHERE aluno_id = ? AND trilha_id = ?', alunoId, trilhaId);
  if (jaTem) throw new ErroApp('Esse aluno já está matriculado nessa trilha.', 409);
  const primeira = um('SELECT id FROM fase WHERE trilha_id = ? ORDER BY numero LIMIT 1', trilhaId);
  if (!primeira) throw new ErroApp('A trilha ainda não tem fase cadastrada.');
  return inserir('matricula', {
    aluno_id: alunoId,
    trilha_id: trilhaId,
    fase_id: primeira.id,
    inicio: inicio ?? undefined,
  });
}

import { todos, um } from '../db/index.js';
import { arredondar, progressoMatricula } from '../services/progresso.js';

const DIAS_PARADO = 30;

export function registrar(rota) {
  rota.get('/api/indicadores', () => {
    const matriculas = todos(
      `SELECT m.id, m.aluno_id, a.nome AS aluno
         FROM matricula m JOIN aluno a ON a.id = m.aluno_id
        WHERE m.situacao = 'Em curso' AND a.ativo = 1`,
    ).map((m) => ({ aluno: m.aluno, aluno_id: m.aluno_id, ...progressoMatricula(m.id) }));

    const porTrilha = new Map();
    for (const m of matriculas) {
      const atual = porTrilha.get(m.trilha) ?? { trilha: m.trilha, alunos: 0, soma: 0 };
      atual.alunos += 1;
      atual.soma += m.percentual;
      porTrilha.set(m.trilha, atual);
    }

    // "Parado" é matrícula sem nenhuma avaliação nova há mais de um mês: é o
    // aluno que ninguém olhou, que some da conversa antes de sumir da escola.
    const limite = new Date(Date.now() - DIAS_PARADO * 86400000).toISOString().slice(0, 10);
    const parados = todos(
      `SELECT m.id AS matricula_id, a.nome AS aluno, t.nome AS trilha,
              MAX(av.data) AS ultima_avaliacao
         FROM matricula m
         JOIN aluno a ON a.id = m.aluno_id
         JOIN trilha t ON t.id = m.trilha_id
         LEFT JOIN avaliacao av ON av.matricula_id = m.id
        WHERE m.situacao = 'Em curso' AND a.ativo = 1
        GROUP BY m.id
       HAVING ultima_avaliacao IS NULL OR ultima_avaliacao < ?
        ORDER BY ultima_avaliacao IS NOT NULL, ultima_avaliacao`,
      limite,
    );

    return {
      alunos_ativos: um('SELECT COUNT(*) AS n FROM aluno WHERE ativo = 1').n,
      matriculas_em_curso: matriculas.length,
      media_geral: matriculas.length
        ? arredondar(matriculas.reduce((s, m) => s + m.percentual, 0) / matriculas.length)
        : null,
      aulas_30_dias: um(
        "SELECT COUNT(*) AS n FROM aula WHERE data >= date('now', '-30 day')",
      ).n,
      por_trilha: [...porTrilha.values()]
        .map((t) => ({ trilha: t.trilha, alunos: t.alunos, media: arredondar(t.soma / t.alunos) }))
        .sort((a, b) => a.trilha.localeCompare(b.trilha, 'pt-BR')),
      prontos_para_avancar: matriculas
        .filter((m) => m.pode_avancar)
        .map((m) => ({
          matricula_id: m.matricula_id,
          aluno_id: m.aluno_id,
          aluno: m.aluno,
          trilha: m.trilha,
          fase_numero: m.fase_numero,
          percentual: m.percentual,
          minimo_avanco: m.minimo_avanco,
        }))
        .sort((a, b) => b.percentual - a.percentual),
      parados: parados.map((p) => ({
        ...p,
        dias_sem_avaliacao: p.ultima_avaliacao
          ? Math.floor((Date.now() - Date.parse(`${p.ultima_avaliacao}T12:00:00Z`)) / 86400000)
          : null,
      })),
      dias_parado: DIAS_PARADO,
    };
  });
}

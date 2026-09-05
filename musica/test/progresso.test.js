import test from 'node:test';
import assert from 'node:assert/strict';
import {
  progresso,
  bd,
  prepararBanco,
  criarTrilha,
  criarAluno,
  matricular,
  progressoMatricula,
  lancarAvaliacao,
  avancarFase,
  boletim,
} from './ajuda.js';

// A fase do Carlos no boletim de referência: oito objetivos, pesos somando 25,
// níveis 4/4/4/3/3/3/3/1 — 82%.
const FASE_MSA_4 = [
  ['Escala maior até dois sustenidos', 4],
  ['Colcheias e semicolcheias em 2/4 e 4/4', 4],
  ['Intervalos de 2ª, 3ª e 5ª ao ouvido', 3],
  ['Ditado melódico em Dó maior', 3],
  ['Solfejo à primeira vista em Sol maior', 3],
  ['Compasso composto 6/8', 3],
  ['Armadura de clave', 3],
  ['Ditado rítmico com síncope', 2],
];
const NIVEIS_CARLOS = [4, 4, 4, 3, 3, 3, 3, 1];

function cenario({ minimo = 80 } = {}) {
  prepararBanco();
  const trilha = criarTrilha(
    'Formação musical',
    [
      ['Fase 3', [['Objetivo antigo', 1]]],
      ['Fase 4', FASE_MSA_4],
      ['Fase 5', [['Escala menor', 2]]],
    ],
    { minimo_avanco: minimo },
  );
  const aluno = criarAluno('Carlos');
  const matricula = matricular(aluno.id, trilha.id);
  return { trilha, aluno, matricula };
}

function avaliarFaseAtual(matriculaId, niveis) {
  const objetivos = progressoMatricula(matriculaId).objetivos;
  objetivos.forEach((o, i) => {
    if (niveis[i] === undefined) return;
    lancarAvaliacao(matriculaId, { objetivo_id: o.id, nivel: niveis[i] });
  });
}

test('percentual da fase é a média dos níveis ponderada pelo peso', () => {
  const { matricula } = cenario();
  avancarFase(matricula.id, { forcar: true, justificativa: 'histórico' });
  avaliarFaseAtual(matricula.id, NIVEIS_CARLOS);

  const p = progressoMatricula(matricula.id);
  assert.equal(p.fase_numero, 2);
  assert.equal(p.percentual, 82);
  assert.equal(p.cobertura, 100);
});

test('objetivo sem avaliação vale zero, e a cobertura denuncia o buraco', () => {
  const { matricula } = cenario();
  avancarFase(matricula.id, { forcar: true, justificativa: 'histórico' });
  // Só os dois primeiros objetivos (peso 4 + 4 de 25) avaliados no topo da escala.
  avaliarFaseAtual(matricula.id, [4, 4]);

  const p = progressoMatricula(matricula.id);
  assert.equal(p.percentual, 32); // (4*4 + 4*4) / (25*4) = 32%
  assert.equal(p.cobertura, 32); // 8 de 25 de peso avaliado
});

test('reavaliar não apaga o histórico: vale a última avaliação', () => {
  const { matricula } = cenario();
  avancarFase(matricula.id, { forcar: true, justificativa: 'histórico' });
  const objetivo = progressoMatricula(matricula.id).objetivos[0];

  lancarAvaliacao(matricula.id, { objetivo_id: objetivo.id, nivel: 2, data: '2026-03-01' });
  lancarAvaliacao(matricula.id, { objetivo_id: objetivo.id, nivel: 4, data: '2026-06-01' });
  // Lançamento com data anterior não pode "voltar" o nível vigente.
  lancarAvaliacao(matricula.id, { objetivo_id: objetivo.id, nivel: 0, data: '2026-01-10' });

  const atual = progressoMatricula(matricula.id).objetivos[0];
  assert.equal(atual.nivel, 4);
  assert.equal(atual.avaliado_em, '2026-06-01');

  assert.equal(progresso.historico(matricula.id, objetivo.id).length, 3);
});

test('avançar de fase abaixo do mínimo é recusado, e o erro diz quanto falta', () => {
  const { matricula } = cenario({ minimo: 80 });
  avancarFase(matricula.id, { forcar: true, justificativa: 'histórico' });
  avaliarFaseAtual(matricula.id, [4, 3, 3, 3, 3, 2, 3, 2]); // 74%

  assert.throws(() => avancarFase(matricula.id), (erro) => {
    assert.equal(erro.status, 400);
    assert.match(erro.message, /74%/);
    assert.match(erro.message, /Faltam 6 pontos/);
    return true;
  });
  assert.equal(progressoMatricula(matricula.id).fase_numero, 2, 'a fase não pode ter mudado');
});

test('avançar abaixo do mínimo com forçar exige justificativa', () => {
  const { matricula } = cenario();
  avancarFase(matricula.id, { forcar: true, justificativa: 'histórico' });
  avaliarFaseAtual(matricula.id, [4, 3, 3, 3, 3, 2, 3, 2]); // 74%
  assert.throws(() => avancarFase(matricula.id, { forcar: true }), /justificativa/);
  const saida = avancarFase(matricula.id, { forcar: true, justificativa: 'Decisão da banca.' });
  assert.equal(saida.fase_encerrada.percentual, 74);
});

test('fase encerrada congela o percentual e não aceita mais avaliação', () => {
  const { matricula } = cenario();
  avancarFase(matricula.id, { forcar: true, justificativa: 'histórico' });
  avaliarFaseAtual(matricula.id, NIVEIS_CARLOS);
  const objetivoDaFase4 = progressoMatricula(matricula.id).objetivos[0];

  const saida = avancarFase(matricula.id);
  assert.equal(saida.fase_encerrada.percentual, 82);

  const depois = progressoMatricula(matricula.id);
  assert.equal(depois.fase_numero, 3);
  assert.equal(depois.percentual, 0, 'a fase nova começa do zero');
  assert.deepEqual(
    depois.fases_concluidas.map((f) => [f.numero, f.percentual]),
    [[1, 0], [2, 82]],
  );

  assert.throws(
    () => lancarAvaliacao(matricula.id, { objetivo_id: objetivoDaFase4.id, nivel: 0 }),
    /congelado/,
  );
});

test('progresso da trilha soma fases fechadas com a fração da fase atual', () => {
  const { matricula } = cenario();
  avancarFase(matricula.id, { forcar: true, justificativa: 'histórico' }); // fecha a fase 1
  avaliarFaseAtual(matricula.id, NIVEIS_CARLOS);
  // 1 fase de 3 fechada + 82% da segunda = (1 + 0,82) / 3
  assert.equal(progressoMatricula(matricula.id).progresso_trilha, 60.7);
});

test('encerrar a última fase conclui a matrícula', () => {
  prepararBanco();
  const trilha = criarTrilha('Curta', [['Única', [['Objetivo', 1]]]], { minimo_avanco: 50 });
  const aluno = criarAluno();
  const matricula = matricular(aluno.id, trilha.id);
  lancarAvaliacao(matricula.id, { objetivo_id: trilha.fases[0].objetivos[0].id, nivel: 4 });

  avancarFase(matricula.id);
  const p = progressoMatricula(matricula.id);
  assert.equal(p.situacao, 'Concluída');
  assert.equal(p.progresso_trilha, 100);
  assert.throws(() => avancarFase(matricula.id), /não há fase a avançar/);
  assert.throws(
    () => lancarAvaliacao(matricula.id, { objetivo_id: trilha.fases[0].objetivos[0].id, nivel: 2 }),
    /não aceita avaliação/,
  );
});

test('avaliação recusa objetivo de outra trilha e de fase ainda não iniciada', () => {
  const { trilha, matricula } = cenario();
  const outra = criarTrilha('Violino', [['Fase 1', [['Cordas soltas', 2]]]]);
  assert.throws(
    () => lancarAvaliacao(matricula.id, { objetivo_id: outra.fases[0].objetivos[0].id, nivel: 3 }),
    /outra trilha/,
  );
  assert.throws(
    () => lancarAvaliacao(matricula.id, { objetivo_id: trilha.fases[2].objetivos[0].id, nivel: 3 }),
    /ainda não começou/,
  );
});

test('matrícula duplicada na mesma trilha é barrada', () => {
  const { trilha, aluno } = cenario();
  assert.throws(() => matricular(aluno.id, trilha.id), /já está matriculado/);
});

test('boletim traz a média das trilhas em curso e a frequência', () => {
  const { aluno, matricula } = cenario();
  avancarFase(matricula.id, { forcar: true, justificativa: 'histórico' });
  avaliarFaseAtual(matricula.id, NIVEIS_CARLOS);

  const outra = criarTrilha('Repertório', [['Iniciante', [['Peça de cor', 1]]]], { minimo_avanco: 70 });
  const m2 = matricular(aluno.id, outra.id);
  lancarAvaliacao(m2.id, { objetivo_id: outra.fases[0].objetivos[0].id, nivel: 2 }); // 50%

  for (const presenca of ['Presente', 'Presente', 'Falta', 'Reposição']) {
    bd.inserir('aula', { aluno_id: aluno.id, presenca });
  }

  const b = boletim(aluno.id);
  assert.equal(b.trilhas.length, 2);
  assert.equal(b.media_geral, 66); // (82 + 50) / 2
  assert.equal(b.frequencia.percentual, 75); // 3 de 4
});

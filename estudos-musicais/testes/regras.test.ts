// Regras pedagógicas: o cálculo do aproveitamento e as liberações.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularAproveitamento, liberaHinario, podeAvancarDeFase, podeConcluirCurso, preRequisitoDeFases,
  type UnidadeElegivel,
} from '../src/lib/regras.ts';

const unidade = (id: string, estado: UnidadeElegivel['estado'], peso = 1): UnidadeElegivel =>
  ({ licaoId: id, estado, peso });

test('o exemplo do enunciado: 8 de 20 unidades aprovadas dão 40%', () => {
  const unidades = Array.from({ length: 20 }, (_, i) => unidade(`l${i}`, i < 8 ? 'APROVADO' : 'NAO_INICIADO'));
  const r = calcularAproveitamento(unidades, 40);
  assert.equal(r.unidadesElegiveis, 20);
  assert.equal(r.unidadesAprovadas, 8);
  assert.equal(r.percentual, 40);
  assert.equal(r.faltamUnidades, 0);
});

test('página aberta, lição iniciada ou concluída sem aprovação não contam', () => {
  const unidades = [
    unidade('a', 'APROVADO'), unidade('b', 'CONCLUIDO'), unidade('c', 'EM_ANDAMENTO'),
    unidade('d', 'NAO_INICIADO'), unidade('e', 'REPROVADO'),
  ];
  const r = calcularAproveitamento(unidades, 40);
  assert.equal(r.unidadesAprovadas, 1);
  assert.equal(r.percentual, 20);
});

test('a mesma lição em vários agrupamentos conta uma vez só', () => {
  // O exercício 7 aparece em "Dó maior", em "clave de Sol" e em "compasso 3/4".
  const unidades = [
    unidade('ex7', 'APROVADO'), unidade('ex7', 'APROVADO'), unidade('ex7', 'APROVADO'),
    unidade('ex8', 'NAO_INICIADO'),
  ];
  const r = calcularAproveitamento(unidades, 40);
  assert.equal(r.unidadesElegiveis, 2, 'duas lições, não quatro');
  assert.equal(r.percentual, 50);
});

test('quando a mesma lição vem com estados diferentes, vale o mais avançado', () => {
  const r = calcularAproveitamento([unidade('x', 'EM_ANDAMENTO'), unidade('x', 'APROVADO')], 40);
  assert.equal(r.unidadesAprovadas, 1);
});

test('com pesos diferentes, é a soma dos pesos que manda', () => {
  const unidades = [
    unidade('a', 'APROVADO', 3), unidade('b', 'APROVADO', 1),
    unidade('c', 'NAO_INICIADO', 6),
  ];
  const r = calcularAproveitamento(unidades, 40);
  assert.equal(r.pesoElegivel, 10);
  assert.equal(r.pesoAprovado, 4);
  assert.equal(r.percentual, 40);
});

test('o aluno enxerga quanto falta para liberar o Hinário', () => {
  const unidades = Array.from({ length: 20 }, (_, i) => unidade(`l${i}`, i < 5 ? 'APROVADO' : 'NAO_INICIADO'));
  const r = liberaHinario(unidades, 40);
  assert.equal(r.liberado, false);
  assert.equal(r.percentual, 25);
  assert.equal(r.faltamUnidades, 3, 'faltam 3 unidades para chegar aos 40%');

  const comOitoAprovadas = Array.from({ length: 20 }, (_, i) => unidade(`l${i}`, i < 8 ? 'APROVADO' : 'NAO_INICIADO'));
  assert.equal(liberaHinario(comOitoAprovadas, 40).liberado, true);
});

test('sem unidade elegível o percentual é zero, e não divisão por zero', () => {
  const r = calcularAproveitamento([], 40);
  assert.equal(r.percentual, 0);
  assert.equal(r.pesoElegivel, 0);
});

test('regra A: as fases 1 a 5 do MSA precisam estar aprovadas', () => {
  const fases = [1, 2, 3, 4, 5].map((numero) => ({ numero, estado: 'APROVADO' as const }));
  assert.equal(preRequisitoDeFases(fases, [1, 2, 3, 4, 5]).liberado, true);

  const comUmaConcluidaSemAprovacao = fases.map((f, i) => (i === 2 ? { ...f, estado: 'CONCLUIDO' as const } : f));
  const r = preRequisitoDeFases(comUmaConcluidaSemAprovacao, [1, 2, 3, 4, 5]);
  assert.equal(r.liberado, false);
  assert.deepEqual(r.faltando, [3]);
});

test('regra C: avanço de fase exige aproveitamento e aprovação do instrutor', () => {
  const licoes = Array.from({ length: 10 }, (_, i) => unidade(`f${i}`, i < 8 ? 'APROVADO' : 'NAO_INICIADO'));
  const semInstrutor = podeAvancarDeFase({
    licoesDaFase: licoes, percentualExigido: 70, aprovacaoDoInstrutor: false, preRequisitosCumpridos: true,
  });
  assert.equal(semInstrutor.liberado, false);
  assert.match(semInstrutor.motivos.join(' '), /aprovação do instrutor/);

  const completo = podeAvancarDeFase({
    licoesDaFase: licoes, percentualExigido: 70, aprovacaoDoInstrutor: true, preRequisitosCumpridos: true,
  });
  assert.equal(completo.liberado, true);
});

test('regra D: conclusão exige todas as fases, atividades e validação final', () => {
  const fases = [1, 2, 3].map((numero) => ({ numero, estado: 'APROVADO' as const }));
  assert.equal(podeConcluirCurso({ fasesObrigatorias: fases, atividadesObrigatoriasPendentes: 0, validacaoFinal: true }).liberado, true);
  const semValidacao = podeConcluirCurso({ fasesObrigatorias: fases, atividadesObrigatoriasPendentes: 0, validacaoFinal: false });
  assert.equal(semValidacao.liberado, false);
  const comPendencia = podeConcluirCurso({ fasesObrigatorias: fases, atividadesObrigatoriasPendentes: 2, validacaoFinal: true });
  assert.match(comPendencia.motivos.join(' '), /2 atividade/);
});

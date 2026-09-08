// Regras pedagógicas: o cálculo do aproveitamento e as liberações.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularAproveitamento, criteriosDoMetodo, liberaRepertorio, podeAvancarDeUnidade,
  podeConcluirJornada, preRequisitoDeUnidades, CRITERIOS_PADRAO,
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

test('o aluno enxerga quanto falta para liberar o repertório', () => {
  const unidades = Array.from({ length: 20 }, (_, i) => unidade(`l${i}`, i < 5 ? 'APROVADO' : 'NAO_INICIADO'));
  const r = liberaRepertorio(unidades, 40);
  assert.equal(r.liberado, false);
  assert.equal(r.percentual, 25);
  assert.equal(r.faltamUnidades, 3, 'faltam 3 unidades para chegar aos 40%');

  const comOitoAprovadas = Array.from({ length: 20 }, (_, i) => unidade(`l${i}`, i < 8 ? 'APROVADO' : 'NAO_INICIADO'));
  assert.equal(liberaRepertorio(comOitoAprovadas, 40).liberado, true);
});

test('o percentual é do método: 40% libera num, 60% não libera no outro', () => {
  const unidades = Array.from({ length: 20 }, (_, i) => unidade(`l${i}`, i < 8 ? 'APROVADO' : 'NAO_INICIADO'));
  const deUmMetodo = criteriosDoMetodo([
    { chave: 'PERCENTUAL_DE_APROVEITAMENTO', valor: { percentual: 40 } },
  ]);
  const doOutro = criteriosDoMetodo([
    { chave: 'PERCENTUAL_DE_APROVEITAMENTO', valor: { percentual: 60 } },
  ]);
  assert.equal(liberaRepertorio(unidades, deUmMetodo.percentualDeAproveitamento).liberado, true);
  assert.equal(liberaRepertorio(unidades, doOutro.percentualDeAproveitamento).liberado, false);
});

test('o que o método não declara cai no padrão da plataforma, não no critério de outro método', () => {
  const criterios = criteriosDoMetodo([{ chave: 'NOTA_MINIMA', valor: { percentual: 55 } }]);
  assert.equal(criterios.notaMinima, 55);
  assert.equal(criterios.origem.notaMinima, 'metodo');
  assert.equal(criterios.percentualDeAproveitamento, CRITERIOS_PADRAO.percentualDeAproveitamento);
  assert.equal(criterios.origem.percentualDeAproveitamento, 'padrao');
});

test('exigência de instrutor e pesos de competência vêm do método', () => {
  const criterios = criteriosDoMetodo([
    { chave: 'EXIGE_APROVACAO_INSTRUTOR', valor: { exige: false } },
    { chave: 'PESOS_DE_COMPETENCIA', valor: { POSTURA: 3, ARCO: 3, LEITURA: 1 } },
    { chave: 'QUESTOES_POR_AVALIACAO', valor: { quantidade: 6 } },
  ]);
  assert.equal(criterios.exigeAprovacaoDoInstrutor, false);
  assert.equal(criterios.questoesPorAvaliacao, 6);
  assert.deepEqual(criterios.pesosDeCompetencia, { POSTURA: 3, ARCO: 3, LEITURA: 1 });
});

test('sem unidade elegível o percentual é zero, e não divisão por zero', () => {
  const r = calcularAproveitamento([], 40);
  assert.equal(r.percentual, 0);
  assert.equal(r.pesoElegivel, 0);
});

test('regra A: as unidades exigidas precisam estar aprovadas, não apenas vistas', () => {
  const unidades = ['1', '2', '3', '4', '5'].map((codigo) => ({ codigo, estado: 'APROVADO' as const }));
  assert.equal(preRequisitoDeUnidades(unidades, ['1', '2', '3', '4', '5']).liberado, true);

  const comUmaConcluidaSemAprovacao = unidades.map((u, i) => (i === 2 ? { ...u, estado: 'CONCLUIDO' as const } : u));
  const r = preRequisitoDeUnidades(comUmaConcluidaSemAprovacao, ['1', '2', '3', '4', '5']);
  assert.equal(r.liberado, false);
  assert.deepEqual(r.faltando, ['3']);
});

test('o pré-requisito usa o código da unidade, seja "3", "1.4" ou "N2/F1"', () => {
  const unidades = [
    { codigo: 'N1', estado: 'APROVADO' as const },
    { codigo: '1.4', estado: 'APROVADO' as const },
    { codigo: 'N2', estado: 'EM_ANDAMENTO' as const },
  ];
  const r = preRequisitoDeUnidades(unidades, ['N1', '1.4', 'N2']);
  assert.deepEqual(r.faltando, ['N2']);
});

test('regra C: avanço de unidade exige aproveitamento e aprovação do instrutor', () => {
  const licoes = Array.from({ length: 10 }, (_, i) => unidade(`f${i}`, i < 8 ? 'APROVADO' : 'NAO_INICIADO'));
  const semInstrutor = podeAvancarDeUnidade({
    licoesDaUnidade: licoes, percentualExigido: 70, aprovacaoDoInstrutor: false, preRequisitosCumpridos: true,
  });
  assert.equal(semInstrutor.liberado, false);
  assert.match(semInstrutor.motivos.join(' '), /aprovação do instrutor/);

  const completo = podeAvancarDeUnidade({
    licoesDaUnidade: licoes, percentualExigido: 70, aprovacaoDoInstrutor: true, preRequisitosCumpridos: true,
  });
  assert.equal(completo.liberado, true);
});

test('quando o método não exige instrutor, o avanço não fica preso nele', () => {
  const licoes = Array.from({ length: 10 }, (_, i) => unidade(`f${i}`, i < 8 ? 'APROVADO' : 'NAO_INICIADO'));
  const r = podeAvancarDeUnidade({
    licoesDaUnidade: licoes, percentualExigido: 70, exigeAprovacaoDoInstrutor: false,
    aprovacaoDoInstrutor: false, preRequisitosCumpridos: true,
  });
  assert.equal(r.liberado, true);
});

test('regra D: conclusão exige todas as unidades, atividades e validação final', () => {
  const unidades = ['1', '2', '3'].map((codigo) => ({ codigo, estado: 'APROVADO' as const }));
  assert.equal(podeConcluirJornada({ unidadesObrigatorias: unidades, atividadesObrigatoriasPendentes: 0, validacaoFinal: true }).liberado, true);
  const semValidacao = podeConcluirJornada({ unidadesObrigatorias: unidades, atividadesObrigatoriasPendentes: 0, validacaoFinal: false });
  assert.equal(semValidacao.liberado, false);
  const comPendencia = podeConcluirJornada({ unidadesObrigatorias: unidades, atividadesObrigatoriasPendentes: 2, validacaoFinal: true });
  assert.match(comPendencia.motivos.join(' '), /2 atividade/);
});

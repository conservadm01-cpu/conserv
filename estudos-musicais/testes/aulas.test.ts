// Aulas e frequência: o que pode ser registrado e o que os números significam.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alertaDeFrequencia, comparece, listaDePresencaInicial, motivoDaRecusaDeAula,
  motivoDaRecusaDePresenca, nomeDaPresenca, resumoDeFrequencia, TIPOS_DE_PRESENCA,
} from '../src/lib/aulas.ts';

const HOJE = new Date('2026-09-09T12:00:00Z');

test('a aula é de uma turma ou de uma matrícula, nunca das duas', () => {
  assert.match(motivoDaRecusaDeAula({ data: HOJE }, HOJE)!, /turma ou de uma matrícula/);
  assert.match(motivoDaRecusaDeAula({ turmaId: 't1', jornadaId: 'j1', data: HOJE }, HOJE)!, /não das duas/);
  assert.equal(motivoDaRecusaDeAula({ turmaId: 't1', data: HOJE }, HOJE), null);
  assert.equal(motivoDaRecusaDeAula({ jornadaId: 'j1', data: HOJE }, HOJE), null);
});

test('aula precisa de data válida', () => {
  assert.match(motivoDaRecusaDeAula({ turmaId: 't1' }, HOJE)!, /Informe a data/);
  assert.match(motivoDaRecusaDeAula({ turmaId: 't1', data: 'ontem' }, HOJE)!, /inválida/);
});

test('aula realizada não pode ter data no futuro', () => {
  const semanaQueVem = new Date('2026-09-16T12:00:00Z');
  assert.match(
    motivoDaRecusaDeAula({ turmaId: 't1', data: semanaQueVem, situacao: 'REALIZADA' }, HOJE)!,
    /só pode ser registrada como planejada/,
  );
  assert.equal(
    motivoDaRecusaDeAula({ turmaId: 't1', data: semanaQueVem, situacao: 'PLANEJADA' }, HOJE),
    null,
    'planejar aula futura é o uso normal',
  );
});

test('o horário é conferido', () => {
  const base = { turmaId: 't1', data: HOJE };
  assert.match(motivoDaRecusaDeAula({ ...base, horaInicio: '25:00' }, HOJE)!, /início inválida/);
  assert.match(motivoDaRecusaDeAula({ ...base, horaInicio: '19h' }, HOJE)!, /início inválida/);
  assert.match(motivoDaRecusaDeAula({ ...base, horaFim: '9:5' }, HOJE)!, /término inválida/);
  assert.match(
    motivoDaRecusaDeAula({ ...base, horaInicio: '20:00', horaFim: '19:00' }, HOJE)!,
    /terminar antes de começar/,
  );
  assert.equal(motivoDaRecusaDeAula({ ...base, horaInicio: '19:30', horaFim: '20:30' }, HOJE), null);
});

test('falta justificada sem justificativa é só falta', () => {
  assert.match(motivoDaRecusaDePresenca({ tipo: 'FALTA_JUSTIFICADA' })!, /precisa da justificativa/);
  assert.match(motivoDaRecusaDePresenca({ tipo: 'FALTA_JUSTIFICADA', justificativa: '  ' })!, /justificativa/);
  assert.equal(motivoDaRecusaDePresenca({ tipo: 'FALTA_JUSTIFICADA', justificativa: 'atestado' }), null);
  assert.equal(motivoDaRecusaDePresenca({ tipo: 'FALTA' }), null);
});

test('atraso conta como comparecimento; falta justificada não', () => {
  assert.ok(comparece('PRESENTE'));
  assert.ok(comparece('ATRASO'), 'quem chegou atrasado esteve na aula');
  assert.ok(!comparece('FALTA'));
  assert.ok(!comparece('FALTA_JUSTIFICADA'), 'justificada continua sendo ausência');
  assert.equal(nomeDaPresenca('FALTA_JUSTIFICADA'), 'Falta justificada');
  assert.equal(TIPOS_DE_PRESENCA.length, 4);
});

const p = (tipo: string, data: string, situacao = 'REALIZADA') => ({ tipo, aula: { data, situacao } });

test('a frequência é a contagem das presenças, não um campo mantido à mão', () => {
  const resumo = resumoDeFrequencia([
    p('PRESENTE', '2026-09-01'), p('PRESENTE', '2026-09-02'), p('ATRASO', '2026-09-03'),
    p('FALTA', '2026-09-04'), p('FALTA_JUSTIFICADA', '2026-09-05'),
  ]);
  assert.equal(resumo.aulas, 5);
  assert.equal(resumo.presencas, 3);
  assert.equal(resumo.faltas, 1);
  assert.equal(resumo.faltasJustificadas, 1);
  assert.equal(resumo.atrasos, 1);
  assert.equal(resumo.percentual, 60);
});

test('aula cancelada não conta contra ninguém', () => {
  const resumo = resumoDeFrequencia([
    p('PRESENTE', '2026-09-01'),
    p('FALTA', '2026-09-02', 'CANCELADA'),
  ]);
  assert.equal(resumo.aulas, 1, 'não faltou quem não teve aula');
  assert.equal(resumo.percentual, 100);
});

test('sem aula não se diz que a frequência é zero', () => {
  const resumo = resumoDeFrequencia([]);
  assert.equal(resumo.aulas, 0);
  assert.equal(resumo.percentual, null, 'zero por cento seria uma acusação falsa');
  assert.equal(alertaDeFrequencia(resumo, 'João'), null);
});

test('faltas seguidas são contadas a partir da aula mais recente', () => {
  const resumo = resumoDeFrequencia([
    p('PRESENTE', '2026-09-01'), p('FALTA', '2026-09-02'),
    p('PRESENTE', '2026-09-03'), p('FALTA', '2026-09-04'), p('FALTA', '2026-09-05'),
  ]);
  assert.equal(resumo.faltas, 3);
  assert.equal(resumo.faltasSeguidas, 2, 'só as duas últimas são seguidas');
});

test('o alerta fala de faltas seguidas antes de falar de percentual', () => {
  const seguidas = resumoDeFrequencia([
    p('PRESENTE', '2026-09-01'), p('FALTA', '2026-09-03'),
    p('FALTA', '2026-09-04'), p('FALTA', '2026-09-05'),
  ]);
  assert.match(alertaDeFrequencia(seguidas, 'João')!, /faltou às 3 últimas aulas/);

  const baixa = resumoDeFrequencia([
    p('FALTA', '2026-09-01'), p('FALTA', '2026-09-02'),
    p('PRESENTE', '2026-09-03'), p('PRESENTE', '2026-09-04'),
  ]);
  assert.match(alertaDeFrequencia(baixa, 'Maria')!, /50% de presença em 4 aulas/);

  const poucaEvidencia = resumoDeFrequencia([p('FALTA', '2026-09-01'), p('PRESENTE', '2026-09-02')]);
  assert.equal(alertaDeFrequencia(poucaEvidencia, 'Ana'), null,
    'com duas aulas não se conclui nada sobre frequência');

  const emDia = resumoDeFrequencia([
    p('PRESENTE', '2026-09-01'), p('PRESENTE', '2026-09-02'),
    p('PRESENTE', '2026-09-03'), p('FALTA', '2026-09-04'),
  ]);
  assert.equal(alertaDeFrequencia(emDia, 'Pedro'), null, 'quem está em dia não vira alerta');
});

test('a chamada começa com todos presentes', () => {
  const lista = listaDePresencaInicial([{ alunoId: 'a1' }, { alunoId: 'a2' }]);
  assert.deepEqual(lista.map((l) => l.tipo), ['PRESENTE', 'PRESENTE']);
});

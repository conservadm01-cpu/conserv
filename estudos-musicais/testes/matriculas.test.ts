// A matrícula: abertura, situação e quem pode mexer.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { EscopoDoUsuario, Papel } from '../src/lib/autorizacao.ts';
import {
  camposDaMudancaDeSituacao, descreverMatricula, encerra, estaEmCurso, matriculaPrincipal,
  motivoDaRecusaDeAbertura, motivoDaRecusaDeGestao, motivoDaRecusaDeSituacaoDaMatricula,
  nomeDaSituacao, SITUACOES_DA_MATRICULA,
} from '../src/lib/matriculas.ts';

const escopo = (papeis: Papel[], extras: Partial<EscopoDoUsuario> = {}): EscopoDoUsuario => ({
  usuarioId: 'quem', papeis, comunsDiretas: [], regioes: [], comunsVisiveis: [],
  ehAdministracao: papeis.some((p) => p === 'SUPERADMIN' || p === 'ADMIN_PEDAGOGICO'),
  comumDoAluno: null, ...extras,
});

test('o aluno tem várias matrículas, mas não duas no mesmo método e instrumento', () => {
  const existentes = [
    { id: 'm1', alunoId: 'a1', metodoId: 'msa', instrumentoId: null, status: 'ATIVA' },
    { id: 'm2', alunoId: 'a1', metodoId: 'cordas', instrumentoId: 'violino', status: 'ATIVA' },
  ];

  assert.match(
    motivoDaRecusaDeAbertura({ alunoId: 'a1', metodoId: 'msa' }, existentes)!,
    /já tem uma matrícula em curso/,
  );
  assert.equal(
    motivoDaRecusaDeAbertura({ alunoId: 'a1', metodoId: 'cordas', instrumentoId: 'viola' }, existentes),
    null,
    'o mesmo método em outro instrumento é outra matrícula',
  );
  assert.equal(
    motivoDaRecusaDeAbertura({ alunoId: 'a2', metodoId: 'msa' }, existentes),
    null,
    'outro aluno não é impedido pela matrícula do primeiro',
  );
});

test('matrícula encerrada não impede abrir outra no mesmo método', () => {
  const existentes = [
    { id: 'm1', alunoId: 'a1', metodoId: 'msa', instrumentoId: null, status: 'CONCLUIDA' },
    { id: 'm2', alunoId: 'a1', metodoId: 'cordas', instrumentoId: 'violino', status: 'TRANCADA' },
  ];
  assert.equal(motivoDaRecusaDeAbertura({ alunoId: 'a1', metodoId: 'msa' }, existentes), null);
  assert.equal(
    motivoDaRecusaDeAbertura({ alunoId: 'a1', metodoId: 'cordas', instrumentoId: 'violino' }, existentes),
    null,
  );
});

test('matrícula sem aluno ou sem método é recusada', () => {
  assert.match(motivoDaRecusaDeAbertura({ alunoId: '', metodoId: 'msa' }, [])!, /sem aluno/);
  assert.match(motivoDaRecusaDeAbertura({ alunoId: 'a1', metodoId: '' }, [])!, /sem método/);
});

test('a matrícula tranca, volta e cancela — mas concluída é final', () => {
  assert.equal(motivoDaRecusaDeSituacaoDaMatricula('ATIVA', 'TRANCADA'), null);
  assert.equal(motivoDaRecusaDeSituacaoDaMatricula('TRANCADA', 'ATIVA'), null);
  assert.equal(motivoDaRecusaDeSituacaoDaMatricula('ATIVA', 'CONCLUIDA'), null);
  assert.equal(motivoDaRecusaDeSituacaoDaMatricula('ATIVA', 'ATIVA'), null, 'não mudar nada é permitido');

  assert.match(motivoDaRecusaDeSituacaoDaMatricula('CONCLUIDA', 'ATIVA')!, /não é reaberta/);
  assert.match(motivoDaRecusaDeSituacaoDaMatricula('CONCLUIDA', 'ATIVA')!, /nova matrícula/);
  assert.match(motivoDaRecusaDeSituacaoDaMatricula('CANCELADA', 'ATIVA')!, /não é reaberta/);
});

test('o nome antigo continua valendo e volta a circular', () => {
  assert.equal(nomeDaSituacao('INTERROMPIDA'), 'Trancada', 'quem foi gravado antes continua legível');
  assert.equal(motivoDaRecusaDeSituacaoDaMatricula('INTERROMPIDA', 'ATIVA'), null);
  assert.ok(!SITUACOES_DA_MATRICULA.some((s) => s.id === 'INTERROMPIDA'),
    'mas não se oferece o nome antigo em tela nova');
});

test('encerrar carimba a data; reabrir a limpa', () => {
  const agora = new Date('2026-09-09T12:00:00Z');

  const trancada = camposDaMudancaDeSituacao('TRANCADA', agora);
  assert.equal(trancada.encerradaEm?.toISOString(), agora.toISOString());

  const concluida = camposDaMudancaDeSituacao('CONCLUIDA', agora);
  assert.equal(concluida.conclusaoEm?.toISOString(), agora.toISOString());
  assert.equal(concluida.encerradaEm?.toISOString(), agora.toISOString());

  const reaberta = camposDaMudancaDeSituacao('ATIVA', agora);
  assert.equal(reaberta.encerradaEm, null, 'matrícula reaberta não pode constar como encerrada');
  assert.equal(reaberta.conclusaoEm, null);
});

test('em curso e encerrada são perguntas diferentes', () => {
  assert.ok(estaEmCurso('ATIVA'));
  assert.ok(estaEmCurso('AGUARDANDO_LIBERACAO'));
  assert.ok(!estaEmCurso('TRANCADA'));
  assert.ok(encerra('CONCLUIDA') && encerra('CANCELADA') && encerra('INTERROMPIDA'));
  assert.ok(!encerra('ATIVA'));
});

test('o instrutor da matrícula pode geri-la sem depender da secretaria', () => {
  const instrutor = escopo(['INSTRUTOR'], { usuarioId: 'inst-1' });
  const matricula = { alunoId: 'a1', instrutorId: 'inst-1' };

  assert.equal(motivoDaRecusaDeGestao(instrutor, matricula, false), null,
    'quem acompanha registra andamento sem pedir licença a cada aula');

  const outroInstrutor = escopo(['INSTRUTOR'], { usuarioId: 'inst-2' });
  assert.match(motivoDaRecusaDeGestao(outroInstrutor, matricula, false)!, /não acompanha/);
  assert.equal(motivoDaRecusaDeGestao(outroInstrutor, matricula, true), null,
    'mas quem administra o aluno pode');
});

test('o aluno não altera a própria matrícula', () => {
  const aluno = escopo(['ALUNO'], { usuarioId: 'a1', comumDoAluno: 'c1' });
  assert.match(
    motivoDaRecusaDeGestao(aluno, { alunoId: 'a1', instrutorId: 'inst-1' }, false)!,
    /alterada pelo instrutor ou pela secretaria/,
  );
});

test('a matrícula se descreve para a lista', () => {
  assert.equal(
    descreverMatricula({ metodo: { nome: 'MSA' }, instrumento: { nome: 'Violino' }, status: 'ATIVA' }),
    'MSA · Violino — ativa',
  );
  assert.equal(
    descreverMatricula({ metodo: { nome: 'MSA' }, instrumento: null, status: 'INTERROMPIDA' }),
    'MSA — trancada',
  );
});

test('a matrícula que representa o aluno numa linha só é sempre a mesma', () => {
  // Painel e relatório escolhiam por critérios diferentes, e o mesmo aluno
  // aparecia em métodos diferentes nas duas telas.
  const matriculas = [
    { id: 'antiga-ativa', status: 'ATIVA', inicioEm: '2024-01-01' },
    { id: 'concluida-recente', status: 'CONCLUIDA', inicioEm: '2026-01-01' },
    { id: 'nova-ativa', status: 'ATIVA', inicioEm: '2025-06-01' },
  ];
  assert.equal(matriculaPrincipal(matriculas)!.id, 'nova-ativa',
    'a mais recente EM CURSO, não a mais recente de todas');

  const soEncerradas = [
    { id: 'velha', status: 'CANCELADA', inicioEm: '2023-01-01' },
    { id: 'recente', status: 'CONCLUIDA', inicioEm: '2026-01-01' },
  ];
  assert.equal(matriculaPrincipal(soEncerradas)!.id, 'recente',
    'sem nenhuma em curso, a mais recente de todas');

  assert.equal(matriculaPrincipal([]), null);
});

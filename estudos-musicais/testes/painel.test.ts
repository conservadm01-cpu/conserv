// Os números dos painéis: o que eles afirmam e o que se recusam a afirmar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buscar, distribuicaoPor, distribuicaoPorFase, panorama, situacaoDoAluno,
  taxaDeAprovacao, type Achado, type LinhaDoAluno,
} from '../src/lib/painel.ts';

const AGORA = new Date('2026-09-09T12:00:00Z');
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86400000);

const aluno = (extras: Partial<LinhaDoAluno> = {}): LinhaDoAluno => ({
  alunoId: 'a1', nome: 'Ana Lima Souza', instrumento: 'Violino', metodo: 'MSA',
  unidadeAtual: 'Fase 3', percentual: 40, ultimoAcesso: diasAtras(1), ultimaAula: diasAtras(3),
  frequencia: 100, aulas: 8, enviosPendentes: 0, ...extras,
});

test('quem está em dia não vira alerta', () => {
  const situacao = situacaoDoAluno(aluno(), AGORA);
  assert.equal(situacao.chave, 'em_dia');
  assert.deepEqual(situacao.motivos, []);
  assert.equal(situacao.texto, 'em dia', 'a situação sai também em palavra, não só em cor');
});

test('quem nunca acessou nem teve aula não é chamado de atrasado', () => {
  const situacao = situacaoDoAluno(aluno({ ultimoAcesso: null, ultimaAula: null }), AGORA);
  assert.equal(situacao.chave, 'nao_comecou');
  assert.match(situacao.motivos[0], /ainda não acessou/);
});

test('o atraso é medido pelo sinal mais recente de vida', () => {
  // Não abre o aplicativo há dois meses, mas teve aula anteontem: não está
  // em atraso — está estudando presencialmente.
  const soPresencial = situacaoDoAluno(
    aluno({ ultimoAcesso: diasAtras(60), ultimaAula: diasAtras(2) }), AGORA);
  assert.equal(soPresencial.chave, 'em_dia');

  const sumido = situacaoDoAluno(
    aluno({ ultimoAcesso: diasAtras(40), ultimaAula: diasAtras(35) }), AGORA);
  assert.equal(sumido.chave, 'atencao');
  assert.match(sumido.motivos[0], /35 dias sem estudar/);
});

test('frequência baixa só é apontada com aulas bastantes', () => {
  const poucas = situacaoDoAluno(aluno({ frequencia: 50, aulas: 2 }), AGORA);
  assert.equal(poucas.chave, 'em_dia', 'duas aulas não sustentam conclusão sobre frequência');

  const muitas = situacaoDoAluno(aluno({ frequencia: 50, aulas: 10 }), AGORA);
  assert.equal(muitas.chave, 'atencao');
  assert.match(muitas.motivos.join(' '), /50% de presença em 10 aulas/);
});

test('atividade esperando avaliação é acompanhar, não alarme', () => {
  const situacao = situacaoDoAluno(aluno({ enviosPendentes: 2 }), AGORA);
  assert.equal(situacao.chave, 'acompanhar');
  assert.match(situacao.motivos[0], /2 atividade\(s\) de Ana esperando avaliação/);
});

test('a média é de quem tem o dado, não do total', () => {
  const resumo = panorama([
    aluno({ alunoId: 'a1', percentual: 80, frequencia: 100, aulas: 10 }),
    aluno({ alunoId: 'a2', percentual: 40, frequencia: 50, aulas: 10 }),
    // Matriculado ontem: sem progresso e sem aula. Contá-lo como zero faria
    // parecer que o ensino piorou quando o que houve foi matrícula nova.
    aluno({ alunoId: 'a3', percentual: null, frequencia: null, aulas: 0, ultimoAcesso: null, ultimaAula: null }),
  ], AGORA);

  assert.equal(resumo.alunos, 3);
  assert.equal(resumo.progressoMedio, 60, 'média de 80 e 40, sem o que não começou');
  assert.equal(resumo.frequenciaMedia, 75);
  assert.equal(resumo.alunosSemAtividade, 1);
});

test('panorama sem ninguém não inventa zero', () => {
  const vazio = panorama([], AGORA);
  assert.equal(vazio.alunos, 0);
  assert.equal(vazio.progressoMedio, null);
  assert.equal(vazio.frequenciaMedia, null);
});

test('a distribuição mostra onde a turma está', () => {
  const linhas = [
    aluno({ alunoId: 'a1', unidadeAtual: 'Fase 1', instrumento: 'Violino' }),
    aluno({ alunoId: 'a2', unidadeAtual: 'Fase 1', instrumento: 'Flauta' }),
    aluno({ alunoId: 'a3', unidadeAtual: 'Fase 4', instrumento: 'Violino' }),
    aluno({ alunoId: 'a4', unidadeAtual: null, instrumento: null }),
  ];
  assert.deepEqual(distribuicaoPorFase(linhas), [
    { fase: 'Fase 1', alunos: 2 }, { fase: 'Fase 4', alunos: 1 }, { fase: 'sem fase definida', alunos: 1 },
  ]);
  assert.deepEqual(distribuicaoPor(linhas, 'instrumento')[0], { nome: 'Violino', alunos: 2 });
  assert.ok(distribuicaoPor(linhas, 'instrumento').some((d) => d.nome === 'não definido'));
});

test('a taxa de aprovação se cala quando há poucas avaliações', () => {
  assert.deepEqual(taxaDeAprovacao([]), { taxa: null, total: 0, conclusiva: false });

  const duas = taxaDeAprovacao([{ aprovado: true }, { aprovado: false }]);
  assert.equal(duas.taxa, 50);
  assert.equal(duas.conclusiva, false, '50% em duas tentativas não se compara com 50% em duzentas');

  const muitas = taxaDeAprovacao([
    { aprovado: true }, { aprovado: true }, { aprovado: true },
    { aprovado: false }, { aprovado: true }, { aprovado: true },
  ]);
  assert.equal(muitas.taxa, 83);
  assert.equal(muitas.conclusiva, true);
});

test('tentativa ainda não corrigida não entra na conta', () => {
  const resultado = taxaDeAprovacao([{ aprovado: true }, { aprovado: null }, { aprovado: null }]);
  assert.equal(resultado.total, 1, 'o que ainda não foi corrigido não conta como reprovação');
  assert.equal(resultado.taxa, 100);
});

const universo: Achado[] = [
  { tipo: 'aluno', id: '1', titulo: 'Mariana Costa', detalhe: 'Violino · Centro', destino: '/a/1' },
  { tipo: 'aluno', id: '2', titulo: 'Ana Lima', detalhe: 'Flauta · Jardim Sul', destino: '/a/2' },
  { tipo: 'instrutor', id: '3', titulo: 'Paulo Alves', detalhe: 'Jardim Aeroporto', destino: '/i/3' },
  { tipo: 'metodo', id: '4', titulo: 'Método Simplificado', detalhe: 'MSA', destino: '/m/4' },
];

test('a busca acha por nome, por detalhe e sem acento', () => {
  assert.deepEqual(buscar('ana', universo).map((a) => a.titulo), ['Ana Lima', 'Mariana Costa'],
    'quem começa com o termo vem antes');
  // Nenhum dos dois COMEÇA com "jardim" — o termo casa no detalhe. O empate
  // é desfeito em ordem alfabética, que é previsível para quem procura.
  assert.deepEqual(buscar('jardim', universo).map((a) => a.titulo), ['Ana Lima', 'Paulo Alves']);
  assert.deepEqual(buscar('metodo', universo).map((a) => a.titulo), ['Método Simplificado'],
    'procurar sem acento acha com acento');
  assert.deepEqual(buscar('MSA', universo).map((a) => a.titulo), ['Método Simplificado']);
});

test('a busca não dispara com uma letra', () => {
  assert.deepEqual(buscar('a', universo), [], 'uma letra devolveria o cadastro inteiro');
  assert.deepEqual(buscar('  ', universo), []);
});

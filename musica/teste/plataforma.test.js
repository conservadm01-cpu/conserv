// Testes da plataforma: matrículas, versões, motor pedagógico, desempenho,
// gamificação, certificados verificáveis, auditoria e importação de métodos.
import test from 'node:test';
import assert from 'node:assert/strict';

const { criarDepositoEmMemoria } = await import('../js/dados/deposito.js');
const R = await import('../js/dados/repositorios.js');
const migracao = await import('../js/dados/migracao.js');
const catalogo = await import('../js/servicos/catalogo.js');
const progresso = await import('../js/servicos/progresso.js');
const avaliacoes = await import('../js/servicos/avaliacoes.js');
const desempenho = await import('../js/servicos/desempenho.js');
const recomendacao = await import('../js/servicos/recomendacao.js');
const gamificacao = await import('../js/servicos/gamificacao.js');
const certificados = await import('../js/servicos/certificados.js');
const auditoria = await import('../js/servicos/auditoria.js');
const eventos = await import('../js/servicos/eventos.js');
const alertas = await import('../js/servicos/alertas.js');
const relatorios = await import('../js/servicos/relatorios.js');
const importacao = await import('../js/servicos/importacao.js');
const estudo = await import('../js/servicos/estudo.js');

const recomecar = () => R.usarDeposito(criarDepositoEmMemoria());

function criarAluno(nome, instrumentoId, extras = {}) {
  const aluno = R.alunos.criar({ nome, instrumentoId, ...extras });
  migracao.matricularNosMetodos(R.estadoAtual(), aluno);
  R.gravar();
  return aluno;
}

// Faz uma avaliação com o número de acertos pedido.
function avaliar(alunoId, faseId, acertos, { instrumentoId = 'violino', data = null } = {}) {
  const fase = catalogo.faseDoAluno(faseId, instrumentoId, { matriculas: R.matriculasDoAluno(alunoId) });
  const prova = avaliacoes.montar(fase, R.progressoDoAluno(alunoId, faseId).usadas);
  const respostas = prova.questoes.map((q, i) => (i < acertos ? q.correta : '—resposta errada—'));
  const resultado = avaliacoes.corrigir(prova, respostas, fase);
  return avaliacoes.registrarTentativa({ alunoId, fase, prova, resultado, data, duracaoSegundos: 300 });
}

// ------------------------------------------------------------- matrículas

test('cadastrar um aluno o matricula nos métodos que servem ao instrumento', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  const minhas = R.matriculasDoAluno(aluno.id);
  assert.deepEqual(minhas.map((m) => m.metodoId).sort(), ['instrumento', 'msa']);
  assert.ok(minhas.every((m) => m.situacao === 'em_curso'));
  assert.ok(minhas.every((m) => m.versaoId), 'cada matrícula aponta a versão em que o aluno estuda');
});

test('o aluno pode ter duas matrículas, e um progresso não vaza no outro', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  // Um método novo, de outro instrumento, ao qual ela também se matricula.
  R.metodos.criar({ id: 'flauta-basico', nome: 'Flauta do começo', instrumentoIds: ['flauta'], ordem: 5 });
  R.versoes.criar({ id: 'flauta-basico-1.0', metodoId: 'flauta-basico', rotulo: '1.0', situacao: 'publicada', ordem: 1 });
  R.fases.criar({ id: 'fb1', metodoId: 'flauta-basico', versaoId: 'flauta-basico-1.0', ordem: 1, titulo: 'Sopro' });

  R.matriculas.criar({ alunoId: aluno.id, instrumentoId: 'flauta', metodoId: 'flauta-basico',
    versaoId: 'flauta-basico-1.0', situacao: 'em_curso' });

  assert.equal(R.matriculasDoAluno(aluno.id).length, 3);

  avaliar(aluno.id, '1', 10);
  const situacao = progresso.situacaoDoAluno(aluno.id);
  const doMsa = situacao.matriculas.find((m) => m.matricula.metodoId === 'msa');
  const daFlauta = situacao.matriculas.find((m) => m.matricula.metodoId === 'flauta-basico');
  assert.equal(doMsa.concluidas, 1);
  assert.equal(daFlauta.concluidas, 0, 'a aprovação num método não conta no outro');
});

test('a matrícula anda de fase e se conclui quando não há mais fase', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  const matricula = R.matriculasDoAluno(aluno.id).find((m) => m.metodoId === 'msa');
  assert.equal(matricula.faseAtualId, null, 'ainda não começou');

  avaliar(aluno.id, '1', 10);
  assert.equal(R.matriculas.buscar(matricula.id).faseAtualId, '2');

  for (const fase of R.fasesDoMetodo('msa')) avaliar(aluno.id, fase.id, 10);
  const depois = R.matriculas.buscar(matricula.id);
  assert.equal(depois.situacao, 'concluida');
  assert.ok(depois.dataFim);
});

// ---------------------------------------------------------------- versões

test('duas versões de um método convivem, e cada aluno fica na sua', () => {
  recomecar();
  R.versoes.criar({ id: 'msa-2.0', metodoId: 'msa', rotulo: '2.0', situacao: 'publicada', ordem: 2 });
  for (let i = 1; i <= 3; i++) {
    R.fases.criar({ id: `msa2-f${i}`, metodoId: 'msa', versaoId: 'msa-2.0', ordem: i,
      titulo: `Fase nova ${i}`, anteriorId: i > 1 ? `msa2-f${i - 1}` : null });
  }

  assert.equal(R.versaoVigente('msa').rotulo, '2.0', 'quem chega agora entra na última publicada');
  assert.equal(R.fasesDaVersao('msa-1.0').length, 10);
  assert.equal(R.fasesDaVersao('msa-2.0').length, 3);

  const novo = criarAluno('Bia Souza', 'flauta');
  const daBia = R.matriculasDoAluno(novo.id).find((m) => m.metodoId === 'msa');
  assert.equal(daBia.versaoId, 'msa-2.0');
  assert.equal(catalogo.trilhasDoAluno('flauta', { matriculas: [daBia] }).todas.length, 3);

  // Um aluno preso à versão 1.0 continua vendo as dez fases dela.
  const antigo = criarAluno('Carlos Dias', 'trompete');
  const doCarlos = R.matriculasDoAluno(antigo.id).find((m) => m.metodoId === 'msa');
  R.matriculas.atualizar(doCarlos.id, { versaoId: 'msa-1.0' });
  const dele = R.matriculas.buscar(doCarlos.id);
  assert.equal(catalogo.trilhasDoAluno('trompete', { matriculas: [dele] }).todas.length, 10);
});

// ------------------------------------------------- método de qualquer tamanho

for (const quantidade of [10, 16, 20]) {
  test(`o aluno percorre um método de ${quantidade} fases`, () => {
    recomecar();
    const metodoId = `m${quantidade}`;
    R.metodos.criar({ id: metodoId, nome: `Método de ${quantidade}`, instrumentoIds: ['violino'], ordem: 8 });
    R.versoes.criar({ id: `${metodoId}-1.0`, metodoId, rotulo: '1.0', situacao: 'publicada', ordem: 1 });
    for (let i = 1; i <= quantidade; i++) {
      R.fases.criar({ id: `${metodoId}-f${i}`, metodoId, versaoId: `${metodoId}-1.0`, ordem: i,
        titulo: `Fase ${i}`, anteriorId: i > 1 ? `${metodoId}-f${i - 1}` : null });
      R.licoes.criar({ id: `${metodoId}-f${i}-l1`, faseId: `${metodoId}-f${i}`, ordem: 1,
        titulo: 'Aula', corpo: 'Conteúdo.' });
    }
    const aluno = criarAluno('Ana Lima', 'violino');
    const matricula = R.matriculasDoAluno(aluno.id).find((m) => m.metodoId === metodoId);
    assert.ok(matricula, 'o aluno é matriculado no método novo');

    const situacao = progresso.situacaoDaMatricula(matricula);
    assert.equal(situacao.total, quantidade);
    assert.equal(situacao.fases[0].liberada, true, 'a primeira fase está aberta');
    assert.equal(situacao.fases[1].liberada, false, 'a segunda não');
    assert.equal(situacao.fases[quantidade - 1].fase.numero, quantidade);
  });
}

// ------------------------------------------------------- motor pedagógico

test('a próxima atividade segue lição, jogo e avaliação, e diz o porquê', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');

  let seguinte = progresso.proximaAtividade(aluno.id);
  assert.equal(seguinte.tipo, 'licao');
  assert.match(seguinte.motivo, /Começar a Fase 1/);

  const fase = catalogo.faseDoAluno('1', 'violino');
  fase.licoes.forEach((licao, i) => estudo.marcarLicaoLida(aluno.id, '1', i, { titulo: licao.titulo }));

  seguinte = progresso.proximaAtividade(aluno.id);
  assert.equal(seguinte.tipo, 'jogo');
  assert.match(seguinte.motivo, /já leu as lições/);

  fase.jogos.forEach((jogo) => estudo.registrarJogo(aluno.id, '1', jogo.titulo, 30));
  seguinte = progresso.proximaAtividade(aluno.id);
  assert.equal(seguinte.tipo, 'avaliacao');
  assert.match(seguinte.motivo, /aprovação é a partir de 70%/);

  avaliar(aluno.id, '1', 10);
  seguinte = progresso.proximaAtividade(aluno.id);
  assert.equal(seguinte.fase.id, '2', 'aprovada a fase, o próximo passo é a seguinte');
});

test('a fase só abre quando a anterior é aprovada', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  const matricula = R.matriculasDoAluno(aluno.id).find((m) => m.metodoId === 'msa');

  const antes = progresso.situacaoDaMatricula(matricula);
  assert.equal(antes.fases[1].situacao, progresso.SITUACOES.TRANCADA);

  avaliar(aluno.id, '1', 10);
  const depois = progresso.situacaoDaMatricula(matricula);
  assert.equal(depois.fases[0].situacao, progresso.SITUACOES.APROVADA);
  assert.equal(depois.fases[1].situacao, progresso.SITUACOES.NAO_INICIADA);
  assert.equal(depois.fases[1].liberada, true);
});

test('a nota mínima da fase vale mais que a do aplicativo', () => {
  recomecar();
  R.fases.atualizar('1', { notaMinima: 90 });
  const aluno = criarAluno('Ana Lima', 'violino');
  const { registro } = avaliar(aluno.id, '1', 8);
  assert.equal(registro.nota, 80);
  assert.equal(registro.aprovado, false, '80% não passa numa fase que exige 90%');
});

// ------------------------------------------------------------- histórico

test('todas as tentativas ficam guardadas, com o detalhe de cada questão', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  avaliar(aluno.id, '1', 6);
  avaliar(aluno.id, '1', 7);
  avaliar(aluno.id, '1', 9);

  const tentativas = R.resultadosDoAluno(aluno.id, '1');
  assert.equal(tentativas.length, 3, 'nenhuma tentativa é sobrescrita');
  assert.deepEqual(tentativas.map((t) => t.nota), [60, 70, 90]);
  assert.equal(tentativas[0].respostas.length, 10, 'cada questão respondida fica registrada');
  assert.ok(tentativas[0].respostas[0].gerador, 'com o gerador que a produziu');
  assert.equal(typeof tentativas[0].respostas[0].certa, 'boolean');
  assert.equal(R.progressoDoAluno(aluno.id, '1').melhorNota, 90);
});

test('a linha do tempo é feita de fatos, na ordem em que aconteceram', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  estudo.marcarLicaoLida(aluno.id, '1', 0, { titulo: 'Som, ruído e música' });
  avaliar(aluno.id, '1', 10);

  const tipos = eventos.doAluno(aluno.id).map((e) => e.tipo);
  assert.ok(tipos.includes('licao_lida'));
  assert.ok(tipos.includes('avaliacao'));
  assert.ok(tipos.includes('aprovacao'));
  assert.ok(eventos.linhaDoTempo(aluno.id).length >= 1);
});

// ------------------------------------------------------------ desempenho

test('o desempenho aponta onde o aluno erra, com evidência', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  avaliar(aluno.id, '1', 10);
  avaliar(aluno.id, '1', 9);
  avaliar(aluno.id, '2', 3);
  avaliar(aluno.id, '2', 2);

  const pontos = desempenho.pontos(aluno.id);
  assert.equal(pontos.fracos.length, 1);
  assert.equal(pontos.fracos[0].faseId, '2');
  assert.equal(pontos.fortes[0].faseId, '1');

  const conselho = recomendacao.recomendar(aluno.id);
  assert.equal(conselho.prioridade, 'reforco');
  assert.match(conselho.motivo, /\d+% das \d+ questões/, 'a recomendação traz o número que a sustenta');
});

test('com pouca evidência o app não conclui nada', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  const fase = catalogo.faseDoAluno('1', 'violino');
  const prova = avaliacoes.montar(fase, [], { quantidade: 3 });
  const resultado = avaliacoes.corrigir(prova, prova.questoes.map(() => 'errado'), fase);
  avaliacoes.registrarTentativa({ alunoId: aluno.id, fase, prova, resultado });

  const pontos = desempenho.pontos(aluno.id);
  assert.equal(pontos.fracos.length, 0, '3 questões não bastam para chamar de dificuldade');
  assert.equal(pontos.semEvidencia, 1);
  assert.equal(recomendacao.recomendar(aluno.id).prioridade, 'seguir');
});

test('a tendência das notas só é afirmada com tentativas bastantes', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  avaliar(aluno.id, '1', 3);
  assert.equal(desempenho.tendencia(aluno.id).conclusiva, false);
  for (const acertos of [4, 5, 8, 9, 10]) avaliar(aluno.id, '1', acertos);
  const tendencia = desempenho.tendencia(aluno.id);
  assert.equal(tendencia.conclusiva, true);
  assert.equal(tendencia.sentido, 'subindo');
});

// ----------------------------------------------------------- gamificação

test('o nível vem do XP e a sequência conta dias seguidos', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  for (const dia of ['2026-09-05', '2026-09-06', '2026-09-07']) {
    eventos.registrar({ alunoId: aluno.id, tipo: 'licao_lida', titulo: 'x', dataHora: `${dia}T10:00:00.000Z` });
  }
  assert.equal(gamificacao.sequencia(aluno.id, '2026-09-07T20:00:00Z').dias, 3);
  assert.equal(gamificacao.sequencia(aluno.id, '2026-09-08T08:00:00Z').dias, 3, 'quem estudou ontem ainda tem a sequência');
  assert.equal(gamificacao.sequencia(aluno.id, '2026-09-10T08:00:00Z').dias, 0, 'dois dias sem estudar perde');
});

test('as conquistas premiam constância e superação, e não se repetem', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  estudo.marcarLicaoLida(aluno.id, '1', 0);
  assert.ok(R.conquistasDoAluno(aluno.id).some((c) => c.chave === 'primeira-licao'));

  avaliar(aluno.id, '1', 3);   // não passou
  avaliar(aluno.id, '1', 10);  // voltou e passou
  gamificacao.conferir(aluno.id);
  const chaves = R.conquistasDoAluno(aluno.id).map((c) => c.chave);
  assert.ok(chaves.includes('superacao'), 'não desistir é a conquista que mais importa');
  assert.ok(chaves.includes('primeira-fase'));
  assert.ok(chaves.includes('sem-erro'));

  const antes = R.conquistasDoAluno(aluno.id).length;
  gamificacao.conferir(aluno.id);
  assert.equal(R.conquistasDoAluno(aluno.id).length, antes, 'conferir de novo não duplica');
});

// ---------------------------------------------------------- certificados

test('o certificado guarda o retrato do dia e não muda depois', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino', { comum: 'Centro' });
  const fase = catalogo.faseDoAluno('1', 'violino');
  const emitido = certificados.emitir({ alunoId: aluno.id, fase, nota: 90, acertos: 9, total: 10 });

  assert.equal(emitido.numero, 1);
  assert.equal(emitido.retrato.metodo, 'Teoria — MSA');
  assert.equal(emitido.retrato.versao, '1.0');
  assert.equal(emitido.retrato.instrumento, 'Violino');
  assert.ok(emitido.responsavel, 'o certificado registra quem respondeu por ele');

  R.metodos.atualizar('msa', { nome: 'Outro nome' });
  R.fases.atualizar('1', { titulo: 'Outro título' });
  const relido = R.certificados.buscar(emitido.id);
  assert.equal(relido.retrato.metodo, 'Teoria — MSA', 'mudar o método não reescreve o certificado');
  assert.equal(relido.retrato.fase.titulo, 'O som e a música');
});

test('o certificado é conferível, e a adulteração é detectada', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  const fase = catalogo.faseDoAluno('1', 'violino');
  const emitido = certificados.emitir({ alunoId: aluno.id, fase, nota: 80, acertos: 8, total: 10 });

  assert.equal(certificados.verificar(emitido.codigo).valido, true);
  assert.equal(certificados.verificar('MSA-99-XXXXXX').valido, false);

  R.certificados.salvar({ ...R.certificados.buscar(emitido.id), nota: 100 });
  const conferencia = certificados.verificar(emitido.codigo);
  assert.equal(conferencia.valido, false);
  assert.match(conferencia.motivo, /não correspondem/);
});

test('reaprovar a mesma fase não cria um segundo certificado nem muda o número', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  const fase = catalogo.faseDoAluno('1', 'violino');
  const primeiro = certificados.emitir({ alunoId: aluno.id, fase, nota: 80, acertos: 8, total: 10 });
  const segundo = certificados.emitir({ alunoId: aluno.id, fase, nota: 100, acertos: 10, total: 10 });
  assert.equal(R.certificadosDoAluno(aluno.id).length, 1);
  assert.equal(segundo.numero, primeiro.numero);
  assert.equal(segundo.codigo, primeiro.codigo);
});

// -------------------------------------------------------------- auditoria

test('a auditoria registra o que tem consequência e nunca guarda senha', () => {
  recomecar();
  const aluno = criarAluno('Ana Lima', 'violino');
  const fase = catalogo.faseDoAluno('1', 'violino');
  certificados.emitir({ alunoId: aluno.id, fase, nota: 90, acertos: 9, total: 10 });

  const registros = auditoria.listar();
  assert.ok(registros.some((a) => a.acao === 'certificado.emitir'));

  auditoria.registrar({
    acao: 'acesso.login', entidade: 'usuarios', entidadeId: 'admin',
    dadosDepois: { login: 'RENATO', senha: 'CCB123', senhaHash: 'abc', sal: 'admin' },
  });
  const gravado = auditoria.listar({ acao: 'acesso.login' })[0];
  assert.equal(gravado.dadosDepois.login, 'RENATO');
  assert.equal(gravado.dadosDepois.senha, undefined);
  assert.equal(gravado.dadosDepois.senhaHash, undefined);
  assert.equal(gravado.dadosDepois.sal, undefined);
  assert.ok(!JSON.stringify(R.auditorias.listar()).includes('CCB123'));
});

// ---------------------------------------------------------- alertas e painel

test('o instrutor recebe alertas com o número por trás', () => {
  recomecar();
  const joao = criarAluno('João Pedro', 'violino');
  const maria = criarAluno('Maria Silva', 'flauta');
  criarAluno('Pedro Nunes', 'trompete');

  avaliar(joao.id, '1', 10);
  for (let i = 0; i < 4; i++) avaliar(maria.id, '1', 3, { instrumentoId: 'flauta' });

  const daMaria = alertas.doAluno(maria.id);
  assert.ok(daMaria.some((a) => a.chave === 'travado' && /4 vezes/.test(a.texto)));
  assert.ok(daMaria.some((a) => a.chave === 'dificuldade'));
  assert.equal(alertas.situacaoDoAluno(maria.id).chave, 'atencao');
  assert.equal(alertas.situacaoDoAluno(maria.id).texto, 'precisa de atenção', 'a situação também é dita em palavra');

  const doPedro = alertas.doAluno(R.alunos.listar((a) => a.nome === 'Pedro Nunes')[0].id);
  assert.ok(doPedro.some((a) => a.chave === 'nunca-comecou'));
  assert.ok(alertas.doAluno(joao.id).some((a) => a.gravidade === 'boa'), 'o painel também mostra a quem dar parabéns');
});

test('o relatório aponta a fase que mais trava', () => {
  recomecar();
  const alunos = ['Ana', 'Bia', 'Carlos'].map((n) => criarAluno(`${n} Souza`, 'violino'));
  for (const aluno of alunos) {
    avaliar(aluno.id, '1', 10);
    avaliar(aluno.id, '2', 2);
    avaliar(aluno.id, '2', 3);
  }
  const doMsa = relatorios.porMetodo().find((m) => m.metodo.id === 'msa');
  assert.equal(doMsa.totalDeFases, 10);
  assert.equal(doMsa.gargalo.faseId, '2');
  assert.equal(doMsa.gargalo.taxa, 0);

  const panorama = relatorios.panorama();
  assert.equal(panorama.alunos, 3);
  assert.equal(panorama.alunosSemAtividade, 0);
  assert.equal(panorama.avaliacoes, 9);
});

// ------------------------------------------------------------- importação

const METODO_DE_TESTE = {
  metodo: { id: 'teste-import', nome: 'Método de teste', instrumentoIds: ['flauta'] },
  versao: { rotulo: '1.0' },
  fases: [{ id: 'ti1', ordem: 1, titulo: 'Primeira', notaMinima: 60 }],
  licoes: [{ faseId: 'ti1', ordem: 1, titulo: 'Aula', corpo: 'Primeiro.\n\nSegundo.' }],
  avaliacoes: [{ faseId: 'ti1', quantidadeDeQuestoes: 2, questoes: [
    { enunciado: 'A?', alternativas: ['sim', 'não'], correta: 'sim' },
    { enunciado: 'B?', alternativas: ['sim', 'não'], correta: 'não' },
  ] }],
};

test('a análise do arquivo diz exatamente onde está o erro', () => {
  recomecar();
  const analise = importacao.analisar({
    metodo: { id: 'x', nome: 'X', instrumentoIds: ['flauta'] },
    fases: [{ id: 'x1', ordem: 1, titulo: 'A' }],
    licoes: [{ faseId: 'x1', ordem: 1, titulo: 'L', corpo: 'c' }],
    avaliacoes: [{ faseId: 'x1', questoes: [
      { enunciado: 'ok?', alternativas: ['a', 'b'], correta: 'a' },
      { enunciado: 'ruim?', alternativas: ['a', 'b'], correta: 'z' },
    ] }],
  });
  assert.equal(analise.valido, false);
  const problema = analise.problemas.find((p) => /Questão 2/.test(p.onde));
  assert.ok(problema, 'o erro aponta a questão exata');
  assert.match(problema.mensagem, /não está entre as alternativas/);
});

test('nada é gravado quando o arquivo não passa', () => {
  recomecar();
  const antes = R.metodos.contar();
  assert.throws(() => importacao.importar({ metodo: { id: 'y', nome: 'Y' }, fases: [] }), /impedem a importação/);
  assert.equal(R.metodos.contar(), antes);
});

test('o método importado vira trilha, com prova das questões cadastradas', () => {
  recomecar();
  const resultado = importacao.importar(METODO_DE_TESTE);
  assert.equal(resultado.criados.fases, 1);
  assert.equal(resultado.criados.questoes, 2);
  assert.equal(resultado.versao.situacao, 'publicada');

  const aluno = criarAluno('Bia Souza', 'flauta');
  const trilhas = catalogo.trilhasDoAluno('flauta', { matriculas: R.matriculasDoAluno(aluno.id) });
  const importada = trilhas.trilhas.find((t) => t.metodo.id === 'teste-import');
  assert.ok(importada, 'o método importado aparece para quem toca o instrumento dele');
  assert.equal(importada.fases.length, 1);

  const fase = importada.fases[0];
  assert.match(fase.licoes[0].corpo(), /<p>Primeiro\.<\/p><p>Segundo\.<\/p>/,
    'o corpo importado vira parágrafos escapados');

  const prova = avaliacoes.montar(fase);
  assert.equal(prova.questoes.length, 2);
  const combinacao = avaliacoes.combinacaoDaFase(fase);
  assert.equal(combinacao.origem, 'cadastradas');
  assert.equal(combinacao.notaMinima, 60, 'a nota mínima é a que o arquivo declarou');
});

test('o corpo importado não injeta script na página', () => {
  recomecar();
  importacao.importar({
    ...METODO_DE_TESTE,
    metodo: { ...METODO_DE_TESTE.metodo, id: 'perigoso', nome: 'Perigoso' },
    fases: [{ id: 'pg1', ordem: 1, titulo: 'P' }],
    licoes: [{ faseId: 'pg1', ordem: 1, titulo: 'L', corpo: '<script>alert(1)</script> e <b>negrito</b>' }],
    avaliacoes: [],
  });
  // criarAluno já matricula em todo método que serve à flauta, o importado
  // incluído — não é preciso (nem permitido) criar a matrícula de novo.
  const aluno = criarAluno('Bia Souza', 'flauta');
  assert.ok(R.matriculasDoAluno(aluno.id).some((m) => m.metodoId === 'perigoso'));
  const fase = catalogo.faseDoAluno('pg1', 'flauta', { matriculas: R.matriculasDoAluno(aluno.id) });
  const html = fase.licoes[0].corpo();
  assert.ok(!html.includes('<script>'), 'a tag não sai como tag');
  assert.ok(html.includes('&lt;script&gt;'), 'sai como texto visível');
});

// -------------------------------------------------------------- migração

test('a migração cria matrículas para quem já existia, sem perder progresso', () => {
  const deposito = criarDepositoEmMemoria();
  deposito.gravarChave('msa.escola.v1', {
    versao: 2,
    admin: { usuario: 'RENATO', sal: 'admin', senhaHash: 'a'.repeat(64) },
    usuarios: [{ id: 'u1', nome: 'Ana Lima', instrumento: 'violino', sal: 'u1', senhaHash: null, exigeSenha: false }],
    progressos: { u1: {
      fases: { 1: { licoesLidas: [0, 1], jogos: {}, tentativas: [{ data: '2026-01-01T00:00:00.000Z', nota: 90, acertos: 9, total: 10, aprovado: true }], aprovadoEm: '2026-01-01T00:00:00.000Z', melhorNota: 90 } },
      usadas: { 1: ['a#1'] }, certificados: [{ faseId: '1', nota: 90 }], xp: 300 } },
    config: {}, sessao: null,
  });

  const { estado } = migracao.migrarDadosV1ParaV2(deposito);
  assert.equal(estado.matriculas.length, 2, 'uma matrícula por método que serve ao violino');
  assert.ok(estado.progressos.every((p) => p.matriculaId), 'o progresso já gravado é ligado à matrícula');
  assert.ok(estado.resultados.every((r) => r.matriculaId));
  assert.ok(estado.certificados.every((c) => c.matriculaId));
  assert.equal(estado.alunos[0].xpHistorico, 300);
  assert.equal(estado.versoes.length, 2, 'cada método ganha a sua versão 1.0');
  assert.equal(estado.matriculas.find((m) => m.metodoId === 'msa').faseAtualId, '2');
  assert.deepEqual(deposito.lerChave('msa.escola.v1').usuarios.length, 1, 'a chave antiga fica intacta');
});

test('um cadastro já no V2, sem versões nem matrículas, sobe uma vez só', () => {
  const deposito = criarDepositoEmMemoria();
  R.usarDeposito(deposito);
  const aluno = R.alunos.criar({ nome: 'Ana Lima', instrumentoId: 'violino' });
  const estado = R.estadoAtual();
  estado.versoes = [];
  estado.matriculas = [];
  estado.migracao = { versao: 2, migradoEm: '2026-01-01T00:00:00.000Z', origem: null, backup: null, registros: 0 };
  R.gravar();

  const primeira = migracao.migrarDadosV1ParaV2(deposito);
  assert.ok(primeira.estado.versoes.length >= 2, 'as versões são criadas');
  assert.ok(primeira.estado.matriculas.some((m) => m.alunoId === aluno.id), 'o aluno é matriculado');
  assert.ok(primeira.backup, 'com cópia de segurança antes');

  const segunda = migracao.migrarDadosV1ParaV2(deposito);
  assert.equal(segunda.migrado, false, 'abrir de novo não refaz nada');
  assert.equal(segunda.estado.matriculas.length, primeira.estado.matriculas.length, 'e não duplica matrícula');
});

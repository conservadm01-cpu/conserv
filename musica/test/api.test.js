import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { prepararBanco, criarTrilha, criarAluno } from './ajuda.js';

const { criarApp } = await import('../src/app.js');

let servidor;
let base;

before(async () => {
  prepararBanco();
  servidor = http.createServer(criarApp());
  await new Promise((r) => servidor.listen(0, r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor?.close());

async function chamar(metodo, caminho, corpo) {
  const resposta = await fetch(base + caminho, {
    method: metodo,
    headers: corpo ? { 'content-type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const tipo = resposta.headers.get('content-type') ?? '';
  const dados = tipo.includes('json') ? await resposta.json() : await resposta.text();
  return { status: resposta.status, dados };
}

test('saúde responde e a rota inexistente devolve 404 em JSON', async () => {
  assert.deepEqual((await chamar('GET', '/api/saude')).dados, { ok: true, app: 'clave', versao: '1.0.0' });
  const perdida = await chamar('GET', '/api/nada');
  assert.equal(perdida.status, 404);
  assert.equal(perdida.dados.erro, 'Rota não encontrada.');
});

test('cadastro de aluno cobra o nome e devolve 201 com a linha criada', async () => {
  const semNome = await chamar('POST', '/api/alunos', { professor: 'Prof. X' });
  assert.equal(semNome.status, 400);
  assert.match(semNome.dados.erro, /Informe o nome/);

  const criado = await chamar('POST', '/api/alunos', { nome: '  Ana   Beatriz ', professor: 'Prof. X' });
  assert.equal(criado.status, 201);
  assert.equal(criado.dados.nome, 'Ana Beatriz', 'espaço repetido é normalizado');
  assert.equal(criado.dados.ativo, 1);
});

test('ciclo completo: matricular, avaliar, ver o percentual e encerrar a fase', async () => {
  const trilha = criarTrilha(
    'Violino',
    [
      ['Cordas soltas', [['Arco no meio', 3], ['Travessia de cordas', 1]]],
      ['Primeira posição', [['Dedos 1, 2 e 3', 2]]],
    ],
    { minimo_avanco: 75 },
  );
  const aluno = criarAluno('Carlos');

  const matricula = await chamar('POST', `/api/alunos/${aluno.id}/matriculas`, { trilha_id: trilha.id });
  assert.equal(matricula.status, 201);
  const id = matricula.dados.id;

  const [arco, travessia] = trilha.fases[0].objetivos;
  assert.equal((await chamar('POST', `/api/matriculas/${id}/avaliacoes`, { objetivo_id: arco.id, nivel: 4 })).status, 201);
  await chamar('POST', `/api/matriculas/${id}/avaliacoes`, { objetivo_id: travessia.id, nivel: 2 });

  const progresso = (await chamar('GET', `/api/matriculas/${id}`)).dados;
  assert.equal(progresso.percentual, 87.5); // (3*4 + 1*2) / (4*4)
  assert.equal(progresso.pode_avancar, true);

  const avanco = await chamar('POST', `/api/matriculas/${id}/avancar`, {});
  assert.equal(avanco.dados.fase_encerrada.percentual, 87.5);
  assert.equal(avanco.dados.progresso.fase_numero, 2);

  const boletim = (await chamar('GET', `/api/alunos/${aluno.id}`)).dados;
  assert.equal(boletim.trilhas[0].percentual, 0);
  assert.deepEqual(boletim.trilhas[0].fases_concluidas.map((f) => f.percentual), [87.5]);

  // Nível fora da escala e objetivo inexistente são recusados com mensagem.
  const foraDaEscala = await chamar('POST', `/api/matriculas/${id}/avaliacoes`, { objetivo_id: arco.id, nivel: 7 });
  assert.equal(foraDaEscala.status, 400);
  assert.match(foraDaEscala.dados.erro, /não pode ser maior que 4/);
  assert.equal((await chamar('POST', `/api/matriculas/${id}/avaliacoes`, { objetivo_id: 9999, nivel: 2 })).status, 404);

  // A segunda matrícula na mesma trilha bate no 409.
  assert.equal((await chamar('POST', `/api/alunos/${aluno.id}/matriculas`, { trilha_id: trilha.id })).status, 409);
});

test('aula no futuro é recusada e a frequência sai da lista de aulas', async () => {
  const aluno = criarAluno('Helena');
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const futura = await chamar('POST', `/api/alunos/${aluno.id}/aulas`, { data: amanha });
  assert.equal(futura.status, 400);
  assert.match(futura.dados.erro, /futuro/);

  await chamar('POST', `/api/alunos/${aluno.id}/aulas`, { presenca: 'Presente' });
  await chamar('POST', `/api/alunos/${aluno.id}/aulas`, { presenca: 'Falta' });
  const boletim = (await chamar('GET', `/api/alunos/${aluno.id}`)).dados;
  assert.equal(boletim.frequencia.percentual, 50);

  const presencaInvalida = await chamar('POST', `/api/alunos/${aluno.id}/aulas`, { presenca: 'Sumiu' });
  assert.equal(presencaInvalida.status, 400);
});

test('currículo: fase em uso não é excluída e objetivo avaliado só é inativado', async () => {
  const trilha = (await chamar('POST', '/api/trilhas', { nome: 'Teoria', metodo: 'MSA', minimo_avanco: 60 })).dados;
  const fase = (await chamar('POST', `/api/trilhas/${trilha.id}/fases`, { nome: 'Fase 1' })).dados;
  const objetivo = (await chamar('POST', `/api/fases/${fase.id}/objetivos`, { titulo: 'Pulso', peso: 2 })).dados;
  const aluno = criarAluno('Rafael');
  const matricula = (await chamar('POST', `/api/alunos/${aluno.id}/matriculas`, { trilha_id: trilha.id })).dados;

  const emUso = await chamar('DELETE', `/api/fases/${fase.id}`);
  assert.equal(emUso.status, 409);

  await chamar('POST', `/api/matriculas/${matricula.id}/avaliacoes`, { objetivo_id: objetivo.id, nivel: 3 });
  const removido = await chamar('DELETE', `/api/objetivos/${objetivo.id}`);
  assert.deepEqual(removido.dados, { inativado: true, avaliacoes: 1 });

  // Sem objetivo ativo a fase fica sem peso: 0%, e não estoura divisão por zero.
  assert.equal((await chamar('GET', `/api/matriculas/${matricula.id}`)).dados.percentual, 0);

  // O aluno com histórico é inativado, não apagado.
  assert.deepEqual((await chamar('DELETE', `/api/alunos/${aluno.id}`)).dados, { inativado: true, avaliacoes: 1 });
  assert.equal((await chamar('GET', `/api/alunos/${aluno.id}`)).dados.aluno.ativo, 0);
});

test('boletim impresso sai em HTML com o nome do aluno e o percentual', async () => {
  const trilha = criarTrilha('Repertório', [['Iniciante', [['Peça de cor', 1]]]], { minimo_avanco: 70 });
  const aluno = criarAluno('Carlos Eduardo <Ribeiro>');
  const matricula = (await chamar('POST', `/api/alunos/${aluno.id}/matriculas`, { trilha_id: trilha.id })).dados;
  await chamar('POST', `/api/matriculas/${matricula.id}/avaliacoes`, { objetivo_id: trilha.fases[0].objetivos[0].id, nivel: 3 });

  const pagina = await chamar('GET', `/boletim/${aluno.id}`);
  assert.equal(pagina.status, 200);
  assert.match(pagina.dados, /<!doctype html>/i);
  assert.match(pagina.dados, /Carlos Eduardo &lt;Ribeiro&gt;/, 'nome com "<" sai escapado');
  assert.match(pagina.dados, /75%/);
});

test('painel lista quem está apto a avançar', async () => {
  const painel = (await chamar('GET', '/api/indicadores')).dados;
  assert.ok(painel.alunos_ativos >= 1);
  assert.ok(Array.isArray(painel.prontos_para_avancar));
  assert.ok(painel.por_trilha.length >= 1);
});

test('a interface é servida na raiz', async () => {
  const pagina = await fetch(base + '/');
  assert.equal(pagina.status, 200);
  assert.match(pagina.headers.get('content-type'), /text\/html/);
  assert.match(await pagina.text(), /CLAVE/);
});

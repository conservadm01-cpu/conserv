import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conserv-programacao-'));
process.env.DB_PATH = path.join(tmp, 'teste.db');

const { getDb, migrate } = await import('../src/db/index.js');
const { capacidadeSemanal, programacaoSemanal, ordensDaSemana } =
  await import('../src/services/programacao.js');
const { abrirOrdem, atualizarEtapa } = await import('../src/services/producao.js');
const { inicioSemana, somarDias, hoje } = await import('../src/lib/dates.js');

const db = migrate(getDb());

const idEtapa = (codigo) => db.prepare(`SELECT id FROM etapas WHERE codigo = ?`).get(codigo).id;
const idDepto = (nome) => db.prepare(`SELECT id FROM departamentos WHERE nome = ?`).get(nome).id;

/** Jornada redonda: 8h por dia, 5 dias, sem ocupação ociosa — a conta fica conferível na mão. */
db.prepare(
  `UPDATE parametros SET jornada_inicio = '08:00', jornada_fim = '16:00', intervalo_min = 0,
     dias_semana = '1,2,3,4,5', ocupacao_percentual = 100 WHERE id = 1`
).run();

function contratar(setor, quantas = 1) {
  const ins = db.prepare(
    `INSERT INTO colaboradores (nome, departamento_id, salario, produtivo, status)
     VALUES (?, ?, 2000, 1, 'ATIVO')`
  );
  for (let i = 0; i < quantas; i++) ins.run(`P${Math.random()}`, idDepto(setor));
}

/** Uma OP com tempo padrão só na costura, entregando na data pedida. */
function ordemPara(dataPrevista, { quantidade = 100, minutosPorPeca = 6, preco = 10 } = {}) {
  const produto = db
    .prepare(`INSERT INTO produtos (descricao, linha, preco_padrao) VALUES (?, 'LEVE', ?)`)
    .run(`PROD ${Math.random()}`, preco).lastInsertRowid;
  db.prepare(
    `INSERT INTO produto_processo (produto_id, etapa_id, sequencia, tempo_por_peca_min) VALUES (?, ?, 1, ?)`
  ).run(produto, idEtapa('COSTURA'), minutosPorPeca);

  const cliente = db.prepare(`INSERT INTO clientes (nome) VALUES (?)`).run(`C ${Math.random()}`).lastInsertRowid;
  const pedido = db
    .prepare(`INSERT INTO pedidos (numero, cliente_id, data_pedido, data_entrega) VALUES (?, ?, date('now'), ?)`)
    .run(String(Math.floor(Math.random() * 1e6)), cliente, dataPrevista).lastInsertRowid;
  const item = db
    .prepare(
      `INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario, data_entrega)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(pedido, produto, quantidade, preco, dataPrevista).lastInsertRowid;
  return abrirOrdem(item, { dataPrevista });
}

const setorDa = (semana, nome) => semana.setores.find((s) => s.setor === nome);
const semanaCom = (plano, inicio) => plano.plano.find((s) => s.inicio === inicio);

contratar('COSTURA', 2);

test('capacidade semanal é gente produtiva × jornada × dias da semana', () => {
  const cap = capacidadeSemanal(db);
  assert.equal(cap.minutos_dia, 480);
  assert.equal(cap.dias_uteis_semana, 5);

  const costura = cap.setores.find((s) => s.setor === 'COSTURA');
  assert.equal(costura.pessoas, 2);
  assert.equal(costura.minutos_semana, 2 * 480 * 5); // 4800 min = 80h
  assert.equal(costura.horas_semana, 80);

  // Setor sem ninguém entra na lista assinalado, não sumindo do plano.
  assert.equal(cap.setores.find((s) => s.setor === 'CORTE').sem_equipe, true);
});

test('a carga cai na semana da entrega prometida, com a ocupação do setor', () => {
  const daquiDuas = somarDias(inicioSemana(hoje()), 15);
  ordemPara(daquiDuas, { quantidade: 100, minutosPorPeca: 6 }); // 600 min = 10h

  const plano = programacaoSemanal({ semanas: 4 }, db);
  const semana = semanaCom(plano, somarDias(inicioSemana(hoje()), 14));
  assert.ok(semana, 'a terceira semana do plano existe');
  assert.equal(semana.ordens, 1);
  assert.equal(semana.pecas, 100);

  const costura = setorDa(semana, 'COSTURA');
  assert.equal(costura.horas, 10);
  assert.equal(costura.capacidade_horas, 80);
  assert.equal(costura.ocupacao_percentual, 13); // 10h de 80h
  assert.equal(costura.excedente_horas, 0);
});

test('ordem vencida não some: entra na primeira semana e é contada como atrasada', () => {
  const vencida = somarDias(inicioSemana(hoje()), -40);
  ordemPara(vencida, { quantidade: 50, minutosPorPeca: 6 });

  const plano = programacaoSemanal({ semanas: 4 }, db);
  const primeira = plano.plano[0];
  assert.equal(primeira.inicio, inicioSemana(hoje()));
  assert.equal(primeira.atrasadas, 1);
  assert.equal(setorDa(primeira, 'COSTURA').horas, 5);
});

test('semana vendida acima da capacidade vira excedente e alerta', () => {
  const alvo = somarDias(inicioSemana(hoje()), 21);
  ordemPara(alvo, { quantidade: 1000, minutosPorPeca: 6 }); // 100h contra 80h

  const plano = programacaoSemanal({ semanas: 4 }, db);
  const costura = setorDa(semanaCom(plano, alvo), 'COSTURA');
  assert.equal(costura.horas, 100);
  assert.equal(costura.ocupacao_percentual, 125);
  assert.equal(costura.excedente_horas, 20);

  const alerta = plano.alertas.find((a) => a.tipo === 'EXCEDIDA' && a.setor === 'COSTURA');
  assert.ok(alerta, 'o plano avisa que a semana estourou');
  assert.match(alerta.texto, /125%/);
});

test('etapa concluída sai da carga — só o que falta fazer ocupa a fábrica', () => {
  const alvo = somarDias(inicioSemana(hoje()), 7);
  const ordem = ordemPara(alvo, { quantidade: 200, minutosPorPeca: 6 }); // 20h

  const antes = setorDa(semanaCom(programacaoSemanal({ semanas: 4 }, db), alvo), 'COSTURA');
  assert.equal(antes.horas, 20);

  atualizarEtapa(ordem.id, idEtapa('COSTURA'), { status: 'CONCLUIDA' }, db);

  const depois = semanaCom(programacaoSemanal({ semanas: 4 }, db), alvo);
  assert.equal(setorDa(depois, 'COSTURA'), undefined);
});

test('produto sem tempo padrão é sinalizado: a carga aparece menor do que é', () => {
  const plano = programacaoSemanal({ semanas: 4 }, db);
  const primeira = plano.plano[0];
  const corte = setorDa(primeira, 'CORTE');
  assert.ok(corte.sem_tempo > 0, 'o corte recebe ordens sem tempo cadastrado');
  assert.equal(corte.horas, 0);
  assert.equal(corte.sem_capacidade, true);
  assert.ok(plano.alertas.some((a) => a.tipo === 'SEM_TEMPO' && a.setor === 'CORTE'));
});

test('entrega além do horizonte e ordem sem data ficam fora da grade, mas contadas', () => {
  ordemPara(somarDias(inicioSemana(hoje()), 200), { quantidade: 10 });
  const semDataOrdem = ordemPara(somarDias(inicioSemana(hoje()), 7), { quantidade: 10 });
  db.prepare(`UPDATE ordens_producao SET data_prevista = NULL WHERE id = ?`).run(semDataOrdem.id);

  const plano = programacaoSemanal({ semanas: 4 }, db);
  assert.equal(plano.fora_do_horizonte.ordens, 1);
  assert.equal(plano.sem_data.ordens, 1);
});

test('fila do setor mede quantas semanas de trabalho já estão prometidas', () => {
  const fila = programacaoSemanal({ semanas: 4 }, db).fila.find((f) => f.setor === 'COSTURA');
  assert.ok(fila.horas > 0);
  assert.equal(fila.semanas_fila, Number((fila.horas / fila.capacidade_horas).toFixed(2)));
});

test('a célula da semana abre a lista de ordens, com o vencido junto', () => {
  const detalhe = ordensDaSemana({ inicio: hoje(), setor: 'COSTURA', atrasadas: true }, db);
  assert.equal(detalhe.inicio, inicioSemana(hoje()));
  assert.ok(detalhe.ordens.length >= 1);
  assert.ok(detalhe.ordens.some((o) => o.atrasada));
  assert.ok(detalhe.ordens.every((o) => o.etapas.every((e) => e.setor === 'COSTURA')));

  // Sem o vencido, a mesma semana mostra só o que foi prometido para ela.
  const soDaSemana = ordensDaSemana({ inicio: hoje(), setor: 'COSTURA' }, db);
  assert.ok(soDaSemana.ordens.every((o) => !o.atrasada));
});

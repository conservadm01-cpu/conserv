/**
 * §54 — o teste obrigatório do módulo, ponta a ponta.
 *
 * Camiseta básica, 10.000 peças, pelos cinco processos: corte, preparação,
 * silk, costura e acabamento. Cada `test` abaixo é um dos itens da lista do
 * §54, na ordem em que a fábrica faz.
 *
 *   node --test industrial/testes/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  prepararIndustrial, disponivelEmProcesso, recalcularEstoquesProcesso, localDoDepartamento, num,
} from '../modelo.mjs';
import {
  consolidarCarteira, explodirBOM, calcularMRP, calcularCapacidade, calcularBudget,
  planoDeProducao, executarTransformacao, liberarParaCostura, wipDaCarteira,
  realizadoVersusBudget, custoAcumulado, rastrear, simular,
} from '../motores.mjs';
import { montarDemonstracao, receberCompra } from '../demonstracao.mjs';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const base = JSON.parse(fs.readFileSync(path.join(raiz, 'docs/teste/confeccao/base-teste.json'), 'utf8'));

const db = prepararIndustrial(JSON.parse(JSON.stringify(base)));
const usuario = { nome: 'Helena Vasques', perfil: 'Gestor' };
const cenario = montarDemonstracao(db);
const { itens, transformacoes, departamentos } = cenario;

/* o que cada teste deixa para o seguinte */
const estado = {};

test('a carteira de três clientes consolida em um lote de 10.000', () => {
  const r = consolidarCarteira(db, { nome: 'Camiseta uniforme — setembro' });
  assert.ok(!r.erro, r.erro);
  assert.equal(r.consolidacao.produtos.length, 1);
  assert.equal(r.consolidacao.produtos[0].quantidade, 10000);
  assert.equal(r.consolidacao.produtos[0].linhas.length, 3);
  estado.consolidacao = r.consolidacao;
});

test('✓ explosão da BOM: o coproduto do corte não multiplica o tecido', () => {
  const explosao = explodirBOM(db, itens.camiseta.id, 10000, { considerarEstoque: false });
  assert.ok(!explosao.erro, explosao.erro);
  const acha = (id) => explosao.necessidades.find((l) => l.itemId === id);

  /* o silk refuga 2%: a costura quer 10.000 frentes estampadas, então o
     corte precisa entregar 10.200 frentes */
  assert.equal(acha(itens.frente.id).bruta, 10200);
  assert.equal(acha(itens.costas.id).bruta, 10200);   // sai junto no mesmo enfesto
  assert.equal(acha(itens.manga.id).bruta, 20400);
  assert.equal(acha(itens.emProcesso.id).bruta, 10000);

  /* ✓ necessidade de tecido — 10.200 enfestadas × 0,55 kg */
  assert.equal(acha(itens.malha.id).bruta, 5610);

  /* ✓ necessidade de aviamentos */
  assert.equal(acha(itens.linha.id).bruta, 150);
  assert.equal(acha(itens.etiqueta.id).bruta, 10000);
  assert.equal(acha(itens.saco.id).bruta, 10000);
  assert.equal(Math.round(acha(itens.tinta.id).bruta), 120);

  /* o excedente de coproduto aparece como sobra planejada, não some */
  assert.equal(acha(itens.costas.id).sobra, 200);
  assert.equal(acha(itens.manga.id).sobra, 400);
  estado.explosao = explosao;
});

test('a explosão desce na ordem certa e cobre os cinco processos', () => {
  const explosao = estado.explosao;
  const setores = explosao.producao.map((p) => p.departamento);
  assert.deepEqual(setores, ['Corte', 'Estamparia', 'Preparação', 'Costura', 'Acabamento']);
  assert.equal(explosao.avisos.length, 0);

  /* §10 — 285 minutos por enfesto de 500: 21 enfestes para 10.200 peças */
  const corte = explosao.producao.find((p) => p.departamento === 'Corte');
  assert.equal(corte.minutos.total, 285 * 21);
  assert.equal(corte.minutos.porTipo.setup, 30 * 21);
});

test('✓ MRP: necessidade líquida desconta o que já existe no almoxarifado', () => {
  const comEstoque = explodirBOM(db, itens.camiseta.id, 10000);
  const mrp = calcularMRP(db, comEstoque, { consolidacaoId: estado.consolidacao.id });
  const malha = mrp.linhas.find((l) => l.itemId === itens.malha.id);

  assert.equal(malha.bruta, 5610);
  assert.ok(malha.disponivel > 0, 'a base de teste tem malha em estoque');
  assert.equal(malha.comprar, Number((malha.bruta - malha.disponivel).toFixed(3)));
  assert.equal(malha.fornecedor, 'Santa Clara');
  assert.ok(mrp.totalCompra > 0);
  assert.ok(mrp.alertas.some((a) => a.id === 'material_insuficiente'));
  estado.mrp = mrp;
  estado.malha = malha;
});

test('capacidade: minutos necessários contra os minutos que os setores têm', () => {
  const capacidade = calcularCapacidade(db, estado.explosao, { quantidade: 10000, dias: 22 });
  const costura = capacidade.linhas.find((l) => l.departamento === 'Costura');
  assert.ok(costura.minutosNecessarios > 0);
  assert.ok(costura.pessoas >= 5, 'a base tem a equipe de costura cadastrada');
  assert.ok(capacidade.takt > 0);
  assert.ok(['normal', 'risco', 'gargalo'].includes(costura.situacao));
  estado.capacidade = capacidade;
});

test('✓ budget: material, processo e indireto, com custo por peça', () => {
  const budget = calcularBudget(db, estado.explosao, { consolidacaoId: estado.consolidacao.id });
  assert.ok(budget.totalMaterial > 0);
  assert.ok(budget.totalProcesso > 0);
  assert.equal(budget.custoIndustrial, Number((budget.totalMaterial + budget.totalProcesso).toFixed(2)));
  assert.equal(budget.custoPorPeca, Number((budget.custoIndustrial / 10000).toFixed(4)));
  assert.equal(budget.processos.length, 5);
  /* o custo do processo se abre em parcelas que não se sobrepõem (§43) */
  const corte = budget.processos.find((p) => p.departamento === 'Corte');
  assert.equal(corte.total, Number((corte.maoDeObra + corte.manuseio + corte.setup
    + corte.maquina + corte.energia + corte.indireto).toFixed(2)));
  estado.budget = budget;
});

test('✓ geração das demandas e das ordens por processo, com dependência', () => {
  const plano = planoDeProducao(db, { consolidacaoId: estado.consolidacao.id });
  assert.ok(!plano.erro, plano.erro);
  const p = plano.planos[0];
  assert.equal(p.demandas.length, 5);
  assert.equal(p.ordens.length, 5);

  const ordemCostura = p.ordens.find((o) => o.departamentoId === departamentos.costura.id);
  assert.ok(ordemCostura.dependeDe.length >= 2, 'a costura depende do silk e da preparação');
  const ordemCorte = p.ordens.find((o) => o.departamentoId === departamentos.corte.id);
  assert.equal(ordemCorte.dependeDe.length, 0, 'o corte é o começo da cadeia');
  estado.plano = p;
});

test('a compra que o MRP pediu entra no almoxarifado', () => {
  const comprados = estado.mrp.linhas.filter((l) => l.comprar > 0);
  assert.ok(comprados.length >= 2, 'a carteira exige compra de mais de um material');
  for (const linha of comprados) {
    const r = receberCompra(db, linha.materialId, linha.comprar,
      { documento: `NF 202${comprados.indexOf(linha)}`, usuario });
    assert.ok(!r.erro, r.erro);
  }
  /* com tudo recebido, a mesma carteira não pede mais compra nenhuma */
  const depois = calcularMRP(db, explodirBOM(db, itens.camiseta.id, 10000));
  assert.equal(depois.itensAComprar, 0, JSON.stringify(
    depois.linhas.filter((l) => l.comprar > 0).map((l) => `${l.nome}: ${l.comprar}`)));
});

test('✓ corte: recebe rolo, entrega frente, costas, manga e gola', () => {
  const demanda = estado.plano.demandas.find((d) => d.departamentoId === departamentos.corte.id);
  const ordem = estado.plano.ordens.find((o) => o.demandaId === demanda.id);
  const r = executarTransformacao(db, {
    transformacaoId: transformacoes.corte.id,
    demandaId: demanda.id,
    ordemId: ordem.id,
    consolidacaoId: estado.consolidacao.id,
    colaboradorId: (db.colaboradores.find((c) => c.departamentoId === departamentos.corte.id) || {}).id,
    saidas: [
      { itemId: itens.frente.id, quantidade: 10200 },
      { itemId: itens.costas.id, quantidade: 10200 },
      { itemId: itens.manga.id, quantidade: 20400 },
      { itemId: itens.golaCortada.id, quantidade: 10200 },
    ],
    retalhos: [{ tipo: 'aproveitavel', peso: 64, cor: 'Azul marinho', localizacao: 'RET-01' }],
  }, usuario);
  assert.ok(!r.erro, r.erro);

  const local = localDoDepartamento(departamentos.corte);
  assert.equal(disponivelEmProcesso(db, itens.frente.id, local), 10200);
  assert.equal(disponivelEmProcesso(db, itens.manga.id, local), 20400);

  /* o tecido saiu do almoxarifado, e o custo entrou no subproduto */
  const consumo = r.execucao.consumos.find((c) => c.itemId === itens.malha.id);
  assert.equal(consumo.quantidade, 5610);
  assert.ok(r.execucao.custos.material > 0);
  assert.ok(r.execucao.custos.conversao > 0);
  assert.equal(db.industrial.retalhos.length, 1);
  estado.corte = r.execucao;
});

test('a costura recusa enquanto faltar componente, e diz o que falta', () => {
  const ordem = estado.plano.ordens.find((o) => o.departamentoId === departamentos.costura.id);
  const r = liberarParaCostura(db, ordem.id, usuario);
  assert.equal(r.liberada, false);
  const faltas = r.faltas.map((f) => f.nome);
  assert.ok(faltas.includes('FRENTE ESTAMPADA'), 'o silk ainda não rodou');
  assert.ok(faltas.includes('GOLA PREPARADA'), 'a preparação ainda não rodou');
  const mensagem = r.alertas[0].mensagem;
  assert.match(mensagem, /Faltam 10000 FRENTE ESTAMPADA\./);
});

test('✓ preparação: gola cortada + entretela + etiqueta = gola preparada', () => {
  const demanda = estado.plano.demandas.find((d) => d.departamentoId === departamentos.preparacao.id);
  const r = executarTransformacao(db, {
    transformacaoId: transformacoes.preparacao.id,
    demandaId: demanda.id,
    consolidacaoId: estado.consolidacao.id,
    saidas: [{ itemId: itens.golaPreparada.id, quantidade: 10000 }],
  }, usuario);
  assert.ok(!r.erro, r.erro);

  const local = localDoDepartamento(departamentos.preparacao);
  assert.equal(disponivelEmProcesso(db, itens.golaPreparada.id, local), 10000);
  /* as 200 golas que sobraram do enfesto continuam no estoque do corte */
  assert.equal(disponivelEmProcesso(db, itens.golaCortada.id), 200);
  estado.preparacao = r.execucao;
});

test('✓ silk: frente cortada vira frente estampada, com refugo', () => {
  const demanda = estado.plano.demandas.find((d) => d.departamentoId === departamentos.estamparia.id);
  const r = executarTransformacao(db, {
    transformacaoId: transformacoes.silk.id,
    demandaId: demanda.id,
    consolidacaoId: estado.consolidacao.id,
    saidas: [{ itemId: itens.frenteEstampada.id, quantidade: 10000 }],
    perdas: [{ itemId: itens.frente.id, quantidade: 200, motivo: 'erro_estampa', custoUnitario: 3.1 }],
  }, usuario);
  assert.ok(!r.erro, r.erro);
  assert.equal(disponivelEmProcesso(db, itens.frenteEstampada.id), 10000);
  assert.equal(disponivelEmProcesso(db, itens.frente.id), 0, 'as 10.200 frentes entraram no silk');
  assert.equal(db.industrial.perdas.length, 1);
  assert.ok(r.execucao.custos.perda > 0);
  estado.silk = r.execucao;
});

test('✓ com os componentes prontos, a costura é liberada', () => {
  const ordem = estado.plano.ordens.find((o) => o.departamentoId === departamentos.costura.id);
  const r = liberarParaCostura(db, ordem.id, usuario);
  assert.equal(r.liberada, true, JSON.stringify(r.faltas));
  assert.equal(r.alertas[0].id, 'liberado');
  estado.ordemCostura = ordem;
});

test('✓ costura: montagem dos componentes em produto em processo', () => {
  const demanda = estado.plano.demandas.find((d) => d.departamentoId === departamentos.costura.id);
  const r = executarTransformacao(db, {
    transformacaoId: transformacoes.costura.id,
    demandaId: demanda.id,
    ordemId: estado.ordemCostura.id,
    consolidacaoId: estado.consolidacao.id,
    saidas: [{ itemId: itens.emProcesso.id, quantidade: 10000 }],
  }, usuario);
  assert.ok(!r.erro, r.erro);
  assert.equal(disponivelEmProcesso(db, itens.emProcesso.id), 10000);
  assert.equal(disponivelEmProcesso(db, itens.frenteEstampada.id), 0);
  assert.equal(disponivelEmProcesso(db, itens.golaPreparada.id), 0);
  assert.equal(disponivelEmProcesso(db, itens.manga.id), 400, 'sobrou o coproduto do enfesto');
  estado.costura = r.execucao;
});

test('✓ acabamento: produto acabado no estoque, com custo acumulado', () => {
  const demanda = estado.plano.demandas.find((d) => d.departamentoId === departamentos.acabamento.id);
  const r = executarTransformacao(db, {
    transformacaoId: transformacoes.acabamento.id,
    demandaId: demanda.id,
    consolidacaoId: estado.consolidacao.id,
    saidas: [{ itemId: itens.camiseta.id, quantidade: 10000 }],
  }, usuario);
  assert.ok(!r.erro, r.erro);
  assert.equal(disponivelEmProcesso(db, itens.camiseta.id), 10000);

  /* ✓ custo acumulado: a camiseta sabe o que custou desde o rolo */
  const lote = r.execucao.saidas[0];
  const custo = custoAcumulado(db, lote.loteId);
  const setores = custo.etapas.map((e) => e.departamento);
  assert.deepEqual(setores, ['Corte', 'Estamparia', 'Preparação', 'Costura', 'Acabamento']);
  assert.ok(custo.custoUnitario > 0);
  assert.equal(custo.custoUnitario, lote.custoUnitario);
  estado.acabamento = r.execucao;
  estado.loteFinal = lote.loteId;
});

test('✓ rastreabilidade: a árvore vai do produto acabado ao rolo de malha', () => {
  const arvore = rastrear(db, estado.loteFinal);
  assert.ok(!arvore.erro, arvore.erro);
  const nomes = [];
  const andar = (no) => {
    nomes.push(no.item);
    (no.origens || []).forEach(andar);
  };
  andar(arvore);
  assert.ok(nomes.includes('CAMISETA BÁSICA MALHA PV'));
  assert.ok(nomes.includes('FRENTE ESTAMPADA'));
  assert.ok(nomes.includes('FRENTE CORTADA'));
  assert.ok(nomes.includes('MALHA PV 30/1 AZUL MARINHO'), 'chegou até a matéria-prima');
});

test('✓ WIP: onde estão as peças da carteira', () => {
  const wip = wipDaCarteira(db, estado.consolidacao.id);
  assert.ok(!wip.erro, wip.erro);
  assert.equal(wip.total, 10000);
  assert.equal(wip.etapas.length, 5);
  assert.ok(wip.etapas.every((e) => e.status === 'atendida'), JSON.stringify(wip.etapas));
  const acabamento = wip.etapas.find((e) => e.departamento === 'Acabamento');
  assert.equal(acabamento.emEstoque, 10000);
});

test('✓ budget × realizado: desvio por departamento, com motivo', () => {
  const comparacao = realizadoVersusBudget(db, estado.consolidacao.id);
  assert.ok(!comparacao.erro, comparacao.erro);
  assert.equal(comparacao.linhas.length, 5);
  assert.ok(comparacao.planejado > 0);
  assert.ok(comparacao.realizado > 0);
  assert.equal(comparacao.desvio, Number((comparacao.realizado - comparacao.planejado).toFixed(2)));
  const estamparia = comparacao.linhas.find((l) => l.departamento === 'Estamparia');
  assert.ok(estamparia.perdas > 0, 'a perda do silk aparece no realizado');

  /* O custo do subproduto já foi contado quando ele foi produzido: somá-lo de
     novo a cada setor faria o realizado sair um múltiplo do budget. Produzido
     o planejado, sem retrabalho, os dois têm de ficar perto. */
  const distancia = Math.abs(comparacao.realizado - comparacao.planejado) / comparacao.planejado;
  assert.ok(distancia < 0.1,
    `realizado ${comparacao.realizado} contra planejado ${comparacao.planejado}`);
});

test('nenhum saldo de processo fica negativo e o extrato confere', () => {
  const negativos = db.industrial.estoques.filter((s) => num(s.quantidade) < -0.0001);
  assert.deepEqual(negativos, []);
  const divergencias = recalcularEstoquesProcesso(db);
  assert.deepEqual(divergencias, [], 'o saldo é o acumulado dos movimentos');
});

test('§39 simulação: 5.000, 10.000 e 20.000 sem gravar nada', () => {
  const antes = JSON.stringify(db.industrial.budgets.length);
  /* simulação é conta de custo padrão: não desconta o estoque que a
     execução desta bateria acabou de criar */
  const cenarios = simular(db, itens.camiseta.id, [5000, 10000, 20000], { considerarEstoque: false });
  assert.equal(cenarios.length, 3);
  assert.ok(cenarios[2].custoIndustrial > cenarios[0].custoIndustrial);
  /* o custo por peça cai com a escala: o setup se dilui */
  assert.ok(cenarios[2].custoPorPeca < cenarios[0].custoPorPeca);
  assert.equal(JSON.stringify(db.industrial.budgets.length), antes, 'simular não grava budget');
});

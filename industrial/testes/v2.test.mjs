/**
 * V2 §47 — a bateria dos vinte testes, rodada pelo `node --test`.
 *
 * É a mesma função que o sistema roda na aba Auditoria: se passa aqui, passa
 * lá, porque é o mesmo código sobre a mesma base.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { migrarIndustrialV2, prepararIndustrial } from '../modelo.mjs';
import { montarDemonstracao } from '../demonstracao.mjs';
import { testarIndustrialV2 } from '../testes-v2.mjs';
import { auditarIndustrial, reconciliarEstoqueIndustrial } from '../auditoria.mjs';
import { reservarMaterial, disponivelParaOrdem, liberarReservasDaOrdem } from '../reservas.mjs';
import { gerarRequisicoes, criarPedidoCompra, receberPedido, painelCompras } from '../compras.mjs';
import { explodirBOM, calcularMRP, budgetsDaCarteira } from '../motores.mjs';
import { abrirOrdem, cancelarOrdem, resumoDaOrdem } from '../ordens.mjs';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const base = JSON.parse(fs.readFileSync(path.join(raiz, 'docs/teste/confeccao/base-teste.json'), 'utf8'));
const novaBase = () => {
  const db = JSON.parse(JSON.stringify(base));
  prepararIndustrial(db);
  migrarIndustrialV2(db);
  return db;
};
const usuario = { nome: 'Helena Vasques', perfil: 'Gestor' };

test('§42 a migração é retrocompatível: nada some, campos novos aparecem', () => {
  const db = JSON.parse(JSON.stringify(base));
  const antesMateriais = (db.materiais || []).length;
  const r = migrarIndustrialV2(db);
  assert.equal(r.para, 2);
  assert.equal((db.materiais || []).length, antesMateriais, 'a migração não mexe em material');
  assert.ok(Array.isArray(db.industrial.reservas), 'coleção de reservas criada');
  assert.ok(Array.isArray(db.industrial.requisicoesCompra), 'coleção de requisições criada');
  assert.equal(db.equipamentos[0].custoHoraDetalhado, false, 'equipamento ganhou os campos de custo');
  assert.equal(db.colaboradores[0].beneficiosMensais, 0, 'colaborador ganhou benefícios');
  /* rodar de novo não duplica nem reescreve */
  const segunda = migrarIndustrialV2(db);
  assert.equal(segunda.feitas.length, 0, 'a segunda passada não tem o que fazer');
});

test('§47 os vinte testes do documento passam sobre a demonstração', () => {
  const db = novaBase();
  montarDemonstracao(db);
  const r = testarIndustrialV2(db, { usuario });
  const falhas = r.detalhesFalhas.map((f) => `${f.numero} ${f.nome}: ${f.detalhe}`);
  assert.deepEqual(falhas, [], falhas.join(' | '));
  assert.ok(r.total >= 20, `esperado ao menos 20 testes, vieram ${r.total}`);
  assert.equal(r.falhas, 0);
});

test('§47 a bateria não encosta na base de quem a roda', () => {
  const db = novaBase();
  montarDemonstracao(db);
  const antes = JSON.stringify({
    itens: db.industrial.itens.length,
    ordens: db.industrial.consolidacoes.length,
    lotes: db.industrial.lotes.length,
    saldos: db.saldos.map((s) => s.fisico),
  });
  testarIndustrialV2(db, { usuario });
  const depois = JSON.stringify({
    itens: db.industrial.itens.length,
    ordens: db.industrial.consolidacoes.length,
    lotes: db.industrial.lotes.length,
    saldos: db.saldos.map((s) => s.fisico),
  });
  assert.equal(depois, antes, 'a bateria alterou a base real');
});

test('§6 uma ordem não enxerga como disponível o que está reservado para outra', () => {
  const db = novaBase();
  const cenario = montarDemonstracao(db);
  const malha = db.materiais.find((m) => m.nome.includes('MALHA PV'));
  const inicial = disponivelParaOrdem(db, malha.id);
  assert.ok(inicial.livre > 0);

  const r = reservarMaterial(db, {
    materialId: malha.id, quantidade: inicial.livre, consolidacaoId: 'ordem-A',
  }, usuario);
  assert.ok(!r.erro, r.erro);

  const paraOutra = disponivelParaOrdem(db, malha.id, 'ordem-B');
  assert.equal(paraOutra.livre, 0, 'a ordem B não pode contar com o que a A reservou');
  const paraMesma = disponivelParaOrdem(db, malha.id, 'ordem-A');
  assert.equal(paraMesma.paraAOrdem, inicial.livre, 'a ordem A continua contando com o que reservou');

  const excesso = reservarMaterial(db, { materialId: malha.id, quantidade: 1, consolidacaoId: 'ordem-B' }, usuario);
  assert.match(excesso.erro || '', /já está reservado para outra ordem/);

  liberarReservasDaOrdem(db, 'ordem-A', 'teste', usuario);
  assert.equal(disponivelParaOrdem(db, malha.id).livre, inicial.livre, 'liberar devolve ao livre');
});

test('§5 o MRP separa físico, reservado, programado e o que falta comprar', () => {
  const db = novaBase();
  const cenario = montarDemonstracao(db);
  const explosao = explodirBOM(db, cenario.itens.camiseta.id, 10000);
  const mrp = calcularMRP(db, explosao, {});
  const malha = mrp.linhas.find((l) => l.itemId === cenario.itens.malha.id);

  assert.equal(malha.bruta, 5610);
  assert.ok(malha.fisico > 0);
  assert.equal(malha.comprar, Number((malha.bruta - malha.disponivel - malha.programadas + malha.seguranca).toFixed(3)));
  assert.equal(malha.status, 'compra_necessaria');
  assert.ok(malha.dataLimite, 'a linha traz a data limite de compra');
  assert.equal(malha.leadTimeDias, 10);

  /* com pedido de compra em aberto, a mesma linha passa a "compra programada" */
  const req = gerarRequisicoes(db, { linhas: [malha], origem: 'teste' }, usuario);
  assert.ok(!req.erro, req.erro);
  const pedido = criarPedidoCompra(db, { requisicaoIds: [req.criadas[0].id] }, usuario);
  assert.ok(!pedido.erro, pedido.erro);
  const depois = calcularMRP(db, explodirBOM(db, cenario.itens.camiseta.id, 10000), {});
  const malhaDepois = depois.linhas.find((l) => l.itemId === cenario.itens.malha.id);
  assert.equal(malhaDepois.status, 'compra_programada');
  assert.ok(malhaDepois.programadas > 0, 'o pedido em aberto virou entrada programada');
});

test('§7 requisição → pedido → recebimento entra no estoque e reserva para a ordem', () => {
  const db = novaBase();
  const cenario = montarDemonstracao(db);
  const ordem = abrirOrdem(db, { itemId: cenario.itens.camiseta.id, quantidade: 2000 }, usuario);
  assert.ok(!ordem.erro, ordem.erro);

  const requisicoes = (db.industrial.requisicoesCompra || []).filter(
    (r) => r.consolidacaoId === ordem.ordem.id);
  assert.ok(requisicoes.length > 0, 'abrir ordem gerou requisição para a falta');
  assert.ok(requisicoes[0].dataLimite, 'requisição com data limite');

  const pedido = criarPedidoCompra(db, { requisicaoIds: requisicoes.map((r) => r.id) }, usuario);
  assert.ok(!pedido.erro, pedido.erro);
  const malhaAntes = disponivelParaOrdem(db, cenario.itens.malha.materialId, ordem.ordem.id);

  const recebimento = receberPedido(db, { pedidoId: pedido.pedidos[0].id, documento: 'NF 1' }, usuario);
  assert.ok(!recebimento.erro, recebimento.erro);
  const malhaDepois = disponivelParaOrdem(db, cenario.itens.malha.materialId, ordem.ordem.id);
  assert.ok(malhaDepois.fisico > malhaAntes.fisico, 'o material entrou no estoque');
  assert.ok(malhaDepois.reservadoDaOrdem > malhaAntes.reservadoDaOrdem,
    'o recebido entrou reservado para a ordem que pediu');

  const painel = painelCompras(db);
  assert.equal(painel.requisicoes.filter((r) => r.status === 'pendente').length, 0);
});

test('§52 cancelar a ordem devolve o material reservado', () => {
  const db = novaBase();
  const cenario = montarDemonstracao(db);
  const antes = disponivelParaOrdem(db, cenario.itens.malha.materialId).livre;
  const ordem = abrirOrdem(db, { itemId: cenario.itens.camiseta.id, quantidade: 100 }, usuario);
  assert.ok(!ordem.erro, ordem.erro);
  assert.ok(ordem.reserva.feitas.length > 0, 'a ordem reservou o que existia');
  assert.ok(disponivelParaOrdem(db, cenario.itens.malha.materialId).livre < antes);

  const r = cancelarOrdem(db, ordem.ordem.id, 'cliente desistiu', usuario);
  assert.ok(!r.erro, r.erro);
  assert.ok(r.reservasLiberadas > 0);
  assert.equal(disponivelParaOrdem(db, cenario.itens.malha.materialId).livre, antes,
    'o estoque voltou ao que era antes da ordem');
});

test('§4 os quatro budgets respondem perguntas diferentes', () => {
  const db = novaBase();
  const cenario = montarDemonstracao(db);
  const explosao = explodirBOM(db, cenario.itens.camiseta.id, 10000);
  const b = budgetsDaCarteira(db, explosao, {});

  assert.ok(b.industrial.custoIndustrial > b.consumo.total, 'industrial = material + conversão');
  assert.ok(b.consumo.total > b.compras.total, 'nem tudo o que se consome precisa ser comprado');
  assert.equal(b.caixa.materialAComprar, b.compras.total);
  assert.ok(b.caixa.materialExistente > 0, 'o estoque que já existe aparece separado');
  assert.notEqual(b.caixa.necessidadeDeCaixa, b.industrial.custoIndustrial,
    'custo industrial e necessidade de caixa não são a mesma conta');
  assert.ok(b.caixa.porMes.length > 0, 'o desembolso tem data');
});

test('§33 a auditoria vê estrutura quebrada e reserva maior que o estoque', () => {
  const db = novaBase();
  const cenario = montarDemonstracao(db);
  assert.equal(auditarIndustrial(db, { registrar: false }).erros.length, 0, 'base limpa');

  /* quebra proposital: um componente apagado do cadastro */
  const estrutura = db.industrial.estruturas.find((e) => e.ativa);
  estrutura.componentes.push({ id: 'x', itemId: 'nao-existe', quantidade: 1, perda: 0 });
  const comErro = auditarIndustrial(db, { registrar: false });
  assert.ok(comErro.erros.some((e) => e.tipo === 'estrutura_quebrada'));

  /* reserva maior que o físico */
  const malha = db.materiais.find((m) => m.nome.includes('MALHA PV'));
  db.industrial.reservas.push({
    id: 'r1', codigo: 'RES-X', materialId: malha.id, quantidade: 999999, atendido: 0,
    status: 'ativa', consolidacaoId: 'x',
  });
  const comReserva = auditarIndustrial(db, { registrar: false });
  assert.ok(comReserva.erros.some((e) => e.tipo === 'reserva_maior_que_estoque'));
});

test('§34 a reconciliação encontra saldo que não bate com o extrato', () => {
  const db = novaBase();
  const cenario = montarDemonstracao(db);
  assert.equal(reconciliarEstoqueIndustrial(db).conferido, true);

  const saldo = db.saldos[0];
  saldo.fisico = Number(saldo.fisico) + 13;
  const r = reconciliarEstoqueIndustrial(db);
  assert.equal(r.conferido, false);
  assert.ok(r.divergencias.some((d) => d.onde === 'almoxarifado' && Math.abs(d.diferenca + 13) < 0.001));
});

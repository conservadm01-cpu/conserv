/**
 * Os dois ambientes novos: cadastro de produto e ordem de produção.
 *
 * O roteiro é o de quem acabou de receber o sistema: cadastrar um produto do
 * zero — sem a demonstração — e abrir uma ordem para ele.
 *
 *   node --test "industrial/testes/*.test.mjs"
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { prepararIndustrial, disponivelEmProcesso, num } from '../modelo.mjs';
import {
  salvarItem, salvarEstrutura, salvarTransformacao, inativarItem, inativarTransformacao,
  conferirEngenharia, custoPadrao, arvoreDoProduto, clonarProduto,
} from '../cadastro.mjs';
import {
  abrirOrdem, resumoDaOrdem, ordensDeProducao, cancelarOrdem, encerrarOrdem,
  conferirComponentes, materiaisDaOrdem,
} from '../ordens.mjs';
import { executarTransformacao } from '../motores.mjs';
import { receberCompra } from '../demonstracao.mjs';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const base = JSON.parse(fs.readFileSync(path.join(raiz, 'docs/teste/confeccao/base-teste.json'), 'utf8'));
const db = prepararIndustrial(JSON.parse(JSON.stringify(base)));
const usuario = { nome: 'Helena Vasques', perfil: 'Gestor' };

const setor = (nome) => (db.departamentos || []).find((d) => d.nome === nome);
const material = (trecho) => (db.materiais || []).find((m) => m.nome.includes(trecho));
const ok = (r, contexto) => { assert.ok(!r.erro, `${contexto}: ${r.erro}`); return r; };

const estado = {};

/* ==================================================== cadastro do produto */

test('cadastro: itens comprados são ligados ao almoxarifado', () => {
  const tnt = ok(salvarItem(db, {
    nome: 'TNT 40G BRANCO (industrial)', tipo: 'MATERIA_PRIMA',
    materialId: material('TNT 40G').id, unidade: 'M',
  }, usuario), 'TNT');
  const elastico = ok(salvarItem(db, {
    nome: 'ELÁSTICO 2CM (industrial)', tipo: 'AVIAMENTO',
    materialId: material('ELÁSTICO 2CM').id, unidade: 'M',
  }, usuario), 'elástico');
  const linha = ok(salvarItem(db, {
    nome: 'LINHA 120 (industrial)', tipo: 'AVIAMENTO',
    materialId: material('LINHA 120').id, unidade: 'UN',
  }, usuario), 'linha');

  assert.equal(tnt.item.custoPadrao, material('TNT 40G').custoMedio, 'herda o custo do material');
  assert.equal(tnt.item.fornecedorId, material('TNT 40G').fornecedorPadraoId);
  Object.assign(estado, { tnt: tnt.item, elastico: elastico.item, linha: linha.item });
});

test('cadastro: nome repetido é recusado', () => {
  const r = salvarItem(db, {
    nome: 'tnt 40g branco (INDUSTRIAL)', tipo: 'MATERIA_PRIMA', materialId: material('TNT 40G').id,
  }, usuario);
  assert.match(r.erro || '', /Já existe um item/);
});

test('cadastro: item produzido precisa dizer em que setor nasce', () => {
  const r = salvarItem(db, { nome: 'TOUCA CORTADA', tipo: 'SUBPRODUTO', unidade: 'UN' }, usuario);
  assert.match(r.erro || '', /em que setor/);
});

test('cadastro: subproduto e produto acabado', () => {
  const cortada = ok(salvarItem(db, {
    nome: 'TOUCA CORTADA', tipo: 'SUBPRODUTO', unidade: 'UN', departamentoId: setor('Corte').id,
  }, usuario), 'touca cortada');
  const touca = ok(salvarItem(db, {
    nome: 'TOUCA DESCARTÁVEL TNT', tipo: 'PRODUTO_ACABADO', unidade: 'UN',
    departamentoId: setor('Costura').id,
  }, usuario), 'touca');
  Object.assign(estado, { cortada: cortada.item, touca: touca.item });
});

test('a ordem recusa produto sem engenharia, e diz o que falta', () => {
  const conferencia = conferirEngenharia(db, estado.touca.id);
  assert.equal(conferencia.pronto, false);
  assert.match(conferencia.pendencias[0], /sem transformação/);

  const r = abrirOrdem(db, { itemId: estado.touca.id, quantidade: 3000 }, usuario);
  assert.match(r.erro || '', /engenharia de TOUCA DESCARTÁVEL TNT está incompleta/);
});

test('cadastro: as duas transformações do produto', () => {
  const corte = ok(salvarTransformacao(db, {
    nome: 'Corte da touca',
    departamentoId: setor('Corte').id,
    entradas: [{ itemId: estado.tnt.id, quantidade: 0.34, unidade: 'M', perda: 0 }],
    saidas: [{ itemId: estado.cortada.id, quantidade: 1, principal: true }],
    operacoes: [{
      nome: 'Enfesto e corte', porCiclo: 600, pessoas: 1,
      tempos: { preparacao: 12, setup: 20, processamento: 80, manuseio: 35, inspecao: 20, movimentacao: 15 },
    }],
    lotePadrao: 600,
  }, usuario), 'transformação do corte');

  const costura = ok(salvarTransformacao(db, {
    nome: 'Costura da touca',
    departamentoId: setor('Costura').id,
    entradas: [
      { itemId: estado.cortada.id, quantidade: 1, perda: 1 },
      { itemId: estado.elastico.id, quantidade: 0.62, unidade: 'M', perda: 0 },
      { itemId: estado.linha.id, quantidade: 0.008, unidade: 'UN', perda: 0 },
    ],
    saidas: [{ itemId: estado.touca.id, quantidade: 1, principal: true }],
    operacoes: [{ nome: 'Fechar e pregar elástico', porCiclo: 1, tempos: { processamento: 0.8, manuseio: 0.2 } }],
    lotePadrao: 1,
  }, usuario), 'transformação da costura');

  Object.assign(estado, { trfCorte: corte.transformacao, trfCostura: costura.transformacao });

  const conferencia = conferirEngenharia(db, estado.touca.id);
  assert.equal(conferencia.pronto, true, conferencia.pendencias.join(' · '));
});

test('cadastro: o sistema recusa dois donos para o mesmo item', () => {
  const r = salvarTransformacao(db, {
    nome: 'Outro corte da touca',
    departamentoId: setor('Corte').id,
    entradas: [{ itemId: estado.tnt.id, quantidade: 0.4 }],
    saidas: [{ itemId: estado.cortada.id, quantidade: 1, principal: true }],
    operacoes: [{ nome: 'Cortar', porCiclo: 500, tempos: { processamento: 60 } }],
  }, usuario);
  assert.match(r.erro || '', /já é produzido por "Corte da touca"/);
});

test('cadastro: estrutura em laço é recusada', () => {
  const r = salvarEstrutura(db, estado.cortada.id, [{ itemId: estado.touca.id, quantidade: 1 }], {}, usuario);
  assert.match(r.erro || '', /laço/);
});

test('cadastro: a estrutura declara o que a peça leva', () => {
  const r = ok(salvarEstrutura(db, estado.touca.id, [
    { itemId: estado.cortada.id, quantidade: 1, perda: 1 },
    { itemId: estado.elastico.id, quantidade: 0.62 },
    { itemId: estado.linha.id, quantidade: 0.008 },
  ], { motivo: 'Primeira versão' }, usuario), 'estrutura');
  assert.equal(r.estrutura.versao, 1);

  const segunda = ok(salvarEstrutura(db, estado.touca.id, [
    { itemId: estado.cortada.id, quantidade: 1, perda: 2 },
    { itemId: estado.elastico.id, quantidade: 0.6 },
    { itemId: estado.linha.id, quantidade: 0.008 },
  ], { motivo: 'Elástico mais curto' }, usuario), 'segunda versão');
  assert.equal(segunda.estrutura.versao, 2);
  assert.equal((db.industrial.estruturas || []).filter((e) => e.itemId === estado.touca.id && e.ativa).length, 1);
});

test('cadastro: custo padrão e árvore do produto', () => {
  const custo = custoPadrao(db, estado.touca.id, 3000);
  assert.ok(!custo.erro, custo.erro);
  assert.ok(custo.material > 0);
  assert.ok(custo.processo > 0);
  assert.equal(custo.total, Number((custo.material + custo.processo).toFixed(2)));
  assert.ok(custo.porPeca > 0 && custo.porPeca < 20, `custo por peça ${custo.porPeca}`);

  const arvore = arvoreDoProduto(db, estado.touca.id, 1);
  assert.equal(arvore.nome, 'TOUCA DESCARTÁVEL TNT');
  const nomes = arvore.filhos.map((f) => f.nome);
  assert.ok(nomes.includes('TOUCA CORTADA'));
  const cortada = arvore.filhos.find((f) => f.nome === 'TOUCA CORTADA');
  assert.equal(cortada.setor, 'Corte');
  assert.equal(cortada.filhos[0].nome, 'TNT 40G BRANCO (industrial)');
  assert.equal(cortada.filhos[0].setor, 'almoxarifado');
});

test('cadastro: item em uso não some do cadastro', () => {
  const r = inativarItem(db, estado.cortada.id, 'teste', usuario);
  assert.match(r.erro || '', /é usado em/);
});

/* ======================================================= ordem de produção */

test('ordem: abrir cria a cadeia inteira, com dependência', () => {
  const r = ok(abrirOrdem(db, {
    itemId: estado.touca.id,
    quantidade: 3000,
    clienteId: (db.clientes[0] || {}).id,
    pedido: '5001',
    entrega: '2026-10-30',
    prioridade: 2,
    observacao: 'Primeira ordem da touca.',
  }, usuario), 'abrir ordem');

  assert.match(r.ordem.codigoOrdem, /^OP-\d{4}-0001$/);
  assert.equal(r.plano.demandas.length, 2, 'corte e costura');
  const costura = r.plano.ordens.find((o) => o.departamentoId === setor('Costura').id);
  assert.equal(costura.dependeDe.length, 1, 'a costura depende do corte');
  estado.ordem = r.ordem;
});

test('ordem: o resumo mostra onde está e o que trava', () => {
  const resumo = resumoDaOrdem(db, estado.ordem.id);
  assert.ok(!resumo.erro, resumo.erro);
  assert.equal(resumo.quantidade, 3000);
  assert.equal(resumo.acabadas, 0);
  assert.equal(resumo.etapas.map((e) => e.departamento).join(' → '), 'Corte → Costura');
  assert.equal(resumo.proxima.departamento, 'Corte', 'o corte pode começar');
  assert.equal(resumo.travada.departamento, 'Costura', 'a costura espera a touca cortada');
  assert.ok(resumo.custoPlanejado > 0);

  /* a costura esperando o corte é a ordem acontecendo, não um problema: a
     falta aparece marcada com o setor que vai supri-la, e não vira alerta */
  const costura = resumo.etapas.find((e) => e.departamento === 'Costura');
  assert.equal(costura.faltas[0].nome, 'TOUCA CORTADA');
  assert.equal(costura.faltas[0].esperando, 'Corte');
  assert.deepEqual(resumo.alertas.filter((a) => a.id === 'componente_faltante'), [],
    'nada falta de verdade: o que a costura espera sai do corte desta mesma ordem');
});

test('ordem: o MRP da ordem pede o que falta', () => {
  const mrp = materiaisDaOrdem(db, estado.ordem.id);
  assert.ok(!mrp.erro, mrp.erro);
  const tnt = mrp.linhas.find((l) => l.itemId === estado.tnt.id);
  /* a costura refuga 1%: para entregar 3.000 toucas, o corte precisa cortar
     3.030 — e o TNT sai de 3.030 × 0,34 m, não de 3.000 */
  assert.equal(tnt.bruta, 1030.2);
  for (const l of mrp.linhas.filter((x) => x.comprar > 0)) {
    ok(receberCompra(db, l.materialId, l.comprar, { usuario }), `receber ${l.nome}`);
  }
  assert.equal(materiaisDaOrdem(db, estado.ordem.id).itensAComprar, 0);
});

test('ordem: cancelar exige motivo', () => {
  const r = cancelarOrdem(db, estado.ordem.id, '', usuario);
  assert.match(r.erro || '', /motivo/);
});

test('ordem: produzir a cadeia até o produto acabado', () => {
  const resumo = resumoDaOrdem(db, estado.ordem.id);
  const corte = resumo.etapas.find((e) => e.departamento === 'Corte');

  /* a costura ainda não pode ser liberada */
  const antes = conferirComponentes(db, resumo.etapas.find((e) => e.departamento === 'Costura').ordemId, usuario);
  assert.equal(antes.liberada, false);
  assert.match(antes.alertas[0].mensagem, /Faltam 3030 TOUCA CORTADA/);

  ok(executarTransformacao(db, {
    transformacaoId: estado.trfCorte.id,
    demandaId: corte.demandaId,
    ordemId: corte.ordemId,
    consolidacaoId: estado.ordem.id,
    saidas: [{ itemId: estado.cortada.id, quantidade: corte.planejado }],
  }, usuario), 'corte');

  const meio = resumoDaOrdem(db, estado.ordem.id);
  const costura = meio.etapas.find((e) => e.departamento === 'Costura');
  assert.equal(costura.podeComecar, true, JSON.stringify(costura.faltas));

  const depois = conferirComponentes(db, costura.ordemId, usuario);
  assert.equal(depois.liberada, true, JSON.stringify(depois.faltas));

  ok(executarTransformacao(db, {
    transformacaoId: estado.trfCostura.id,
    demandaId: costura.demandaId,
    ordemId: costura.ordemId,
    consolidacaoId: estado.ordem.id,
    saidas: [{ itemId: estado.touca.id, quantidade: 3000 }],
  }, usuario), 'costura');

  const fim = resumoDaOrdem(db, estado.ordem.id);
  assert.equal(fim.acabadas, 3000);
  assert.equal(fim.percentual, 100);
  assert.equal(disponivelEmProcesso(db, estado.touca.id), 3000);
  assert.ok(Math.abs(fim.custoReal - fim.custoPlanejado) / fim.custoPlanejado < 0.1,
    `real ${fim.custoReal} contra planejado ${fim.custoPlanejado}`);
});

test('ordem: depois de produzir, cancelar não é caminho — encerrar é', () => {
  const r = cancelarOrdem(db, estado.ordem.id, 'cliente desistiu', usuario);
  assert.match(r.erro || '', /encerre a ordem/);

  const fim = ok(encerrarOrdem(db, estado.ordem.id, {}, usuario), 'encerrar');
  assert.equal(fim.acabadas, 3000);
  assert.equal(fim.saldo, 0);
  assert.equal(fim.ordem.status, 'concluida');
});

test('ordem: uma ordem nova não é zerada pelo estoque da ordem anterior', () => {
  /* 3.000 toucas acabadas estão no estoque do processo. Pedir mais 500 tem de
     abrir 500 — o produto da ponta não desconta estoque (§34). */
  const nova = ok(abrirOrdem(db, { itemId: estado.touca.id, quantidade: 500, entrega: '2026-11-10' }, usuario),
    'segunda ordem');
  const resumo = resumoDaOrdem(db, nova.ordem.id);
  assert.equal(resumo.etapas.length, 2);
  assert.equal(resumo.etapas.find((e) => e.departamento === 'Costura').planejado, 500);
  /* já o subproduto no meio do caminho desconta: sobrou touca cortada de ontem */
  estado.ordemComSaldo = nova.ordem;
});

test('ordem: encerrar com saldo exige motivo', () => {
  const nova = { ordem: estado.ordemComSaldo };
  const semMotivo = encerrarOrdem(db, nova.ordem.id, {}, usuario);
  assert.match(semMotivo.erro || '', /Faltam 500 peça/);

  const comMotivo = ok(encerrarOrdem(db, nova.ordem.id,
    { motivo: 'Cliente antecipou a entrega do que já estava pronto.' }, usuario), 'encerrar com saldo');
  assert.equal(comMotivo.saldo, 500);
  assert.equal(comMotivo.ordem.saldoNaoProduzido, 500);
});

test('ordem: a lista do ambiente mostra o andamento de cada uma', () => {
  const lista = ordensDeProducao(db);
  assert.ok(lista.ordens.length >= 2);
  assert.equal(lista.abertas, 0, 'as duas foram encerradas');
  const primeira = lista.ordens.find((o) => o.codigo.endsWith('0001'));
  assert.equal(primeira.produto, 'TOUCA DESCARTÁVEL TNT');
  assert.equal(primeira.acabadas, 3000);
  assert.equal(primeira.situacao, 'concluida');
});

test('cadastro: clonar produto copia a árvore produzida', () => {
  const r = ok(clonarProduto(db, estado.touca.id, 'TOUCA DESCARTÁVEL AZUL', usuario), 'clonar');
  const conferencia = conferirEngenharia(db, r.item.id);
  assert.equal(conferencia.pronto, true, conferencia.pendencias.join(' · '));
  const arvore = arvoreDoProduto(db, r.item.id, 1);
  assert.ok(arvore.filhos.some((f) => f.nome.includes('TOUCA CORTADA')));
  assert.notEqual(arvore.filhos[0].itemId, estado.cortada.id, 'o subproduto do clone é outro');
});

test('cadastro: transformação com demanda aberta não é inativada', () => {
  const nova = ok(abrirOrdem(db, { itemId: estado.touca.id, quantidade: 100 }, usuario), 'ordem de teste');
  const r = inativarTransformacao(db, estado.trfCorte.id, 'teste', usuario);
  assert.match(r.erro || '', /demanda em aberto/);
  ok(cancelarOrdem(db, nova.ordem.id, 'teste de inativação', usuario), 'cancelar');
});

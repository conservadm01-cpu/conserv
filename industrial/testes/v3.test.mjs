/**
 * V3 §41 — a bateria de integração, rodando no Node.
 *
 *   node --test industrial/testes/
 *
 * Os trinta passos do fluxo completo entram aqui como um teste só (eles já se
 * conferem por dentro); em volta ficam os testes das funções novas que o
 * fluxo não consegue provar sozinho: unidade divergente, item órfão, lote sem
 * origem e o MRP que não pode encostar no estoque.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { prepararIndustrial, migrarIndustrialV3, num } from '../modelo.mjs';
import { explodirBOM, calcularMRP } from '../motores.mjs';
import { montarDemonstracao } from '../demonstracao.mjs';
import {
  resolverMaterialIndustrial, custoVigenteDoMaterial, converterUnidadeMaterial,
  auditarIntegracaoMateriaisEngenhariaIndustrial, indicadoresDeIntegracao, mapaDaCadeia,
} from '../integracao.mjs';
import { testarFluxoCompletoERPIndustrial } from '../testes-v3.mjs';
import { testarIndustrialV2 } from '../testes-v2.mjs';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const base = JSON.parse(fs.readFileSync(path.join(raiz, 'docs/teste/confeccao/base-teste.json'), 'utf8'));

const nova = () => {
  const db = prepararIndustrial(JSON.parse(JSON.stringify(base)));
  migrarIndustrialV3(db);
  return db;
};

test('V3 §34 — a migração é idempotente e não reescreve nada', () => {
  const db = nova();
  const lotes = db.industrial.lotes.length;
  const historico = (db.industrial.historico || []).length;
  const segunda = migrarIndustrialV3(db);
  assert.equal(db.industrial.versao, 3);
  assert.equal(db.industrial.lotes.length, lotes, 'a segunda migração criou lote de novo');
  assert.equal(segunda.feitas.length, 0, `refez: ${segunda.feitas.join(' · ')}`);
  assert.equal((db.industrial.historico || []).length, historico);
});

test('V3 §4 — resolverMaterialIndustrial é a única ponte item ↔ material', () => {
  const db = nova();
  const cenario = montarDemonstracao(db);

  const malha = resolverMaterialIndustrial(db, cenario.itens.malha.id);
  assert.equal(malha.vinculado, true);
  assert.equal(malha.materialId, cenario.itens.malha.materialId);
  assert.equal(malha.unidade, malha.material.unidadeEstoque);
  assert.ok(malha.custo > 0);
  assert.equal(malha.produzido, false);
  /* físico = livre + reservado, sempre */
  assert.equal(num(malha.estoque), num(malha.disponivel) + num(malha.reservado));

  /* item produzido não tem material: o estoque dele é o do processo */
  const frente = resolverMaterialIndustrial(db, cenario.itens.frente.id);
  assert.equal(frente.produzido, true);
  assert.equal(frente.materialId, '');
  assert.ok(frente.transformacaoId, 'a frente cortada precisa apontar para o corte');

  /* item que não existe responde com frase, não com exceção */
  const fantasma = resolverMaterialIndustrial(db, 'nao-existe');
  assert.equal(fantasma.vinculado, false);
  assert.match(fantasma.erro, /não encontrado/);
});

test('V3 §21 — o custo vigente diz de onde veio', () => {
  const db = nova();
  const material = db.materiais.find((m) => num(m.custoMedio) > 0);
  assert.equal(custoVigenteDoMaterial(db, material.id).origem, 'medio');

  material.ultimoCusto = num(material.custoMedio) * 2;
  const reposicao = custoVigenteDoMaterial(db, material.id, 'reposicao');
  assert.equal(reposicao.origem, 'ultimo');
  assert.equal(reposicao.valor, material.ultimoCusto);

  material.custoMedio = 0;
  material.ultimoCusto = 0;
  material.precoCompra = 0;
  assert.equal(custoVigenteDoMaterial(db, material.id).origem, 'sem_custo');
  assert.equal(custoVigenteDoMaterial(db, 'nao-existe').origem, 'inexistente');
});

test('V3 §9 — converter unidade não cria um segundo cadastro', () => {
  const db = nova();
  const material = db.materiais[0];
  const igual = converterUnidadeMaterial(db, {
    materialId: material.id, quantidade: 7, de: material.unidadeEstoque, para: material.unidadeEstoque,
  });
  assert.equal(igual.destino.quantidade, 7);
  assert.equal(igual.fator, 1);

  const impossivel = converterUnidadeMaterial(db, {
    materialId: material.id, quantidade: 1, de: 'CARRETA', para: material.unidadeEstoque,
  });
  assert.match(impossivel.erro, /Não há conversão cadastrada/);
});

test('V3 §27 — a auditoria de integração vê a cadeia partida', () => {
  const db = nova();
  const cenario = montarDemonstracao(db);
  const limpa = auditarIntegracaoMateriaisEngenhariaIndustrial(db);
  assert.equal(limpa.erros.length, 0, JSON.stringify(limpa.erros.slice(0, 2)));

  /* item comprado apontando para um material que não existe mais */
  db.industrial.itens.find((i) => i.id === cenario.itens.linha.id).materialId = 'apagado';
  /* unidade do item diferente da do material */
  db.industrial.itens.find((i) => i.id === cenario.itens.saco.id).unidade = 'CX';
  /* lote sem origem identificada */
  db.industrial.lotes.push({ id: 'lt-solto', codigo: 'LT-SOLTO', itemId: cenario.itens.frente.id,
    quantidade: 10, origem: 'producao', execucaoId: '', saldo: 0 });

  const suja = auditarIntegracaoMateriaisEngenhariaIndustrial(db);
  assert.ok(suja.erros.some((e) => e.tipo === 'item_sem_material'), JSON.stringify(suja.erros));
  assert.ok(suja.erros.concat(suja.alertas).some((e) => e.tipo === 'unidade_divergente'));
  assert.ok(suja.erros.some((e) => e.tipo === 'lote_sem_execucao'), JSON.stringify(suja.erros));
  assert.ok(suja.orfaos.some((o) => o.tipo === 'lote' && o.nome === 'LT-SOLTO'));
  assert.equal(suja.ok, false);
});

test('V3 §30 — a saúde da engenharia industrial é um número com prova', () => {
  const db = nova();
  const cenario = montarDemonstracao(db);
  const cheio = indicadoresDeIntegracao(db);
  assert.equal(cheio.integracao, 100);
  assert.ok(cheio.provas.length >= 5);
  for (const p of cheio.provas) {
    assert.equal(p.percentual, p.total > 0 ? Number(((p.ok / p.total) * 100).toFixed(1)) : 100);
  }

  /* quebrar metade dos vínculos derruba a nota: não é um número decorativo */
  const comprados = db.industrial.itens.filter((i) => i.materialId);
  for (const i of comprados.slice(0, Math.ceil(comprados.length / 2))) i.materialId = 'apagado';
  const quebrado = indicadoresDeIntegracao(db);
  assert.ok(quebrado.integracao < cheio.integracao,
    `quebrar ${comprados.length} vínculos não mudou a nota`);
  assert.ok(quebrado.contagem.errosIntegracao > 0);
  assert.equal(cenario.itens.camiseta.tipo, 'PRODUTO_ACABADO');
});

test('V3 §31 — o mapa da cadeia cobre os quinze elos, com aba de destino', () => {
  const db = nova();
  montarDemonstracao(db);
  const mapa = mapaDaCadeia(db);
  assert.ok(mapa.blocos.length >= 12, `${mapa.blocos.length} blocos`);
  for (const b of mapa.blocos) {
    assert.ok(b.id && b.nome, JSON.stringify(b));
    assert.ok(typeof b.registros === 'number');
    assert.ok(typeof b.problemas === 'number' && b.problemas >= 0);
    assert.ok(b.aba, `${b.id} sem aba de destino`);
  }
  assert.equal(mapa.integracao, 100);
  assert.ok(mapa.blocos.some((b) => b.id === 'materiais'));
  assert.ok(mapa.blocos.some((b) => b.id === 'acabado'));
});

test('V3 §12 — o MRP calcula e não encosta no estoque', () => {
  const db = nova();
  const cenario = montarDemonstracao(db);
  const foto = JSON.stringify([db.saldos, db.movimentacoes, db.industrial.lotes]);
  for (const q of [1000, 10000, 50000]) {
    const mrp = calcularMRP(db, explodirBOM(db, cenario.itens.camiseta.id, q));
    assert.ok(mrp.linhas.length > 0);
  }
  assert.equal(JSON.stringify([db.saldos, db.movimentacoes, db.industrial.lotes]), foto,
    'calcular o MRP alterou saldo, extrato ou lote');
});

test('V3 §41 — testarIndustrialV2 continua verde depois da V3', () => {
  const r = testarIndustrialV2(base);
  assert.equal(r.falhas, 0, JSON.stringify(r.detalhesFalhas));
  assert.equal(r.total, 21);
});

test('V3 §28 — testarFluxoCompletoERPIndustrial: 30 passos, 10.000 camisetas', () => {
  const r = testarFluxoCompletoERPIndustrial(base);
  assert.equal(r.total, 30);
  assert.equal(r.falhas, 0, JSON.stringify(r.detalhesFalhas, null, 2));
  assert.equal(r.indicadores.integracao, 100);
});

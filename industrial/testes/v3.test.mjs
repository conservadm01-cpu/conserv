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
import { conferirEngenharia, custoPadrao } from '../cadastro.mjs';
import { montarDemonstracao } from '../demonstracao.mjs';
import {
  resolverMaterialIndustrial, custoVigenteDoMaterial, converterUnidadeMaterial,
  auditarIntegracaoMateriaisEngenhariaIndustrial, indicadoresDeIntegracao, mapaDaCadeia,
} from '../integracao.mjs';
import { testarFluxoCompletoERPIndustrial } from '../testes-v3.mjs';
import { testarIndustrialV2 } from '../testes-v2.mjs';
import {
  produtosDaEngenharia, derivarProdutoDaEngenharia, lerFichaDoProduto, divergenciasDaFicha,
} from '../engenharia.mjs';
import {
  ordensDoSistema, planejarOrdemDoSistema, planejarOrdensPendentes, planoDaOrdemDoSistema,
  abrirOrdemDeProducao, versaoVigenteDoProduto, tarefasDaOrdem,
} from '../ordens-sistema.mjs';
import { encerrarOrdem } from '../ordens.mjs';

/**
 * A base ligada: os produtos que a Engenharia já tem e as ordens que o módulo
 * Produção já abriu entram no motor industrial.
 */
const ligarEngenharia = (db) => {
  for (const l of produtosDaEngenharia(db).linhas) {
    if (l.derivado || l.pendencias.length) continue;
    const r = derivarProdutoDaEngenharia(db, l.produtoId, { nome: 'Teste' });
    assert.ok(!r.erro, `${l.codigo}: ${r.erro}`);
  }
  const ordens = planejarOrdensPendentes(db, { nome: 'Teste' });
  assert.equal(ordens.falhas.length, 0, JSON.stringify(ordens.falhas));
  return db;
};

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

  /* produto cadastrado na Engenharia e ausente do industrial derruba a nota:
     é cadastro partido, e o número precisa dizer isso */
  const partido = indicadoresDeIntegracao(db);
  assert.ok(partido.integracao < 100,
    'com 6 produtos da Engenharia e 8 ordens fora do industrial a nota continuou cheia');
  assert.equal(partido.provas.find((p) => p.id === 'ordens_planejadas').ok, 0);
  assert.equal(partido.provas.find((p) => p.id === 'produtos_da_engenharia').ok, 0);

  ligarEngenharia(db);
  const cheio = indicadoresDeIntegracao(db);
  assert.equal(cheio.integracao, 100);
  assert.equal(cheio.provas.find((p) => p.id === 'produtos_da_engenharia').percentual, 100);
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
  ligarEngenharia(db);
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
  assert.ok(mapa.blocos.some((b) => b.id === 'engenharia_sistema'));
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

/* ===================================== a ponte com a Engenharia do sistema */

test('Engenharia → industrial: a ficha é lida como estrutura e roteiro', () => {
  const db = nova();
  const prd = db.produtos.find((p) => p.codigo === 'PRD-0002');
  const ficha = lerFichaDoProduto(db, prd.id);

  assert.equal(ficha.materiais.length, 5);
  const malha = ficha.materiais.find((m) => m.nome.includes('MALHA PV'));
  assert.equal(malha.quantidade, 0.21);
  assert.equal(malha.tipo, 'MATERIA_PRIMA', 'malha está no grupo Tecidos → matéria-prima');
  assert.equal(ficha.materiais.find((m) => m.nome.includes('LINHA')).tipo, 'AVIAMENTO');
  assert.equal(ficha.materiais.find((m) => m.nome.includes('TINTA')).tipo, 'INSUMO');
  assert.equal(ficha.materiais.find((m) => m.nome.includes('SACO')).tipo, 'EMBALAGEM');

  /* 13 etapas em 5 setores, na ordem em que a peça anda */
  assert.deepEqual(ficha.blocos.map((b) => b.departamento),
    ['Corte', 'Estamparia', 'Costura', 'Acabamento', 'Embalagem']);

  /* o modo da etapa vira o ciclo: 'projeto' é uma vez por ordem */
  const corte = ficha.blocos[0];
  assert.equal(corte.operacoes.find((o) => o.nome === 'Enfesto').porCiclo, 0);
  assert.equal(corte.operacoes.find((o) => o.nome === 'Corte').porCiclo, 1);
  assert.equal(corte.minutosPorPeca, 0.7);
  assert.equal(corte.minutosPorOrdem, 28);
});

test('Engenharia → industrial: derivar não duplica material nem cadastro', () => {
  const db = nova();
  const prd = db.produtos.find((p) => p.codigo === 'PRD-0002');
  const r = derivarProdutoDaEngenharia(db, prd.id, { nome: 'Teste' });
  assert.ok(!r.erro, r.erro);

  /* um item industrial por material — nunca dois */
  const porMaterial = new Map();
  for (const i of db.industrial.itens.filter((x) => x.materialId)) {
    porMaterial.set(i.materialId, num(porMaterial.get(i.materialId)) + 1);
  }
  assert.ok([...porMaterial.values()].every((n) => n === 1), 'material com dois itens industriais');

  /* o vínculo ficou gravado */
  assert.equal(r.item.produtoId, prd.id);
  assert.equal(r.item.origem, 'engenharia');
  assert.ok(r.item.fichaAssinatura);

  /* a cadeia tem uma transformação por setor, encadeadas */
  assert.equal(r.criados.transformacoes.length, 5);
  assert.equal(r.criados.subprodutos.length, 4, 'quatro subprodutos: os cinco setores menos o último');

  /* e a engenharia fecha: dá para abrir ordem */
  const conferencia = conferirEngenharia(db, r.item.id);
  assert.ok(conferencia.pronto, conferencia.pendencias.join(' | '));

  /* derivar de novo não cria nada */
  const itensAntes = db.industrial.itens.length;
  const trfAntes = db.industrial.transformacoes.length;
  const outra = derivarProdutoDaEngenharia(db, prd.id, { nome: 'Teste' });
  assert.ok(!outra.erro, outra.erro);
  assert.equal(db.industrial.itens.length, itensAntes);
  assert.equal(db.industrial.transformacoes.length, trfAntes);
});

test('Engenharia → industrial: a necessidade bate com a ficha, peça por peça', () => {
  const db = nova();
  const prd = db.produtos.find((p) => p.codigo === 'PRD-0002');
  const r = derivarProdutoDaEngenharia(db, prd.id, { nome: 'Teste' });
  const explosao = explodirBOM(db, r.item.id, 500, { considerarEstoque: false });
  assert.ok(!explosao.erro, explosao.erro);

  /* o nome do produto acabado do sistema traz o tecido dentro ("CAMISETA …
     MALHA PV 30/1 …"), então a busca é pelo material, não pelo nome */
  const doMaterial = (trecho) => {
    const material = db.materiais.find((m) => m.nome.includes(trecho));
    return explosao.necessidades.find((l) => l.item.materialId === material.id);
  };
  const acha = doMaterial;
  assert.equal(acha('MALHA PV').bruta, 105, '0,21 kg × 500');
  assert.equal(acha('LINHA 120').bruta, 7.5, '0,015 × 500');
  assert.equal(acha('TINTA BASE').bruta, 6, '0,012 × 500');
  assert.equal(acha('SACO PL').bruta, 500);
  assert.equal(explosao.producao.length, 5, 'cinco setores no plano');
});

test('Engenharia → industrial: mexer na ficha acusa divergência, e atualizar resolve', () => {
  const db = nova();
  const prd = db.produtos.find((p) => p.codigo === 'PRD-0002');
  derivarProdutoDaEngenharia(db, prd.id, { nome: 'Teste' });
  assert.equal(divergenciasDaFicha(db, prd.id).emDia, true);

  /* a Engenharia muda o consumo de tecido */
  prd.tecidos[0].quantidade = 0.28;
  const depois = divergenciasDaFicha(db, prd.id);
  assert.equal(depois.emDia, false);
  assert.equal(depois.divergencias.length, 1, JSON.stringify(depois.divergencias));
  assert.match(depois.divergencias[0], /0\.28.*0\.21/);

  /* a auditoria de integração trata isso como erro, não como detalhe */
  const auditoria = auditarIntegracaoMateriaisEngenhariaIndustrial(db);
  assert.ok(auditoria.erros.some((e) => e.tipo === 'ficha_divergente'));

  /* atualizar refaz a derivação e zera a diferença */
  const r = derivarProdutoDaEngenharia(db, prd.id, { nome: 'Teste' });
  assert.ok(!r.erro, r.erro);
  assert.equal(divergenciasDaFicha(db, prd.id).emDia, true);
  const explosao = explodirBOM(db, r.item.id, 1000, { considerarEstoque: false });
  const malha = db.materiais.find((m) => m.nome.includes('MALHA PV'));
  assert.equal(explosao.necessidades.find((l) => l.item.materialId === malha.id).bruta, 280);
});

test('Engenharia → industrial: os seis produtos da base viram ordens de verdade', () => {
  const db = nova();
  ligarEngenharia(db);
  const estado = produtosDaEngenharia(db);
  assert.equal(estado.total, 6);
  assert.equal(estado.derivados, 6);
  assert.equal(estado.divergentes, 0);

  for (const l of estado.linhas) {
    const conferencia = conferirEngenharia(db, l.itemId);
    assert.ok(conferencia.pronto, `${l.codigo}: ${conferencia.pendencias.join(' | ')}`);
    const custo = custoPadrao(db, l.itemId, 1000);
    assert.ok(!custo.erro, `${l.codigo}: ${custo.erro}`);
    assert.ok(num(custo.porPeca) > 0, `${l.codigo} saiu com custo zero`);
  }
});

/* ============================ a ordem nasce no módulo Produção */

test('Produção → industrial: a ordem do sistema vira plano, reserva e MRP', () => {
  const db = nova();
  const antes = ordensDoSistema(db);
  assert.equal(antes.total, 8, 'a base tem oito ordens em aberto');
  assert.equal(antes.planejadas, 0);
  assert.ok(antes.linhas.every((l) => l.estado === 'sem_plano'));

  const alvo = antes.linhas.find((l) => l.codigo === 'OP-0002');
  const r = planejarOrdemDoSistema(db, alvo.ordemId, { nome: 'Teste' });
  assert.ok(!r.erro, r.erro);

  /* o código continua sendo o do sistema — não se inventa um segundo número */
  assert.equal(r.ordem.codigoOrdem, 'OP-0002');
  assert.equal(r.ordem.ordemSistemaId, alvo.ordemId);
  assert.equal(db.ordens.find((o) => o.id === alvo.ordemId).industrialId, r.ordem.id);

  /* e o motor rodou inteiro */
  assert.ok(r.plano.ordens.length > 0, 'nenhuma etapa industrial');
  assert.ok(r.reserva.feitas.length > 0, 'nada reservado');
  assert.ok(num(r.custoPlanejado) > 0, 'budget zerado');

  /* o produto veio da ficha junto, sem ninguém pedir */
  assert.ok(r.item.produtoId, 'o item industrial não ficou ligado ao produto do sistema');

  /* planejar de novo é recusado, com frase */
  const outra = planejarOrdemDoSistema(db, alvo.ordemId, { nome: 'Teste' });
  assert.match(outra.erro, /já está planejada/);

  const depois = ordensDoSistema(db);
  assert.equal(depois.planejadas, 1);
  assert.equal(depois.linhas.find((l) => l.codigo === 'OP-0002').estado, 'planejada');
});

test('Produção → industrial: a quantidade da ordem manda no MRP', () => {
  const db = nova();
  const alvo = ordensDoSistema(db).linhas.find((l) => l.codigo === 'OP-0002');
  const r = planejarOrdemDoSistema(db, alvo.ordemId, { nome: 'Teste' });

  /* OP-0002 são 1.500 camisetas; a ficha pede 0,21 kg de malha por peça */
  const explosao = explodirBOM(db, r.item.id, alvo.quantidade, { considerarEstoque: false });
  const malha = db.materiais.find((m) => m.nome.includes('MALHA PV'));
  const linha = explosao.necessidades.find((l) => l.item.materialId === malha.id);
  assert.equal(alvo.quantidade, 1500);
  assert.equal(linha.bruta, 315, '0,21 × 1.500');
});

test('Produção → industrial: ordem fechada não entra, e a auditoria vê a que falta', () => {
  const db = nova();
  const concluida = db.ordens.find((o) => o.situacao === 'concluida');
  const r = planejarOrdemDoSistema(db, concluida.id, { nome: 'Teste' });
  assert.match(r.erro, /concluida|concluída/);

  const auditoria = auditarIntegracaoMateriaisEngenhariaIndustrial(db);
  assert.ok(auditoria.alertas.some((a) => a.tipo === 'ordem_sem_plano'),
    'oito ordens em aberto sem plano e nenhum alerta');

  planejarOrdensPendentes(db, { nome: 'Teste' });
  const limpa = auditarIntegracaoMateriaisEngenhariaIndustrial(db);
  assert.ok(!limpa.alertas.some((a) => a.tipo === 'ordem_sem_plano'));
  assert.equal(ordensDoSistema(db).semPlano, 0);
});

test('Produção → industrial: planejar as oito ordens da base de uma vez', () => {
  const db = nova();
  const r = planejarOrdensPendentes(db, { nome: 'Teste' });
  assert.equal(r.falhas.length, 0, JSON.stringify(r.falhas));
  assert.equal(r.feitas.length, 8);
  assert.ok(r.feitas.every((f) => f.etapas > 0 && f.custo > 0));

  const estado = ordensDoSistema(db);
  assert.equal(estado.planejadas, 8);
  assert.ok(estado.custoPlanejado > 0);

  /* cada ordem do sistema tem uma consolidação, e só uma */
  for (const l of estado.linhas) {
    const achadas = db.industrial.consolidacoes.filter((c) => c.ordemSistemaId === l.ordemId);
    assert.equal(achadas.length, 1, `${l.codigo} tem ${achadas.length} consolidações`);
    assert.equal(planoDaOrdemDoSistema(db, l.ordemId).codigoOrdem, l.codigo);
  }
});

/* ================= a ordem de produção nasce no industrial */

test('Ordem: nasce no industrial e é gravada como a ordem do sistema', () => {
  const db = nova();
  const prd = db.produtos.find((p) => p.codigo === 'PRD-0002');
  const antes = (db.ordens || []).length;

  const r = abrirOrdemDeProducao(db, {
    produtoId: prd.id, quantidade: 1200, entrega: '2026-11-30', prioridade: 2,
  }, { nome: 'Teste' });
  assert.ok(!r.erro, r.erro);

  /* o registro entrou em db.ordens, no formato de sempre */
  assert.equal(db.ordens.length, antes + 1);
  const ordem = r.ordemSistema;
  assert.match(ordem.codigo, /^OP-\d{4}$/);
  assert.equal(ordem.situacao, 'aberta');
  assert.equal(ordem.produtoId, prd.id);
  assert.equal(ordem.quantidade, 1200);
  /* a engenharia fica congelada na ordem */
  assert.equal(ordem.versaoCodigo, versaoVigenteDoProduto(db, prd.id).codigo);
  assert.equal(ordem.tarefas.length, prd.processo.length, 'uma tarefa por etapa do processo');

  /* e o plano industrial nasceu junto */
  assert.equal(r.ordem.codigoOrdem, ordem.codigo, 'o industrial inventou outro número');
  assert.equal(r.ordem.ordemSistemaId, ordem.id);
  assert.equal(r.plano.ordens.length, 5, 'cinco setores no roteiro da camiseta');
  assert.ok(r.reserva.feitas.length > 0);
  assert.ok(num(r.custoPlanejado) > 0);
});

test('Ordem: as tarefas saem do processo com a mesma conta do cadastro', () => {
  const db = nova();
  const prd = db.produtos.find((p) => p.codigo === 'PRD-0002');
  const tarefas = tarefasDaOrdem(db, prd, 1200);

  /* enfesto: 28 min de projeto com 2 pessoas, diluído em 1.200 peças */
  const enfesto = tarefas[0];
  assert.equal(enfesto.modo, 'projeto');
  assert.equal(enfesto.tempo, 28);
  assert.equal(enfesto.pessoas, 2);
  assert.equal(enfesto.minutosPorPeca, Number((28 * 2 / 1200).toFixed(6)));
  assert.equal(enfesto.minutosTotais, 56);

  /* corte: 0,7 min por peça, e a quantidade de gente não multiplica */
  const corte = tarefas[1];
  assert.equal(corte.modo, 'pessoa');
  assert.equal(corte.minutosPorPeca, 0.7);
  assert.equal(corte.minutosTotais, 840);
  assert.ok(tarefas.every((t) => t.concluida === false));
});

test('Ordem: produto em desenvolvimento só abre como amostra', () => {
  const db = nova();
  const dev = db.produtos.find((p) => String(p.status).toLowerCase() !== 'liberado');
  assert.ok(dev, 'a base tem um produto em desenvolvimento');

  const recusa = abrirOrdemDeProducao(db, { produtoId: dev.id, quantidade: 10 }, { nome: 'Teste' });
  assert.match(recusa.erro, /amostra/);
  assert.ok(!(db.ordens || []).some((o) => o.produtoId === dev.id && o.origem === 'industrial'),
    'a ordem recusada não pode ficar meio criada');

  const ok = abrirOrdemDeProducao(db, { produtoId: dev.id, quantidade: 10, amostra: true }, { nome: 'Teste' });
  assert.ok(!ok.erro, ok.erro);
  assert.equal(ok.ordemSistema.amostra, true);
});

test('Ordem: encerrar no industrial fecha a ordem do sistema', () => {
  const db = nova();
  const prd = db.produtos.find((p) => p.codigo === 'PRD-0004');
  const r = abrirOrdemDeProducao(db, { produtoId: prd.id, quantidade: 50 }, { nome: 'Teste' });
  assert.ok(!r.erro, r.erro);
  assert.equal(db.ordens.find((o) => o.id === r.ordemSistema.id).situacao, 'aberta');

  const fim = encerrarOrdem(db, r.ordem.id, { motivo: 'teste' }, { nome: 'Teste' });
  assert.ok(!fim.erro, fim.erro);
  const depois = db.ordens.find((o) => o.id === r.ordemSistema.id);
  assert.equal(depois.situacao, 'concluida');
  assert.ok(depois.concluidaEm, 'a ordem fechou sem data');

  /* e sai da lista de abertas */
  assert.ok(!ordensDoSistema(db).linhas.some((l) => l.ordemId === depois.id));
});

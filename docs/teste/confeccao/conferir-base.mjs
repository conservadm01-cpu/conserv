/**
 * Confere a base de teste do jeito que o sistema a lê.
 *
 *   node docs/teste/confeccao/conferir-base.mjs <confeccao-erp.html> [base.json]
 *
 * Repete o caminho do `loadDb` do protótipo — só as coleções que a versão
 * atual conhece, com as semeaduras por cima — e depois pergunta ao motor o
 * que ele vê: saldo, avanço das ordens, custo do produto, indicadores do
 * canal. Serve de teste da base: se alguma conta não fecha, aparece aqui e
 * não na frente de quem está avaliando o sistema.
 */
import fs from 'node:fs';
import path from 'node:path';
import { carregarMotor } from './motor.mjs';

const htmlProtótipo = process.argv[2];
const arquivo = process.argv[3]
  || path.join(path.dirname(new URL(import.meta.url).pathname), 'base-teste.json');
if (!htmlProtótipo) {
  console.error('uso: node docs/teste/confeccao/conferir-base.mjs <confeccao-erp.html> [base.json]');
  process.exit(1);
}

const api = carregarMotor(htmlProtótipo);
const { num } = api;
const salvo = JSON.parse(fs.readFileSync(arquivo, 'utf8'));

/* o mesmo filtro do loadDb: coleção que a versão não conhece fica de fora */
const modelo = api.emptyDb();
const base = {};
Object.keys(modelo).forEach((k) => {
  base[k] = salvo[k] !== undefined && salvo[k] !== null ? salvo[k] : modelo[k];
});
base.seq = { ...modelo.seq, ...(salvo.seq || {}) };
const db = api.migrarJornada(api.semearEngenharia(api.migrarGruposCortaveis(
  api.semearProduto(api.semearMateriais(api.garantirAdminPadrao(base))))));

const falhas = [];
const conferir = (ok, texto) => {
  if (!ok) falhas.push(texto);
  return ok;
};

/* ---- a base sobreviveu à leitura sem perder nada ---- */
conferir(db.colaboradores.length === (salvo.colaboradores || []).length,
  'o carregamento perdeu colaboradores');
conferir(!db.colaboradores.some((c) => c.nome === 'Administrador'),
  'o sistema precisou criar um administrador — a base veio sem nenhum ativo');

/* ---- estoque: saldo é o extrato, não um número digitado ---- */
const copia = JSON.parse(JSON.stringify(db));
const divergencias = api.recalcularSaldos(copia);
conferir(divergencias.length === 0,
  `${divergencias.length} saldo(s) não batem com as movimentações`);
const negativos = db.saldos.filter((s) => num(s.fisico) < 0);
conferir(negativos.length === 0, `${negativos.length} material(is) com saldo negativo`);

/* ---- produção ---- */
const painel = api.painelProducao(db, {});
conferir(painel.concluidas >= 1, 'nenhuma ordem concluída — falta o caso já fechado');
conferir(painel.emAndamento >= 3, 'poucas ordens em andamento');
conferir(painel.atrasadas >= 1, 'nenhuma ordem atrasada — falta o caso que aperta o PCP');

for (const o of db.ordens) {
  const av = api.avancoDaOrdem(o, db);
  const primeira = av.etapas[0];
  for (const e of av.etapas) {
    conferir(e.produzidas <= e.disponivel + 0.001,
      `${o.codigo}: a etapa ${e.etapa} processou mais do que a anterior entregou`);
  }
  conferir(!primeira || primeira.produzidas <= o.quantidade + 0.001,
    `${o.codigo}: apontou mais peças do que a ordem tem`);
}

/* ---- custo: produto liberado precisa ter conta fechada ---- */
for (const p of db.produtos) {
  const c = api.custearProduto(p, db);
  const total = num(c.custoTecido);
  if (api.statusDoProduto(p) === 'liberado') {
    conferir(total > 0, `${p.nome}: custo de material zerado`);
    const ck = api.checklistEngenharia(p, db);
    conferir(ck.obrigatoriosOk, `${p.nome}: engenharia obrigatória incompleta`);
  }
}

/* ---- canal e RH ---- */
const canal = api.indicadoresCanal(db, {});
conferir((db.manifestacoes || []).length >= 3, 'canal do colaborador vazio');
conferir((db.pesquisasClima || []).length >= 10, 'termômetro de clima sem histórico');
conferir((db.indicacoes || []).length >= 1, 'nenhuma indicação para as vagas');

/* ---- tamanho ---- */
const bytes = JSON.stringify(db).length;
conferir(bytes < api.LIMITE_BASE_BYTES,
  `a base ocupa ${(bytes / 1024 / 1024).toFixed(2)} MB e o sistema recusa acima de `
  + `${(api.LIMITE_BASE_BYTES / 1024 / 1024).toFixed(1)} MB`);

/* ---------------------------------------------------------- relatório */

const fabrica = api.mediaGeralFabrica(db);
const indireto = api.taxaCustoIndireto(db);

console.log(`\nBase conferida: ${arquivo}`);
console.log(`  ${(bytes / 1024).toFixed(0)} KB · ${db.colaboradores.length} pessoa(s) · `
  + `${db.materiais.length} material(is) · ${db.produtos.length} produto(s)`);
console.log(`  ordens: ${painel.abertas} aberta(s), ${painel.emAndamento} em andamento, `
  + `${painel.atrasadas} atrasada(s), ${painel.concluidas} concluída(s)`);
console.log(`  apontamentos: ${db.apontamentos.length} · `
  + `${db.apontamentos.reduce((s, a) => s + num(a.pecasBoas), 0)} peça(s) boa(s) · `
  + `${db.apontamentos.reduce((s, a) => s + num(a.pecasDefeito), 0)} refugo(s)`);
console.log(`  estoque: ${db.movimentacoes.length} movimentação(ões), `
  + `${db.saldos.filter((s) => num(s.fisico) > 0).length} material(is) com saldo`);
console.log(`  custo do minuto: R$ ${fabrica.custoMinuto} (mão de obra) · `
  + `R$ ${indireto.taxaMinuto ?? indireto.porMinuto ?? '—'} (indireto)`);
console.log(`  canal: ${(db.manifestacoes || []).length} manifestação(ões)`
  + `${canal && canal.abertas !== undefined ? `, ${canal.abertas} em aberto` : ''} · `
  + `clima ${(db.pesquisasClima || []).length} nota(s)`);

for (const p of db.produtos) {
  const c = api.custearProduto(p, db);
  const r = api.resumoProcesso(p, db, 100);
  console.log(`  · ${p.codigo} ${p.nome} — ${api.statusDoProduto(p)} · `
    + `material R$ ${num(c.custoTecido).toFixed(2)}/peça · `
    + `${num(r.minutosHomem ?? r.totalMinutos ?? 0).toFixed(2)} min/peça`);
}

if (falhas.length) {
  console.error('\nProblemas encontrados:');
  falhas.forEach((f) => console.error(`  • ${f}`));
  process.exit(1);
}
console.log('\nTudo confere.\n');

// Leitor de .xlsx e normalização do índice — a parte que decide fidelidade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { lerXlsx, linhasComoObjetos, referenciaDaCelula, textoXml } from '../src/lib/planilha/leitor.ts';
import {
  LIMITES_DA_EDICAO, converterClave, converterTipo, faixaDePaginas, normalizarIndice, resumirImportacao,
} from '../src/lib/msa/importacao.ts';

// A planilha do índice é material de terceiros e não fica no repositório.
// Quem for rodar estes testes precisa colocá-la em dados/ (ver README).
const caminhoDaPlanilha = new URL('../dados/MSA_indice.xlsx', import.meta.url);
const temPlanilha = existsSync(caminhoDaPlanilha);
if (!temPlanilha) {
  console.warn('dados/MSA_indice.xlsx ausente: os testes do índice do MSA foram pulados.');
}
const planilha = temPlanilha ? lerXlsx(await readFile(caminhoDaPlanilha)) : new Map();

test('o leitor abre a planilha do MSA, com prefixo de namespace e tudo', { skip: !temPlanilha }, () => {
  assert.ok(planilha.has('Índice detalhado'));
  assert.equal(planilha.size, 8);
  const { linhas, cabecalho } = linhasComoObjetos(planilha.get('Índice detalhado')!);
  assert.equal(linhas.length, 212);
  assert.ok(cabecalho.includes('Página impressa') && cabecalho.includes('Página no PDF'));
});

test('referência de célula e entidades XML', () => {
  assert.deepEqual(referenciaDaCelula('A1'), { coluna: 1, linha: 1 });
  assert.deepEqual(referenciaDaCelula('Z10'), { coluna: 26, linha: 10 });
  assert.deepEqual(referenciaDaCelula('AA3'), { coluna: 27, linha: 3 });
  assert.equal(textoXml('Dó &amp; R&#233;'), 'Dó & Ré');
});

test('faixas de página viram início e fim, sem inventar número', () => {
  assert.deepEqual(faixaDePaginas('56–57'), { inicio: 56, fim: 57, textoOriginal: '56–57' });
  assert.deepEqual(faixaDePaginas('42'), { inicio: 42, fim: 42, textoOriginal: '42' });
  assert.deepEqual(faixaDePaginas('A conferir'), { inicio: null, fim: null, textoOriginal: 'A conferir' });
  assert.deepEqual(faixaDePaginas(null), { inicio: null, fim: null, textoOriginal: null });
});

test('claves e tipos são convertidos, e o desconhecido não vira palpite', () => {
  assert.equal(converterClave('Sol'), 'SOL');
  assert.equal(converterClave('Dó'), 'DO');
  assert.equal(converterClave('Fá'), 'FA');
  assert.equal(converterClave('Tenor'), null);
  assert.equal(converterTipo('Leitura rítmica'), 'LEITURA_RITMICA');
  assert.equal(converterTipo('Hino'), 'HINO');
});

const { linhas } = temPlanilha
  ? linhasComoObjetos(planilha.get('Índice detalhado')!)
  : { linhas: [] as Record<string, string | null>[] };
const { licoes, ocorrencias } = normalizarIndice(linhas as Record<string, unknown>[]);

test('a normalização preserva a numeração original e agrupa por clave', { skip: !temPlanilha }, () => {
  assert.equal(licoes.length, 153);
  const comTresClaves = licoes.filter((l) => l.versoes.length === 3);
  assert.ok(comTresClaves.length >= 25, 'os exercícios em Sol, Dó e Fá viram uma lição com três versões');
  for (const licao of comTresClaves) {
    const claves = licao.versoes.map((v) => v.clave).sort();
    assert.deepEqual(claves, ['DO', 'FA', 'SOL']);
    assert.equal(new Set(licao.versoes.map((v) => v.clave)).size, 3, 'sem clave repetida');
  }
});

test('exercício rítmico não recebe tonalidade artificial', { skip: !temPlanilha }, () => {
  const ritmicos = licoes.filter((l) => l.tipo === 'LEITURA_RITMICA' || l.tipo === 'PREPARATORIO_RITMICO');
  assert.ok(ritmicos.length > 40);
  for (const licao of ritmicos) {
    for (const versao of licao.versoes) {
      assert.equal(versao.escalaReferencia, null, `${licao.numeroOriginal} não pode ter escala atribuída`);
    }
  }
});

test('clave adotada fica registrada como adotada, e pendente', { skip: !temPlanilha }, () => {
  const adotadas = licoes.filter((l) => l.versoes.some((v) => /adotad/i.test(v.criterioClave ?? '')));
  assert.ok(adotadas.length > 100);
  for (const licao of adotadas) {
    assert.notEqual(licao.statusConferencia, 'CONFERIDO');
    assert.ok(licao.pendencias.some((p) => p.includes('adotada')));
  }
});

test('o que passa dos limites do arquivo informado vira divergência', { skip: !temPlanilha }, () => {
  const divergentes = licoes.filter((l) => l.statusConferencia === 'DIVERGENTE');
  assert.equal(divergentes.length, 2);
  const numeros = divergentes.map((l) => l.numeroOriginal).sort();
  assert.deepEqual(numeros, ['112', '113']);
  for (const licao of divergentes) {
    assert.ok(licao.pendencias.some((p) => p.includes(String(LIMITES_DA_EDICAO.paginasArquivo))
      || p.includes(String(LIMITES_DA_EDICAO.paginaImpressaMaxima))
      || p.includes(String(LIMITES_DA_EDICAO.exercicioMaximo))));
  }
});

test('hino depende do Hinário e não ganha compasso nem tonalidade', { skip: !temPlanilha }, () => {
  const hinos = licoes.filter((l) => l.tipo === 'HINO');
  assert.equal(hinos.length, 21);
  for (const hino of hinos) {
    assert.equal(hino.statusConferencia, 'PENDENTE_CONFERENCIA');
    assert.ok(hino.pendencias.some((p) => p.includes('Hinário')));
    for (const versao of hino.versoes) {
      assert.deepEqual(versao.compassos, []);
      assert.equal(versao.escalaReferencia, null);
    }
  }
});

test('compassos alternados na mesma clave são fundidos numa versão só', { skip: !temPlanilha }, () => {
  const alternados = licoes.find((l) => l.numeroOriginal === '80' && l.topicoCodigo === '11.4');
  assert.ok(alternados, 'o exercício 80 do tópico 11.4 precisa existir');
  assert.equal(alternados!.versoes.length, 1);
  assert.deepEqual(alternados!.versoes[0].compassos.sort(), ['3/4', '4/4']);
  assert.ok(ocorrencias.some((o) => o.motivo.includes('mais de um compasso')));
});

test('rótulo repetido no tópico vira lição por escala, sem perder o rótulo', { skip: !temPlanilha }, () => {
  const construcoes = licoes.filter((l) => l.numeroOriginal === 'Exemplo de construção');
  assert.ok(construcoes.length >= 4);
  for (const licao of construcoes) {
    assert.ok(licao.variante, 'precisa de variante para não colidir');
    assert.equal(licao.numeroOriginal, 'Exemplo de construção', 'a numeração original é preservada');
  }
  const chaves = construcoes.map((l) => `${l.topicoCodigo}|${l.variante}`);
  assert.equal(new Set(chaves).size, chaves.length, 'sem duplicidade');
});

test('página impressa e página do arquivo ficam separadas', { skip: !temPlanilha }, () => {
  const comAsDuas = licoes.flatMap((l) => l.versoes).filter((v) => v.paginaImpressaInicio && v.paginaArquivoInicio);
  assert.ok(comAsDuas.length > 150);
  for (const versao of comAsDuas.slice(0, 50)) {
    assert.equal(versao.paginaArquivoInicio, versao.paginaImpressaInicio! - 1,
      'no MSA a página do arquivo é a impressa menos um; se mudar, é sinal de conferir');
  }
});

test('o resumo conta o que a fonte sustenta e o que ficou pendente', { skip: !temPlanilha }, () => {
  const resumo = resumirImportacao(licoes, ocorrencias, []);
  assert.equal(resumo.licoes, 153);
  assert.equal(resumo.porStatus.CONFERIDO + resumo.porStatus.PENDENTE_CONFERENCIA + resumo.porStatus.DIVERGENTE, 153);
  assert.ok(resumo.porStatus.PENDENTE_CONFERENCIA > resumo.porStatus.CONFERIDO,
    'com as fontes disponíveis, a maior parte segue pendente — e isso precisa aparecer');
  assert.ok(resumo.motivos.length > 5);
});

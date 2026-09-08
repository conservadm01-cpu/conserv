// Analisadores de método: a parte que decide fidelidade à fonte, e a prova de
// que a plataforma lê método novo sem que o núcleo mude.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { lerXlsx, linhasComoObjetos, referenciaDaCelula, textoXml } from '../src/lib/planilha/leitor.ts';
import {
  analisadorDeIndiceEmPlanilha, converterClave, converterTipo, faixaDePaginas, montarArvore,
  normalizarIndice, numerosDaLista, reconhecerColunas, resumirAnalise,
} from '../src/lib/metodos/analisadores/indice-em-planilha.ts';
import { analisadorDeSumarioEmTexto, analisarSumario } from '../src/lib/metodos/analisadores/sumario-em-texto.ts';
import { ANALISADORES, escolherAnalisador } from '../src/lib/metodos/analisadores/index.ts';
import { achatar, contarEstrutura, garantirCodigosUnicos } from '../src/lib/metodos/estrutura.ts';

/** Limites informados pelo responsável para a edição usada nestes testes. */
const LIMITES = { paginasArquivo: 150, paginaImpressaMaxima: 151, exercicioMaximo: 112 };

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
const { licoes, ocorrencias } = normalizarIndice(linhas as Record<string, unknown>[], LIMITES);

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
    assert.ok(licao.pendencias.some((p) => p.includes(String(LIMITES.paginasArquivo))
      || p.includes(String(LIMITES.paginaImpressaMaxima))
      || p.includes(String(LIMITES.exercicioMaximo))));
  }
});

test('item que depende de outra fonte não ganha compasso nem tonalidade', { skip: !temPlanilha }, () => {
  const hinos = licoes.filter((l) => l.tipo === 'HINO');
  assert.equal(hinos.length, 21);
  for (const hino of hinos) {
    assert.equal(hino.statusConferencia, 'PENDENTE_CONFERENCIA');
    assert.ok(hino.pendencias.some((p) => p.includes('dependem de outra fonte')));
    for (const versao of hino.versoes) {
      assert.deepEqual(versao.compassos, []);
      assert.equal(versao.escalaReferencia, null);
    }
  }
});

test('compassos alternados na mesma clave são fundidos numa versão só', { skip: !temPlanilha }, () => {
  const alternados = licoes.find((l) => l.numeroOriginal === '80' && l.unidadeMenorCodigo === '11.4');
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
  const chaves = construcoes.map((l) => `${l.unidadeMenorCodigo}|${l.variante}`);
  assert.equal(new Set(chaves).size, chaves.length, 'sem duplicidade');
});

test('página impressa e página do arquivo ficam separadas', { skip: !temPlanilha }, () => {
  const comAsDuas = licoes.flatMap((l) => l.versoes).filter((v) => v.paginaInicio && v.paginaArquivoInicio);
  assert.ok(comAsDuas.length > 150);
  for (const versao of comAsDuas.slice(0, 50)) {
    assert.equal(versao.paginaArquivoInicio, versao.paginaInicio! - 1,
      'no MSA a página do arquivo é a impressa menos um; se mudar, é sinal de conferir');
  }
});

test('o resumo conta o que a fonte sustenta e o que ficou pendente', { skip: !temPlanilha }, () => {
  const resumo = resumirAnalise(licoes, ocorrencias, []);
  assert.equal(resumo.licoes, 153);
  assert.equal(resumo.porStatus.CONFERIDO + resumo.porStatus.PENDENTE_CONFERENCIA + resumo.porStatus.DIVERGENTE, 153);
  assert.ok(resumo.porStatus.PENDENTE_CONFERENCIA > resumo.porStatus.CONFERIDO,
    'com as fontes disponíveis, a maior parte segue pendente — e isso precisa aparecer');
  assert.ok(resumo.motivos.length > 5);
});

// ------------------------------------------- a plataforma não é de um método

test('as colunas são reconhecidas por sinônimo, não por rótulo de um método', () => {
  const doMsa = reconhecerColunas(['Fase', 'Tópico do MSA', 'Exercício', 'Página impressa', 'Página no PDF']);
  assert.equal(doMsa.unidadeMaior, 'Fase');
  assert.equal(doMsa.unidadeMenor, 'Tópico do MSA');
  assert.equal(doMsa.item, 'Exercício');

  // Outra planilha, outros rótulos, mesmo entendimento.
  const deOutroMetodo = reconhecerColunas(['Nível', 'Módulo', 'Lição', 'Página do livro', 'Compasso']);
  assert.equal(deOutroMetodo.unidadeMaior, 'Nível');
  assert.equal(deOutroMetodo.unidadeMenor, 'Módulo');
  assert.equal(deOutroMetodo.item, 'Lição');
  assert.equal(deOutroMetodo.paginaImpressa, 'Página do livro');
});

test('sem limites declarados, nada vira divergência por página', () => {
  const linhas = [{
    Fase: '16', Tópico: '16.3 – Final', Exercício: '113', Tipo: 'Leitura métrica / solfejo',
    Clave: 'Sol', 'Página impressa': '154', 'Página no PDF': '153', Compasso: '4/4', Armadura: 'Nenhuma',
  }];
  const semLimites = normalizarIndice(linhas as Record<string, unknown>[]);
  assert.equal(semLimites.licoes[0].statusConferencia, 'PENDENTE_CONFERENCIA');

  const comLimites = normalizarIndice(linhas as Record<string, unknown>[], LIMITES);
  assert.equal(comLimites.licoes[0].statusConferencia, 'DIVERGENTE');
});

test('a árvore sai em duas camadas e a pior situação sobe', () => {
  const linhas = [
    { Fase: '1', Tópico: '1.1 – Um', Exercício: '1', Tipo: 'Leitura rítmica', Clave: 'Sol',
      'Página impressa': '10', 'Página no PDF': '9', Compasso: '2/4', Armadura: 'Sem armadura' },
    { Fase: '1', Tópico: '1.2 – Dois', Exercício: '2', Tipo: 'Leitura rítmica', Clave: 'Sol',
      'Página impressa': '11', 'Página no PDF': '10', Compasso: '2/4', Armadura: 'Sem armadura' },
  ];
  const { licoes: itens } = normalizarIndice(linhas as Record<string, unknown>[]);
  const arvore = montarArvore(itens);
  assert.equal(arvore.length, 1);
  assert.equal(arvore[0].tipo, 'FASE');
  assert.equal(arvore[0].filhas.length, 2);
  assert.deepEqual(arvore[0].filhas.map((f) => f.tipo), ['MODULO', 'MODULO']);
  assert.equal(arvore[0].paginaInicio, 10);
  assert.equal(arvore[0].paginaFim, 11);
  assert.equal(arvore[0].statusConferencia, 'PENDENTE_CONFERENCIA');
});

test('listas com anotação e faixa viram números, e frase não vira palpite', () => {
  assert.deepEqual(numerosDaLista('19 (p. 42); 24 (p. 43)'), ['19', '24']);
  assert.deepEqual(numerosDaLista('7–10, 14'), ['7', '8', '9', '10', '14']);
  assert.deepEqual(numerosDaLista('Nenhum exercício identificado'), []);
});

test('o sumário em texto lê outro formato e devolve a mesma estrutura', () => {
  const sumario = [
    ':: nome: Método fictício de flauta',
    ':: codigo: FIC-FLAUTA',
    '',
    '# 1 – Primeiros sons {NIVEL}',
    '## 1.1 – Emissão',
    '- 1 – Sons longos (Atividade de apoio) [p. 4]',
    '- 2 – Sons curtos (Atividade de apoio) [p. 5–6]',
    '## 1.2 – Leitura',
    '- 3 – Primeira leitura (Leitura métrica) [p. 8]',
    '- 4 – Leitura sem página',
  ].join('\n');

  const estrutura = analisarSumario(sumario);
  assert.equal(estrutura.metodo.nome, 'Método fictício de flauta');
  assert.equal(estrutura.metodo.codigo, 'FIC-FLAUTA');

  const contagem = contarEstrutura(estrutura);
  assert.deepEqual(contagem.unidadesPorTipo, { NIVEL: 1, MODULO: 2 });
  assert.equal(contagem.itens, 4);
  assert.equal(contagem.profundidade, 2);

  // O que a fonte não traz fica pendente, não suposto.
  const semPagina = estrutura.unidades[0].filhas[1].itens[1];
  assert.equal(semPagina.paginaInicio, null);
  assert.equal(semPagina.statusConferencia, 'PENDENTE_CONFERENCIA');
  assert.ok(semPagina.pendencias.some((p) => p.includes('sem página impressa')));

  const comPagina = estrutura.unidades[0].filhas[0].itens[1];
  assert.equal(comPagina.paginaInicio, 5);
  assert.equal(comPagina.paginaFim, 6);
  assert.equal(comPagina.statusConferencia, 'CONFERIDO');
});

test('a profundidade é do método: um sumário de quatro camadas não é achatado', () => {
  const estrutura = analisarSumario([
    '# A – Nível {NIVEL}',
    '## B – Fase {FASE}',
    '### C – Módulo {MODULO}',
    '#### D – Aula {AULA}',
    '- 1 – Item [p. 2]',
  ].join('\n'));
  assert.equal(contarEstrutura(estrutura).profundidade, 4);
  assert.deepEqual(achatar(estrutura.unidades).map((u) => u.caminho), ['A', 'A/B', 'A/B/C', 'A/B/C/D']);
});

test('código repetido no currículo é qualificado pelo pai, com aviso', () => {
  const estrutura = analisarSumario([
    '# 1 – Primeiro',
    '## 1.1 – Um',
    '# 2 – Segundo',
    '## 1.1 – Um outra vez',
  ].join('\n'));
  const codigos = achatar(estrutura.unidades).map((u) => u.unidade.codigo);
  assert.equal(new Set(codigos).size, codigos.length, 'nenhum código repetido');
  assert.ok(estrutura.avisos.some((a) => a.mensagem.includes('mais de uma vez')));
});

test('garantirCodigosUnicos é idempotente na segunda passada', () => {
  const estrutura = analisarSumario(['# 1 – A', '## 1 – B'].join('\n'));
  assert.deepEqual(garantirCodigosUnicos(estrutura.unidades), [], 'já ficou único na análise');
});

test('o analisador é escolhido pelo formato do arquivo, nunca pelo método', () => {
  const planilha = { nomeArquivo: 'qualquer-metodo.xlsx', tipoArquivo: 'XLSX', conteudo: Buffer.alloc(0) };
  const texto = { nomeArquivo: 'qualquer-metodo.md', tipoArquivo: 'TXT', conteudo: Buffer.alloc(0) };
  assert.equal(escolherAnalisador(planilha).id, analisadorDeIndiceEmPlanilha.id);
  assert.equal(escolherAnalisador(texto).id, analisadorDeSumarioEmTexto.id);
  assert.throws(
    () => escolherAnalisador({ nomeArquivo: 'metodo.zip', tipoArquivo: 'OUTRO', conteudo: Buffer.alloc(0) }),
    /Nenhum analisador/,
  );
});

test('nenhum analisador conhece o nome de um método', () => {
  for (const analisador of ANALISADORES) {
    const identidade = `${analisador.id} ${analisador.nome} ${analisador.descricao}`;
    assert.doesNotMatch(identidade, /\bMSA\b/i, `${analisador.id} não pode se declarar de um método`);
  }
});

test('a análise da planilha real entrega estrutura, avisos e resumo', { skip: !temPlanilha }, async () => {
  const conteudo = await readFile(caminhoDaPlanilha);
  const estrutura = analisadorDeIndiceEmPlanilha.analisar(
    { nomeArquivo: 'MSA_indice.xlsx', tipoArquivo: 'XLSX', conteudo },
    { limites: LIMITES },
  );
  const contagem = contarEstrutura(estrutura);
  assert.deepEqual(contagem.unidadesPorTipo, { FASE: 16, MODULO: 33 });
  assert.equal(contagem.itens, 153);
  assert.equal(contagem.versoes, 211);
  assert.equal(contagem.porConferencia.DIVERGENTE, 2);
  // Cruzamentos e ocorrências viram AVISO, não correção silenciosa.
  assert.ok(estrutura.avisos.length > 10);
  assert.ok(estrutura.avisos.some((a) => a.origem.startsWith('aba ')));
});

/**
 * Leitor de .xlsx sem dependência externa.
 *
 * Existe por dois motivos: a planilha do MSA usa prefixo de namespace (`x:`),
 * que a biblioteca usual não lê, e retirar a dependência tira junto a
 * vulnerabilidade que ela arrastava. Lê o que a importação precisa — texto,
 * número, booleano e string compartilhada — e ignora fórmula, imagem e estilo.
 */

import { inflateRawSync } from 'node:zlib';

const ASSINATURA_DIRETORIO = 0x02014b50;
const ASSINATURA_ARQUIVO = 0x04034b50;
const ASSINATURA_FIM = 0x06054b50;

/** Abre o zip do .xlsx e devolve cada entrada já descompactada. */
export function abrirZip(dados: Buffer): Map<string, Buffer> {
  const fim = localizarFimDoDiretorio(dados);
  const total = dados.readUInt16LE(fim + 10);
  let posicao = dados.readUInt32LE(fim + 16);
  const entradas = new Map<string, Buffer>();

  for (let i = 0; i < total; i++) {
    if (dados.readUInt32LE(posicao) !== ASSINATURA_DIRETORIO) {
      throw new Error('Arquivo .xlsx inválido: diretório central corrompido.');
    }
    const metodo = dados.readUInt16LE(posicao + 10);
    const tamanhoComprimido = dados.readUInt32LE(posicao + 20);
    const tamanhoNome = dados.readUInt16LE(posicao + 28);
    const tamanhoExtra = dados.readUInt16LE(posicao + 30);
    const tamanhoComentario = dados.readUInt16LE(posicao + 32);
    const deslocamento = dados.readUInt32LE(posicao + 42);
    const nome = dados.toString('utf8', posicao + 46, posicao + 46 + tamanhoNome);

    if (dados.readUInt32LE(deslocamento) !== ASSINATURA_ARQUIVO) {
      throw new Error(`Arquivo .xlsx inválido: cabeçalho de "${nome}" corrompido.`);
    }
    const nomeLocal = dados.readUInt16LE(deslocamento + 26);
    const extraLocal = dados.readUInt16LE(deslocamento + 28);
    const inicio = deslocamento + 30 + nomeLocal + extraLocal;
    const bruto = dados.subarray(inicio, inicio + tamanhoComprimido);

    if (metodo === 0) entradas.set(nome, Buffer.from(bruto));
    else if (metodo === 8) entradas.set(nome, inflateRawSync(bruto));
    else throw new Error(`Compressão ${metodo} não suportada em "${nome}".`);

    posicao += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  return entradas;
}

function localizarFimDoDiretorio(dados: Buffer): number {
  for (let i = dados.length - 22; i >= 0; i--) {
    if (dados.readUInt32LE(i) === ASSINATURA_FIM) return i;
  }
  throw new Error('Arquivo .xlsx inválido: fim do diretório não encontrado.');
}

const semPrefixo = (nome: string) => nome.replace(/^[^:]+:/, '');

/** Desfaz as entidades XML que aparecem em texto de planilha. */
export function textoXml(bruto: string): string {
  return bruto
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function lerStringsCompartilhadas(entradas: Map<string, Buffer>): string[] {
  const xml = entradas.get('xl/sharedStrings.xml');
  if (!xml) return [];
  const texto = xml.toString('utf8');
  const itens: string[] = [];
  for (const item of texto.matchAll(/<(?:[^:>]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?si>/g)) {
    itens.push(textoXml(item[1]));
  }
  return itens;
}

/** "BC12" → { coluna: 54, linha: 12 } (coluna começa em 1). */
export function referenciaDaCelula(referencia: string): { coluna: number; linha: number } {
  const partes = /^([A-Z]+)(\d+)$/.exec(referencia);
  if (!partes) return { coluna: 1, linha: 1 };
  let coluna = 0;
  for (const letra of partes[1]) coluna = coluna * 26 + (letra.charCodeAt(0) - 64);
  return { coluna, linha: Number(partes[2]) };
}

function lerAba(xml: string, compartilhadas: string[]): (string | null)[][] {
  const linhas: (string | null)[][] = [];
  for (const linha of xml.matchAll(/<(?:[^:>]+:)?row\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?row>/g)) {
    const celulas: (string | null)[] = [];
    for (const celula of linha[1].matchAll(/<(?:[^:>]+:)?c\b([^>]*)>([\s\S]*?)<\/(?:[^:>]+:)?c>|<(?:[^:>]+:)?c\b([^>]*)\/>/g)) {
      const atributos = celula[1] ?? celula[3] ?? '';
      const corpo = celula[2] ?? '';
      const referencia = /r="([A-Z]+\d+)"/.exec(atributos)?.[1];
      const tipo = /t="([^"]+)"/.exec(atributos)?.[1];
      const posicao = referencia ? referenciaDaCelula(referencia).coluna : celulas.length + 1;
      while (celulas.length < posicao - 1) celulas.push(null);

      let valor: string | null = null;
      if (tipo === 'inlineStr') {
        const conteudo = /<(?:[^:>]+:)?is\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?is>/.exec(corpo)?.[1];
        valor = conteudo ? textoXml(conteudo) : null;
      } else {
        const conteudo = /<(?:[^:>]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?v>/.exec(corpo)?.[1];
        if (conteudo !== undefined) {
          const cru = textoXml(conteudo);
          if (tipo === 's') valor = compartilhadas[Number(cru)] ?? null;
          else if (tipo === 'b') valor = cru === '1' ? 'VERDADEIRO' : 'FALSO';
          else valor = cru;
        }
      }
      celulas[posicao - 1] = valor;
    }
    linhas.push(celulas);
  }
  return linhas;
}

/** Lê a planilha inteira: nome da aba → matriz de células como texto. */
export function lerXlsx(dados: Buffer): Map<string, (string | null)[][]> {
  const entradas = abrirZip(dados);
  const workbook = entradas.get('xl/workbook.xml');
  if (!workbook) throw new Error('Arquivo .xlsx inválido: xl/workbook.xml não encontrado.');

  const relacoes = new Map<string, string>();
  const rels = entradas.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  for (const rel of rels.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g)) {
    relacoes.set(rel[1], rel[2].replace(/^\/?xl\//, '').replace(/^\.\//, ''));
  }

  const compartilhadas = lerStringsCompartilhadas(entradas);
  const abas = new Map<string, (string | null)[][]>();
  const texto = workbook.toString('utf8');

  let indice = 0;
  for (const aba of texto.matchAll(/<(?:[^:>]+:)?sheet\b([^>]*)\/?>/g)) {
    const atributos = aba[1];
    const nome = textoXml(/name="([^"]*)"/.exec(atributos)?.[1] ?? `Planilha ${indice + 1}`);
    const idRelacao = /r:id="([^"]+)"/.exec(atributos)?.[1];
    indice++;
    const alvo = (idRelacao && relacoes.get(idRelacao)) || `worksheets/sheet${indice}.xml`;
    const conteudo = entradas.get(`xl/${alvo}`);
    if (!conteudo) continue;
    abas.set(nome, lerAba(conteudo.toString('utf8'), compartilhadas));
  }
  return abas;
}

/**
 * Converte a matriz em objetos usando a primeira linha com pelo menos
 * `minimoDeColunas` células preenchidas como cabeçalho — as planilhas de
 * índice trazem título e subtítulo antes dele.
 */
export function linhasComoObjetos(
  matriz: (string | null)[][],
  { minimoDeColunas = 3, aPartirDe = 1 } = {},
): { cabecalho: string[]; linhas: Record<string, string | null>[]; linhaDoCabecalho: number } {
  const indice = matriz.findIndex((l, i) => i >= aPartirDe
    && l.filter((c) => c !== null && c !== '').length >= minimoDeColunas);
  if (indice < 0) return { cabecalho: [], linhas: [], linhaDoCabecalho: -1 };

  const cabecalho = matriz[indice].map((c, i) => (c ?? `coluna${i + 1}`).trim());
  const linhas = matriz.slice(indice + 1)
    .filter((l) => l.some((c) => c !== null && c !== ''))
    .map((l) => Object.fromEntries(cabecalho.map((chave, i) => [chave, l[i] ?? null])));
  return { cabecalho, linhas, linhaDoCabecalho: indice + 1 };
}

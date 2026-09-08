/**
 * Importador de método — qualquer método.
 *
 * Não há aqui nome de método nenhum: o que entra é um documento, e a
 * plataforma escolhe o analisador pelo FORMATO do arquivo. MSA, Melodia em
 * Movimento e o método de um instrumento passam pelo mesmo caminho.
 *
 * O que o importador respeita, por decisão do responsável pedagógico:
 *   • não cria item, página, tonalidade ou compasso que a fonte não traga;
 *   • página impressa, página do arquivo e número original ficam separados;
 *   • item sem altura definida NÃO recebe tonalidade;
 *   • clave adotada (não escrita no método) é preservada como adotada;
 *   • o que passa dos limites informados do documento entra como DIVERGENTE;
 *   • a estrutura entra como ANÁLISE, e vira currículo só depois que uma
 *     pessoa confirma — e mesmo então nada é publicado.
 *
 * Uso:
 *   node --experimental-strip-types scripts/importar-metodo.ts <arquivo> \
 *     --metodo=<código> [--nome="…"] [--instrumento="…"] [--analisador=<id>]
 *     [--aba="…"] [--paginas-arquivo=N] [--pagina-maxima=N] [--item-maximo=N]
 *     [--registrar] [--confirmar --revisor=<e-mail> --parecer="…"]
 *
 * Sem --registrar, é prévia: lê, confere e não grava nada.
 */

import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { clienteAdministrativo } from '../src/lib/banco.ts';
import type { DocumentoParaAnalise, EstruturaSugerida } from '../src/lib/metodos/estrutura.ts';
import { analisadorPorId, escolherAnalisador } from '../src/lib/metodos/analisadores/index.ts';
import { registrarAnalise, resumirEstrutura, revisarAnalise } from '../src/lib/metodos/aplicar.ts';

const argumentos = process.argv.slice(2);
const caminho = argumentos.find((a) => !a.startsWith('--'));
const opcao = (nome: string) => {
  const achado = argumentos.find((a) => a === `--${nome}` || a.startsWith(`--${nome}=`));
  if (!achado) return undefined;
  return achado.includes('=') ? achado.slice(achado.indexOf('=') + 1) : '';
};
const numero = (nome: string) => {
  const valor = opcao(nome);
  return valor ? Number(valor) : undefined;
};
const tem = (nome: string) => opcao(nome) !== undefined;

if (!caminho) {
  console.error('Informe o arquivo do método. Ex.: scripts/importar-metodo.ts dados/MSA_indice.xlsx --metodo=MSA');
  process.exit(1);
}

const TIPOS_DE_ARQUIVO: Record<string, string> = {
  '.xlsx': 'XLSX', '.csv': 'CSV', '.pdf': 'PDF', '.txt': 'TXT', '.md': 'TXT',
  '.docx': 'DOCX', '.musicxml': 'MUSICXML', '.mscz': 'MSCZ',
};

async function principal() {
  const conteudo = await readFile(caminho!);
  const hash = createHash('sha256').update(conteudo).digest('hex');
  const extensao = extname(caminho!).toLowerCase();
  const documento: DocumentoParaAnalise = {
    nomeArquivo: basename(caminho!),
    tipoArquivo: TIPOS_DE_ARQUIVO[extensao] ?? 'OUTRO',
    conteudo,
  };

  const idDoAnalisador = opcao('analisador');
  const analisador = idDoAnalisador ? analisadorPorId(idDoAnalisador) : escolherAnalisador(documento);
  if (!analisador) throw new Error(`Analisador "${idDoAnalisador}" não existe.`);

  const limites = {
    rotulo: opcao('edicao'),
    paginasArquivo: numero('paginas-arquivo'),
    paginaImpressaMaxima: numero('pagina-maxima'),
    exercicioMaximo: numero('item-maximo'),
  };
  const estrutura = analisador.analisar(documento, {
    limites,
    aba: opcao('aba'),
    rotuloDaUnidadeMaior: opcao('rotulo-da-unidade'),
  });

  relatar(documento, hash, analisador.nome, estrutura, limites);

  if (!tem('registrar')) {
    console.log('\nPrévia apenas. Rode com --registrar para gravar a análise (que ainda passará por revisão humana).\n');
    return;
  }

  const codigo = opcao('metodo');
  if (!codigo) throw new Error('Informe --metodo=<código> para registrar a análise.');

  const prisma = clienteAdministrativo();
  try {
    const instrumentoNome = opcao('instrumento');
    const instrumento = instrumentoNome
      ? await prisma.instrumento.findUniqueOrThrow({ where: { nome: instrumentoNome } })
      : null;

    const metodo = await prisma.metodo.upsert({
      where: { codigo },
      update: {},
      create: {
        codigo,
        nome: opcao('nome') ?? estrutura.metodo.nome ?? codigo,
        escopo: instrumento ? 'INSTRUMENTO' : 'TRANSVERSAL',
        instrumentoId: instrumento?.id ?? null,
        autor: estrutura.metodo.autor ?? null,
        organizacao: estrutura.metodo.organizacao ?? null,
        versao: estrutura.metodo.versao ?? limites.rotulo ?? null,
        nivel: estrutura.metodo.nivel ?? null,
        status: 'RASCUNHO',
        notaDireitos: 'Material de terceiros. O arquivo do método não é distribuído pela plataforma; '
          + 'apenas o índice de estudo e as referências de página. Uso mediante autorização.',
      },
    });

    const documentoGravado = await prisma.documentoMetodo.create({
      data: {
        metodoId: metodo.id,
        nomeArquivo: documento.nomeArquivo,
        tipoArquivo: documento.tipoArquivo as never,
        versao: limites.rotulo ?? null,
        descricao: `Analisado por "${analisador.nome}". SHA-256 ${hash.slice(0, 16)}…`,
        fonte: opcao('fonte') ?? null,
      },
    });

    const importacao = await prisma.importacao.create({
      data: {
        tipo: documento.tipoArquivo === 'XLSX' ? 'METODO_PLANILHA'
          : documento.tipoArquivo === 'PDF' ? 'METODO_PDF' : 'METODO_DOCUMENTO',
        nomeArquivo: documento.nomeArquivo,
        hashArquivo: hash,
        status: 'APLICADA',
        resumo: { ...estrutura.resumo, analisador: analisador.id } as unknown as object,
        concluidaEm: new Date(),
      },
    });
    for (const aviso of estrutura.avisos) {
      await prisma.importacaoLinha.create({
        data: {
          importacaoId: importacao.id, numeroLinha: 0,
          dados: aviso as unknown as object, status: 'PENDENTE_CONFERENCIA',
          mensagem: `[${aviso.origem}] ${aviso.mensagem}`,
        },
      });
    }

    const analise = await registrarAnalise(prisma, {
      metodoId: metodo.id,
      documentoId: documentoGravado.id,
      estrutura,
      origem: `importador:${analisador.id}`,
    });
    console.log(`\nAnálise ${analise.id} registrada para o método ${metodo.codigo}, em revisão humana.`);

    if (!tem('confirmar')) {
      console.log('Nenhum currículo foi criado: confirme a análise na central administrativa '
        + 'ou rode de novo com --confirmar --revisor=<e-mail>.\n');
      return;
    }

    const email = opcao('revisor');
    if (!email) throw new Error('--confirmar exige --revisor=<e-mail>: a decisão precisa de responsável.');
    const revisor = await prisma.usuario.findUniqueOrThrow({ where: { email } });

    const { gravado } = await revisarAnalise(prisma, {
      analiseId: analise.id,
      decisao: 'CONFIRMAR',
      revisorId: revisor.id,
      parecer: opcao('parecer') ?? null,
    });
    await prisma.auditoria.create({
      data: {
        usuarioId: revisor.id, acao: 'CONFIRMAR_ANALISE_DE_METODO', entidade: 'analises_de_metodo',
        entidadeId: analise.id,
        depois: { metodo: metodo.codigo, curriculo: gravado?.curriculoId, origem: 'importador' },
      },
    });
    console.log(`Confirmada por ${revisor.nomeCompleto}. Currículo ${gravado?.curriculoId}: `
      + `${gravado?.unidades} unidades, ${gravado?.licoes} lições, ${gravado?.versoes} versões.`);
    console.log('Nada foi publicado: publicar é ato à parte do responsável pedagógico.\n');
  } finally {
    await prisma.$disconnect();
  }
}

function relatar(
  documento: DocumentoParaAnalise,
  hash: string,
  analisador: string,
  estrutura: EstruturaSugerida,
  limites: Record<string, unknown>,
) {
  const resumo = estrutura.resumo as Record<string, never>;
  const contagem = resumirEstrutura(estrutura);

  console.log(`\nArquivo: ${documento.nomeArquivo} (${documento.tipoArquivo})`);
  console.log(`SHA-256: ${hash.slice(0, 16)}…`);
  console.log(`Analisador: ${analisador}`);
  const declarados = Object.entries(limites).filter(([, v]) => v !== undefined && v !== '');
  console.log(declarados.length
    ? `Limites informados: ${declarados.map(([k, v]) => `${k}=${v}`).join(', ')}`
    : 'Sem limites informados: nada será marcado como divergente por página.');

  console.log(`\nUnidades: ${Object.entries(contagem.unidadesPorTipo).map(([t, n]) => `${n} ${t}`).join(', ') || '—'}`);
  console.log(`Profundidade da árvore: ${contagem.profundidade}`);
  console.log(`Itens: ${contagem.itens} | versões: ${contagem.versoes}`);
  console.log('\nPor situação de conferência:');
  for (const [situacao, quantidade] of Object.entries(contagem.porConferencia)) {
    console.log(`  ${situacao.padEnd(22)} ${quantidade}`);
  }

  const motivos = (resumo.motivos ?? []) as unknown as [string, number][];
  if (motivos.length) {
    console.log('\nMotivos de pendência (mais frequentes):');
    for (const [motivo, quantidade] of motivos.slice(0, 12)) {
      console.log(`  ${String(quantidade).padStart(4)} × ${motivo}`);
    }
  }
  const divergencias = (resumo.divergencias ?? []) as unknown as string[];
  if (divergencias.length) {
    console.log('\nDivergências que exigem conferência humana:');
    for (const d of divergencias) console.log(`  • ${d}`);
  }
  if (estrutura.avisos.length) {
    console.log(`\nAvisos da análise (${estrutura.avisos.length}):`);
    for (const a of estrutura.avisos.slice(0, 20)) console.log(`  • [${a.origem}] ${a.mensagem}`);
    if (estrutura.avisos.length > 20) console.log(`  … e mais ${estrutura.avisos.length - 20}.`);
  }
  console.log('\nAmostra da estrutura proposta:');
  for (const linha of contagem.amostra) console.log(`  • ${linha}`);
}

principal().catch((erro) => { console.error(erro); process.exit(1); });

/**
 * Importador do MSA.
 *
 * Fonte primária: a aba "Índice detalhado" da planilha auxiliar, que é o
 * superconjunto das demais (212 linhas = 103 leitura métrica + 38 rítmica +
 * 25 construção de escala + 21 hinos + 13 preparatórios + 12 apoio).
 * As outras abas entram como CONFERÊNCIA CRUZADA: divergência entre elas e o
 * índice detalhado vira registro pendente, nunca correção silenciosa.
 *
 * Regras que o importador respeita, por decisão do responsável pedagógico:
 *   • não cria exercício, página, tonalidade ou compasso que a fonte não traga;
 *   • página impressa, página do arquivo e número original ficam separados;
 *   • exercício sem altura definida NÃO recebe tonalidade;
 *   • clave adotada (não escrita no método) é preservada como adotada;
 *   • o que passa dos limites informados do PDF (150 páginas de arquivo,
 *     página impressa 151, exercício 112) entra como DIVERGENTE;
 *   • nada é publicado pela importação: publicar é ato do administrador.
 *
 * Uso:
 *   node --experimental-strip-types scripts/importar-msa.ts <planilha.xlsx> [--aplicar]
 */

import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { lerXlsx, linhasComoObjetos } from '../src/lib/planilha/leitor.ts';
import { clienteAdministrativo } from '../src/lib/banco.ts';
import {
  LIMITES_DA_EDICAO, normalizarIndice, conferirCruzamentos, resumirImportacao,
} from '../src/lib/msa/importacao.ts';

const [caminho, ...opcoes] = process.argv.slice(2);
const aplicar = opcoes.includes('--aplicar');

if (!caminho) {
  console.error('Informe o caminho da planilha. Ex.: scripts/importar-msa.ts dados/MSA.xlsx [--aplicar]');
  process.exit(1);
}

/** Lê a planilha inteira como listas de objetos, uma por aba. */
async function lerPlanilha(arquivo: string) {
  const abas = lerXlsx(await readFile(arquivo));
  const saida: Record<string, Record<string, string | null>[]> = {};
  for (const [nome, matriz] of abas) saida[nome] = linhasComoObjetos(matriz).linhas;
  return saida;
}

async function principal() {
  const conteudo = await readFile(caminho);
  const hash = createHash('sha256').update(conteudo).digest('hex');
  const abas = await lerPlanilha(caminho);

  const detalhado = abas['Índice detalhado'] ?? [];
  if (!detalhado.length) throw new Error('A aba "Índice detalhado" não foi encontrada na planilha.');

  const { licoes, ocorrencias } = normalizarIndice(detalhado);
  const cruzamentos = conferirCruzamentos(abas, licoes);
  const resumo = resumirImportacao(licoes, ocorrencias, cruzamentos);

  console.log(`\nPlanilha: ${basename(caminho)}`);
  console.log(`SHA-256: ${hash.slice(0, 16)}…`);
  console.log(`Limites informados da edição: ${LIMITES_DA_EDICAO.paginasArquivo} páginas de arquivo, `
    + `até a página impressa ${LIMITES_DA_EDICAO.paginaImpressaMaxima}, último exercício ${LIMITES_DA_EDICAO.exercicioMaximo}.`);
  console.log(`\nLinhas lidas: ${detalhado.length}`);
  console.log(`Lições distintas: ${licoes.length}`);
  console.log(`Versões (clave): ${licoes.reduce((soma, l) => soma + l.versoes.length, 0)}`);
  console.log('\nPor situação de conferência:');
  for (const [situacao, quantidade] of Object.entries(resumo.porStatus)) {
    console.log(`  ${situacao.padEnd(22)} ${quantidade}`);
  }
  console.log('\nMotivos de pendência (mais frequentes):');
  for (const [motivo, quantidade] of resumo.motivos.slice(0, 12)) {
    console.log(`  ${String(quantidade).padStart(4)} × ${motivo}`);
  }
  if (resumo.divergencias.length) {
    console.log('\nDivergências que exigem conferência humana:');
    for (const d of resumo.divergencias) console.log(`  • ${d}`);
  }
  if (cruzamentos.length) {
    console.log('\nConferência cruzada com as demais abas:');
    for (const c of cruzamentos.slice(0, 20)) console.log(`  • [${c.aba}] ${c.mensagem}`);
    if (cruzamentos.length > 20) console.log(`  … e mais ${cruzamentos.length - 20}.`);
  }

  if (!aplicar) {
    console.log('\nPrévia apenas. Rode com --aplicar para gravar no banco.\n');
    return;
  }

  const prisma = clienteAdministrativo();
  try {
    const gravado = await gravar(prisma, { hash, licoes, resumo, cruzamentos });
    console.log(`\nGravado. Importação ${gravado.importacaoId}: `
      + `${gravado.licoes} lições, ${gravado.versoes} versões, ${gravado.agrupamentos} agrupamentos.`);
    console.log('Nada foi publicado: a publicação é ato do administrador pedagógico.\n');
  } finally {
    await prisma.$disconnect();
  }
}

async function gravar(prisma: ReturnType<typeof clienteAdministrativo>, dados: {
  hash: string;
  licoes: ReturnType<typeof normalizarIndice>['licoes'];
  resumo: ReturnType<typeof resumirImportacao>;
  cruzamentos: ReturnType<typeof conferirCruzamentos>;
}) {
  const material = await prisma.material.upsert({
    where: { tipo_nome: { tipo: 'MSA', nome: 'Método Simplificado de Aprendizagem Musical' } },
    update: {},
    create: {
      tipo: 'MSA',
      nome: 'Método Simplificado de Aprendizagem Musical',
      descricao: 'Método de teoria e solfejo da Congregação Cristã no Brasil.',
      notaDireitos: 'Material de terceiros. O arquivo do método não é distribuído pela plataforma; '
        + 'apenas o índice de estudo e as referências de página. Uso mediante autorização.',
    },
  });

  const edicao = await prisma.edicao.upsert({
    where: { materialId_rotulo: { materialId: material.id, rotulo: LIMITES_DA_EDICAO.rotulo } },
    update: { paginasArquivo: LIMITES_DA_EDICAO.paginasArquivo },
    create: {
      materialId: material.id,
      rotulo: LIMITES_DA_EDICAO.rotulo,
      ano: 2022,
      mes: 12,
      paginasArquivo: LIMITES_DA_EDICAO.paginasArquivo,
      observacao: `Arquivo de ${LIMITES_DA_EDICAO.paginasArquivo} páginas, terminando no exercício `
        + `${LIMITES_DA_EDICAO.exercicioMaximo}, página impressa ${LIMITES_DA_EDICAO.paginaImpressaMaxima}.`,
    },
  });

  const importacao = await prisma.importacao.create({
    data: {
      tipo: 'MSA_PLANILHA',
      nomeArquivo: basename(caminho),
      hashArquivo: dados.hash,
      status: 'APLICADA',
      resumo: dados.resumo as unknown as object,
      concluidaEm: new Date(),
    },
  });

  let totalLicoes = 0;
  let totalVersoes = 0;
  const agrupamentosCriados = new Set<string>();

  for (const licao of dados.licoes) {
    const fase = await prisma.fase.upsert({
      where: { edicaoId_numero: { edicaoId: edicao.id, numero: licao.fase } },
      update: {},
      // O nome da fase vem do PDF; até lá, fica o número, sem inventar título.
      create: { edicaoId: edicao.id, numero: licao.fase, nome: `Fase ${licao.fase}`, ordem: licao.fase },
    });

    const topico = await prisma.topico.upsert({
      where: { faseId_codigo: { faseId: fase.id, codigo: licao.topicoCodigo } },
      update: { nome: licao.topicoNome },
      create: { faseId: fase.id, codigo: licao.topicoCodigo, nome: licao.topicoNome, ordem: licao.ordem },
    });

    const registro = await prisma.licao.upsert({
      where: {
        topicoId_numeroOriginal_variante: {
          topicoId: topico.id, numeroOriginal: licao.numeroOriginal, variante: licao.variante,
        },
      },
      update: {
        titulo: licao.titulo, tipo: licao.tipo, statusConferencia: licao.statusConferencia,
        observacoes: licao.observacoes, fonte: licao.fonte, ordemPedagogica: licao.ordem,
      },
      create: {
        topicoId: topico.id,
        numeroOriginal: licao.numeroOriginal,
        variante: licao.variante,
        titulo: licao.titulo,
        tipo: licao.tipo,
        ordemPedagogica: licao.ordem,
        statusConferencia: licao.statusConferencia,
        statusPublicacao: 'RASCUNHO',
        observacoes: licao.observacoes,
        fonte: licao.fonte,
      },
    });
    totalLicoes++;

    for (const versao of licao.versoes) {
      await prisma.versaoLicao.upsert({
        where: { licaoId_clave: { licaoId: registro.id, clave: versao.clave } },
        update: { ...versao, licaoId: registro.id },
        create: { ...versao, licaoId: registro.id },
      });
      totalVersoes++;
    }

    for (const grupo of licao.agrupamentos) {
      const agrupamento = await prisma.agrupamento.upsert({
        where: { tipo_valor: { tipo: grupo.tipo, valor: grupo.valor } },
        update: { rotulo: grupo.rotulo },
        create: grupo,
      });
      agrupamentosCriados.add(agrupamento.id);
      await prisma.licaoAgrupamento.upsert({
        where: { licaoId_agrupamentoId: { licaoId: registro.id, agrupamentoId: agrupamento.id } },
        update: {},
        create: { licaoId: registro.id, agrupamentoId: agrupamento.id },
      });
    }

    await prisma.importacaoLinha.create({
      data: {
        importacaoId: importacao.id,
        numeroLinha: licao.linhaOrigem,
        dados: { ...licao, versoes: licao.versoes } as unknown as object,
        status: licao.statusConferencia === 'CONFERIDO' ? 'NOVO'
          : licao.statusConferencia === 'DIVERGENTE' ? 'ERRO' : 'PENDENTE_CONFERENCIA',
        mensagem: licao.pendencias.join(' | ') || null,
      },
    });
  }

  for (const c of dados.cruzamentos) {
    await prisma.importacaoLinha.create({
      data: {
        importacaoId: importacao.id, numeroLinha: 0,
        dados: c as unknown as object, status: 'PENDENTE_CONFERENCIA',
        mensagem: `[${c.aba}] ${c.mensagem}`,
      },
    });
  }

  return {
    importacaoId: importacao.id, licoes: totalLicoes, versoes: totalVersoes,
    agrupamentos: agrupamentosCriados.size,
  };
}

principal().catch((erro) => { console.error(erro); process.exit(1); });

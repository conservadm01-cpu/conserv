/**
 * Exporta um banco semeado como JSON, para demonstração.
 *
 * Sai daqui o mesmo conteúdo que o sistema mostra — métodos, currículos com a
 * árvore inteira, lições com proveniência e versões por clave, pessoas,
 * vínculos, turmas e jornadas. Serve para montar uma amostra navegável fora do
 * servidor, sem inventar dado nenhum: o que estiver aqui saiu do banco.
 *
 * NÃO é ferramenta de backup — para isso, ver docs/backup-e-restauracao.md.
 * E não exporta senha: o arquivo não carrega credencial de ninguém.
 *
 * Uso:
 *   node --experimental-strip-types scripts/exportar-demonstracao.ts [saida.json]
 *
 * Lê de DATABASE_URL_TESTES quando existir (o banco descartável), senão de
 * DATABASE_URL_MIGRACAO.
 */
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '../src/gerado/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const url = process.env.DATABASE_URL_TESTES ?? process.env.DATABASE_URL_MIGRACAO;
if (!url) throw new Error('Defina DATABASE_URL_TESTES ou DATABASE_URL_MIGRACAO.');
const saida = process.argv[2] ?? 'dados/demonstracao.json';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const dados = {
  regioes: await prisma.regiao.findMany({ select: { id: true, nome: true, cidadeUf: true } }),
  comuns: await prisma.comum.findMany({ select: { id: true, nome: true, codigo: true, cidade: true, regiaoId: true } }),
  instrumentos: await prisma.instrumento.findMany({
    select: { id: true, nome: true, clavePrincipal: true, afinacao: true },
    orderBy: { nome: 'asc' },
  }),
  metodos: await prisma.metodo.findMany({
    select: {
      id: true, nome: true, codigo: true, escopo: true, descricao: true, instrumentoId: true,
      status: true, conteudoCompartilhado: true, notaDireitos: true,
      competencias: { select: { codigo: true, nome: true, peso: true, ordem: true }, orderBy: { ordem: 'asc' } },
      configuracoes: { select: { chave: true, valor: true, descricao: true } },
      autorizacoes: { select: { instrumentoId: true } },
      documentos: { select: { nomeArquivo: true } },
    },
  }),
  curriculos: await prisma.curriculo.findMany({
    select: { id: true, metodoId: true, rotulo: true, versao: true, status: true },
  }),
  unidades: await prisma.unidadeCurricular.findMany({
    select: {
      id: true, curriculoId: true, paiId: true, tipo: true, codigo: true, nome: true,
      ordem: true, profundidade: true, caminho: true, paginaOrigemInicio: true,
      paginaOrigemFim: true, statusConferencia: true,
    },
    orderBy: [{ profundidade: 'asc' }, { ordem: 'asc' }],
  }),
  licoes: await prisma.licao.findMany({
    select: {
      id: true, unidadeId: true, metodoId: true, instrumentoId: true, numeroOriginal: true,
      variante: true, titulo: true, tipo: true, ordemPedagogica: true, compartilhado: true,
      paginaOrigemInicio: true, paginaOrigemFim: true, referenciaOrigem: true, fonte: true,
      observacoes: true, statusConferencia: true, statusPublicacao: true,
      versoes: {
        select: {
          clave: true, criterioClave: true, paginaImpressaInicio: true, paginaImpressaFim: true,
          paginaArquivoInicio: true, paginaArquivoFim: true, armadura: true,
          escalaReferencia: true, compassos: true, tipoLeitura: true, statusConferencia: true,
        },
      },
    },
    orderBy: { ordemPedagogica: 'asc' },
  }),
  usuarios: await prisma.usuario.findMany({
    select: {
      id: true, nomeCompleto: true, email: true, login: true, telefone: true, status: true,
      deveTrocarSenha: true, criadoPorId: true, ultimoAcessoEm: true,
      vinculos: {
        where: { revogadoEm: null },
        select: { id: true, papel: true, escopo: true, comumId: true, regiaoId: true, ativo: true },
      },
      perfilAluno: { select: { comumId: true, instrumentoId: true, instrutorId: true,
        encarregadoLocalNome: true, encarregadoRegionalNome: true, anciaoNome: true } },
    },
    orderBy: { nomeCompleto: 'asc' },
  }),
  turmas: await prisma.turma.findMany({
    select: {
      id: true, nome: true, comumId: true, instrumentoId: true, metodoId: true,
      unidadeId: true, instrutorId: true,
      matriculas: { select: { alunoId: true, jornadaId: true } },
    },
  }),
  jornadas: await prisma.jornadaDoAluno.findMany({
    select: { id: true, alunoId: true, instrumentoId: true, metodoId: true, curriculoId: true,
      unidadeAtualId: true, status: true },
  }),
  progresso: await prisma.progressoLicao.findMany({
    select: { alunoId: true, licaoId: true, jornadaId: true, estado: true, peso: true },
  }),
  analises: await prisma.analiseDeMetodo.findMany({
    select: { id: true, metodoId: true, origem: true, status: true, resumo: true, parecer: true,
      revisadoPor: { select: { nomeCompleto: true } } },
  }),
  regras: await prisma.regraProgressao.findMany({
    select: { codigo: true, tipo: true, descricao: true, parametros: true },
  }),
};

writeFileSync(saida, JSON.stringify(dados));
console.log(`Exportado para ${saida}:`);
for (const [chave, valor] of Object.entries(dados)) {
  console.log(`  ${chave.padEnd(14)} ${Array.isArray(valor) ? valor.length : 1}`);
}
await prisma.$disconnect();

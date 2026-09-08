/**
 * Semente de demonstração.
 *
 * Cria território, pessoas de cada papel, instrumentos, regras pedagógicas e
 * um pouco de progresso — o bastante para abrir os painéis e para os testes de
 * autorização terem alvos reais em comuns e regiões diferentes.
 *
 * As senhas daqui são de demonstração e estão documentadas no README; em
 * produção, o primeiro acesso do superadministrador troca a sua.
 */

import { readFile } from 'node:fs/promises';
import { clienteAdministrativo } from '../src/lib/banco.ts';
import { gerarHashDeSenha } from '../src/lib/senha.ts';

const prisma = clienteAdministrativo();
const SENHA_DEMONSTRACAO = 'Estudos2026';

async function criarUsuario(dados: {
  nome: string; email: string; senha?: string; status?: 'ATIVO' | 'PENDENTE'; telefone?: string;
}) {
  const senhaHash = await gerarHashDeSenha(dados.senha ?? SENHA_DEMONSTRACAO);
  return prisma.usuario.upsert({
    where: { email: dados.email },
    update: { nomeCompleto: dados.nome, status: dados.status ?? 'ATIVO' },
    create: {
      nomeCompleto: dados.nome, email: dados.email, senhaHash, telefone: dados.telefone,
      status: dados.status ?? 'ATIVO', aceiteTermosEm: new Date(), versaoPrivacidade: '2026-01',
    },
  });
}

async function darVinculo(dados: {
  usuarioId: string; papel: 'SUPERADMIN' | 'ADMIN_PEDAGOGICO' | 'INSTRUTOR' | 'ENCARREGADO_LOCAL' | 'ENCARREGADO_REGIONAL' | 'ANCIAO' | 'ALUNO';
  escopo: 'GLOBAL' | 'REGIAO' | 'COMUM'; regiaoId?: string; comumId?: string; concedidoPorId?: string;
}) {
  const existente = await prisma.vinculo.findFirst({
    where: {
      usuarioId: dados.usuarioId, papel: dados.papel, escopo: dados.escopo,
      regiaoId: dados.regiaoId ?? null, comumId: dados.comumId ?? null,
    },
  });
  if (existente) return existente;
  return prisma.vinculo.create({ data: { ...dados, ativo: true } });
}

async function principal() {
  console.log('Semeando…');

  // ------------------------------------------------------------ território
  const regiaoNorte = await prisma.regiao.upsert({
    where: { codigo: 'REG-N' },
    update: {},
    create: { nome: 'Região Norte (demonstração)', codigo: 'REG-N', cidadeUf: 'São Paulo/SP' },
  });
  const regiaoSul = await prisma.regiao.upsert({
    where: { codigo: 'REG-S' },
    update: {},
    create: { nome: 'Região Sul (demonstração)', codigo: 'REG-S', cidadeUf: 'Curitiba/PR' },
  });

  const comuns = await Promise.all([
    ['COM-01', 'Jardim Aeroporto', regiaoNorte.id, 'São Paulo', 'SP'],
    ['COM-02', 'Vila Nova', regiaoNorte.id, 'São Paulo', 'SP'],
    ['COM-03', 'Centro', regiaoSul.id, 'Curitiba', 'PR'],
    ['COM-04', 'Boqueirão', regiaoSul.id, 'Curitiba', 'PR'],
  ].map(([codigo, nome, regiaoId, cidade, estado]) => prisma.comum.upsert({
    where: { codigo: codigo as string },
    update: {},
    create: { codigo: codigo as string, nome: nome as string, regiaoId: regiaoId as string, cidade: cidade as string, estado: estado as string },
  })));
  const [jardim, vilaNova, centro] = comuns;

  // --------------------------------------------------------------- pessoas
  const superadmin = await criarUsuario({ nome: 'Renato Superadministrador', email: 'renato@exemplo.org' });
  await darVinculo({ usuarioId: superadmin.id, papel: 'SUPERADMIN', escopo: 'GLOBAL' });

  const pedagogico = await criarUsuario({ nome: 'Ana Administração Pedagógica', email: 'ana.pedagogica@exemplo.org' });
  await darVinculo({ usuarioId: pedagogico.id, papel: 'ADMIN_PEDAGOGICO', escopo: 'GLOBAL', concedidoPorId: superadmin.id });

  const instrutorNorte = await criarUsuario({ nome: 'Paulo Instrutor', email: 'paulo.instrutor@exemplo.org' });
  await darVinculo({ usuarioId: instrutorNorte.id, papel: 'INSTRUTOR', escopo: 'COMUM', comumId: jardim.id, concedidoPorId: superadmin.id });

  const instrutorSul = await criarUsuario({ nome: 'Marcos Instrutor', email: 'marcos.instrutor@exemplo.org' });
  await darVinculo({ usuarioId: instrutorSul.id, papel: 'INSTRUTOR', escopo: 'COMUM', comumId: centro.id, concedidoPorId: superadmin.id });

  const encarregadoLocal = await criarUsuario({ nome: 'José Encarregado Local', email: 'jose.local@exemplo.org' });
  await darVinculo({ usuarioId: encarregadoLocal.id, papel: 'ENCARREGADO_LOCAL', escopo: 'COMUM', comumId: jardim.id, concedidoPorId: superadmin.id });

  const encarregadoRegional = await criarUsuario({ nome: 'Antônio Encarregado Regional', email: 'antonio.regional@exemplo.org' });
  await darVinculo({ usuarioId: encarregadoRegional.id, papel: 'ENCARREGADO_REGIONAL', escopo: 'REGIAO', regiaoId: regiaoNorte.id, concedidoPorId: superadmin.id });

  const anciao = await criarUsuario({ nome: 'Benedito Ancião', email: 'benedito.anciao@exemplo.org' });
  await darVinculo({ usuarioId: anciao.id, papel: 'ANCIAO', escopo: 'COMUM', comumId: jardim.id, concedidoPorId: superadmin.id });

  // ----------------------------------------------------------- instrumentos
  const listaInstrumentos = JSON.parse(await readFile(new URL('../dados/instrumentos.json', import.meta.url), 'utf8')) as {
    nome: string; categoria: string; afinacao: string; clavePrincipal: 'SOL' | 'DO' | 'FA';
    clavesAlternativas: ('SOL' | 'DO' | 'FA')[]; transposicaoGrau: number; transposicaoSemitons: number;
    transposicaoDescricao: string; extensaoEscrita: string; observacoesTecnicas: string;
  }[];

  const categorias = new Map<string, string>();
  for (const [ordem, nome] of ['Cordas', 'Madeiras', 'Metais', 'Teclados'].entries()) {
    const categoria = await prisma.categoriaInstrumento.upsert({
      where: { nome }, update: {}, create: { nome, ordem },
    });
    categorias.set(nome, categoria.id);
  }

  for (const instrumento of listaInstrumentos) {
    await prisma.instrumento.upsert({
      where: { nome: instrumento.nome },
      update: {},
      create: {
        nome: instrumento.nome,
        categoriaId: categorias.get(instrumento.categoria)!,
        afinacao: instrumento.afinacao,
        clavePrincipal: instrumento.clavePrincipal,
        clavesAlternativas: instrumento.clavesAlternativas,
        transposicaoGrau: instrumento.transposicaoGrau,
        transposicaoSemitons: instrumento.transposicaoSemitons,
        transposicaoDescricao: instrumento.transposicaoDescricao,
        extensaoEscrita: instrumento.extensaoEscrita,
        observacoesTecnicas: instrumento.observacoesTecnicas,
      },
    });
  }

  const violino = await prisma.instrumento.findUniqueOrThrow({ where: { nome: 'Violino' } });
  const clarinete = await prisma.instrumento.findUniqueOrThrow({ where: { nome: 'Clarinete' } });

  const msa = await prisma.material.findFirst({ where: { tipo: 'MSA' } });
  if (msa) {
    for (const instrumento of await prisma.instrumento.findMany({ select: { id: true } })) {
      await prisma.instrumentoMaterial.upsert({
        where: { instrumentoId_materialId: { instrumentoId: instrumento.id, materialId: msa.id } },
        update: {},
        create: { instrumentoId: instrumento.id, materialId: msa.id, observacao: 'Base comum a todos os instrumentos.' },
      });
    }
  }

  // ---------------------------------------------------------------- alunos
  const alunos = [
    { nome: 'Maria Souza', email: 'maria.aluna@exemplo.org', comum: jardim, instrumento: clarinete, instrutor: instrutorNorte },
    { nome: 'João Batista', email: 'joao.aluno@exemplo.org', comum: jardim, instrumento: violino, instrutor: instrutorNorte },
    { nome: 'Pedro Alves', email: 'pedro.aluno@exemplo.org', comum: vilaNova, instrumento: violino, instrutor: null },
    { nome: 'Lucas Ferreira', email: 'lucas.aluno@exemplo.org', comum: centro, instrumento: clarinete, instrutor: instrutorSul },
  ];

  const criados = [];
  for (const dados of alunos) {
    const usuario = await criarUsuario({ nome: dados.nome, email: dados.email });
    await prisma.perfilAluno.upsert({
      where: { usuarioId: usuario.id },
      update: { comumId: dados.comum.id, instrumentoId: dados.instrumento.id, instrutorId: dados.instrutor?.id ?? null },
      create: {
        usuarioId: usuario.id, comumId: dados.comum.id, instrumentoId: dados.instrumento.id,
        instrutorId: dados.instrutor?.id ?? null, situacao: 'APROVADO', aprovadoPorId: pedagogico.id, aprovadoEm: new Date(),
        encarregadoLocalNome: 'José Encarregado Local',
        encarregadoRegionalNome: 'Antônio Encarregado Regional',
        anciaoNome: 'Benedito Ancião',
      },
    });
    await darVinculo({ usuarioId: usuario.id, papel: 'ALUNO', escopo: 'COMUM', comumId: dados.comum.id, concedidoPorId: pedagogico.id });
    criados.push(usuario);
  }

  // ------------------------------------------------------ regras pedagógicas
  const regras = [
    {
      codigo: 'A-PRE-REQUISITO-MSA', tipo: 'PRE_REQUISITO_FASES' as const,
      descricao: 'Fases 1 a 5 do MSA concluídas e aprovadas liberam os métodos específicos do instrumento.',
      parametros: { material: 'MSA', fases: [1, 2, 3, 4, 5], habilita: 'METODO_INSTRUMENTO', exigeAprovacao: true },
    },
    {
      codigo: 'B-APROVEITAMENTO-HINARIO', tipo: 'PERCENTUAL_APROVEITAMENTO' as const,
      descricao: 'Aproveitamento aprovado de 40% das unidades elegíveis do método específico libera os exercícios de '
        + 'Hinário permitidos para a etapa. Percentual definido por esta plataforma, não pelo MSA.',
      parametros: {
        percentual: 40, base: 'unidades elegíveis do método do instrumento', considerar: ['APROVADO'],
        ignorar: ['página aberta', 'tempo de tela', 'lição concluída sem aprovação'],
        pesos: 'configuráveis por atividade', contarLicaoUmaVez: true,
      },
    },
    {
      codigo: 'C-AVANCO-DE-FASE', tipo: 'APROVACAO_INSTRUTOR' as const,
      descricao: 'Avanço de fase exige pré-requisitos cumpridos, aproveitamento mínimo e aprovação do instrutor.',
      parametros: { percentual: 70, exigeAprovacaoInstrutor: true, exigePreRequisitos: true },
    },
    {
      codigo: 'D-CONCLUSAO', tipo: 'CONCLUSAO_CURSO' as const,
      descricao: 'Conclusão do curso exige todas as etapas obrigatórias, avaliações e validação final.',
      parametros: { exigeTodasAsFases: true, exigeAtividadesObrigatorias: true, exigeValidacaoFinal: true },
    },
  ];
  for (const regra of regras) {
    await prisma.regraProgressao.upsert({
      where: { codigo_versao: { codigo: regra.codigo, versao: 1 } },
      update: { descricao: regra.descricao, parametros: regra.parametros },
      create: { ...regra, versao: 1 },
    });
  }

  // ------------------------------- publicação de amostra (ato administrativo)
  const conferidas = await prisma.licao.findMany({
    where: { statusConferencia: 'CONFERIDO', statusPublicacao: 'RASCUNHO' },
    select: { id: true },
  });
  if (conferidas.length) {
    await prisma.licao.updateMany({
      where: { id: { in: conferidas.map((l) => l.id) } },
      data: { statusPublicacao: 'PUBLICADO' },
    });
    await prisma.auditoria.create({
      data: {
        usuarioId: pedagogico.id, acao: 'PUBLICAR_LICOES', entidade: 'licoes',
        depois: { quantidade: conferidas.length, criterio: 'statusConferencia = CONFERIDO', origem: 'semente' },
      },
    });
  }

  // ------------------------------------------- progresso para os painéis
  const maria = criados[0];
  const licoesPublicadas = await prisma.licao.findMany({ where: { statusPublicacao: 'PUBLICADO' }, take: 10, select: { id: true } });
  for (const [indice, licao] of licoesPublicadas.entries()) {
    await prisma.progressoLicao.upsert({
      where: { alunoId_licaoId: { alunoId: maria.id, licaoId: licao.id } },
      update: {},
      create: {
        alunoId: maria.id, licaoId: licao.id,
        estado: indice < 4 ? 'APROVADO' : indice < 6 ? 'CONCLUIDO' : 'EM_ANDAMENTO',
        iniciadoEm: new Date(), concluidoEm: indice < 6 ? new Date() : null,
        aprovadoEm: indice < 4 ? new Date() : null, aprovadoPorId: indice < 4 ? instrutorNorte.id : null,
      },
    });
  }
  await prisma.tempoDiario.upsert({
    where: { usuarioId_dia: { usuarioId: maria.id, dia: new Date(new Date().toISOString().slice(0, 10)) } },
    update: {},
    create: {
      usuarioId: maria.id, dia: new Date(new Date().toISOString().slice(0, 10)),
      segundosSessao: 3600, segundosAtivos: 2700, segundosDedicacao: 2400,
      paginasDistintas: 6, licoesIniciadas: 4, licoesConcluidas: 2,
    },
  });

  console.log(`  regiões: 2 | comuns: ${comuns.length} | instrumentos: ${listaInstrumentos.length}`);
  console.log(`  pessoas: ${criados.length + 7} | regras: ${regras.length} | lições publicadas: ${conferidas.length}`);
  console.log(`  senha de demonstração para todos: ${SENHA_DEMONSTRACAO}`);
}

principal()
  .catch((erro) => { console.error(erro); process.exit(1); })
  .finally(() => prisma.$disconnect());

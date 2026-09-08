/**
 * Semente de demonstração.
 *
 * Cria território, pessoas de cada papel, instrumentos, MÉTODOS, competências,
 * critérios por método, jornadas, turmas e um pouco de progresso — o bastante
 * para abrir os painéis e para os testes terem alvos reais em comuns, regiões
 * e métodos diferentes.
 *
 * Três métodos, de propósito, para que a plataforma não pareça feita para um:
 *   • MSA — transversal, conteúdo compartilhado com todos os instrumentos;
 *   • Melodia em Movimento — transversal, cadastrado e AINDA SEM currículo,
 *     porque o documento de origem não foi analisado; e é assim que fica,
 *     em vez de inventar estrutura;
 *   • um método de cordas de DEMONSTRAÇÃO, com estrutura fictícia declarada,
 *     três níveis de profundidade e critérios próprios — a prova de que
 *     nenhum critério do MSA cai sobre outro método.
 *
 * As senhas daqui são de demonstração e estão documentadas no README; em
 * produção, o primeiro acesso do superadministrador troca a sua.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { clienteAdministrativo } from '../src/lib/banco.ts';
import { gerarHashDeSenha } from '../src/lib/senha.ts';
import { analisadorDeIndiceEmPlanilha, analisadorDeSumarioEmTexto } from '../src/lib/metodos/analisadores/index.ts';
import { publicarCurriculo, registrarAnalise, revisarAnalise } from '../src/lib/metodos/aplicar.ts';

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

  // --------------------------------------------------------------- métodos
  //
  // Método é LINHA de tabela. Nenhum deles é privilegiado no código: o que
  // muda de um para outro são os dados abaixo — escopo, competências,
  // critérios de avaliação e currículo.

  const msa = await prisma.metodo.upsert({
    where: { codigo: 'MSA' },
    update: { escopo: 'TRANSVERSAL', conteudoCompartilhado: true },
    create: {
      codigo: 'MSA',
      nome: 'Método Simplificado de Aprendizagem Musical',
      escopo: 'TRANSVERSAL',
      descricao: 'Método de teoria e solfejo, comum a quem estuda qualquer instrumento.',
      conteudoCompartilhado: true,
      status: 'ATIVO',
      notaDireitos: 'Material de terceiros. O arquivo do método não é distribuído pela plataforma; '
        + 'apenas o índice de estudo e as referências de página. Uso mediante autorização.',
    },
  });

  // Transversal só alcança um instrumento com autorização explícita. Sem esta
  // linha, o conteúdo do MSA não apareceria na jornada de instrumento nenhum.
  const todosOsInstrumentos = await prisma.instrumento.findMany({ select: { id: true } });
  for (const instrumento of todosOsInstrumentos) {
    await prisma.metodoInstrumento.upsert({
      where: { metodoId_instrumentoId: { metodoId: msa.id, instrumentoId: instrumento.id } },
      update: {},
      create: {
        metodoId: msa.id, instrumentoId: instrumento.id, autorizadoPorId: pedagogico.id,
        observacao: 'Base teórica comum, autorizada para todos os instrumentos.',
      },
    });
  }

  // O índice do MSA é material de terceiros e não fica no repositório. Quando
  // ele estiver em dados/, a semente faz o caminho inteiro — analisar,
  // confirmar com responsável registrado, publicar o que está conferido.
  const indiceDoMsa = new URL('../dados/MSA_indice.xlsx', import.meta.url);
  const temIndiceDoMsa = existsSync(indiceDoMsa);
  const msaJaTemCurriculo = await prisma.curriculo.findFirst({ where: { metodoId: msa.id } });
  if (temIndiceDoMsa && !msaJaTemCurriculo) {
    const conteudo = await readFile(indiceDoMsa);
    const documento = await prisma.documentoMetodo.create({
      data: {
        metodoId: msa.id, nomeArquivo: 'MSA_indice.xlsx', tipoArquivo: 'XLSX',
        descricao: 'Índice de estudo em planilha. O arquivo do método não é distribuído pela plataforma.',
      },
    });
    const estrutura = analisadorDeIndiceEmPlanilha.analisar(
      { nomeArquivo: 'MSA_indice.xlsx', tipoArquivo: 'XLSX', conteudo },
      // Limites informados pelo responsável para ESTA edição do documento: o
      // que passar deles é divergência a conferir, não dado a corrigir.
      { limites: { paginasArquivo: 150, paginaImpressaMaxima: 151, exercicioMaximo: 112 } },
    );
    const analise = await registrarAnalise(prisma, {
      metodoId: msa.id, documentoId: documento.id, estrutura, origem: 'semente',
    });
    const { gravado } = await revisarAnalise(prisma, {
      analiseId: analise.id, decisao: 'CONFIRMAR', revisorId: pedagogico.id,
      parecer: 'Estrutura conferida contra o índice; divergências e pendências mantidas como estão.',
    });
    // Publica só o que está CONFERIDO: pendente e divergente ficam em rascunho.
    if (gravado) await publicarCurriculo(prisma, gravado.curriculoId);
  } else if (!temIndiceDoMsa) {
    console.warn('  dados/MSA_indice.xlsx ausente: o MSA fica cadastrado e sem currículo (ver README).');
  }

  // Cadastrado e sem currículo: o documento de origem ainda não foi analisado,
  // e a plataforma prefere um método vazio a um método inventado.
  const melodia = await prisma.metodo.upsert({
    where: { codigo: 'MEM' },
    update: {},
    create: {
      codigo: 'MEM',
      nome: 'Melodia em Movimento',
      escopo: 'TRANSVERSAL',
      descricao: 'Cadastrado. A estrutura será proposta quando o documento de origem for analisado '
        + 'e a proposta for confirmada por um responsável.',
      conteudoCompartilhado: true,
      status: 'RASCUNHO',
    },
  });
  for (const instrumento of todosOsInstrumentos) {
    await prisma.metodoInstrumento.upsert({
      where: { metodoId_instrumentoId: { metodoId: melodia.id, instrumentoId: instrumento.id } },
      update: {},
      create: {
        metodoId: melodia.id, instrumentoId: instrumento.id, autorizadoPorId: pedagogico.id,
        observacao: 'Autorização registrada; o conteúdo só aparece depois da análise do documento.',
      },
    });
  }

  // Método de instrumento, com estrutura própria de três níveis, analisada a
  // partir de um sumário em texto — outro formato, outro analisador, mesmo
  // caminho: análise → revisão humana → currículo.
  const demo = await prisma.metodo.upsert({
    where: { codigo: 'DEMO-CORDAS' },
    update: {},
    create: {
      codigo: 'DEMO-CORDAS',
      nome: 'Método de demonstração — cordas friccionadas',
      escopo: 'INSTRUMENTO',
      instrumentoId: violino.id,
      organizacao: 'Estudos Musicais (dados de demonstração)',
      descricao: 'CONTEÚDO FICTÍCIO, criado para demonstração e testes. Não reproduz método real.',
      status: 'ATIVO',
    },
  });

  const jaTemCurriculo = await prisma.curriculo.findFirst({ where: { metodoId: demo.id } });
  if (!jaTemCurriculo) {
    const conteudo = await readFile(new URL('../dados/metodo-demonstracao.md', import.meta.url));
    const documento = await prisma.documentoMetodo.create({
      data: {
        metodoId: demo.id, nomeArquivo: 'metodo-demonstracao.md', tipoArquivo: 'TXT',
        descricao: 'Sumário de demonstração, em texto.',
      },
    });
    const estrutura = analisadorDeSumarioEmTexto.analisar({
      nomeArquivo: 'metodo-demonstracao.md', tipoArquivo: 'TXT', conteudo,
    });
    const analise = await registrarAnalise(prisma, {
      metodoId: demo.id, documentoId: documento.id, estrutura, origem: 'semente',
    });
    // A confirmação é ato de gente: fica registrada com quem decidiu e quando.
    const { gravado } = await revisarAnalise(prisma, {
      analiseId: analise.id, decisao: 'CONFIRMAR', revisorId: pedagogico.id,
      parecer: 'Estrutura de demonstração conferida contra o sumário.',
    });
    if (gravado) await publicarCurriculo(prisma, gravado.curriculoId);
  }

  // Uma análise ainda EM ABERTO, para a central administrativa ter fila.
  const analisePendente = await prisma.analiseDeMetodo.findFirst({
    where: { metodoId: melodia.id, status: 'SUGERIDA' },
  });
  if (!analisePendente) {
    await registrarAnalise(prisma, {
      metodoId: melodia.id,
      estrutura: {
        analisador: 'sumario-em-texto',
        metodo: { nome: 'Melodia em Movimento' },
        unidades: [],
        avisos: [{ origem: 'semente', mensagem: 'documento de origem ainda não enviado; estrutura vazia, aguardando análise' }],
        resumo: { observacao: 'Aguardando o documento do método para propor a estrutura.' },
      },
      origem: 'semente',
    });
  }

  // ----------------------------------------------- competências por método
  //
  // Cada método define as suas. Não há lista fixa no código, e a lista de um
  // não vale para o outro.
  const competencias = [
    { metodoId: msa.id, codigo: 'LEITURA', nome: 'Leitura à primeira vista', ordem: 1, peso: 2 },
    { metodoId: msa.id, codigo: 'SOLFEJO', nome: 'Solfejo e afinação vocal', ordem: 2, peso: 2 },
    { metodoId: msa.id, codigo: 'RITMO', nome: 'Precisão rítmica', ordem: 3, peso: 2 },
    { metodoId: msa.id, codigo: 'TEORIA', nome: 'Teoria aplicada', ordem: 4, peso: 1 },
    { metodoId: demo.id, codigo: 'POSTURA', nome: 'Postura e sustentação do instrumento', ordem: 1, peso: 3 },
    { metodoId: demo.id, codigo: 'ARCO', nome: 'Condução do arco', ordem: 2, peso: 3 },
    { metodoId: demo.id, codigo: 'AFINACAO', nome: 'Afinação da mão esquerda', ordem: 3, peso: 2 },
    { metodoId: demo.id, codigo: 'LEITURA', nome: 'Leitura aplicada ao instrumento', ordem: 4, peso: 1 },
  ];
  for (const competencia of competencias) {
    await prisma.competencia.upsert({
      where: { metodoId_codigo: { metodoId: competencia.metodoId, codigo: competencia.codigo } },
      update: { nome: competencia.nome, ordem: competencia.ordem, peso: competencia.peso },
      create: competencia,
    });
  }

  // ---------------------------------------------- critérios por método
  //
  // É aqui que o isolamento pedagógico deixa de ser promessa: o percentual do
  // MSA vale para o MSA; o método de cordas tem o seu, diferente, e exige
  // aprovação do instrutor que o outro não exige.
  const configuracoes = [
    { metodoId: msa.id, chave: 'PERCENTUAL_DE_APROVEITAMENTO' as const, valor: { percentual: 40, base: 'unidades elegíveis do método' },
      descricao: 'Regra desta plataforma, definida pelos seus responsáveis — não é determinação do MSA.' },
    { metodoId: msa.id, chave: 'NOTA_MINIMA' as const, valor: { percentual: 70 }, descricao: 'Nota mínima nas avaliações do método.' },
    { metodoId: msa.id, chave: 'QUESTOES_POR_AVALIACAO' as const, valor: { quantidade: 10 }, descricao: null },
    { metodoId: msa.id, chave: 'TENTATIVAS_MAXIMAS' as const, valor: { quantidade: 3 }, descricao: null },
    { metodoId: msa.id, chave: 'EXIGE_APROVACAO_INSTRUTOR' as const, valor: { exige: true, etapas: ['avanço de unidade'] }, descricao: null },
    { metodoId: demo.id, chave: 'PERCENTUAL_DE_APROVEITAMENTO' as const, valor: { percentual: 60, base: 'unidades elegíveis do método' },
      descricao: 'Critério próprio do método de cordas. Não herda o percentual de nenhum outro método.' },
    { metodoId: demo.id, chave: 'NOTA_MINIMA' as const, valor: { percentual: 60 }, descricao: null },
    { metodoId: demo.id, chave: 'QUESTOES_POR_AVALIACAO' as const, valor: { quantidade: 6 }, descricao: null },
    { metodoId: demo.id, chave: 'EXIGE_APROVACAO_INSTRUTOR' as const, valor: { exige: true, etapas: ['toda a avaliação prática'] },
      descricao: 'Execução instrumental é avaliada por pessoa, sempre.' },
    { metodoId: demo.id, chave: 'PESOS_DE_COMPETENCIA' as const, valor: { POSTURA: 3, ARCO: 3, AFINACAO: 2, LEITURA: 1 }, descricao: null },
  ];
  for (const configuracao of configuracoes) {
    await prisma.configuracaoDoMetodo.upsert({
      where: { metodoId_chave_versao: { metodoId: configuracao.metodoId, chave: configuracao.chave, versao: 1 } },
      update: { valor: configuracao.valor, descricao: configuracao.descricao },
      create: { ...configuracao, versao: 1 },
    });
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
      codigo: 'A-PRE-REQUISITO-BASE', tipo: 'PRE_REQUISITO_FASES' as const,
      descricao: 'Concluir e ter aprovadas as unidades iniciais do método de base libera os métodos '
        + 'específicos do instrumento. Quais são o método de base e as unidades vem dos parâmetros, '
        + 'não do código.',
      parametros: { metodo: 'MSA', unidades: ['1', '2', '3', '4', '5'], habilita: 'METODO_DO_INSTRUMENTO', exigeAprovacao: true },
    },
    {
      codigo: 'B-APROVEITAMENTO-REPERTORIO', tipo: 'PERCENTUAL_APROVEITAMENTO' as const,
      descricao: 'Aproveitamento aprovado no método específico libera o repertório permitido para a etapa. '
        + 'O percentual vem da configuração do método (PERCENTUAL_DE_APROVEITAMENTO) — 40% no MSA, por '
        + 'decisão desta plataforma e não do método, e 60% no método de cordas.',
      parametros: {
        percentual: 'ConfiguracaoDoMetodo.PERCENTUAL_DE_APROVEITAMENTO',
        base: 'unidades elegíveis do próprio método', considerar: ['APROVADO'],
        ignorar: ['página aberta', 'tempo de tela', 'lição concluída sem aprovação'],
        pesos: 'configuráveis por atividade', contarLicaoUmaVez: true,
      },
    },
    {
      codigo: 'C-AVANCO-DE-UNIDADE', tipo: 'APROVACAO_INSTRUTOR' as const,
      descricao: 'Avanço de unidade (fase, módulo ou nível — o que o método usar) exige pré-requisitos '
        + 'cumpridos, aproveitamento mínimo e aprovação do instrutor quando o método a exigir.',
      parametros: {
        percentual: 'ConfiguracaoDoMetodo.NOTA_MINIMA',
        exigeAprovacaoInstrutor: 'ConfiguracaoDoMetodo.EXIGE_APROVACAO_INSTRUTOR',
        exigePreRequisitos: true,
      },
    },
    {
      codigo: 'D-CONCLUSAO', tipo: 'CONCLUSAO_CURSO' as const,
      descricao: 'Conclusão de uma jornada exige todas as unidades obrigatórias do método, as avaliações '
        + 'e a validação final.',
      parametros: { exigeTodasAsUnidades: true, exigeAtividadesObrigatorias: true, exigeValidacaoFinal: true },
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
  //
  // A importação nunca publica. Aqui, na semente, quem publica é a
  // administração pedagógica, e só o que está CONFERIDO.
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

  // -------------------------------------------------------------- jornadas
  //
  // Um aluno, várias jornadas ao mesmo tempo: a teoria comum num método e o
  // instrumento noutro, cada uma com currículo e progresso próprios.
  const curriculoDoMsa = await prisma.curriculo.findFirst({
    where: { metodoId: msa.id }, orderBy: { versao: 'desc' },
  });
  const curriculoDoDemo = await prisma.curriculo.findFirst({
    where: { metodoId: demo.id }, orderBy: { versao: 'desc' },
  });

  const abrirJornada = async (dados: {
    alunoId: string; metodoId: string; curriculoId: string; instrumentoId?: string | null;
  }) => {
    const primeira = await prisma.unidadeCurricular.findFirst({
      where: { curriculoId: dados.curriculoId, paiId: null }, orderBy: { ordem: 'asc' },
    });
    // Sem `upsert`: a chave única tem campo anulável (método transversal não
    // tem instrumento), e o Prisma não aceita nulo em chave composta.
    const existente = await prisma.jornadaDoAluno.findFirst({
      where: { alunoId: dados.alunoId, metodoId: dados.metodoId, instrumentoId: dados.instrumentoId ?? null },
    });
    if (existente) {
      return prisma.jornadaDoAluno.update({
        where: { id: existente.id }, data: { curriculoId: dados.curriculoId },
      });
    }
    return prisma.jornadaDoAluno.create({
      data: {
        alunoId: dados.alunoId, metodoId: dados.metodoId, curriculoId: dados.curriculoId,
        instrumentoId: dados.instrumentoId ?? null, unidadeAtualId: primeira?.id ?? null, status: 'ATIVA',
      },
    });
  };

  const jornadas: Record<string, string> = {};
  for (const [indice, dados] of alunos.entries()) {
    const aluno = criados[indice];
    if (curriculoDoMsa) {
      const jornada = await abrirJornada({ alunoId: aluno.id, metodoId: msa.id, curriculoId: curriculoDoMsa.id });
      jornadas[`${aluno.id}|MSA`] = jornada.id;
    }
    // Só quem toca o instrumento do método específico entra na jornada dele.
    if (curriculoDoDemo && dados.instrumento.id === violino.id) {
      const jornada = await abrirJornada({
        alunoId: aluno.id, metodoId: demo.id, curriculoId: curriculoDoDemo.id, instrumentoId: violino.id,
      });
      jornadas[`${aluno.id}|DEMO`] = jornada.id;
    }
  }

  // ----------------------------------------------------------------- turmas
  //
  // Turma é instrumento + método + unidade + instrutor + localidade.
  const turmas = [
    {
      nome: 'Violino — iniciação (Jardim Aeroporto)', comumId: jardim.id, instrumentoId: violino.id,
      metodoId: demo.id, instrutorId: instrutorNorte.id, curriculoId: curriculoDoDemo?.id,
    },
    {
      nome: 'Teoria comum (Jardim Aeroporto)', comumId: jardim.id, instrumentoId: null,
      metodoId: msa.id, instrutorId: instrutorNorte.id, curriculoId: curriculoDoMsa?.id,
    },
    {
      nome: 'Teoria comum (Centro)', comumId: centro.id, instrumentoId: null,
      metodoId: msa.id, instrutorId: instrutorSul.id, curriculoId: curriculoDoMsa?.id,
    },
  ];

  let turmasCriadas = 0;
  for (const dados of turmas) {
    const jaExiste = await prisma.turma.findFirst({ where: { nome: dados.nome, comumId: dados.comumId } });
    const unidade = dados.curriculoId
      ? await prisma.unidadeCurricular.findFirst({ where: { curriculoId: dados.curriculoId, paiId: null }, orderBy: { ordem: 'asc' } })
      : null;
    const turma = jaExiste ?? await prisma.turma.create({
      data: {
        nome: dados.nome, comumId: dados.comumId, instrumentoId: dados.instrumentoId,
        metodoId: dados.metodoId, unidadeId: unidade?.id ?? null, instrutorId: dados.instrutorId,
        inicioEm: new Date(),
      },
    });
    if (!jaExiste) turmasCriadas++;

    for (const [indice, aluno] of alunos.entries()) {
      if (aluno.comum.id !== dados.comumId) continue;
      if (dados.instrumentoId && aluno.instrumento.id !== dados.instrumentoId) continue;
      const usuario = criados[indice];
      const chave = dados.metodoId === msa.id ? `${usuario.id}|MSA` : `${usuario.id}|DEMO`;
      await prisma.matriculaEmTurma.upsert({
        where: { turmaId_alunoId: { turmaId: turma.id, alunoId: usuario.id } },
        update: {},
        create: { turmaId: turma.id, alunoId: usuario.id, jornadaId: jornadas[chave] ?? null },
      });
    }
  }

  // ------------------------------------------- progresso para os painéis
  const maria = criados[0];
  const licoesPublicadas = await prisma.licao.findMany({
    where: { statusPublicacao: 'PUBLICADO', metodoId: msa.id }, take: 10,
    orderBy: { ordemPedagogica: 'asc' }, select: { id: true },
  });
  for (const [indice, licao] of licoesPublicadas.entries()) {
    await prisma.progressoLicao.upsert({
      where: { alunoId_licaoId: { alunoId: maria.id, licaoId: licao.id } },
      update: {},
      create: {
        alunoId: maria.id, licaoId: licao.id, jornadaId: jornadas[`${maria.id}|MSA`] ?? null,
        estado: indice < 4 ? 'APROVADO' : indice < 6 ? 'CONCLUIDO' : 'EM_ANDAMENTO',
        iniciadoEm: new Date(), concluidoEm: indice < 6 ? new Date() : null,
        aprovadoEm: indice < 4 ? new Date() : null, aprovadoPorId: indice < 4 ? instrutorNorte.id : null,
      },
    });
  }

  // João toca violino: tem as duas jornadas, e o progresso de uma não mexe na outra.
  const joao = criados[1];
  const licoesDoDemo = await prisma.licao.findMany({
    where: { statusPublicacao: 'PUBLICADO', metodoId: demo.id }, take: 6,
    orderBy: { ordemPedagogica: 'asc' }, select: { id: true },
  });
  for (const [indice, licao] of licoesDoDemo.entries()) {
    await prisma.progressoLicao.upsert({
      where: { alunoId_licaoId: { alunoId: joao.id, licaoId: licao.id } },
      update: {},
      create: {
        alunoId: joao.id, licaoId: licao.id, jornadaId: jornadas[`${joao.id}|DEMO`] ?? null,
        estado: indice < 3 ? 'APROVADO' : 'EM_ANDAMENTO',
        iniciadoEm: new Date(), concluidoEm: indice < 3 ? new Date() : null,
        aprovadoEm: indice < 3 ? new Date() : null, aprovadoPorId: indice < 3 ? instrutorNorte.id : null,
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
  console.log(`  métodos: ${[msa, melodia, demo].map((m) => m.codigo).join(', ')} `
    + `| competências: ${competencias.length} | critérios por método: ${configuracoes.length}`);
  console.log(`  currículos: MSA ${curriculoDoMsa ? `v${curriculoDoMsa.versao}` : '— (importe e confirme a análise)'} `
    + `| cordas ${curriculoDoDemo ? `v${curriculoDoDemo.versao}` : '—'} | MEM — (aguardando documento)`);
  const publicadas = await prisma.licao.count({ where: { statusPublicacao: 'PUBLICADO' } });
  const emRascunho = await prisma.licao.count({ where: { statusPublicacao: 'RASCUNHO' } });
  console.log(`  pessoas: ${criados.length + 7} | regras: ${regras.length}`);
  console.log(`  lições publicadas: ${publicadas} | em rascunho, aguardando conferência: ${emRascunho}`);
  console.log(`  jornadas: ${Object.keys(jornadas).length} | turmas novas: ${turmasCriadas}`);
  console.log(`  senha de demonstração para todos: ${SENHA_DEMONSTRACAO}`);
}

principal()
  .catch((erro) => { console.error(erro); process.exit(1); })
  .finally(() => prisma.$disconnect());

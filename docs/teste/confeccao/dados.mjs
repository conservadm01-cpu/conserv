/**
 * O conteúdo da base de teste: uma confecção pequena inteira, do almoxarifado
 * ao apontamento do chão de fábrica.
 *
 * Os números são plausíveis para uma confecção deste porte — consumo por peça,
 * salário, tempo de operação, preço de tecido — mas são exemplo, não dado real.
 * Nomes de pessoas, clientes e fornecedores são fictícios.
 */

/* ------------------------------------------------------------ pessoas */

export const COLABORADORES = [
  { nome: 'Ana Paula Ribeiro', funcoes: ['Administradora do sistema'], perfil: 'Administrador',
    departamento: '', salario: 5200, produtivo: false, admissao: -2200 },
  { nome: 'Marcos Andrade', funcoes: ['Supervisor de produção'], perfil: 'Gestor',
    departamento: '', salario: 4600, produtivo: false, admissao: -1500 },
  { nome: 'Helena Vasques', funcoes: ['Analista de PCP'], perfil: 'Gestor',
    departamento: '', salario: 3800, produtivo: false, admissao: -900 },

  { nome: 'José Carlos Lima', funcoes: ['Cortador'], departamento: 'Corte', salario: 2750,
    admissao: -1800, maquinas: ['Cortadeira vertical 8"', 'Mesa de enfesto'] },
  { nome: 'Rita Nogueira', funcoes: ['Enfestadeira'], departamento: 'Corte', salario: 2280,
    admissao: -1200, maquinas: ['Mesa de enfesto'] },
  { nome: 'Fernando Dias', funcoes: ['Gravador', 'Estampador'], departamento: 'Estamparia',
    salario: 2650, admissao: -1450, maquinas: ['Carrossel silk 6 cores', 'Prensa térmica 40x50'] },
  { nome: 'Camila Souza', funcoes: ['Bordadeira'], departamento: 'Bordado', salario: 2540,
    admissao: -700, maquinas: ['Bordadeira 6 cabeças'] },
  { nome: 'Vera Lúcia Martins', funcoes: ['Auxiliar de preparação'], departamento: 'Preparação',
    salario: 1980, admissao: -500, maquinas: ['Prensa de entretela'] },

  { nome: 'Maria Helena Rocha', funcoes: ['Costureira'], departamento: 'Costura', salario: 2420,
    admissao: -2600, maquinas: ['Reta 01', 'Reta 02', 'Overloque 01', 'Galoneira 01'] },
  { nome: 'Sandra Regina Alves', funcoes: ['Costureira'], departamento: 'Costura', salario: 2380,
    admissao: -1900, maquinas: ['Reta 02', 'Reta 03', 'Overloque 01'] },
  { nome: 'Juliana Prado', funcoes: ['Costureira'], departamento: 'Costura', salario: 2180,
    admissao: -640, maquinas: ['Reta 03', 'Overloque 02'] },
  { nome: 'Cleide Barbosa', funcoes: ['Costureira'], departamento: 'Costura', salario: 2310,
    admissao: -1100, maquinas: ['Overloque 01', 'Overloque 02', 'Travete 01'] },
  { nome: 'Antônia Ferreira', funcoes: ['Costureira'], departamento: 'Costura', salario: 2050,
    admissao: -260, maquinas: ['Reta 01', 'Galoneira 01'] },

  { nome: 'Patrícia Gomes', funcoes: ['Revisora'], departamento: 'Acabamento', salario: 2090,
    admissao: -820, maquinas: [] },
  { nome: 'Débora Nunes', funcoes: ['Inspetora de qualidade'], departamento: 'Qualidade',
    salario: 2260, admissao: -1340, maquinas: [] },
  { nome: 'Silvana Teixeira', funcoes: ['Embaladora'], departamento: 'Embalagem', salario: 1920,
    admissao: -430, maquinas: [] },
  { nome: 'Roberto Antunes', funcoes: ['Auxiliar de expedição'], departamento: 'Embalagem',
    salario: 2040, admissao: -980, maquinas: [] },
];

/* ---------------------------------------------------------- máquinas */

export const EQUIPAMENTOS = [
  { nome: 'Cortadeira vertical 8"', tipo: 'maquina', departamento: 'Corte', marca: 'Bonfanti', patrimonio: 'PAT-0101' },
  { nome: 'Mesa de enfesto', tipo: 'movel', departamento: 'Corte', marca: 'Própria', patrimonio: 'PAT-0102' },
  { nome: 'Carrossel silk 6 cores', tipo: 'maquina', departamento: 'Estamparia', marca: 'Metalnox', patrimonio: 'PAT-0201' },
  { nome: 'Prensa térmica 40x50', tipo: 'maquina', departamento: 'Estamparia', marca: 'Metalnox', patrimonio: 'PAT-0202' },
  { nome: 'Bordadeira 6 cabeças', tipo: 'maquina', departamento: 'Bordado', marca: 'Sinsim', patrimonio: 'PAT-0301' },
  { nome: 'Prensa de entretela', tipo: 'maquina', departamento: 'Preparação', marca: 'Hashima', patrimonio: 'PAT-0401' },
  { nome: 'Reta 01', tipo: 'maquina', departamento: 'Costura', marca: 'Singer', patrimonio: 'PAT-0501' },
  { nome: 'Reta 02', tipo: 'maquina', departamento: 'Costura', marca: 'Singer', patrimonio: 'PAT-0502' },
  { nome: 'Reta 03', tipo: 'maquina', departamento: 'Costura', marca: 'Jack', patrimonio: 'PAT-0503' },
  { nome: 'Overloque 01', tipo: 'maquina', departamento: 'Costura', marca: 'Yamata', patrimonio: 'PAT-0504' },
  { nome: 'Overloque 02', tipo: 'maquina', departamento: 'Costura', marca: 'Yamata', patrimonio: 'PAT-0505' },
  { nome: 'Galoneira 01', tipo: 'maquina', departamento: 'Costura', marca: 'Kansai', patrimonio: 'PAT-0506' },
  { nome: 'Travete 01', tipo: 'maquina', departamento: 'Costura', marca: 'Jack', patrimonio: 'PAT-0507' },
  { nome: 'Ferro a vapor industrial', tipo: 'maquina', departamento: 'Acabamento', marca: 'Sinsim', patrimonio: 'PAT-0601' },
  { nome: 'Detector de agulha', tipo: 'maquina', departamento: 'Qualidade', marca: 'Hashima', patrimonio: 'PAT-0701' },
];

/* -------------------------------------------------------- fornecedores */

export const FORNECEDORES = [
  { nome: 'TECELAGEM SANTA CLARA LTDA', fantasia: 'Santa Clara', documento: '12.345.678/0001-90',
    contato: 'Wagner', telefone: '(11) 3555-0110', categoria: 'Tecidos',
    condicaoPagamento: '28 dias', cidade: 'Americana', uf: 'SP' },
  { nome: 'AVIAMENTOS SÃO PAULO COMÉRCIO LTDA', fantasia: 'Aviamentos SP', documento: '23.456.789/0001-01',
    contato: 'Cida', telefone: '(11) 3333-0220', categoria: 'Aviamentos',
    condicaoPagamento: '21 dias', cidade: 'São Paulo', uf: 'SP' },
  { nome: 'EMBALAGENS RÁPIDAS INDÚSTRIA LTDA', fantasia: 'Embalagens Rápidas', documento: '34.567.890/0001-12',
    contato: 'Douglas', telefone: '(19) 3777-0330', categoria: 'Embalagens',
    condicaoPagamento: '14 dias', cidade: 'Limeira', uf: 'SP' },
  { nome: 'CROMATEX TINTAS E INSUMOS LTDA', fantasia: 'Cromatex', documento: '45.678.901/0001-23',
    contato: 'Eliane', telefone: '(11) 2444-0440', categoria: 'Estamparia',
    condicaoPagamento: '30 dias', cidade: 'Guarulhos', uf: 'SP' },
  { nome: 'OFICINA DE COSTURA DONA MARIA ME', fantasia: 'Oficina Dona Maria', documento: '56.789.012/0001-34',
    contato: 'Maria de Fátima', telefone: '(19) 99888-0550', categoria: 'Facção',
    tipoFornecimento: 'Serviço', servicos: ['Costura'], valorPecaPadrao: 3.4,
    condicaoPagamento: '7 dias', cidade: 'Piracicaba', uf: 'SP' },
  { nome: 'BORDADOS LINHA FINA EIRELI', fantasia: 'Linha Fina', documento: '67.890.123/0001-45',
    contato: 'Anderson', telefone: '(19) 3444-0660', categoria: 'Facção',
    tipoFornecimento: 'Serviço', servicos: ['Bordado'], valorPecaPadrao: 2.1,
    condicaoPagamento: '14 dias', cidade: 'Rio Claro', uf: 'SP' },
];

/* ------------------------------------------------------------ clientes */

export const CLIENTES = [
  { nome: 'REDE HOSPITALAR SÃO LUCAS S/A', fantasia: 'Hospital São Lucas', documento: '78.901.234/0001-56',
    responsavel: 'Carla Menezes', telefone: '(11) 3030-1010', email: 'compras@saolucas.com.br',
    cidade: 'Campinas', uf: 'SP' },
  { nome: 'PANIFICADORA PÃO DOURADO LTDA', fantasia: 'Pão Dourado', documento: '89.012.345/0001-67',
    responsavel: 'Sérgio Bueno', telefone: '(19) 3232-2020', email: 'sergio@paodourado.com.br',
    cidade: 'Piracicaba', uf: 'SP' },
  { nome: 'SUPERMERCADOS BOM PREÇO LTDA', fantasia: 'Bom Preço', documento: '90.123.456/0001-78',
    responsavel: 'Adriana Pires', telefone: '(19) 3434-3030', email: 'adriana@bompreco.com.br',
    cidade: 'Limeira', uf: 'SP' },
  { nome: 'INDÚSTRIA METALÚRGICA FERRAZ S/A', fantasia: 'Metalúrgica Ferraz', documento: '01.234.567/0001-89',
    responsavel: 'Paulo Ferraz', telefone: '(11) 4545-4040', email: 'suprimentos@ferraz.ind.br',
    cidade: 'Sorocaba', uf: 'SP' },
  { nome: 'COLÉGIO NOVO HORIZONTE EDUCACIONAL LTDA', fantasia: 'Colégio Novo Horizonte',
    documento: '11.222.333/0001-44', responsavel: 'Luciana Prates', telefone: '(19) 3535-5050',
    email: 'secretaria@novohorizonte.edu.br', cidade: 'Rio Claro', uf: 'SP' },
  { nome: 'RESTAURANTE SABOR DA TERRA LTDA', fantasia: 'Sabor da Terra', documento: '22.333.444/0001-55',
    responsavel: 'Joel Martins', telefone: '(19) 3636-6060', email: 'joel@sabordaterra.com.br',
    cidade: 'Americana', uf: 'SP' },
  { nome: 'CLÍNICA ODONTOLÓGICA SORRIA MAIS ME', fantasia: 'Sorria Mais', documento: '33.444.555/0001-66',
    responsavel: 'Dra. Renata Kim', telefone: '(11) 3737-7070', email: 'contato@sorriamais.com.br',
    cidade: 'São Paulo', uf: 'SP' },
  { nome: 'TRANSPORTADORA CAMINHO CERTO LTDA', fantasia: 'Caminho Certo', documento: '44.555.666/0001-77',
    responsavel: 'Wilson Tavares', telefone: '(19) 3838-8080', email: 'wilson@caminhocerto.com.br',
    cidade: 'Campinas', uf: 'SP' },
];

/* ----------------------------------------------------------- materiais
   grupo: 'Grupo > Subgrupo', como o cadastro padrão do sistema já traz.
   entrada: quanto entrou no estoque na carga inicial de compra. */

export const MATERIAIS = [
  { nome: 'MALHA PV 30/1 AZUL MARINHO', grupo: 'Tecidos > Malha', unidade: 'KG', custo: 42.9,
    minimo: 80, entrada: 420, fornecedor: 'Santa Clara', cor: 'Azul marinho', gramatura: '160',
    largura: '1,80', composicao: '67% poliéster / 33% viscose', localizacao: 'A-01' },
  { nome: 'MALHA 100% ALGODÃO BRANCA', grupo: 'Tecidos > Malha', unidade: 'KG', custo: 46.5,
    minimo: 60, entrada: 300, fornecedor: 'Santa Clara', cor: 'Branco', gramatura: '150',
    largura: '1,80', composicao: '100% algodão', localizacao: 'A-02' },
  { nome: 'OXFORD BRANCO', grupo: 'Tecidos > Oxford', unidade: 'M', custo: 9.8,
    minimo: 300, entrada: 1200, fornecedor: 'Santa Clara', cor: 'Branco', largura: '1,50',
    composicao: '100% poliéster', localizacao: 'A-03' },
  { nome: 'BRIM SARJA AZUL', grupo: 'Tecidos > Brim', unidade: 'M', custo: 18.4,
    minimo: 200, entrada: 1400, fornecedor: 'Santa Clara', cor: 'Azul', largura: '1,60',
    composicao: '100% algodão', localizacao: 'A-04' },
  { nome: 'MICROFIBRA BRANCA', grupo: 'Tecidos > Microfibra', unidade: 'M', custo: 14.6,
    minimo: 150, entrada: 700, fornecedor: 'Santa Clara', cor: 'Branco', largura: '1,50',
    composicao: '100% poliéster', localizacao: 'A-05' },
  { nome: 'TNT 40G BRANCO', grupo: 'Tecidos > TNT', unidade: 'M', custo: 2.3,
    minimo: 400, entrada: 2400, fornecedor: 'Santa Clara', cor: 'Branco', largura: '1,40',
    localizacao: 'A-06' },
  { nome: 'GABARDINE CINZA', grupo: 'Tecidos > Tecido plano', unidade: 'M', custo: 15.9,
    minimo: 200, entrada: 850, fornecedor: 'Santa Clara', cor: 'Cinza', largura: '1,50',
    localizacao: 'A-07' },
  { nome: 'FORRO POLIÉSTER BRANCO', grupo: 'Tecidos > Forro', unidade: 'M', custo: 6.9,
    minimo: 150, entrada: 600, fornecedor: 'Santa Clara', cor: 'Branco', localizacao: 'A-08' },

  { nome: 'LINHA 120 POLIÉSTER CONE 5000M', grupo: 'Aviamentos > Linhas', unidade: 'UN', custo: 9.4,
    minimo: 60, entrada: 260, fornecedor: 'Aviamentos SP', localizacao: 'B-01' },
  /* entrada curta de propósito: fica abaixo do mínimo depois da OP da bolsa,
     que é o caso que a tela de reposição existe para mostrar */
  { nome: 'ZÍPER 20CM NYLON', grupo: 'Aviamentos > Zíperes', unidade: 'UN', custo: 1.85,
    minimo: 300, entrada: 700, fornecedor: 'Aviamentos SP', localizacao: 'B-02' },
  { nome: 'BOTÃO DE PRESSÃO 12MM', grupo: 'Aviamentos > Botões', unidade: 'UN', custo: 0.32,
    minimo: 2000, entrada: 12000, fornecedor: 'Aviamentos SP', localizacao: 'B-03' },
  { nome: 'ELÁSTICO 2CM', grupo: 'Aviamentos > Elásticos', unidade: 'M', custo: 1.1,
    minimo: 500, entrada: 3600, fornecedor: 'Aviamentos SP', localizacao: 'B-04' },
  { nome: 'VIÉS ALGODÃO 20MM', grupo: 'Aviamentos > Viés', unidade: 'M', custo: 0.85,
    minimo: 800, entrada: 5200, fornecedor: 'Aviamentos SP', localizacao: 'B-05' },
  { nome: 'ENTRETELA FUSÍVEL', grupo: 'Aviamentos > Entretela', unidade: 'M', custo: 4.2,
    minimo: 150, entrada: 620, fornecedor: 'Aviamentos SP', localizacao: 'B-06' },
  { nome: 'VELCRO 5CM', grupo: 'Aviamentos > Velcro', unidade: 'M', custo: 3.6,
    minimo: 100, entrada: 380, fornecedor: 'Aviamentos SP', localizacao: 'B-07' },

  { nome: 'TINTA BASE ÁGUA BRANCA', grupo: 'Estamparia > Tintas', unidade: 'KG', custo: 62,
    minimo: 12, entrada: 25, fornecedor: 'Cromatex', localizacao: 'C-01' },
  { nome: 'TINTA PLASTISOL PRETA', grupo: 'Estamparia > Tintas', unidade: 'KG', custo: 78.5,
    minimo: 10, entrada: 44, fornecedor: 'Cromatex', localizacao: 'C-02' },
  { nome: 'TELA SILK 120 FIOS', grupo: 'Estamparia > Telas', unidade: 'UN', custo: 48,
    minimo: 8, entrada: 30, fornecedor: 'Cromatex', localizacao: 'C-03' },
  { nome: 'EMULSÃO FOTOSSENSÍVEL', grupo: 'Estamparia > Emulsão', unidade: 'KG', custo: 96,
    minimo: 3, entrada: 12, fornecedor: 'Cromatex', localizacao: 'C-04' },
  { nome: 'FILME DTF 60CM', grupo: 'Estamparia > DTF', unidade: 'M', custo: 7.4,
    minimo: 100, entrada: 460, fornecedor: 'Cromatex', localizacao: 'C-05' },

  { nome: 'SACO PLÁSTICO 30X40', grupo: 'Embalagens > Sacos', unidade: 'UN', custo: 0.19,
    minimo: 3000, entrada: 22000, fornecedor: 'Embalagens Rápidas', localizacao: 'D-01' },
  { nome: 'CAIXA PAPELÃO 40X30X25', grupo: 'Embalagens > Caixas', unidade: 'UN', custo: 3.85,
    minimo: 200, entrada: 900, fornecedor: 'Embalagens Rápidas', localizacao: 'D-02' },
  { nome: 'ETIQUETA BORDADA CONSERV', grupo: 'Embalagens > Etiquetas', unidade: 'UN', custo: 0.26,
    minimo: 2000, entrada: 16000, fornecedor: 'Aviamentos SP', localizacao: 'D-03' },
  { nome: 'TAG PAPEL CARTÃO', grupo: 'Embalagens > Tags', unidade: 'UN', custo: 0.11,
    minimo: 3000, entrada: 12000, fornecedor: 'Embalagens Rápidas', localizacao: 'D-04' },
  { nome: 'FITA ADESIVA 48MM', grupo: 'Embalagens > Fitas', unidade: 'UN', custo: 4.9,
    minimo: 60, entrada: 240, fornecedor: 'Embalagens Rápidas', localizacao: 'D-05' },

  { nome: 'LUVA DE MALHA PIGMENTADA', grupo: 'Consumo interno > EPI', unidade: 'PAR', custo: 3.2,
    minimo: 50, entrada: 200, fornecedor: 'Embalagens Rápidas', localizacao: 'E-01' },
  { nome: 'ÓLEO LUBRIFICANTE PARA MÁQUINA', grupo: 'Consumo interno > Manutenção', unidade: 'L',
    custo: 24, minimo: 6, entrada: 24, fornecedor: 'Aviamentos SP', localizacao: 'E-02' },
];

/* ------------------------------------------------------------ produtos
   tecidos: [material, consumo por peça]
   processo: [departamento, etapa, minutos, modo, pessoas, materiais da etapa] */

export const PRODUTOS = [
  {
    grupo: 'Avental', tipo: 'Liso', complemento: 'COZINHA INDUSTRIAL',
    medida: { formato: 'unico' }, preco: 52.9, status: 'liberado',
    observacao: 'Avental de cozinha com bolso frontal e tiras de amarrar.',
    tecidos: [
      ['BRIM SARJA AZUL', 1.35],
      ['VIÉS ALGODÃO 20MM', 3.2],
      ['LINHA 120 POLIÉSTER CONE 5000M', 0.02],
      ['ETIQUETA BORDADA CONSERV', 1],
      ['SACO PLÁSTICO 30X40', 1],
    ],
    processo: [
      ['Corte', 'Enfesto', 22, 'projeto', 2, ['BRIM SARJA AZUL']],
      ['Corte', 'Corte', 0.9, 'pessoa', 1, ['BRIM SARJA AZUL']],
      ['Costura', 'Pregar bolso', 2.4, 'pessoa', 1, ['LINHA 120 POLIÉSTER CONE 5000M']],
      ['Costura', 'Fechar lateral', 3.1, 'pessoa', 1, ['VIÉS ALGODÃO 20MM', 'LINHA 120 POLIÉSTER CONE 5000M']],
      ['Costura', 'Pregar etiqueta', 0.8, 'pessoa', 1, ['ETIQUETA BORDADA CONSERV']],
      ['Acabamento', 'Limpeza de linhas', 1.2, 'pessoa', 1, []],
      ['Qualidade', 'Inspeção', 0.7, 'pessoa', 1, []],
      ['Embalagem', 'Embalar', 0.6, 'pessoa', 1, ['SACO PLÁSTICO 30X40']],
    ],
  },
  {
    grupo: 'Camiseta', tipo: 'Silk', complemento: 'GOLA CARECA',
    medida: { formato: 'grade', tamanhos: ['P', 'M', 'G', 'GG'] }, preco: 27.5, status: 'liberado',
    observacao: 'Camiseta malha PV com silk de uma cor na frente.',
    tecidos: [
      ['MALHA PV 30/1 AZUL MARINHO', 0.21],
      ['LINHA 120 POLIÉSTER CONE 5000M', 0.015],
      ['TINTA BASE ÁGUA BRANCA', 0.012],
      ['ETIQUETA BORDADA CONSERV', 1],
      ['SACO PLÁSTICO 30X40', 1],
    ],
    processo: [
      ['Corte', 'Enfesto', 28, 'projeto', 2, ['MALHA PV 30/1 AZUL MARINHO']],
      ['Corte', 'Corte', 0.7, 'pessoa', 1, ['MALHA PV 30/1 AZUL MARINHO']],
      ['Estamparia', 'Preparação de tela', 35, 'projeto', 1, []],
      ['Estamparia', 'Silk', 0.9, 'pessoa', 1, ['TINTA BASE ÁGUA BRANCA']],
      ['Estamparia', 'Cura', 12, 'projeto', 1, []],
      ['Costura', 'Fechar ombro', 1.1, 'pessoa', 1, ['LINHA 120 POLIÉSTER CONE 5000M']],
      ['Costura', 'Pregar gola', 1.6, 'pessoa', 1, ['LINHA 120 POLIÉSTER CONE 5000M']],
      ['Costura', 'Colocar manga', 1.8, 'pessoa', 1, []],
      ['Costura', 'Fechar lateral', 1.5, 'pessoa', 1, []],
      ['Costura', 'Bainha da barra', 1.3, 'pessoa', 1, ['ETIQUETA BORDADA CONSERV']],
      ['Acabamento', 'Revisão', 0.8, 'pessoa', 1, []],
      ['Embalagem', 'Dobra', 0.5, 'pessoa', 1, []],
      ['Embalagem', 'Embalar', 0.4, 'pessoa', 1, ['SACO PLÁSTICO 30X40']],
    ],
  },
  {
    grupo: 'Jaleco', tipo: 'Bordado', complemento: 'MANGA LONGA',
    medida: { formato: 'grade', tamanhos: ['P', 'M', 'G', 'GG'] }, preco: 89.9, status: 'liberado',
    observacao: 'Jaleco em microfibra com botão de pressão e bordado no bolso.',
    tecidos: [
      ['MICROFIBRA BRANCA', 1.85],
      ['ENTRETELA FUSÍVEL', 0.25],
      ['BOTÃO DE PRESSÃO 12MM', 6],
      ['LINHA 120 POLIÉSTER CONE 5000M', 0.03],
      ['ETIQUETA BORDADA CONSERV', 1],
      ['SACO PLÁSTICO 30X40', 1],
    ],
    processo: [
      ['Corte', 'Enfesto', 26, 'projeto', 2, ['MICROFIBRA BRANCA']],
      ['Corte', 'Corte', 1.4, 'pessoa', 1, ['MICROFIBRA BRANCA']],
      ['Preparação', 'Fusão de entretela', 1.1, 'pessoa', 1, ['ENTRETELA FUSÍVEL']],
      ['Bordado', 'Bordado', 2.6, 'pessoa', 1, []],
      ['Costura', 'Fechar ombro', 2.2, 'pessoa', 1, ['LINHA 120 POLIÉSTER CONE 5000M']],
      ['Costura', 'Colocar manga', 3.4, 'pessoa', 1, []],
      ['Costura', 'Fechar lateral', 2.8, 'pessoa', 1, []],
      ['Costura', 'Pregar bolso', 2.1, 'pessoa', 1, ['BOTÃO DE PRESSÃO 12MM']],
      ['Acabamento', 'Passadoria', 1.9, 'pessoa', 1, []],
      ['Qualidade', 'Inspeção', 1.1, 'pessoa', 1, ['ETIQUETA BORDADA CONSERV']],
      ['Embalagem', 'Embalar', 0.7, 'pessoa', 1, ['SACO PLÁSTICO 30X40']],
    ],
  },
  {
    grupo: 'Touca', tipo: 'Liso', complemento: 'DESCARTÁVEL SANFONADA',
    medida: { formato: 'unico' }, preco: 4.6, status: 'liberado',
    observacao: 'Touca em TNT com elástico, produzida em lote grande.',
    tecidos: [
      ['TNT 40G BRANCO', 0.34],
      ['ELÁSTICO 2CM', 0.62],
      ['LINHA 120 POLIÉSTER CONE 5000M', 0.008],
    ],
    processo: [
      ['Corte', 'Enfesto', 18, 'projeto', 2, ['TNT 40G BRANCO']],
      ['Corte', 'Corte', 0.3, 'pessoa', 1, ['TNT 40G BRANCO']],
      ['Costura', 'Fechar lateral', 0.8, 'pessoa', 1, ['ELÁSTICO 2CM', 'LINHA 120 POLIÉSTER CONE 5000M']],
      ['Qualidade', 'Inspeção', 0.2, 'pessoa', 1, []],
      ['Embalagem', 'Encaixotar', 0.3, 'pessoa', 1, []],
    ],
  },
  {
    grupo: 'Bolsa', tipo: 'DTF', complemento: 'SACOLA COM ZÍPER',
    medida: { formato: 'dimensoes', largura: 40, altura: 35, profundidade: 12 },
    preco: 42.0, status: 'liberado',
    observacao: 'Sacola em oxford com fundo reforçado, zíper e estampa DTF.',
    tecidos: [
      ['OXFORD BRANCO', 0.78],
      ['FORRO POLIÉSTER BRANCO', 0.4],
      ['ZÍPER 20CM NYLON', 1],
      ['FILME DTF 60CM', 0.35],
      ['LINHA 120 POLIÉSTER CONE 5000M', 0.025],
      ['TAG PAPEL CARTÃO', 1],
    ],
    processo: [
      ['Corte', 'Enfesto', 20, 'projeto', 2, ['OXFORD BRANCO', 'FORRO POLIÉSTER BRANCO']],
      ['Corte', 'Corte', 1.1, 'pessoa', 1, ['OXFORD BRANCO']],
      ['Estamparia', 'DTF', 1.4, 'pessoa', 1, ['FILME DTF 60CM']],
      ['Costura', 'Fechar lateral', 3.6, 'pessoa', 1, ['LINHA 120 POLIÉSTER CONE 5000M']],
      ['Costura', 'Pregar bolso', 2.9, 'pessoa', 1, ['ZÍPER 20CM NYLON']],
      ['Acabamento', 'Limpeza de linhas', 1.0, 'pessoa', 1, []],
      ['Embalagem', 'Etiquetar', 0.5, 'pessoa', 1, ['TAG PAPEL CARTÃO']],
    ],
  },
  {
    /* deixado propositalmente em desenvolvimento: só abre ordem de amostra,
       que é justamente o que fecha a engenharia */
    grupo: 'Capa', tipo: 'Liso', complemento: 'PROTEÇÃO DE MÁQUINA',
    medida: { formato: 'dimensoes', largura: 120, altura: 80 }, preco: 64.0,
    status: 'desenvolvimento',
    observacao: 'Modelo novo: aguarda aprovação da amostra pelo cliente.',
    tecidos: [
      ['GABARDINE CINZA', 1.6],
      ['ELÁSTICO 2CM', 1.2],
      ['VELCRO 5CM', 0.6],
      ['LINHA 120 POLIÉSTER CONE 5000M', 0.02],
    ],
    processo: [
      ['Corte', 'Enfesto', 24, 'projeto', 2, ['GABARDINE CINZA']],
      ['Corte', 'Corte', 1.3, 'pessoa', 1, ['GABARDINE CINZA']],
      ['Costura', 'Fechar lateral', 4.2, 'pessoa', 1, ['LINHA 120 POLIÉSTER CONE 5000M']],
      ['Costura', 'Bainha da barra', 2.6, 'pessoa', 1, ['ELÁSTICO 2CM', 'VELCRO 5CM']],
      ['Qualidade', 'Inspeção', 0.9, 'pessoa', 1, []],
    ],
  },
];

/* -------------------------------------------------------------- ordens
   produto: índice em PRODUTOS · entrega: dias a partir de hoje
   avanco: fração da quantidade já apontada em cada etapa, na ordem do
   roteiro (o sistema não deixa uma etapa passar da anterior). */

export const ORDENS = [
  { produto: 0, cliente: 'Pão Dourado', quantidade: 600, entrega: -6, prioridade: 3,
    abertura: -26, avanco: [1, 1, 1, 1, 1, 1, 1, 1],
    observacao: 'Pedido recorrente do mês. Bolso com logo bordado pelo cliente.' },
  { produto: 1, cliente: 'Colégio Novo Horizonte', quantidade: 1500, entrega: 9, prioridade: 2,
    abertura: -12, avanco: [1, 1, 1, 0.8, 0.8, 0.6, 0.55, 0.45, 0.4, 0.3, 0.2, 0.1, 0.05],
    observacao: 'Camiseta do uniforme escolar — grade P/M/G/GG conforme planilha do colégio.' },
  { produto: 2, cliente: 'Hospital São Lucas', quantidade: 240, entrega: 4, prioridade: 1,
    abertura: -9, avanco: [1, 1, 1, 0.75, 0.6, 0.45, 0.3, 0.2, 0.1, 0, 0],
    observacao: 'Bordado do nome de cada profissional no bolso — conferir lista antes de bordar.' },
  { produto: 3, cliente: 'Bom Preço', quantidade: 3000, entrega: 16, prioridade: 5,
    abertura: -3, avanco: [1, 0.6, 0.3, 0, 0],
    observacao: 'Lote grande para reposição de estoque do cliente.' },
  { produto: 4, cliente: 'Metalúrgica Ferraz', quantidade: 500, entrega: 12, prioridade: 4,
    abertura: -7, avanco: [1, 1, 0.7, 0.4, 0.25, 0.1, 0],
    observacao: 'Sacola de brinde da convenção — estampa DTF em duas posições.' },
  { produto: 0, cliente: 'Sabor da Terra', quantidade: 180, entrega: -2, prioridade: 1,
    abertura: -8, avanco: [1, 0.5, 0, 0, 0, 0, 0, 0],
    observacao: 'ATRASADA: parou na costura por falta de máquina livre.' },
  { produto: 1, cliente: 'Caminho Certo', quantidade: 800, entrega: 21, prioridade: 6,
    abertura: -1, avanco: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    observacao: 'Aguardando liberação da arte pelo cliente.' },
  { produto: 2, cliente: 'Sorria Mais', quantidade: 120, entrega: 25, prioridade: 7,
    abertura: -1, avanco: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    observacao: 'Jaleco com logo da clínica; cliente pediu tecido mais leve.' },
  { produto: 5, cliente: 'Metalúrgica Ferraz', quantidade: 5, entrega: 7, prioridade: 2,
    abertura: -2, amostra: true, avanco: [1, 1, 0.6, 0, 0],
    observacao: 'AMOSTRA do modelo novo de capa — cliente aprova antes da produção.' },
];

/* -------------------------------------------------------- custos fixos */

export const CUSTOS_FIXOS = [
  { nome: 'Aluguel do barracão', tipo: 'instalacao', valorMensal: 7800 },
  { nome: 'Energia elétrica', tipo: 'instalacao', valorMensal: 3250 },
  { nome: 'Água e esgoto', tipo: 'instalacao', valorMensal: 540 },
  { nome: 'Internet e telefonia', tipo: 'administrativo', valorMensal: 420 },
  { nome: 'Contabilidade', tipo: 'administrativo', valorMensal: 1350 },
  { nome: 'Manutenção de máquinas', tipo: 'manutencao', valorMensal: 980 },
  { nome: 'Seguro do imóvel e maquinário', tipo: 'administrativo', valorMensal: 610 },
];

/* ---------------------------------------------- canal do colaborador */

export const MANIFESTACOES = [
  { categoria: 'elogio', departamento: 'Costura', anonima: false, colaborador: 'Silvana Teixeira',
    dias: -18, descricao: 'A Maria Helena parou o que estava fazendo para ensinar a regulagem da '
      + 'galoneira para a Antônia, que entrou esse mês. Ninguém pediu, ela fez.' },
  { categoria: 'sugestao', departamento: 'Embalagem', anonima: false, colaborador: 'Roberto Antunes',
    dias: -12, descricao: 'Se as caixas ficassem no carrinho ao lado da bancada em vez do corredor, '
      + 'a gente não precisava atravessar o setor a cada dez peças embaladas.',
    status: 'analise' },
  { categoria: 'problema', departamento: 'Corte', anonima: false, colaborador: 'Rita Nogueira',
    dias: -7, descricao: 'A lâmpada sobre a mesa de enfesto queimou faz duas semanas e o enfesto '
      + 'está sendo feito na penumbra. Já erramos o encaixe uma vez por causa disso.',
    status: 'encaminhado' },
  { categoria: 'risco', departamento: 'Estamparia', anonima: true, dias: -4,
    descricao: 'O extintor perto da estufa de cura está com a validade vencida. É o único extintor '
      + 'daquele canto do barracão, onde tem tinta e solvente guardados.' },
  { categoria: 'sugestao', departamento: 'Costura', anonima: true, dias: -2,
    descricao: 'Poderia ter um mural com a programação do dia para a gente saber o que vem depois '
      + 'da ordem que está na máquina, em vez de perguntar toda hora para o supervisor.' },
];

export const VAGAS = [
  { titulo: 'Costureira', departamento: 'Costura', tipo: 'Efetivo', turno: 'Manhã', vagas: 2,
    descricao: 'Costura de uniformes profissionais em reta e overloque.',
    requisitos: 'Experiência com reta e overloque industrial.', experiencia: '1 ano' },
  { titulo: 'Auxiliar de embalagem', departamento: 'Embalagem', tipo: 'Temporário',
    turno: 'Comercial', vagas: 1, descricao: 'Dobra, embalagem e conferência de pedidos.',
    requisitos: 'Ensino fundamental completo.', experiencia: 'Não exigida' },
];

export const INDICACOES = [
  { vaga: 0, candidato: 'Marli dos Santos', contato: '(19) 99777-1122', indicador: 'Maria Helena Rocha',
    relacao: 'Ex-colega de trabalho', observacao: 'Trabalhou comigo seis anos na Confecções Bela Vista.' },
  { vaga: 0, candidato: 'Eliane Tavares', contato: '(19) 99666-3344', indicador: 'Cleide Barbosa',
    relacao: 'Vizinha', observacao: 'Costura em casa há anos, quer carteira assinada.' },
  { vaga: 1, candidato: 'Diego Ramos', contato: 'diego.ramos@email.com', indicador: 'Roberto Antunes',
    relacao: 'Primo', observacao: 'Primeiro emprego, mora a dez minutos da fábrica.' },
];

export const OCORRENCIAS = [
  { tipo: 'maquina_parada', maquina: 'Overloque 02', departamento: 'Costura', dias: -3,
    minutos: 210, descricao: 'Overloque 02 travou o laçador; aguarda peça do mecânico.',
    encerrar: false },
  { tipo: 'falta_material', departamento: 'Estamparia', dias: -9, minutos: 95,
    descricao: 'Tinta base água acabou no meio do lote; parou até chegar a reposição.',
    encerrar: true },
  { tipo: 'falta', colaborador: 'Juliana Prado', departamento: 'Costura', dias: -5, minutos: 480,
    descricao: 'Falta com atestado médico de um dia.', encerrar: true },
];

/* Notas do termômetro de clima: [dias atrás, nota, departamento, comentário] */
export const CLIMA = [
  [-25, 4, 'Costura', ''],
  [-24, 5, 'Corte', 'Semana boa, deu para adiantar o enfesto.'],
  [-21, 3, 'Costura', ''],
  [-19, 4, 'Embalagem', ''],
  [-17, 2, 'Estamparia', 'Calor perto da estufa é demais à tarde.'],
  [-15, 4, 'Costura', ''],
  [-14, 5, 'Qualidade', ''],
  [-11, 3, 'Costura', 'Máquina parando atrapalha o ritmo.'],
  [-9, 4, 'Corte', ''],
  [-8, 4, 'Acabamento', ''],
  [-6, 5, 'Costura', 'O treinamento da nova ajudou todo mundo.'],
  [-5, 3, 'Embalagem', ''],
  [-3, 4, 'Costura', ''],
  [-2, 4, 'Bordado', ''],
  [-1, 5, 'Corte', ''],
];

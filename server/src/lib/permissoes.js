/**
 * Permissões por área.
 *
 * O perfil sozinho não basta: uma costureira que aponta produção não precisa
 * ver salário, e quem lança contas a pagar não precisa mexer na engenharia.
 * Cada operação sensível tem a sua chave, e o nível de acesso é só um atalho
 * para um conjunto delas — que pode ser ajustado usuário a usuário.
 */

export const AREAS = [
  {
    grupo: 'Cadastros',
    itens: [
      { id: 'cadastros.ver', nome: 'Ver clientes e fornecedores' },
      { id: 'cadastros.editar', nome: 'Criar e editar clientes e fornecedores' },
      { id: 'produtos.editar', nome: 'Criar e editar produtos' },
      { id: 'produtos.processo', nome: 'Montar a ficha técnica e o processo' },
      { id: 'produtos.custo', nome: 'Ver o custo formado do produto' },
    ],
  },
  {
    grupo: 'Pessoas',
    itens: [
      { id: 'pessoas.ver', nome: 'Ver colaboradores' },
      { id: 'pessoas.editar', nome: 'Cadastrar e editar colaboradores' },
      { id: 'pessoas.salario', nome: 'Ver e editar salários' },
      { id: 'pessoas.permissoes', nome: 'Alterar permissões de acesso' },
    ],
  },
  {
    grupo: 'Materiais',
    itens: [
      { id: 'materiais.ver', nome: 'Ver materiais e estoque' },
      { id: 'materiais.editar', nome: 'Cadastrar e editar materiais' },
      { id: 'materiais.mover', nome: 'Lançar movimentações de estoque' },
    ],
  },
  {
    grupo: 'Comercial',
    itens: [
      { id: 'crm.ver', nome: 'Ver o funil e as oportunidades' },
      { id: 'crm.editar', nome: 'Criar e mover oportunidades' },
      { id: 'orcamentos.ver', nome: 'Ver orçamentos' },
      { id: 'orcamentos.editar', nome: 'Criar e editar orçamentos' },
      { id: 'orcamentos.aprovar', nome: 'Aprovar e converter em pedido' },
    ],
  },
  {
    grupo: 'Produção',
    itens: [
      { id: 'producao.ver', nome: 'Acompanhar a produção' },
      { id: 'producao.apontar', nome: 'Apontar produção e ocorrências' },
      { id: 'producao.ordens', nome: 'Abrir e alterar ordens de produção' },
      { id: 'pedidos.ver', nome: 'Ver pedidos e carteira' },
      { id: 'pedidos.editar', nome: 'Criar e editar pedidos' },
    ],
  },
  {
    grupo: 'Engenharia',
    itens: [
      { id: 'engenharia.ver', nome: 'Ver setores, máquinas e jornada' },
      { id: 'engenharia.editar', nome: 'Editar setores e equipamentos' },
      { id: 'engenharia.jornada', nome: 'Alterar jornada, encargos e custos fixos' },
    ],
  },
  {
    grupo: 'Financeiro',
    itens: [
      { id: 'financeiro.ver', nome: 'Ver contas a pagar e a receber' },
      { id: 'financeiro.lancar', nome: 'Lançar títulos' },
      { id: 'financeiro.baixar', nome: 'Dar baixa em títulos' },
    ],
  },
  {
    grupo: 'Sistema',
    itens: [
      { id: 'canal.tratar', nome: 'Tratar manifestações da conversa aberta' },
      { id: 'importacao', nome: 'Importar planilhas' },
      { id: 'admin', nome: 'Administrar o sistema e os usuários' },
    ],
  },
];

export const TODAS = AREAS.flatMap((g) => g.itens.map((i) => i.id));

export const nomeDaArea = (id) =>
  AREAS.flatMap((g) => g.itens).find((i) => i.id === id)?.nome ?? id;

const somenteLeitura = TODAS.filter((a) => a.endsWith('.ver') || a === 'produtos.custo');

/** Níveis prontos: cada função da fábrica recebe um deles e ajusta o que faltar. */
export const NIVEIS = [
  {
    id: 'total',
    nome: 'Acesso total',
    descricao: 'Vê e altera tudo, inclusive permissões e valores sensíveis.',
    areas: TODAS,
  },
  {
    id: 'gerencial',
    nome: 'Gerencial',
    descricao: 'Administra a operação inteira, sem mexer em permissões nem em usuários.',
    areas: TODAS.filter((a) => a !== 'admin' && a !== 'pessoas.permissoes'),
  },
  {
    id: 'pcp',
    nome: 'PCP e produção',
    descricao: 'Planeja e acompanha a fábrica; não vê salário nem financeiro.',
    areas: [
      'cadastros.ver', 'produtos.editar', 'produtos.processo', 'produtos.custo',
      'pessoas.ver', 'materiais.ver', 'materiais.mover',
      'producao.ver', 'producao.apontar', 'producao.ordens',
      'pedidos.ver', 'pedidos.editar', 'engenharia.ver', 'crm.ver', 'orcamentos.ver',
    ],
  },
  {
    id: 'comercial',
    nome: 'Comercial',
    descricao: 'Cuida do funil, orça e fecha pedido; vê o custo para precificar, não a folha.',
    areas: [
      'cadastros.ver', 'cadastros.editar', 'produtos.custo',
      'crm.ver', 'crm.editar', 'orcamentos.ver', 'orcamentos.editar', 'orcamentos.aprovar',
      'pedidos.ver', 'pedidos.editar', 'producao.ver', 'materiais.ver',
    ],
  },
  {
    id: 'almoxarifado',
    nome: 'Almoxarifado',
    descricao: 'Cuida do estoque e da entrada de material.',
    areas: ['cadastros.ver', 'materiais.ver', 'materiais.editar', 'materiais.mover', 'producao.ver', 'pedidos.ver'],
  },
  {
    id: 'financeiro',
    nome: 'Financeiro',
    descricao: 'Lança e baixa títulos; vê os cadastros, não a produção.',
    areas: ['cadastros.ver', 'cadastros.editar', 'pedidos.ver', 'orcamentos.ver',
            'financeiro.ver', 'financeiro.lancar', 'financeiro.baixar'],
  },
  {
    id: 'chao_de_fabrica',
    nome: 'Chão de fábrica',
    descricao: 'Só aponta o que produziu e registra o que parou a linha.',
    areas: ['producao.ver', 'producao.apontar', 'materiais.ver'],
  },
  {
    id: 'consulta',
    nome: 'Somente consulta',
    descricao: 'Vê as informações da operação, mas não altera nada.',
    areas: somenteLeitura.filter((a) => a !== 'pessoas.ver' && a !== 'financeiro.ver'),
  },
];

export const nivelPorId = (id) => NIVEIS.find((n) => n.id === id) ?? null;

/**
 * Permissões efetivas de um usuário: o nível de acesso mais os ajustes gravados
 * na coluna `permissoes` ({"financeiro.ver": true, "pessoas.salario": false}).
 * ADMIN recebe tudo — é a trava que impede alguém trancar o próprio sistema.
 */
export function permissoesDe(usuario) {
  if (!usuario) return {};
  if (usuario.perfil === 'ADMIN') return Object.fromEntries(TODAS.map((a) => [a, true]));

  const nivel = nivelPorId(usuario.nivel_acesso) ?? nivelPorId('consulta');
  const efetivas = Object.fromEntries(TODAS.map((a) => [a, nivel.areas.includes(a)]));

  const ajustes = typeof usuario.permissoes === 'string'
    ? seguroJSON(usuario.permissoes)
    : usuario.permissoes ?? {};
  for (const [area, valor] of Object.entries(ajustes)) {
    if (area in efetivas) efetivas[area] = Boolean(valor);
  }
  return efetivas;
}

export const pode = (usuario, area) => Boolean(permissoesDe(usuario)[area]);

function seguroJSON(texto) {
  try {
    const v = JSON.parse(texto);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

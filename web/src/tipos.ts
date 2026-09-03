export type Etapa = {
  id: number; codigo: string; nome: string; ordem: number;
  consome_material: number; ativo: number;
};

export type OrdemEtapa = {
  id: number; etapa_id: number; codigo: string; nome: string; sequencia: number;
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'NAO_APLICAVEL';
  responsavel: string | null; iniciado_em: string | null; concluido_em: string | null;
  custo_mo: number; observacao: string | null; consome_material: number;
};

export type OrdemMaterial = {
  material_id: number; codigo: string | null; descricao: string; unidade: string;
  custo_unitario: number; saldo: number;
  quantidade_prevista: number; quantidade_baixada: number;
};

export type Ordem = {
  id: number; numero: string; quantidade: number; status: string;
  data_abertura: string; data_prevista: string | null; data_conclusao: string | null;
  observacao: string | null;
  cliente: string; produto: string; grupo: string | null; linha: string;
  pedido_id: number; pedido_numero: string; categoria: string | null; vendedor: string | null;
  preco_unitario: number; valor_item: number;
  etapas: OrdemEtapa[]; materiais: OrdemMaterial[];
  custo_mo_total: number; custo_material_previsto: number;
};

export type OrdemLista = {
  id: number; numero: string; quantidade: number; status: string;
  data_prevista: string | null; cliente: string; produto: string; grupo: string | null;
  pedido_numero: string; pedido_id: number; categoria: string | null; valor_item: number;
  dias_atraso: number | null; etapas_concluidas: number; etapas_total: number; etapa_atual: string | null;
};

export type ColunaQuadro = {
  etapa: Etapa;
  ordens: Array<{
    id: number; numero: string; quantidade: number; status: string; data_prevista: string | null;
    cliente: string; produto: string; grupo: string | null; pedido_numero: string;
    dias_atraso: number | null; etapa_codigo: string | null;
  }>;
};

export type Pedido = {
  id: number; numero: string; cliente: string; cliente_id: number; categoria: string | null;
  vendedor: string | null; vendedor_id: number | null;
  data_pedido: string; data_entrega: string | null; situacao: string;
  nota_fiscal: string | null; observacao: string | null;
  itens: number; pecas: number; total: number; liquidacao: number; atrasado: number;
};

export type PedidoItem = {
  id: number; produto_id: number; produto: string; descricao: string | null;
  quantidade: number; preco_unitario: number; total: number; liquidacao: number;
  data_entrega: string | null; linha: string; grupo: string | null;
  ordem_id: number | null; ordem_numero: string | null; ordem_status: string | null;
};

export type PedidoDetalhe = Omit<Pedido, 'itens'> & {
  itens: PedidoItem[]; semana_pedido: number | null; semana_entrega: number | null;
};

export type ItemCarteira = {
  item_id: number; pedido_id: number; pedido_numero: string; cliente: string; categoria: string | null;
  vendedor: string | null; produto: string; grupo: string | null; linha: string;
  quantidade: number; preco_unitario: number; total: number; liquidacao: number;
  data_pedido: string; data_entrega: string | null; situacao: string;
  ordem_id: number | null; ordem_numero: string | null; ordem_status: string | null;
  dias_atraso: number | null; semana_entrega: number | null;
};

export type Material = {
  id: number; codigo: string | null; descricao: string; tipo: string; unidade: string;
  custo_unitario: number; estoque_min: number; localizacao: string | null;
  fornecedor_id: number | null; ativo: number;
};

export type PosicaoEstoque = Material & {
  saldo: number; valor_estoque: number; abaixo_minimo: number; fornecedor: string | null;
};

export type Movimento = {
  id: number; material_id: number; material: string; unidade: string;
  tipo: 'ENTRADA' | 'SAIDA' | 'AJUSTE'; quantidade: number; custo_unitario: number;
  data: string; documento: string | null; ordem: string | null;
  fornecedor: string | null; usuario: string | null; observacao: string | null;
};

export type Necessidade = {
  id: number; codigo: string | null; descricao: string; unidade: string; custo_unitario: number;
  estoque_min: number; fornecedor: string | null; saldo: number;
  necessidade: number; comprar: number; valor_compra: number;
  primeira_entrega: string | null; ordens: number;
};

export type Produto = {
  id: number; codigo: string | null; descricao: string; grupo_id: number | null; grupo: string | null;
  linha: string; preco_padrao: number; ativo: number; itens_ficha: number;
};

export type ItemFicha = {
  id: number; material_id: number; codigo: string | null; material: string; unidade: string;
  consumo_por_peca: number; perda_percentual: number; custo_unitario: number;
  custo_por_peca: number; observacao: string | null;
};

export type CustoProcesso = {
  etapa_id: number; codigo: string; nome: string; ordem: number; custo_por_peca: number;
};

export type Cliente = {
  id: number; nome: string; categoria_id: number | null; categoria: string | null;
  cnpj: string | null; contato: string | null; email: string | null; telefone: string | null;
  cidade: string | null; uf: string | null; ativo: number;
};

export type Simples = { id: number; nome: string };
export type Fornecedor = Simples & { cnpj: string | null; contato: string | null; telefone: string | null; prazo_entrega_dias: number; ativo: number };

export type Dashboard = {
  referencia: string; ano: number;
  carteira: { itens: number; pecas: number; faturar: number; liquidar: number; pedidos: number; itens_atrasados: number; ticket_medio: number };
  por_grupo: Array<{ grupo: string; pecas: number; faturar: number; liquidar: number }>;
  vendas_mes: Array<{ mes: string; pedidos: number; pecas: number; valor: number; ticket_medio: number }>;
  vendas_categoria: Array<{ categoria: string; pedidos: number; pecas: number; valor: number }>;
  producao_etapas: Array<{ codigo: string; nome: string; sequencia: number; ordens_na_fila: number; concluidas: number; pecas_na_fila: number }>;
  custo_mo: { etapas: Array<{ codigo: string; nome: string; custo: number }>; total: number };
  atrasados: ItemCarteira[];
  entregas_semana: ItemCarteira[];
  alertas_estoque: Array<{ id: number; codigo: string | null; descricao: string; unidade: string; saldo: number; estoque_min: number; custo_unitario: number }>;
};

export type RelatorioImportacao = {
  arquivo: string; simulacao: boolean;
  abas: Array<{ aba: string; importada: boolean; motivo?: string; linhas?: number; pedidos?: number; itens?: number; ordens?: number; ignoradas?: number; duplicadas?: number }>;
  totais: { pedidos: number; itens: number; ordens: number; clientes: number; produtos: number; ignoradas: number; duplicadas: number };
  avisos: string[];
};

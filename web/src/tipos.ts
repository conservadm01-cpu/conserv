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

/* ---------- Engenharia e custeio ---------- */

export type Departamento = {
  id: number; nome: string; responsavel: string | null; produtivo: number;
  observacao: string | null; ativo: number; pessoas: number; equipamentos: number;
};

export type Equipamento = {
  id: number; nome: string; tipo: string | null; departamento_id: number | null;
  departamento: string | null; patrimonio: string | null; quantidade: number;
  status: string; observacao: string | null; ativo: number;
};

export type Colaborador = {
  id: number; nome: string; cpf: string | null; cargo: string | null;
  departamento_id: number | null; departamento: string | null; data_admissao: string | null;
  salario: number; vale_transporte: number; produtivo: number;
  telefone: string | null; email: string | null; status: string; ativo: number;
};

export type CustoFixo = {
  id: number; descricao: string; tipo: string; valor_mensal: number;
  observacao: string | null; ativo: number;
};

export type Jornada = {
  jornada_inicio: string; jornada_fim: string; intervalo_min: number; dias_semana: string;
  dias_uteis_mes: number; encargos_percentual: number; ocupacao_percentual: number;
  extensao_fim: string | null; sabado_inicio: string | null; sabado_fim: string | null;
  minutos_brutos: number; minutos_produtivos: number; minutos_extensao: number;
  minutos_sabado: number; minutos_mes: number; horas_dia: number;
};

export type CustoSetor = {
  departamento_id: number; departamento: string | null; pessoas: number; com_salario: number;
  encargos_percentual: number; dias_uteis_mes: number; minutos_mes: number;
  salario_medio: number; vale_transporte_medio?: number; folha_por_pessoa: number;
  custo_minuto: number; custo_hora: number; sem_salario: boolean; incompleto: boolean;
};

export type Capacidade = {
  pessoas: number; minutos_dia: number; dias_uteis_mes: number; ocupacao_percentual: number;
  minutos_teoricos: number; minutos_reais: number; horas_mes: number; vazia: boolean;
};

export type TaxaIndireta = {
  itens: CustoFixo[]; total: number; por_tipo: Array<{ tipo: string; valor: number }>;
  capacidade: Capacidade; por_minuto: number; por_hora: number;
  avisos: string[]; configurado: boolean;
};

export type LinhaProcesso = {
  id: number; produto_id: number; etapa_id: number; sequencia: number;
  tempo_por_peca_min: number; equipamento_id: number | null; equipamento: string | null;
  codigo: string; etapa: string; ordem_etapa: number;
  departamento_id: number | null; departamento: string | null;
  custo_minuto: number; custo_por_peca: number; pecas_por_hora: number;
  observacao: string | null;
};

export type CustoProduto = {
  produto: { id: number; descricao: string; grupo: string | null; preco_padrao: number; linha: string };
  material: number; mao_de_obra: number; indireto: number; total: number;
  minutos_por_peca: number; margem: number; margem_percentual: number;
  fatias: Array<{ nome: string; valor: number }>;
  detalhe_material: ItemFicha[];
  detalhe_processo: LinhaProcesso[];
  detalhe_indireto: { por_minuto: number; por_hora: number; capacidade: Capacidade };
  completo: boolean; avisos: string[];
};

export type CustoOrdem = {
  ordem_id: number; numero: string; produto: string; cliente: string;
  quantidade: number; produzido: number; refugo: number; minutos_apontados: number;
  receita: number; custo_material: number; custo_mao_de_obra: number; custo_indireto: number;
  custo_total: number; custo_por_peca: number; margem: number; margem_percentual: number;
};

export type Apontamento = {
  id: number; ordem_id: number; ordem: string; etapa_id: number; etapa: string;
  colaborador_id: number | null; colaborador: string | null;
  equipamento_id: number | null; equipamento: string | null;
  data: string; quantidade: number; refugo: number; minutos: number; custo_mo: number;
  observacao: string | null; produto: string; cliente: string;
};

export type Produtividade = {
  id: number; colaborador: string; departamento: string | null; apontamentos: number;
  pecas: number; refugo: number; minutos: number; custo_mo: number; pecas_hora: number;
};

export type Eficiencia = {
  id: number; departamento: string; pessoas: number; dias: number;
  minutos_produzidos: number; minutos_parados: number; minutos_disponiveis: number;
  eficiencia_percentual: number; parada_percentual: number;
};

export type Ocorrencia = {
  id: number; data: string; departamento_id: number | null; departamento: string | null;
  ordem_id: number | null; ordem: string | null; equipamento_id: number | null; equipamento: string | null;
  motivo: string; minutos_parado: number; descricao: string | null; acao: string | null; resolvida: number;
};

export type Manifestacao = {
  id: number; tipo: string; assunto: string | null; mensagem: string; autor: string | null;
  anonima: number; setor: string | null; status: string; tratativa: string | null;
  respondido_em: string | null; criado_em: string;
};

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
  cnpj: string | null; inscricao_estadual: string | null;
  contato: string | null; email: string | null; telefone: string | null;
  cep: string | null; endereco: string | null; numero: string | null;
  complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null;
  prazo_pagamento_dias: number; condicao_pagamento: string | null; limite_credito: number;
  observacao: string | null; ativo: number;
};

export type Simples = { id: number; nome: string };
export type Fornecedor = Simples & {
  cnpj: string | null; inscricao_estadual: string | null;
  contato: string | null; email: string | null; telefone: string | null;
  cep: string | null; endereco: string | null; numero: string | null; bairro: string | null;
  cidade: string | null; uf: string | null;
  prazo_entrega_dias: number; condicao_pagamento: string | null;
  observacao: string | null; ativo: number;
};

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

/* ---------- Financeiro ---------- */

export type Titulo = {
  id: number; tipo: 'RECEBER' | 'PAGAR'; descricao: string;
  categoria_id: number | null; categoria: string | null;
  cliente_id: number | null; cliente: string | null;
  fornecedor_id: number | null; fornecedor: string | null;
  parte: string | null;
  pedido_id: number | null; pedido_numero: string | null;
  documento: string | null; parcela: number; parcelas: number;
  valor: number; pago: number; saldo: number;
  emissao: string; vencimento: string; ultima_baixa: string | null;
  status: 'ABERTO' | 'PARCIAL' | 'QUITADO' | 'CANCELADO';
  dias_atraso: number; observacao: string | null;
  baixas?: Baixa[];
};

export type Baixa = {
  id: number; titulo_id: number; data: string; valor: number;
  juros: number; desconto: number; forma: string;
  conta_id: number | null; conta: string | null;
  observacao: string | null; usuario: string | null;
};

export type PosicaoFinanceira = {
  tipo: string; titulos: number; aberto: number; vencido: number;
  proximos_7: number; proximos_30: number; titulos_vencidos: number;
};

export type FaixaAging = { faixa: string; titulos: number; valor: number };

export type SemanaFluxo = {
  semana: number; inicio: string; fim: string;
  entradas: number; saidas: number; saldo: number; acumulado: number;
};

export type MesRealizado = { mes: string; recebido: number; pago: number; resultado: number };

export type LinhaRanking = {
  parte: string; titulos: number; aberto: number; vencido: number; maior_atraso: number;
};

export type ResumoFinanceiro = {
  referencia: string;
  receber: PosicaoFinanceira; pagar: PosicaoFinanceira;
  aging_receber: FaixaAging[]; aging_pagar: FaixaAging[];
  fluxo: SemanaFluxo[]; realizado: MesRealizado[];
  maiores_devedores: LinhaRanking[]; maiores_credores: LinhaRanking[];
};

export type CategoriaFinanceira = { id: number; nome: string; tipo: string; grupo: string | null; ativo: number };
export type ContaBancaria = {
  id: number; nome: string; tipo: string; banco: string | null;
  agencia: string | null; conta: string | null; saldo_inicial: number; ativo: number;
};

/* ---------- Permissões ---------- */

export type AreaPermissao = { id: string; nome: string };
export type GrupoPermissao = { grupo: string; itens: AreaPermissao[] };
export type NivelAcesso = { id: string; nome: string; descricao: string; areas: string[] };

export type CatalogoPermissoes = {
  areas: GrupoPermissao[]; niveis: NivelAcesso[]; todas: string[];
};

export type UsuarioSistema = {
  id: number; nome: string; email: string; perfil: string;
  nivel_acesso: string; colaborador_id: number | null; colaborador: string | null;
  permissoes: string | null; ativo: number; criado_em: string;
};

export type PermissoesUsuario = {
  nivel_acesso: string; nivel: NivelAcesso | null;
  ajustes: Record<string, boolean>; efetivas: Record<string, boolean>;
};

export type Afericao = {
  id: number; produto_id: number; produto: string; etapa_id: number; etapa: string;
  colaborador: string | null; equipamento: string | null; data: string;
  pecas: number; minutos: number; tempo_por_peca: number; pecas_hora: number;
  observacao: string | null;
};

export type MediaAfericao = {
  etapa_id: number; etapa: string; ordem: number; medicoes: number;
  tempo_por_peca: number; melhor: number; pior: number; tempo_padrao: number | null;
};

/* ---------- Comercial ---------- */

export type EtapaFunil = {
  id: number; nome: string; ordem: number; probabilidade: number;
  tipo: 'ABERTA' | 'GANHA' | 'PERDIDA'; ativo: number;
};

export type Oportunidade = {
  id: number; titulo: string;
  cliente_id: number | null; cliente: string | null; prospect: string | null; parte: string | null;
  contato: string | null; telefone: string | null; email: string | null;
  vendedor_id: number | null; vendedor: string | null;
  etapa_id: number; etapa: string; etapa_tipo: string;
  probabilidade: number | null; probabilidade_etapa: number;
  origem: string; valor_estimado: number;
  previsao_fechamento: string | null; motivo_perda: string | null; fechada_em: string | null;
  observacao: string | null; criado_em: string; atualizado_em: string;
  dias_parada?: number; proximo_contato?: string | null;
  interacoes?: Interacao[]; orcamentos?: Orcamento[];
};

export type Interacao = {
  id: number; oportunidade_id: number | null; cliente_id: number | null;
  tipo: string; data: string; resumo: string;
  proximo_passo: string | null; proxima_data: string | null; concluida: number;
  usuario: string | null; oportunidade?: string; parte?: string;
};

export type ColunaFunil = {
  etapa: EtapaFunil; oportunidades: Oportunidade[];
  total: number; valor: number; valor_ponderado: number;
};

export type ResumoComercial = {
  funil: ColunaFunil[];
  abertas: number; valor_aberto: number; valor_ponderado: number;
  ganhas: number; valor_ganho: number; perdidas: number; valor_perdido: number;
  conversao: number;
  paradas: Oportunidade[];
  motivos_perda: Array<{ motivo: string; total: number; valor: number }>;
  agenda: Interacao[];
};

export type Orcamento = {
  id: number; numero: string;
  cliente_id: number | null; cliente: string | null; prospect: string | null; parte: string | null;
  oportunidade_id: number | null; oportunidade: string | null;
  vendedor_id: number | null; vendedor: string | null;
  data: string; validade: string | null; prazo_entrega_dias: number;
  condicao_pagamento: string | null; desconto_percentual: number; frete: number;
  status: string; motivo_recusa: string | null;
  pedido_id: number | null; pedido_numero: string | null;
  itens: number; pecas: number;
  valor_bruto: number; valor_total: number; custo_total: number; vencido: number;
  observacao: string | null;
  desconto?: number; margem?: number; margem_percentual?: number; minutos_fabrica?: number;
  linhas?: LinhaOrcamento[];
};

export type LinhaOrcamento = {
  id: number; produto_id: number; produto: string; grupo: string | null; linha: string;
  descricao: string | null; quantidade: number;
  preco_unitario: number; custo_unitario: number;
  total: number; custo: number; margem_percentual: number; sequencia: number;
};

export type Precificacao = {
  produto_id: number; produto: string; quantidade: number;
  custo_unitario: number; custo_total: number;
  material: number; mao_de_obra: number; indireto: number; minutos_por_peca: number;
  preco_tabela: number; preco_sugerido: number; base: string;
  margem_no_sugerido: number; margem_no_tabela: number;
  completo: boolean; avisos: string[];
};

export type DesempenhoOrcamentos = {
  por_status: Array<{ status: string; total: number; valor: number }>;
  total: number; valor_total: number; aprovados: number; valor_aprovado: number;
  recusados: number; conversao: number; ticket_medio: number;
  por_vendedor: Array<{ vendedor: string; orcamentos: number; aprovados: number; valor_aprovado: number; valor_total: number }>;
  taxa_indireta: number;
};

/* ------------------------------------------------------------------ compras */

export type Requisicao = {
  id: number; material_id: number; material: string; codigo: string | null; unidade: string;
  custo_unitario: number; fornecedor: string | null; fornecedor_id: number | null;
  quantidade: number; atendida: number; pendente: number; saldo: number; valor?: number;
  urgencia: 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';
  origem: 'MANUAL' | 'MRP' | 'ESTOQUE_MINIMO';
  status: 'ABERTA' | 'PARCIAL' | 'ATENDIDA' | 'CANCELADA';
  necessidade_em: string | null; ordem_id: number | null; justificativa: string | null;
  criado_em: string;
};

export type LinhaCompra = {
  id: number; pedido_compra_id: number; material_id: number; material: string;
  codigo: string | null; unidade: string; requisicao_id: number | null;
  quantidade: number; recebido: number; pendente: number;
  preco_unitario: number; total: number; saldo: number; observacao: string | null;
};

export type RecebimentoResumo = {
  id: number; pedido_compra_id: number; data: string; nota_fiscal: string | null;
  local: string | null; local_id: number | null; titulo_id: number | null;
  usuario: string | null; observacao: string | null; itens: number; valor: number | null;
};

export type PedidoCompra = {
  id: number; numero: string; fornecedor_id: number; fornecedor: string;
  data: string; previsao_entrega: string | null; condicao_pagamento: string | null;
  prazo_pagamento_dias: number; frete: number; desconto: number;
  status: 'RASCUNHO' | 'ENVIADO' | 'CONFIRMADO' | 'PARCIAL' | 'RECEBIDO' | 'CANCELADO';
  observacao: string | null; itens: number;
  valor_bruto: number; valor_total: number; quantidade_pendente: number; dias_atraso: number;
  linhas?: LinhaCompra[]; recebimentos?: RecebimentoResumo[];
};

export type ResumoCompras = {
  requisicoes_abertas: number; valor_requisitado: number; requisicoes_urgentes: number;
  pedidos_abertos: number; valor_em_pedido: number; pedidos_atrasados: number;
  por_fornecedor: Array<{ fornecedor: string; pedidos: number; valor: number; atrasados: number }>;
  entregas_previstas: PedidoCompra[];
};

export type LinhaInventario = {
  id: number; inventario_id: number; material_id: number; material: string;
  codigo: string | null; unidade: string; custo_unitario: number;
  saldo_sistema: number; contado: number | null;
  diferenca: number | null; valor_diferenca: number | null;
  movimento_id: number | null; observacao: string | null;
};

export type Inventario = {
  id: number; descricao: string; data: string; local_id: number | null; local: string | null;
  status: 'ABERTO' | 'FECHADO' | 'CANCELADO'; observacao: string | null;
  usuario: string | null; fechado_em: string | null;
  materiais?: number; contados?: number; pendentes?: number;
  divergencias?: number; valor_divergencia?: number;
  linhas?: LinhaInventario[];
};

export type LocalEstoque = Simples & { tipo: string | null; observacao: string | null; ativo: number };

/* ------------------------------------------------------- qualidade de dados */

export type CandidatoDuplicata = {
  id: number; nome: string; cnpj: string | null; cidade: string | null; uf: string | null;
  ativo: number; pedidos: number; orcamentos: number; oportunidades: number; titulos: number;
  ultimo_pedido: string | null;
};

export type GrupoDuplicata = {
  confianca: 'identico' | 'nucleo' | 'parecido';
  chave: string; manter: number; movimento: number; membros: CandidatoDuplicata[];
};

export type NomeSuspeito = {
  id: number; nome: string; sugestao: string; motivos: string[];
  conflito: { id: number; nome: string } | null;
};

export type PedidoParado = {
  id: number; numero: string; cliente: string;
  data_pedido: string; data_entrega: string | null; situacao: string;
  itens: number; pecas: number; valor: number;
  primeira_entrega: string | null; dias_atraso: number; ordens_abertas: number;
};

export type DataInvertida = {
  item_id: number; pedido_id: number; numero: string; cliente: string; produto: string;
  data_pedido: string; data_entrega: string; no_item: number; dias: number;
  sugestao: string | null;
};

export type ResumoQualidade = {
  duplicatas: { grupos: number; cadastros: number; identicos: number; a_confirmar: number };
  nomes: number;
  parados: { pedidos: number; valor: number; com_ordem_aberta: number; maior_atraso: number };
  datas: { itens: number; com_sugestao: number };
  pedidos_repetidos: { grupos: number; repetidos: number; a_confirmar: number; valor: number };
};

export type PedidoRepetido = {
  id: number; numero: string; cliente_id: number; cliente: string;
  data_pedido: string; situacao: string;
  itens: number; pecas: number; valor: number;
  ordens: number; apontamentos: number; titulos: number;
};

export type GrupoPedidoRepetido = {
  confianca: 'repetido' | 'confira';
  motivo: string; chave: string; cliente: string; data_pedido: string;
  valor: number; manter: number; membros: PedidoRepetido[];
};

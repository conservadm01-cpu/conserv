PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- CADASTROS BÁSICOS
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT    NOT NULL,
  email       TEXT    NOT NULL UNIQUE,
  senha_hash  TEXT    NOT NULL,
  perfil      TEXT    NOT NULL DEFAULT 'OPERADOR'
              CHECK (perfil IN ('ADMIN','GESTOR','PCP','ALMOXARIFE','VENDEDOR','OPERADOR')),
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendedores (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT    NOT NULL UNIQUE,
  email     TEXT,
  telefone  TEXT,
  ativo     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categorias_cliente (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome  TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS clientes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nome         TEXT    NOT NULL UNIQUE,
  categoria_id INTEGER REFERENCES categorias_cliente(id) ON DELETE SET NULL,
  cnpj         TEXT,
  contato      TEXT,
  email        TEXT,
  telefone     TEXT,
  cidade       TEXT,
  uf           TEXT,
  observacao   TEXT,
  ativo        INTEGER NOT NULL DEFAULT 1,
  criado_em    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clientes_categoria ON clientes(categoria_id);

CREATE TABLE IF NOT EXISTS fornecedores (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT    NOT NULL UNIQUE,
  cnpj      TEXT,
  contato   TEXT,
  email     TEXT,
  telefone  TEXT,
  prazo_entrega_dias INTEGER NOT NULL DEFAULT 0,
  ativo     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS grupos_produto (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome  TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS produtos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo        TEXT    UNIQUE,
  descricao     TEXT    NOT NULL UNIQUE,
  grupo_id      INTEGER REFERENCES grupos_produto(id) ON DELETE SET NULL,
  linha         TEXT    NOT NULL DEFAULT 'LEVE' CHECK (linha IN ('LEVE','PESADA','AMBAS')),
  preco_padrao  REAL    NOT NULL DEFAULT 0,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_produtos_grupo ON produtos(grupo_id);

-- ============================================================
-- MATERIAIS / ALMOXARIFADO
-- ============================================================

CREATE TABLE IF NOT EXISTS materiais (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo         TEXT    UNIQUE,
  descricao      TEXT    NOT NULL UNIQUE,
  tipo           TEXT    NOT NULL DEFAULT 'TECIDO'
                 CHECK (tipo IN ('TECIDO','AVIAMENTO','EMBALAGEM','TINTA','ETIQUETA','SERVICO','OUTRO')),
  unidade        TEXT    NOT NULL DEFAULT 'UN'
                 CHECK (unidade IN ('UN','MT','M2','KG','L','PC','CX','RL')),
  custo_unitario REAL    NOT NULL DEFAULT 0,
  estoque_min    REAL    NOT NULL DEFAULT 0,
  localizacao    TEXT,
  fornecedor_id  INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_materiais_tipo ON materiais(tipo);

-- Ficha técnica (BOM): consumo de cada material por peça do produto
CREATE TABLE IF NOT EXISTS ficha_tecnica (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id       INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  material_id      INTEGER NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  consumo_por_peca REAL    NOT NULL CHECK (consumo_por_peca > 0),
  perda_percentual REAL    NOT NULL DEFAULT 0 CHECK (perda_percentual >= 0),
  observacao       TEXT,
  UNIQUE (produto_id, material_id)
);
CREATE INDEX IF NOT EXISTS idx_ficha_produto ON ficha_tecnica(produto_id);

-- ============================================================
-- PROCESSOS (ETAPAS DE PRODUÇÃO)
-- ============================================================

CREATE TABLE IF NOT EXISTS etapas (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo           TEXT    NOT NULL UNIQUE,
  nome             TEXT    NOT NULL,
  ordem            INTEGER NOT NULL,
  consome_material INTEGER NOT NULL DEFAULT 0,
  ativo            INTEGER NOT NULL DEFAULT 1
);

-- Custo padrão de mão de obra por peça, por produto e etapa
CREATE TABLE IF NOT EXISTS custos_processo (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id     INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  etapa_id       INTEGER NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
  custo_por_peca REAL    NOT NULL DEFAULT 0,
  UNIQUE (produto_id, etapa_id)
);

-- ============================================================
-- PEDIDOS (CARTEIRA)
-- ============================================================

CREATE TABLE IF NOT EXISTS pedidos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  numero        TEXT    NOT NULL,
  cliente_id    INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  vendedor_id   INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  data_pedido   TEXT    NOT NULL DEFAULT (date('now')),
  data_entrega  TEXT,
  situacao      TEXT    NOT NULL DEFAULT 'ABERTO'
                CHECK (situacao IN ('ABERTO','FATURADO','ENTREGUE','CANCELADO')),
  nota_fiscal   TEXT,
  observacao    TEXT,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (numero, cliente_id, data_pedido)
);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_data ON pedidos(data_pedido);
CREATE INDEX IF NOT EXISTS idx_pedidos_situacao ON pedidos(situacao);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id      INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id     INTEGER NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  descricao      TEXT,
  quantidade     REAL    NOT NULL CHECK (quantidade > 0),
  preco_unitario REAL    NOT NULL DEFAULT 0,
  liquidacao     REAL    NOT NULL DEFAULT 0,
  data_entrega   TEXT
);
CREATE INDEX IF NOT EXISTS idx_itens_pedido ON pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS idx_itens_produto ON pedido_itens(produto_id);

-- ============================================================
-- ORDENS DE PRODUÇÃO (PCP)
-- ============================================================

CREATE TABLE IF NOT EXISTS ordens_producao (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  numero          TEXT    NOT NULL UNIQUE,
  pedido_item_id  INTEGER NOT NULL UNIQUE REFERENCES pedido_itens(id) ON DELETE CASCADE,
  quantidade      REAL    NOT NULL CHECK (quantidade > 0),
  status          TEXT    NOT NULL DEFAULT 'ABERTA'
                  CHECK (status IN ('ABERTA','EM_PRODUCAO','CONCLUIDA','ENTREGUE','CANCELADA')),
  data_abertura   TEXT    NOT NULL DEFAULT (date('now')),
  data_prevista   TEXT,
  data_conclusao  TEXT,
  observacao      TEXT,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_op_status ON ordens_producao(status);

CREATE TABLE IF NOT EXISTS ordem_etapas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id      INTEGER NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
  etapa_id      INTEGER NOT NULL REFERENCES etapas(id) ON DELETE RESTRICT,
  status        TEXT    NOT NULL DEFAULT 'PENDENTE'
                CHECK (status IN ('PENDENTE','EM_ANDAMENTO','CONCLUIDA','NAO_APLICAVEL')),
  responsavel   TEXT,
  iniciado_em   TEXT,
  concluido_em  TEXT,
  custo_mo      REAL    NOT NULL DEFAULT 0,
  observacao    TEXT,
  UNIQUE (ordem_id, etapa_id)
);
CREATE INDEX IF NOT EXISTS idx_ordem_etapas_ordem ON ordem_etapas(ordem_id);
CREATE INDEX IF NOT EXISTS idx_ordem_etapas_status ON ordem_etapas(status);

-- Necessidade de material da ordem (explosão da ficha técnica)
CREATE TABLE IF NOT EXISTS ordem_materiais (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id            INTEGER NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
  material_id         INTEGER NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  quantidade_prevista REAL    NOT NULL DEFAULT 0,
  quantidade_baixada  REAL    NOT NULL DEFAULT 0,
  UNIQUE (ordem_id, material_id)
);

CREATE TABLE IF NOT EXISTS movimentos_estoque (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id     INTEGER NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  tipo            TEXT    NOT NULL CHECK (tipo IN ('ENTRADA','SAIDA','AJUSTE')),
  quantidade      REAL    NOT NULL CHECK (quantidade > 0),
  custo_unitario  REAL    NOT NULL DEFAULT 0,
  data            TEXT    NOT NULL DEFAULT (date('now')),
  documento       TEXT,
  ordem_id        INTEGER REFERENCES ordens_producao(id) ON DELETE SET NULL,
  fornecedor_id   INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  observacao      TEXT,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mov_material ON movimentos_estoque(material_id);
CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentos_estoque(data);
CREATE INDEX IF NOT EXISTS idx_mov_ordem ON movimentos_estoque(ordem_id);

-- ============================================================
-- VIEWS DE APOIO
-- ============================================================

DROP VIEW IF EXISTS vw_estoque;
CREATE VIEW vw_estoque AS
SELECT
  m.id, m.codigo, m.descricao, m.tipo, m.unidade, m.custo_unitario,
  m.estoque_min, m.localizacao, m.fornecedor_id, m.ativo,
  COALESCE(mov.saldo, 0)                    AS saldo,
  COALESCE(mov.saldo, 0) * m.custo_unitario AS valor_estoque,
  CASE WHEN COALESCE(mov.saldo, 0) <= m.estoque_min THEN 1 ELSE 0 END AS abaixo_minimo
FROM materiais m
LEFT JOIN (
  SELECT material_id,
         SUM(CASE WHEN tipo = 'SAIDA' THEN -quantidade ELSE quantidade END) AS saldo
  FROM movimentos_estoque GROUP BY material_id
) mov ON mov.material_id = m.id;

DROP VIEW IF EXISTS vw_itens;
CREATE VIEW vw_itens AS
SELECT
  i.id                                      AS item_id,
  i.quantidade,
  i.preco_unitario,
  ROUND(i.quantidade * i.preco_unitario, 2) AS total,
  i.liquidacao,
  COALESCE(i.data_entrega, p.data_entrega)  AS data_entrega,
  p.id                                      AS pedido_id,
  p.numero                                  AS pedido_numero,
  p.data_pedido,
  p.situacao,
  p.nota_fiscal,
  c.id                                      AS cliente_id,
  c.nome                                    AS cliente,
  cc.nome                                   AS categoria,
  v.nome                                    AS vendedor,
  pr.id                                     AS produto_id,
  COALESCE(i.descricao, pr.descricao)       AS produto,
  pr.linha,
  g.nome                                    AS grupo,
  o.id                                      AS ordem_id,
  o.numero                                  AS ordem_numero,
  o.status                                  AS ordem_status
FROM pedido_itens i
JOIN pedidos   p  ON p.id = i.pedido_id
JOIN clientes  c  ON c.id = p.cliente_id
LEFT JOIN categorias_cliente cc ON cc.id = c.categoria_id
LEFT JOIN vendedores v ON v.id = p.vendedor_id
JOIN produtos  pr ON pr.id = i.produto_id
LEFT JOIN grupos_produto g ON g.id = pr.grupo_id
LEFT JOIN ordens_producao o ON o.pedido_item_id = i.id;

-- ============================================================
-- ENGENHARIA — setores, máquinas e jornada
-- ============================================================

CREATE TABLE IF NOT EXISTS departamentos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT    NOT NULL UNIQUE,
  responsavel TEXT,
  produtivo   INTEGER NOT NULL DEFAULT 1,
  observacao  TEXT,
  ativo       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS equipamentos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT    NOT NULL UNIQUE,
  tipo            TEXT,
  departamento_id INTEGER REFERENCES departamentos(id) ON DELETE SET NULL,
  patrimonio      TEXT,
  quantidade      INTEGER NOT NULL DEFAULT 1,
  status          TEXT    NOT NULL DEFAULT 'ATIVO'
                  CHECK (status IN ('ATIVO','MANUTENCAO','PARADO','BAIXADO')),
  observacao      TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_equip_depto ON equipamentos(departamento_id);

-- Configuração única da fábrica (uma linha, id = 1).
CREATE TABLE IF NOT EXISTS parametros (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  jornada_inicio     TEXT NOT NULL DEFAULT '06:00',
  jornada_fim        TEXT NOT NULL DEFAULT '15:48',
  intervalo_min      INTEGER NOT NULL DEFAULT 75,
  dias_semana        TEXT NOT NULL DEFAULT '1,2,3,4,5',
  dias_uteis_mes     INTEGER NOT NULL DEFAULT 22,
  encargos_percentual REAL NOT NULL DEFAULT 80,
  ocupacao_percentual REAL NOT NULL DEFAULT 85,
  extensao_fim       TEXT,
  sabado_inicio      TEXT,
  sabado_fim         TEXT,
  atualizado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- PESSOAS
-- ============================================================

CREATE TABLE IF NOT EXISTS colaboradores (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT    NOT NULL UNIQUE,
  cpf             TEXT,
  cargo           TEXT,
  departamento_id INTEGER REFERENCES departamentos(id) ON DELETE SET NULL,
  data_admissao   TEXT,
  salario         REAL    NOT NULL DEFAULT 0,
  vale_transporte REAL    NOT NULL DEFAULT 0,
  produtivo       INTEGER NOT NULL DEFAULT 1,
  telefone        TEXT,
  email           TEXT,
  status          TEXT    NOT NULL DEFAULT 'ATIVO'
                  CHECK (status IN ('ATIVO','AFASTADO','INATIVO')),
  observacao      TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_colab_depto ON colaboradores(departamento_id);

-- ============================================================
-- CUSTOS FIXOS (rateados por minuto de fábrica)
-- ============================================================

CREATE TABLE IF NOT EXISTS custos_fixos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao    TEXT    NOT NULL,
  tipo         TEXT    NOT NULL DEFAULT 'OUTRO'
               CHECK (tipo IN ('ALUGUEL','ENERGIA','AGUA','MANUTENCAO','ADMINISTRATIVO',
                               'IMPOSTO','SEGURO','DEPRECIACAO','SOFTWARE','OUTRO')),
  valor_mensal REAL    NOT NULL DEFAULT 0,
  observacao   TEXT,
  ativo        INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- PROCESSO PRODUTIVO DO PRODUTO
-- Substitui o custo fixo por etapa: agora é tempo × custo do setor.
-- ============================================================

CREATE TABLE IF NOT EXISTS produto_processo (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id         INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  etapa_id           INTEGER NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
  sequencia          INTEGER NOT NULL DEFAULT 1,
  tempo_por_peca_min REAL    NOT NULL DEFAULT 0 CHECK (tempo_por_peca_min >= 0),
  equipamento_id     INTEGER REFERENCES equipamentos(id) ON DELETE SET NULL,
  observacao         TEXT,
  UNIQUE (produto_id, etapa_id)
);
CREATE INDEX IF NOT EXISTS idx_processo_produto ON produto_processo(produto_id);

-- ============================================================
-- MATERIAIS — grupos e locais de estoque
-- ============================================================

CREATE TABLE IF NOT EXISTS grupos_material (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nome   TEXT    NOT NULL UNIQUE,
  pai_id INTEGER REFERENCES grupos_material(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS locais_estoque (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nome   TEXT    NOT NULL UNIQUE,
  tipo   TEXT    NOT NULL DEFAULT 'ALMOXARIFADO'
         CHECK (tipo IN ('ALMOXARIFADO','PRODUCAO','EXPEDICAO','TERCEIRO','OUTRO')),
  ativo  INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- APONTAMENTO DE PRODUÇÃO E PARADAS
-- ============================================================

CREATE TABLE IF NOT EXISTS apontamentos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id        INTEGER NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
  etapa_id        INTEGER NOT NULL REFERENCES etapas(id) ON DELETE RESTRICT,
  colaborador_id  INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  equipamento_id  INTEGER REFERENCES equipamentos(id) ON DELETE SET NULL,
  data            TEXT    NOT NULL DEFAULT (date('now')),
  quantidade      REAL    NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  refugo          REAL    NOT NULL DEFAULT 0 CHECK (refugo >= 0),
  minutos         REAL    NOT NULL DEFAULT 0 CHECK (minutos >= 0),
  custo_mo        REAL    NOT NULL DEFAULT 0,
  observacao      TEXT,
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_apont_ordem ON apontamentos(ordem_id);
CREATE INDEX IF NOT EXISTS idx_apont_data ON apontamentos(data);
CREATE INDEX IF NOT EXISTS idx_apont_colab ON apontamentos(colaborador_id);

CREATE TABLE IF NOT EXISTS ocorrencias (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  data            TEXT    NOT NULL DEFAULT (date('now')),
  departamento_id INTEGER REFERENCES departamentos(id) ON DELETE SET NULL,
  ordem_id        INTEGER REFERENCES ordens_producao(id) ON DELETE SET NULL,
  equipamento_id  INTEGER REFERENCES equipamentos(id) ON DELETE SET NULL,
  motivo          TEXT    NOT NULL DEFAULT 'OUTRO'
                  CHECK (motivo IN ('FALTA_MATERIAL','QUEBRA_EQUIPAMENTO','FALTA_PESSOAL',
                                    'RETRABALHO','ENERGIA','AGUARDANDO_SETOR','TREINAMENTO','OUTRO')),
  minutos_parado  REAL    NOT NULL DEFAULT 0 CHECK (minutos_parado >= 0),
  descricao       TEXT,
  acao            TEXT,
  resolvida       INTEGER NOT NULL DEFAULT 0,
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ocorr_data ON ocorrencias(data);

-- ============================================================
-- CONVERSA ABERTA — canal de sugestões, problemas e riscos
-- ============================================================

CREATE TABLE IF NOT EXISTS manifestacoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo          TEXT    NOT NULL DEFAULT 'SUGESTAO'
                CHECK (tipo IN ('SUGESTAO','PROBLEMA','RISCO','RELATO','ELOGIO')),
  assunto       TEXT,
  mensagem      TEXT    NOT NULL,
  autor         TEXT,
  anonima       INTEGER NOT NULL DEFAULT 1,
  setor         TEXT,
  status        TEXT    NOT NULL DEFAULT 'ABERTA'
                CHECK (status IN ('ABERTA','EM_ANALISE','RESOLVIDA','ARQUIVADA')),
  tratativa     TEXT,
  respondido_em TEXT,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_manif_status ON manifestacoes(status);

-- ============================================================
-- AUDITORIA
-- ============================================================

CREATE TABLE IF NOT EXISTS logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario    TEXT,
  acao       TEXT NOT NULL,
  entidade   TEXT,
  entidade_id INTEGER,
  detalhe    TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_data ON logs(criado_em);

-- ============================================================
-- FINANCEIRO — contas a pagar e a receber
-- ============================================================

CREATE TABLE IF NOT EXISTS contas_bancarias (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT    NOT NULL UNIQUE,
  tipo           TEXT    NOT NULL DEFAULT 'BANCO' CHECK (tipo IN ('CAIXA','BANCO','APLICACAO')),
  banco          TEXT,
  agencia        TEXT,
  conta          TEXT,
  saldo_inicial  REAL    NOT NULL DEFAULT 0,
  ativo          INTEGER NOT NULL DEFAULT 1
);

-- Plano de contas enxuto: uma categoria por natureza de receita ou despesa.
CREATE TABLE IF NOT EXISTS categorias_financeiras (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nome    TEXT    NOT NULL UNIQUE,
  tipo    TEXT    NOT NULL CHECK (tipo IN ('RECEBER','PAGAR')),
  grupo   TEXT,
  ativo   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS titulos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo           TEXT    NOT NULL CHECK (tipo IN ('RECEBER','PAGAR')),
  descricao      TEXT    NOT NULL,
  categoria_id   INTEGER REFERENCES categorias_financeiras(id) ON DELETE SET NULL,
  cliente_id     INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  fornecedor_id  INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
  pedido_id      INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  documento      TEXT,
  parcela        INTEGER NOT NULL DEFAULT 1,
  parcelas       INTEGER NOT NULL DEFAULT 1,
  valor          REAL    NOT NULL CHECK (valor > 0),
  emissao        TEXT    NOT NULL DEFAULT (date('now')),
  vencimento     TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'ABERTO'
                 CHECK (status IN ('ABERTO','PARCIAL','QUITADO','CANCELADO')),
  observacao     TEXT,
  usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_titulos_tipo ON titulos(tipo, status);
CREATE INDEX IF NOT EXISTS idx_titulos_venc ON titulos(vencimento);
CREATE INDEX IF NOT EXISTS idx_titulos_cliente ON titulos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_titulos_fornecedor ON titulos(fornecedor_id);

-- Cada pagamento ou recebimento, inclusive parcial. O status do título é derivado daqui.
CREATE TABLE IF NOT EXISTS baixas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo_id     INTEGER NOT NULL REFERENCES titulos(id) ON DELETE CASCADE,
  data          TEXT    NOT NULL DEFAULT (date('now')),
  valor         REAL    NOT NULL CHECK (valor > 0),
  juros         REAL    NOT NULL DEFAULT 0,
  desconto      REAL    NOT NULL DEFAULT 0,
  forma         TEXT    NOT NULL DEFAULT 'PIX'
                CHECK (forma IN ('DINHEIRO','PIX','BOLETO','TRANSFERENCIA','CARTAO','CHEQUE','OUTRO')),
  conta_id      INTEGER REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  observacao    TEXT,
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_baixas_titulo ON baixas(titulo_id);
CREATE INDEX IF NOT EXISTS idx_baixas_data ON baixas(data);

-- ============================================================
-- ENGENHARIA — aferição de tempo das operações
-- ============================================================

CREATE TABLE IF NOT EXISTS afericoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id     INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  etapa_id       INTEGER NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
  colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
  equipamento_id INTEGER REFERENCES equipamentos(id) ON DELETE SET NULL,
  data           TEXT    NOT NULL DEFAULT (date('now')),
  pecas          REAL    NOT NULL CHECK (pecas > 0),
  minutos        REAL    NOT NULL CHECK (minutos > 0),
  observacao     TEXT,
  usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_afer_produto ON afericoes(produto_id, etapa_id);

-- ============================================================
-- VIEWS DO FINANCEIRO
-- ============================================================

DROP VIEW IF EXISTS vw_titulos;
CREATE VIEW vw_titulos AS
SELECT
  t.*,
  COALESCE(b.pago, 0)                                  AS pago,
  ROUND(t.valor - COALESCE(b.pago, 0), 2)              AS saldo,
  b.ultima_baixa,
  COALESCE(c.nome, f.nome)                             AS parte,
  c.nome                                               AS cliente,
  f.nome                                               AS fornecedor,
  cf.nome                                              AS categoria,
  p.numero                                             AS pedido_numero,
  CASE
    WHEN t.status IN ('QUITADO','CANCELADO') THEN 0
    WHEN t.vencimento < date('now') THEN CAST(julianday('now') - julianday(t.vencimento) AS INTEGER)
    ELSE 0
  END                                                  AS dias_atraso
FROM titulos t
LEFT JOIN (
  SELECT titulo_id,
         SUM(valor + juros - desconto) AS pago,
         MAX(data) AS ultima_baixa
  FROM baixas GROUP BY titulo_id
) b ON b.titulo_id = t.id
LEFT JOIN clientes c ON c.id = t.cliente_id
LEFT JOIN fornecedores f ON f.id = t.fornecedor_id
LEFT JOIN categorias_financeiras cf ON cf.id = t.categoria_id
LEFT JOIN pedidos p ON p.id = t.pedido_id;

-- ============================================================
-- COMERCIAL — CRM, funil e orçamentos
-- ============================================================

CREATE TABLE IF NOT EXISTS etapas_funil (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT    NOT NULL UNIQUE,
  ordem         INTEGER NOT NULL,
  probabilidade REAL    NOT NULL DEFAULT 0 CHECK (probabilidade BETWEEN 0 AND 100),
  tipo          TEXT    NOT NULL DEFAULT 'ABERTA' CHECK (tipo IN ('ABERTA','GANHA','PERDIDA')),
  ativo         INTEGER NOT NULL DEFAULT 1
);

/* Uma oportunidade pode nascer antes do cliente existir no cadastro:
   o prospect entra pelo nome e vira cliente quando o negócio fecha. */
CREATE TABLE IF NOT EXISTS oportunidades (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo            TEXT    NOT NULL,
  cliente_id        INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  prospect          TEXT,
  contato           TEXT,
  telefone          TEXT,
  email             TEXT,
  vendedor_id       INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  etapa_id          INTEGER NOT NULL REFERENCES etapas_funil(id) ON DELETE RESTRICT,
  origem            TEXT    NOT NULL DEFAULT 'OUTRO'
                    CHECK (origem IN ('INDICACAO','SITE','REDES','FEIRA','PROSPECCAO','CLIENTE_ATIVO','OUTRO')),
  valor_estimado    REAL    NOT NULL DEFAULT 0,
  probabilidade     REAL,
  previsao_fechamento TEXT,
  motivo_perda      TEXT,
  fechada_em        TEXT,
  observacao        TEXT,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oport_etapa ON oportunidades(etapa_id);
CREATE INDEX IF NOT EXISTS idx_oport_cliente ON oportunidades(cliente_id);
CREATE INDEX IF NOT EXISTS idx_oport_vendedor ON oportunidades(vendedor_id);

CREATE TABLE IF NOT EXISTS interacoes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  oportunidade_id INTEGER REFERENCES oportunidades(id) ON DELETE CASCADE,
  cliente_id      INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
  tipo            TEXT    NOT NULL DEFAULT 'LIGACAO'
                  CHECK (tipo IN ('LIGACAO','VISITA','REUNIAO','EMAIL','WHATSAPP','PROPOSTA','OUTRO')),
  data            TEXT    NOT NULL DEFAULT (date('now')),
  resumo          TEXT    NOT NULL,
  proximo_passo   TEXT,
  proxima_data    TEXT,
  concluida       INTEGER NOT NULL DEFAULT 1,
  usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inter_oport ON interacoes(oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_inter_proxima ON interacoes(proxima_data);

CREATE TABLE IF NOT EXISTS orcamentos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  numero            TEXT    NOT NULL UNIQUE,
  cliente_id        INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  prospect          TEXT,
  oportunidade_id   INTEGER REFERENCES oportunidades(id) ON DELETE SET NULL,
  vendedor_id       INTEGER REFERENCES vendedores(id) ON DELETE SET NULL,
  data              TEXT    NOT NULL DEFAULT (date('now')),
  validade          TEXT,
  prazo_entrega_dias INTEGER NOT NULL DEFAULT 0,
  condicao_pagamento TEXT,
  desconto_percentual REAL   NOT NULL DEFAULT 0 CHECK (desconto_percentual BETWEEN 0 AND 100),
  frete             REAL    NOT NULL DEFAULT 0,
  status            TEXT    NOT NULL DEFAULT 'RASCUNHO'
                    CHECK (status IN ('RASCUNHO','ENVIADO','EM_NEGOCIACAO','APROVADO','RECUSADO','EXPIRADO')),
  motivo_recusa     TEXT,
  pedido_id         INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  observacao        TEXT,
  usuario_id        INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orc_status ON orcamentos(status);
CREATE INDEX IF NOT EXISTS idx_orc_cliente ON orcamentos(cliente_id);

CREATE TABLE IF NOT EXISTS orcamento_itens (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  orcamento_id   INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  produto_id     INTEGER NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  descricao      TEXT,
  quantidade     REAL    NOT NULL CHECK (quantidade > 0),
  preco_unitario REAL    NOT NULL DEFAULT 0,
  custo_unitario REAL    NOT NULL DEFAULT 0,
  sequencia      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_orc_itens ON orcamento_itens(orcamento_id);

DROP VIEW IF EXISTS vw_orcamentos;
CREATE VIEW vw_orcamentos AS
SELECT
  o.*,
  COALESCE(c.nome, o.prospect)                       AS parte,
  c.nome                                             AS cliente,
  v.nome                                             AS vendedor,
  op.titulo                                          AS oportunidade,
  p.numero                                           AS pedido_numero,
  COALESCE(i.itens, 0)                               AS itens,
  COALESCE(i.pecas, 0)                               AS pecas,
  ROUND(COALESCE(i.bruto, 0), 2)                     AS valor_bruto,
  ROUND(COALESCE(i.bruto, 0) * (1 - o.desconto_percentual / 100.0) + o.frete, 2) AS valor_total,
  ROUND(COALESCE(i.custo, 0), 2)                     AS custo_total,
  CASE WHEN o.validade IS NOT NULL AND o.validade < date('now')
            AND o.status IN ('ENVIADO','EM_NEGOCIACAO') THEN 1 ELSE 0 END AS vencido
FROM orcamentos o
LEFT JOIN clientes c ON c.id = o.cliente_id
LEFT JOIN vendedores v ON v.id = o.vendedor_id
LEFT JOIN oportunidades op ON op.id = o.oportunidade_id
LEFT JOIN pedidos p ON p.id = o.pedido_id
LEFT JOIN (
  SELECT orcamento_id,
         COUNT(*) AS itens,
         SUM(quantidade) AS pecas,
         SUM(quantidade * preco_unitario) AS bruto,
         SUM(quantidade * custo_unitario) AS custo
  FROM orcamento_itens GROUP BY orcamento_id
) i ON i.orcamento_id = o.id;

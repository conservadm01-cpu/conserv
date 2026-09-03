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

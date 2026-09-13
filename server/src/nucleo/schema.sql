/* ==========================================================================
   ERP-PCP CONSERV — NÚCLEO
   ==========================================================================

   74 tabelas em 13 domínios. Escrito para rodar em SQLite hoje e ser portado
   para PostgreSQL sem reescrita:

   - chave sempre TEXT com UUID, nunca inteiro sequencial. No Postgres vira
     `uuid`; a instrução não muda.
   - dinheiro e quantidade em NUMERIC(14,4). Quatro casas porque consumo de
     tecido por peça é 0,4375 m, e arredondar isso na origem custa dinheiro
     no fechamento do mês.
   - data de competência em DATE, evento em TIMESTAMP. O apontamento tem
     hora; o vencimento de um título, não.
   - `datetime('now')` e `date('now')` são os dois únicos SQLite-ismos, e
     viram `now()` e `current_date` na porta. Estão marcados com -- [PORT].
   - índice único parcial (WHERE ...) existe nos dois bancos com a mesma
     sintaxe — é o que garante "uma só versão ativa por produto".

   Regra que atravessa tudo: cadastro se inativa, movimento se cancela.
   Nada aqui é apagado.
   ========================================================================== */

PRAGMA foreign_keys = ON;

/* ======================================================== 1. PLATAFORMA == */

/*
 * Numeração humana. O código do pedido é falado ao telefone e escrito no
 * romaneio, então precisa ser legível e previsível — mas nunca é chave.
 * A máscara é configurável: {ANO} e {SEQ:6} são substituídos na geração.
 */
CREATE TABLE IF NOT EXISTS sequencias (
  id            TEXT PRIMARY KEY,
  entidade      TEXT    NOT NULL,
  escopo        TEXT    NOT NULL DEFAULT '',   -- '' = global; senão o ano, ou o grupo
  mascara       TEXT    NOT NULL,              -- 'PED-{ANO}-{SEQ:6}'
  proximo       INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT] now()
  UNIQUE (entidade, escopo)
);

/* Parâmetros da fábrica — a linha única que sustenta o custeio. */
CREATE TABLE IF NOT EXISTS parametros (
  id                   TEXT PRIMARY KEY,
  jornada_inicio       TEXT    NOT NULL DEFAULT '07:00',
  jornada_fim          TEXT    NOT NULL DEFAULT '17:00',
  intervalo_min        INTEGER NOT NULL DEFAULT 60,
  dias_uteis_mes       INTEGER NOT NULL DEFAULT 22,
  encargos_percentual  NUMERIC(9,4) NOT NULL DEFAULT 80,
  ocupacao_percentual  NUMERIC(9,4) NOT NULL DEFAULT 85,
  margem_seguranca_dias INTEGER NOT NULL DEFAULT 1,
  atualizado_em        TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

/*
 * Trilha de auditoria. Uma linha por campo alterado, não por operação: é o
 * que permite responder "quem mudou a quantidade do pedido 1050 de 500 para
 * 600" sem ler diff de JSON.
 */
CREATE TABLE IF NOT EXISTS auditoria (
  id            TEXT PRIMARY KEY,
  entidade      TEXT    NOT NULL,
  entidade_id   TEXT    NOT NULL,
  codigo        TEXT,                      -- código humano no momento do fato
  acao          TEXT    NOT NULL CHECK (acao IN ('CRIACAO','ALTERACAO','CANCELAMENTO','INATIVACAO','ESTORNO')),
  campo         TEXT,
  valor_anterior TEXT,
  valor_novo    TEXT,
  usuario_id    TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome  TEXT    NOT NULL,          -- congelado: sobrevive à exclusão do usuário
  origem        TEXT,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_auditoria_entidade ON auditoria(entidade, entidade_id);
CREATE INDEX IF NOT EXISTS ix_auditoria_data ON auditoria(criado_em);

/*
 * Anexos com versão. O arquivo original nunca é modificado nem substituído:
 * subir de novo cria versão nova e a anterior continua recuperável — é o que
 * a fábrica precisa quando o molde v2 sai errado e é preciso voltar ao v1.
 */
CREATE TABLE IF NOT EXISTS anexos (
  id           TEXT PRIMARY KEY,
  entidade     TEXT    NOT NULL,
  entidade_id  TEXT    NOT NULL,
  categoria    TEXT    NOT NULL DEFAULT 'DOCUMENTO'
               CHECK (categoria IN ('DOCUMENTO','ARTE','PLT','DXF','MOLDE','FOTO','CANHOTO','NF','CONTRATO','OUTRO')),
  titulo       TEXT    NOT NULL,
  versao_atual INTEGER NOT NULL DEFAULT 1,
  observacao   TEXT,
  ativo        INTEGER NOT NULL DEFAULT 1,
  criado_por   TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em    TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  UNIQUE (entidade, entidade_id, titulo)
);
CREATE INDEX IF NOT EXISTS ix_anexos_entidade ON anexos(entidade, entidade_id);

CREATE TABLE IF NOT EXISTS anexo_versoes (
  id            TEXT PRIMARY KEY,
  anexo_id      TEXT    NOT NULL REFERENCES anexos(id) ON DELETE CASCADE,
  versao        INTEGER NOT NULL,
  nome_arquivo  TEXT    NOT NULL,
  caminho       TEXT    NOT NULL,
  tipo_mime     TEXT,
  bytes         INTEGER NOT NULL DEFAULT 0,
  hash          TEXT,                       -- detecta reenvio do mesmo arquivo
  -- Metadados de PLT/DXF: preenchidos na leitura, nulos para os demais.
  largura_mm    NUMERIC(14,4),
  altura_mm     NUMERIC(14,4),
  qtd_moldes    INTEGER,
  observacao    TEXT,
  criado_por    TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  UNIQUE (anexo_id, versao)
);

/*
 * Campos personalizados. O administrador acrescenta um campo a qualquer
 * cadastro sem migração de schema — a alternativa seria ALTER TABLE a cada
 * pedido de usuário, que é exatamente o que engessa um ERP.
 */
CREATE TABLE IF NOT EXISTS campos_personalizados (
  id          TEXT PRIMARY KEY,
  entidade    TEXT    NOT NULL,
  chave       TEXT    NOT NULL,
  rotulo      TEXT    NOT NULL,
  tipo        TEXT    NOT NULL DEFAULT 'TEXTO'
              CHECK (tipo IN ('TEXTO','NUMERO','DATA','LISTA','BOOLEANO','MOEDA')),
  opcoes      TEXT,                        -- JSON, só quando tipo = LISTA
  obrigatorio INTEGER NOT NULL DEFAULT 0,
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  UNIQUE (entidade, chave)
);

CREATE TABLE IF NOT EXISTS valores_personalizados (
  id          TEXT PRIMARY KEY,
  campo_id    TEXT    NOT NULL REFERENCES campos_personalizados(id) ON DELETE CASCADE,
  entidade_id TEXT    NOT NULL,
  valor       TEXT,
  UNIQUE (campo_id, entidade_id)
);

CREATE TABLE IF NOT EXISTS notificacoes (
  id          TEXT PRIMARY KEY,
  tipo        TEXT    NOT NULL
              CHECK (tipo IN ('PEDIDO_ATRASADO','MATERIAL_INSUFICIENTE','OP_ATRASADA','GARGALO',
                              'ESTOQUE_MINIMO','COMPRA_ATRASADA','SEM_FICHA_TECNICA','SEM_ARTE',
                              'SEM_PLT','SEM_APROVACAO','OUTRO')),
  severidade  TEXT    NOT NULL DEFAULT 'AVISO' CHECK (severidade IN ('INFO','AVISO','CRITICO')),
  titulo      TEXT    NOT NULL,
  detalhe     TEXT,
  entidade    TEXT,
  entidade_id TEXT,
  usuario_id  TEXT,                        -- nulo = para todos que tiverem a área
  area        TEXT,
  lida_em     TEXT,
  resolvida_em TEXT,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_notificacoes_aberta ON notificacoes(tipo, resolvida_em);

/*
 * Importação de planilha. O mapeamento fica guardado por origem: na segunda
 * vez que a mesma planilha for importada, as colunas já vêm ligadas.
 */
CREATE TABLE IF NOT EXISTS importacoes (
  id            TEXT PRIMARY KEY,
  arquivo       TEXT    NOT NULL,
  aba           TEXT,
  destino       TEXT    NOT NULL,          -- 'carteira', 'clientes', 'materiais'...
  status        TEXT    NOT NULL DEFAULT 'PREVIA'
                CHECK (status IN ('PREVIA','VALIDADA','IMPORTADA','CANCELADA','ERRO')),
  linhas_lidas  INTEGER NOT NULL DEFAULT 0,
  linhas_ok     INTEGER NOT NULL DEFAULT 0,
  linhas_erro   INTEGER NOT NULL DEFAULT 0,
  criados       INTEGER NOT NULL DEFAULT 0,
  atualizados   INTEGER NOT NULL DEFAULT 0,
  ignorados     INTEGER NOT NULL DEFAULT 0,
  relatorio     TEXT,                      -- JSON com o log de erros por linha
  usuario_id    TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  concluido_em  TEXT
);

CREATE TABLE IF NOT EXISTS importacao_mapeamentos (
  id            TEXT PRIMARY KEY,
  destino       TEXT    NOT NULL,
  assinatura    TEXT    NOT NULL,          -- hash dos cabeçalhos: reconhece a planilha
  mapa          TEXT    NOT NULL,          -- JSON: coluna da planilha -> campo do sistema
  usos          INTEGER NOT NULL DEFAULT 0,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  UNIQUE (destino, assinatura)
);

/* ============================================================ 2. ACESSO == */

CREATE TABLE IF NOT EXISTS perfis (
  id          TEXT PRIMARY KEY,
  codigo      TEXT    NOT NULL UNIQUE,     -- ADMINISTRADOR, PCP, COSTURA...
  nome        TEXT    NOT NULL,
  descricao   TEXT,
  sistema     INTEGER NOT NULL DEFAULT 0,  -- perfil de fábrica não se apaga
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

/*
 * Permissão por módulo e verbo, como o §36 pede. Uma linha por combinação:
 * é mais verboso que um JSON, e é o que permite perguntar ao banco "quem
 * pode aprovar pedido de compra".
 */
CREATE TABLE IF NOT EXISTS permissoes (
  id        TEXT PRIMARY KEY,
  perfil_id TEXT    NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  modulo    TEXT    NOT NULL,
  verbo     TEXT    NOT NULL CHECK (verbo IN ('VISUALIZAR','CRIAR','EDITAR','EXCLUIR','APROVAR','EXPORTAR')),
  UNIQUE (perfil_id, modulo, verbo)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id                TEXT PRIMARY KEY,
  codigo            TEXT    NOT NULL UNIQUE,
  nome              TEXT    NOT NULL,
  email             TEXT    NOT NULL UNIQUE,
  senha_hash        TEXT    NOT NULL,
  perfil_id         TEXT    REFERENCES perfis(id) ON DELETE SET NULL,
  colaborador_id    TEXT    REFERENCES colaboradores(id) ON DELETE SET NULL,
  permissoes_extra  TEXT,                  -- JSON com os ajustes sobre o perfil
  senha_provisoria  INTEGER NOT NULL DEFAULT 0,
  senha_alterada_em TEXT,
  ultimo_acesso     TEXT,
  ativo             INTEGER NOT NULL DEFAULT 1,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

/* Histórico de senha: guarda o evento, nunca a senha. */
CREATE TABLE IF NOT EXISTS log_senhas (
  id           TEXT PRIMARY KEY,
  usuario_id   TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome TEXT    NOT NULL,
  evento       TEXT    NOT NULL
               CHECK (evento IN ('CRIACAO','PROVISORIA','PRIMEIRO_ACESSO','TROCA','RESET',
                                 'LOGIN','FALHA','BLOQUEIO')),
  autor_id     TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  autor_nome   TEXT,
  origem       TEXT,
  agente       TEXT,
  detalhe      TEXT,
  criado_em    TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_log_senhas_usuario ON log_senhas(usuario_id, criado_em);

/* =========================================================== 3. PESSOAS == */

CREATE TABLE IF NOT EXISTS colaboradores (
  id               TEXT PRIMARY KEY,
  codigo           TEXT    NOT NULL UNIQUE,
  nome             TEXT    NOT NULL,
  cargo            TEXT,
  centro_id        TEXT    REFERENCES centros_trabalho(id) ON DELETE SET NULL,
  data_admissao    DATE,
  data_demissao    DATE,
  salario          NUMERIC(14,4) NOT NULL DEFAULT 0,
  vale_transporte  NUMERIC(14,4) NOT NULL DEFAULT 0,
  produtivo        INTEGER NOT NULL DEFAULT 1,  -- entra no rateio do custo fixo
  telefone         TEXT,
  email            TEXT,
  status           TEXT    NOT NULL DEFAULT 'ATIVO'
                   CHECK (status IN ('ATIVO','AFASTADO','FERIAS','DESLIGADO')),
  observacao       TEXT,
  ativo            INTEGER NOT NULL DEFAULT 1,
  criado_em        TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

/* ========================================================= 4. COMERCIAL == */

CREATE TABLE IF NOT EXISTS grupos_cliente (
  id        TEXT PRIMARY KEY,
  codigo    TEXT NOT NULL UNIQUE,
  nome      TEXT NOT NULL UNIQUE,          -- COSMÉTICO, HAVANNA, PET, EDITORA...
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS vendedores (
  id         TEXT PRIMARY KEY,
  codigo     TEXT NOT NULL UNIQUE,
  nome       TEXT NOT NULL UNIQUE,
  email      TEXT,
  telefone   TEXT,
  comissao_percentual NUMERIC(9,4) NOT NULL DEFAULT 0,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS clientes (
  id                  TEXT PRIMARY KEY,
  codigo              TEXT    NOT NULL UNIQUE,
  razao_social        TEXT    NOT NULL,
  nome_fantasia       TEXT,
  cnpj                TEXT,
  cpf                 TEXT,
  inscricao_estadual  TEXT,
  grupo_id            TEXT    REFERENCES grupos_cliente(id) ON DELETE SET NULL,
  vendedor_id         TEXT    REFERENCES vendedores(id) ON DELETE SET NULL,
  cep                 TEXT,
  endereco            TEXT,
  numero              TEXT,
  complemento         TEXT,
  bairro              TEXT,
  cidade              TEXT,
  uf                  TEXT,
  telefone            TEXT,
  whatsapp            TEXT,
  email               TEXT,
  contato             TEXT,
  condicao_pagamento  TEXT,
  prazo_pagamento_dias INTEGER NOT NULL DEFAULT 0,
  limite_credito      NUMERIC(14,4) NOT NULL DEFAULT 0,
  observacao          TEXT,
  -- Cadastro juntado a outro pela higiene: guarda para onde foi.
  mesclado_em         TEXT    REFERENCES clientes(id) ON DELETE SET NULL,
  ativo               INTEGER NOT NULL DEFAULT 1,
  criado_em           TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_clientes_grupo ON clientes(grupo_id);

CREATE TABLE IF NOT EXISTS oportunidades (
  id            TEXT PRIMARY KEY,
  codigo        TEXT    NOT NULL UNIQUE,
  titulo        TEXT    NOT NULL,
  cliente_id    TEXT    REFERENCES clientes(id) ON DELETE SET NULL,
  prospect      TEXT,
  vendedor_id   TEXT    REFERENCES vendedores(id) ON DELETE SET NULL,
  etapa         TEXT    NOT NULL DEFAULT 'CONTATO'
                CHECK (etapa IN ('CONTATO','QUALIFICACAO','PROPOSTA','NEGOCIACAO','GANHA','PERDIDA')),
  origem        TEXT,
  valor_estimado NUMERIC(14,4) NOT NULL DEFAULT 0,
  probabilidade INTEGER NOT NULL DEFAULT 0,
  previsao_fechamento DATE,
  motivo_perda  TEXT,
  observacao    TEXT,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  atualizado_em TEXT    NOT NULL DEFAULT (datetime('now'))   -- [PORT]
);

CREATE TABLE IF NOT EXISTS orcamentos (
  id              TEXT PRIMARY KEY,
  codigo          TEXT    NOT NULL UNIQUE,
  cliente_id      TEXT    REFERENCES clientes(id) ON DELETE SET NULL,
  prospect        TEXT,
  oportunidade_id TEXT    REFERENCES oportunidades(id) ON DELETE SET NULL,
  vendedor_id     TEXT    REFERENCES vendedores(id) ON DELETE SET NULL,
  data            DATE    NOT NULL DEFAULT (date('now')),  -- [PORT] current_date
  validade        DATE,
  prazo_entrega_dias INTEGER NOT NULL DEFAULT 0,
  condicao_pagamento TEXT,
  desconto_percentual NUMERIC(9,4) NOT NULL DEFAULT 0,
  frete           NUMERIC(14,4) NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'RASCUNHO'
                  CHECK (status IN ('RASCUNHO','ENVIADO','EM_NEGOCIACAO','APROVADO','RECUSADO','EXPIRADO')),
  motivo_recusa   TEXT,
  pedido_id       TEXT    REFERENCES pedidos(id) ON DELETE SET NULL,
  observacao      TEXT,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS orcamento_itens (
  id             TEXT PRIMARY KEY,
  orcamento_id   TEXT    NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  produto_id     TEXT    REFERENCES produtos(id) ON DELETE SET NULL,
  versao_id      TEXT    REFERENCES produto_versoes(id) ON DELETE SET NULL,
  descricao      TEXT,
  quantidade     NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
  preco_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  custo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  sequencia      INTEGER NOT NULL DEFAULT 1
);

/*
 * PEDIDO. O status aqui é o ciclo comercial do §7; o andamento de fábrica
 * não mora nesta tabela — sai das operações da OP, que variam por produto.
 * Misturar os dois é o erro que a planilha comete com a coluna "OK".
 */
CREATE TABLE IF NOT EXISTS pedidos (
  id                 TEXT PRIMARY KEY,
  codigo             TEXT    NOT NULL UNIQUE,
  numero_cliente     TEXT,                 -- o número que o cliente usa, sem unicidade
  cliente_id         TEXT    NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  vendedor_id        TEXT    REFERENCES vendedores(id) ON DELETE SET NULL,
  orcamento_id       TEXT    REFERENCES orcamentos(id) ON DELETE SET NULL,
  data_pedido        DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  data_entrega       DATE,
  data_saida         DATE,
  condicao_pagamento TEXT,
  prazo_pagamento_dias INTEGER NOT NULL DEFAULT 0,
  status             TEXT    NOT NULL DEFAULT 'PEDIDO_RECEBIDO'
                     CHECK (status IN ('ORCAMENTO','PEDIDO_RECEBIDO','APROVADO','AGUARDANDO_ENGENHARIA',
                                       'AGUARDANDO_MATERIAL','LIBERADO_PCP','EM_PRODUCAO','QUALIDADE',
                                       'EMBALAGEM','PRONTO','EXPEDIDO','FATURADO','ENTREGUE','CANCELADO')),
  prioridade         INTEGER NOT NULL DEFAULT 5 CHECK (prioridade BETWEEN 1 AND 9),
  observacao         TEXT,
  cancelado_em       TEXT,
  motivo_cancelamento TEXT,
  criado_por         TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em          TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  atualizado_em      TEXT    NOT NULL DEFAULT (datetime('now'))   -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS ix_pedidos_entrega ON pedidos(data_entrega);
CREATE INDEX IF NOT EXISTS ix_pedidos_status ON pedidos(status);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id             TEXT PRIMARY KEY,
  pedido_id      TEXT    NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  sequencia      INTEGER NOT NULL DEFAULT 1,
  produto_id     TEXT    REFERENCES produtos(id) ON DELETE SET NULL,
  variacao_id    TEXT    REFERENCES variacoes(id) ON DELETE SET NULL,
  -- A versão vendida fica congelada aqui. Melhorar a ficha hoje não reescreve
  -- o custo de um pedido de 2024.
  versao_id      TEXT    REFERENCES produto_versoes(id) ON DELETE SET NULL,
  descricao      TEXT,
  quantidade     NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
  preco_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  desconto_percentual NUMERIC(9,4) NOT NULL DEFAULT 0,
  liquidacao     NUMERIC(14,4) NOT NULL DEFAULT 0,
  data_entrega   DATE,
  observacao     TEXT,
  -- De onde o item veio, quando veio de planilha: permite reconciliar linha a
  -- linha com o arquivo de origem sem adivinhação.
  importacao_id  TEXT    REFERENCES importacoes(id) ON DELETE SET NULL,
  origem_linha   INTEGER,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_pedido_itens_pedido ON pedido_itens(pedido_id);

/* =========================================================== 5. PRODUTO == */

CREATE TABLE IF NOT EXISTS grupos_produto (
  id        TEXT PRIMARY KEY,
  codigo    TEXT NOT NULL UNIQUE,          -- AVE, CAM, CAP, SAC — prefixo do produto
  nome      TEXT NOT NULL UNIQUE,
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS linhas_produto (
  id        TEXT PRIMARY KEY,
  codigo    TEXT NOT NULL UNIQUE,          -- LEVE, PESADA, AMBAS
  nome      TEXT NOT NULL UNIQUE,
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

/*
 * MODELO é a peça como a fábrica a reconhece: "Avental Oxford modelo padrão".
 * PRODUTO é o que se vende, e pode ser o modelo em um tecido específico.
 * VARIAÇÃO é tamanho e cor. A planilha tem 288 descrições livres para 41
 * grupos justamente por não separar as três coisas.
 */
CREATE TABLE IF NOT EXISTS modelos (
  id         TEXT PRIMARY KEY,
  codigo     TEXT    NOT NULL UNIQUE,
  nome       TEXT    NOT NULL,
  grupo_id   TEXT    REFERENCES grupos_produto(id) ON DELETE SET NULL,
  descricao  TEXT,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  UNIQUE (grupo_id, nome)
);

CREATE TABLE IF NOT EXISTS produtos (
  id            TEXT PRIMARY KEY,
  codigo        TEXT    NOT NULL UNIQUE,   -- AVE-000001
  descricao     TEXT    NOT NULL,
  modelo_id     TEXT    REFERENCES modelos(id) ON DELETE SET NULL,
  grupo_id      TEXT    REFERENCES grupos_produto(id) ON DELETE SET NULL,
  linha_id      TEXT    REFERENCES linhas_produto(id) ON DELETE SET NULL,
  unidade       TEXT    NOT NULL DEFAULT 'PC',
  familia       TEXT,
  colecao       TEXT,
  peso_gramas   NUMERIC(14,4),
  preco_padrao  NUMERIC(14,4) NOT NULL DEFAULT 0,
  -- Produto que não exige roteiro (revenda, brinde comprado pronto) não trava
  -- a OP por falta de operações.
  exige_roteiro INTEGER NOT NULL DEFAULT 1,
  observacao    TEXT,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_produtos_grupo ON produtos(grupo_id);

CREATE TABLE IF NOT EXISTS variacoes (
  id         TEXT PRIMARY KEY,
  codigo     TEXT    NOT NULL UNIQUE,      -- AVE-000001-M-VINHO
  produto_id TEXT    NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  tamanho    TEXT,
  cor        TEXT,
  atributos  TEXT,                         -- JSON para o que não for tamanho/cor
  preco_ajuste NUMERIC(14,4) NOT NULL DEFAULT 0,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_variacoes_produto ON variacoes(produto_id);

/*
 * VERSÃO DO PRODUTO — o coração da engenharia. Carrega ficha técnica e
 * roteiro juntos, porque mudar o tecido quase sempre muda a operação. Só uma
 * pode estar ativa por produto, e o índice parcial abaixo é quem garante.
 */
CREATE TABLE IF NOT EXISTS produto_versoes (
  id           TEXT PRIMARY KEY,
  codigo       TEXT    NOT NULL UNIQUE,    -- FT-000123-v3
  produto_id   TEXT    NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  versao       INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'RASCUNHO'
               CHECK (status IN ('RASCUNHO','ATIVA','SUBSTITUIDA','ARQUIVADA')),
  vigente_de   DATE,
  vigente_ate  DATE,
  observacao   TEXT,
  aprovada_por TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  aprovada_em  TEXT,
  criado_por   TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em    TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  UNIQUE (produto_id, versao)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_versao_ativa_unica
  ON produto_versoes(produto_id) WHERE status = 'ATIVA';

/* ========================================================= 6. MATERIAIS == */

CREATE TABLE IF NOT EXISTS grupos_material (
  id        TEXT PRIMARY KEY,
  codigo    TEXT NOT NULL UNIQUE,          -- TEC, AVI, INS, EMB
  nome      TEXT NOT NULL UNIQUE,
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS tipos_material (
  id        TEXT PRIMARY KEY,
  grupo_id  TEXT NOT NULL REFERENCES grupos_material(id) ON DELETE CASCADE,
  codigo    TEXT NOT NULL,                 -- MAL, GAB, ZIP, LIN, ETQ
  nome      TEXT NOT NULL,
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  UNIQUE (grupo_id, codigo)
);

CREATE TABLE IF NOT EXISTS fornecedores (
  id                 TEXT PRIMARY KEY,
  codigo             TEXT    NOT NULL UNIQUE,
  razao_social       TEXT    NOT NULL,
  nome_fantasia      TEXT,
  cnpj               TEXT,
  inscricao_estadual TEXT,
  contato            TEXT,
  telefone           TEXT,
  whatsapp           TEXT,
  email              TEXT,
  cep                TEXT,
  endereco           TEXT,
  numero             TEXT,
  bairro             TEXT,
  cidade             TEXT,
  uf                 TEXT,
  prazo_entrega_dias INTEGER NOT NULL DEFAULT 0,
  condicao_pagamento TEXT,
  observacao         TEXT,
  ativo              INTEGER NOT NULL DEFAULT 1,
  criado_em          TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

/*
 * Código estruturado do §9: GRUPO-TIPO-CARACTERÍSTICA-SEQ, montado pelo
 * sistema. TEC-MAL-PV-001 se lê sem consultar ninguém.
 */
CREATE TABLE IF NOT EXISTS materiais (
  id              TEXT PRIMARY KEY,
  codigo          TEXT    NOT NULL UNIQUE,
  descricao       TEXT    NOT NULL,
  grupo_id        TEXT    REFERENCES grupos_material(id) ON DELETE SET NULL,
  tipo_id         TEXT    REFERENCES tipos_material(id) ON DELETE SET NULL,
  caracteristica  TEXT,                    -- PV, ALG, 600 — o miolo do código
  medida          TEXT,
  unidade         TEXT    NOT NULL DEFAULT 'UN'
                  CHECK (unidade IN ('UN','MT','M2','KG','L','PC','CX','RL','CJ')),
  custo_unitario  NUMERIC(14,4) NOT NULL DEFAULT 0,
  estoque_minimo  NUMERIC(14,4) NOT NULL DEFAULT 0,
  fornecedor_id   TEXT    REFERENCES fornecedores(id) ON DELETE SET NULL,
  local_padrao_id TEXT    REFERENCES locais_estoque(id) ON DELETE SET NULL,
  controla_lote   INTEGER NOT NULL DEFAULT 0,
  observacao      TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_materiais_grupo ON materiais(grupo_id);

/* ======================================================= 7. ENGENHARIA == */

/*
 * CENTRO DE TRABALHO é onde a capacidade se mede e o gargalo aparece. Não é
 * o mesmo que setor administrativo: o corte pode ser um centro com duas
 * mesas, e a costura um centro com trinta máquinas.
 */
CREATE TABLE IF NOT EXISTS centros_trabalho (
  id                TEXT PRIMARY KEY,
  codigo            TEXT    NOT NULL UNIQUE,
  nome              TEXT    NOT NULL UNIQUE,
  responsavel       TEXT,
  produtivo         INTEGER NOT NULL DEFAULT 1,
  -- Capacidade declarada; o PCP compara com a demanda e acusa o gargalo.
  capacidade_min_dia NUMERIC(14,4) NOT NULL DEFAULT 0,
  turnos            INTEGER NOT NULL DEFAULT 1,
  custo_hora        NUMERIC(14,4) NOT NULL DEFAULT 0,
  observacao        TEXT,
  ativo             INTEGER NOT NULL DEFAULT 1,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS maquinas (
  id          TEXT PRIMARY KEY,
  codigo      TEXT    NOT NULL UNIQUE,
  nome        TEXT    NOT NULL,
  tipo        TEXT,                        -- RETA, OVERLOCK, GALONEIRA, PRENSA
  centro_id   TEXT    REFERENCES centros_trabalho(id) ON DELETE SET NULL,
  patrimonio  TEXT,
  quantidade  INTEGER NOT NULL DEFAULT 1,
  custo_hora  NUMERIC(14,4) NOT NULL DEFAULT 0,
  -- Preparado para o §27: horímetro e contagem de ciclos chegam aqui.
  horimetro_atual NUMERIC(14,4) NOT NULL DEFAULT 0,
  aceita_integracao INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'ATIVO'
              CHECK (status IN ('ATIVO','MANUTENCAO','PARADO','BAIXADO')),
  observacao  TEXT,
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

/*
 * OPERAÇÃO é o catálogo do que a fábrica sabe fazer: CORTE, SILK, COSTURA,
 * SUBLIMACAO, DTF, EMBALAGEM. O custo pode vir por peça (como a Conserv
 * pratica hoje) ou por hora — os dois campos convivem porque o §16 pede.
 */
CREATE TABLE IF NOT EXISTS operacoes (
  id             TEXT PRIMARY KEY,
  codigo         TEXT    NOT NULL UNIQUE,
  nome           TEXT    NOT NULL,
  centro_id      TEXT    REFERENCES centros_trabalho(id) ON DELETE SET NULL,
  maquina_padrao_id TEXT REFERENCES maquinas(id) ON DELETE SET NULL,
  custo_por_peca NUMERIC(14,4) NOT NULL DEFAULT 0,
  custo_hora     NUMERIC(14,4) NOT NULL DEFAULT 0,
  tempo_padrao_min NUMERIC(14,4) NOT NULL DEFAULT 0,
  capacidade_hora NUMERIC(14,4) NOT NULL DEFAULT 0,
  terceirizada   INTEGER NOT NULL DEFAULT 0,
  ordem_padrao   INTEGER NOT NULL DEFAULT 0,
  observacao     TEXT,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

/*
 * ROTEIRO pertence à versão do produto, não ao produto. É o que torna
 * "todo produto passa pelo silk" impossível de acontecer por acidente.
 */
CREATE TABLE IF NOT EXISTS roteiros (
  id          TEXT PRIMARY KEY,
  versao_id   TEXT    NOT NULL REFERENCES produto_versoes(id) ON DELETE CASCADE,
  observacao  TEXT,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  UNIQUE (versao_id)
);

CREATE TABLE IF NOT EXISTS roteiro_operacoes (
  id             TEXT PRIMARY KEY,
  roteiro_id     TEXT    NOT NULL REFERENCES roteiros(id) ON DELETE CASCADE,
  operacao_id    TEXT    NOT NULL REFERENCES operacoes(id) ON DELETE RESTRICT,
  sequencia      INTEGER NOT NULL,
  centro_id      TEXT    REFERENCES centros_trabalho(id) ON DELETE SET NULL,
  maquina_id     TEXT    REFERENCES maquinas(id) ON DELETE SET NULL,
  tempo_por_peca_min NUMERIC(14,4) NOT NULL DEFAULT 0,
  custo_por_peca NUMERIC(14,4) NOT NULL DEFAULT 0,
  terceirizada   INTEGER NOT NULL DEFAULT 0,
  observacao     TEXT,
  UNIQUE (roteiro_id, sequencia),
  UNIQUE (roteiro_id, operacao_id)
);

/*
 * FICHA TÉCNICA (BOM). A quantidade bruta não é gravada: é calculada como
 * líquida x (1 + perda), porque gravar as duas convida a divergirem.
 */
CREATE TABLE IF NOT EXISTS bom_itens (
  id               TEXT PRIMARY KEY,
  versao_id        TEXT    NOT NULL REFERENCES produto_versoes(id) ON DELETE CASCADE,
  material_id      TEXT    NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  consumo_por_peca NUMERIC(14,4) NOT NULL CHECK (consumo_por_peca > 0),
  perda_percentual NUMERIC(9,4)  NOT NULL DEFAULT 0 CHECK (perda_percentual >= 0),
  operacao_id      TEXT    REFERENCES operacoes(id) ON DELETE SET NULL,  -- onde entra
  observacao       TEXT,
  UNIQUE (versao_id, material_id)
);

/* Estudo de tempos do §15: as dez primeiras peças, cronometradas. */
CREATE TABLE IF NOT EXISTS estudos_tempo (
  id            TEXT PRIMARY KEY,
  codigo        TEXT    NOT NULL UNIQUE,
  produto_id    TEXT    REFERENCES produtos(id) ON DELETE CASCADE,
  operacao_id   TEXT    NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
  colaborador_id TEXT   REFERENCES colaboradores(id) ON DELETE SET NULL,
  maquina_id    TEXT    REFERENCES maquinas(id) ON DELETE SET NULL,
  data          DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  tempos        TEXT    NOT NULL,          -- JSON com os segundos de cada peça
  media_seg     NUMERIC(14,4),
  mediana_seg   NUMERIC(14,4),
  minimo_seg    NUMERIC(14,4),
  maximo_seg    NUMERIC(14,4),
  desvio_seg    NUMERIC(14,4),
  observacao    TEXT,
  criado_por    TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

/* O tempo que vale para o planejamento, homologado a partir dos estudos. */
CREATE TABLE IF NOT EXISTS tempos_padrao (
  id           TEXT PRIMARY KEY,
  produto_id   TEXT    NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  operacao_id  TEXT    NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
  tempo_min    NUMERIC(14,4) NOT NULL CHECK (tempo_min >= 0),
  estudo_id    TEXT    REFERENCES estudos_tempo(id) ON DELETE SET NULL,
  vigente_de   DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  vigente_ate  DATE,
  criado_em    TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  UNIQUE (produto_id, operacao_id, vigente_de)
);

/* =========================================================== 8. ESTOQUE == */

CREATE TABLE IF NOT EXISTS locais_estoque (
  id        TEXT PRIMARY KEY,
  codigo    TEXT NOT NULL UNIQUE,
  nome      TEXT NOT NULL UNIQUE,          -- ALMOXARIFADO, CORTE, SILK, EXPEDIÇÃO
  tipo      TEXT NOT NULL DEFAULT 'ALMOXARIFADO'
            CHECK (tipo IN ('ALMOXARIFADO','PROCESSO','EXPEDICAO','TERCEIRO','REFUGO')),
  centro_id TEXT REFERENCES centros_trabalho(id) ON DELETE SET NULL,
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS lotes (
  id            TEXT PRIMARY KEY,
  codigo        TEXT    NOT NULL UNIQUE,
  material_id   TEXT    NOT NULL REFERENCES materiais(id) ON DELETE CASCADE,
  fornecedor_id TEXT    REFERENCES fornecedores(id) ON DELETE SET NULL,
  nota_fiscal   TEXT,
  fabricacao    DATE,
  validade      DATE,
  custo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  observacao    TEXT,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

/*
 * Saldo materializado por material/local/lote. Poderia ser sempre somado dos
 * movimentos, mas a tela de estoque e o MRP consultam isso a cada clique —
 * a soma vira lenta com centenas de milhares de movimentos.
 */
CREATE TABLE IF NOT EXISTS estoque_saldos (
  id           TEXT PRIMARY KEY,
  material_id  TEXT    NOT NULL REFERENCES materiais(id) ON DELETE CASCADE,
  local_id     TEXT    NOT NULL REFERENCES locais_estoque(id) ON DELETE CASCADE,
  lote_id      TEXT    REFERENCES lotes(id) ON DELETE SET NULL,
  saldo        NUMERIC(14,4) NOT NULL DEFAULT 0,
  reservado    NUMERIC(14,4) NOT NULL DEFAULT 0,
  atualizado_em TEXT   NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  UNIQUE (material_id, local_id, lote_id)
);

CREATE TABLE IF NOT EXISTS movimentos_estoque (
  id             TEXT PRIMARY KEY,
  codigo         TEXT    NOT NULL UNIQUE,
  material_id    TEXT    NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  local_id       TEXT    NOT NULL REFERENCES locais_estoque(id) ON DELETE RESTRICT,
  local_destino_id TEXT  REFERENCES locais_estoque(id) ON DELETE RESTRICT,
  lote_id        TEXT    REFERENCES lotes(id) ON DELETE SET NULL,
  tipo           TEXT    NOT NULL
                 CHECK (tipo IN ('ENTRADA','SAIDA','TRANSFERENCIA','AJUSTE','CONSUMO',
                                 'DEVOLUCAO','PERDA','SUCATA','INVENTARIO')),
  quantidade     NUMERIC(14,4) NOT NULL CHECK (quantidade <> 0),
  custo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  ordem_id       TEXT    REFERENCES ordens_producao(id) ON DELETE SET NULL,
  recebimento_id TEXT    REFERENCES recebimentos(id) ON DELETE SET NULL,
  inventario_id  TEXT    REFERENCES inventarios(id) ON DELETE SET NULL,
  documento      TEXT,
  observacao     TEXT,
  -- Estorno não apaga: cria o movimento inverso e aponta para o original.
  estorno_de     TEXT    REFERENCES movimentos_estoque(id) ON DELETE SET NULL,
  usuario_id     TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_mov_material ON movimentos_estoque(material_id, criado_em);
CREATE INDEX IF NOT EXISTS ix_mov_ordem ON movimentos_estoque(ordem_id);

CREATE TABLE IF NOT EXISTS inventarios (
  id          TEXT PRIMARY KEY,
  codigo      TEXT    NOT NULL UNIQUE,
  descricao   TEXT    NOT NULL,
  data        DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  local_id    TEXT    REFERENCES locais_estoque(id) ON DELETE SET NULL,
  status      TEXT    NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO','FECHADO','CANCELADO')),
  observacao  TEXT,
  usuario_id  TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  fechado_em  TEXT,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS inventario_itens (
  id            TEXT PRIMARY KEY,
  inventario_id TEXT    NOT NULL REFERENCES inventarios(id) ON DELETE CASCADE,
  material_id   TEXT    NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  lote_id       TEXT    REFERENCES lotes(id) ON DELETE SET NULL,
  saldo_sistema NUMERIC(14,4) NOT NULL DEFAULT 0,
  contado       NUMERIC(14,4),
  movimento_id  TEXT    REFERENCES movimentos_estoque(id) ON DELETE SET NULL,
  observacao    TEXT,
  UNIQUE (inventario_id, material_id, lote_id)
);

/* =========================================================== 9. COMPRAS == */

CREATE TABLE IF NOT EXISTS requisicoes_compra (
  id             TEXT PRIMARY KEY,
  codigo         TEXT    NOT NULL UNIQUE,
  material_id    TEXT    NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  quantidade     NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
  atendida       NUMERIC(14,4) NOT NULL DEFAULT 0,
  urgencia       TEXT    NOT NULL DEFAULT 'NORMAL'
                 CHECK (urgencia IN ('BAIXA','NORMAL','ALTA','URGENTE')),
  necessidade_em DATE,
  origem         TEXT    NOT NULL DEFAULT 'MANUAL'
                 CHECK (origem IN ('MANUAL','MRP','ESTOQUE_MINIMO')),
  ordem_id       TEXT    REFERENCES ordens_producao(id) ON DELETE SET NULL,
  justificativa  TEXT,
  status         TEXT    NOT NULL DEFAULT 'ABERTA'
                 CHECK (status IN ('ABERTA','EM_COTACAO','PARCIAL','ATENDIDA','CANCELADA')),
  usuario_id     TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS cotacoes (
  id          TEXT PRIMARY KEY,
  codigo      TEXT    NOT NULL UNIQUE,
  descricao   TEXT,
  data        DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  validade    DATE,
  status      TEXT    NOT NULL DEFAULT 'ABERTA'
              CHECK (status IN ('ABERTA','RESPONDIDA','DECIDIDA','CANCELADA')),
  observacao  TEXT,
  usuario_id  TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS cotacao_itens (
  id             TEXT PRIMARY KEY,
  cotacao_id     TEXT    NOT NULL REFERENCES cotacoes(id) ON DELETE CASCADE,
  requisicao_id  TEXT    REFERENCES requisicoes_compra(id) ON DELETE SET NULL,
  material_id    TEXT    NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  fornecedor_id  TEXT    NOT NULL REFERENCES fornecedores(id) ON DELETE RESTRICT,
  quantidade     NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
  preco_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  prazo_dias     INTEGER NOT NULL DEFAULT 0,
  escolhido      INTEGER NOT NULL DEFAULT 0,
  observacao     TEXT,
  UNIQUE (cotacao_id, material_id, fornecedor_id)
);

CREATE TABLE IF NOT EXISTS pedidos_compra (
  id                 TEXT PRIMARY KEY,
  codigo             TEXT    NOT NULL UNIQUE,
  fornecedor_id      TEXT    NOT NULL REFERENCES fornecedores(id) ON DELETE RESTRICT,
  data               DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  previsao_entrega   DATE,
  condicao_pagamento TEXT,
  prazo_pagamento_dias INTEGER NOT NULL DEFAULT 0,
  frete              NUMERIC(14,4) NOT NULL DEFAULT 0,
  desconto           NUMERIC(14,4) NOT NULL DEFAULT 0,
  status             TEXT    NOT NULL DEFAULT 'RASCUNHO'
                     CHECK (status IN ('RASCUNHO','ENVIADO','CONFIRMADO','PARCIAL','RECEBIDO','CANCELADO')),
  observacao         TEXT,
  usuario_id         TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em          TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS pedido_compra_itens (
  id               TEXT PRIMARY KEY,
  pedido_compra_id TEXT    NOT NULL REFERENCES pedidos_compra(id) ON DELETE CASCADE,
  material_id      TEXT    NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  requisicao_id    TEXT    REFERENCES requisicoes_compra(id) ON DELETE SET NULL,
  quantidade       NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
  recebido         NUMERIC(14,4) NOT NULL DEFAULT 0,
  preco_unitario   NUMERIC(14,4) NOT NULL DEFAULT 0,
  observacao       TEXT,
  CHECK (recebido <= quantidade)
);

CREATE TABLE IF NOT EXISTS recebimentos (
  id               TEXT PRIMARY KEY,
  codigo           TEXT    NOT NULL UNIQUE,
  pedido_compra_id TEXT    NOT NULL REFERENCES pedidos_compra(id) ON DELETE CASCADE,
  data             DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  nota_fiscal      TEXT,
  local_id         TEXT    REFERENCES locais_estoque(id) ON DELETE SET NULL,
  titulo_id        TEXT    REFERENCES titulos(id) ON DELETE SET NULL,
  observacao       TEXT,
  estornado_em     TEXT,
  usuario_id       TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em        TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS recebimento_itens (
  id             TEXT PRIMARY KEY,
  recebimento_id TEXT    NOT NULL REFERENCES recebimentos(id) ON DELETE CASCADE,
  item_id        TEXT    NOT NULL REFERENCES pedido_compra_itens(id) ON DELETE RESTRICT,
  lote_id        TEXT    REFERENCES lotes(id) ON DELETE SET NULL,
  quantidade     NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
  preco_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  movimento_id   TEXT    REFERENCES movimentos_estoque(id) ON DELETE SET NULL
);

/* ========================================================= 10. PRODUÇÃO == */

CREATE TABLE IF NOT EXISTS ordens_producao (
  id             TEXT PRIMARY KEY,
  codigo         TEXT    NOT NULL UNIQUE,  -- OP-2026-000123
  pedido_item_id TEXT    REFERENCES pedido_itens(id) ON DELETE SET NULL,
  produto_id     TEXT    NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  variacao_id    TEXT    REFERENCES variacoes(id) ON DELETE SET NULL,
  -- A OP carrega a versão que será produzida; se o item já tinha uma, é essa.
  versao_id      TEXT    REFERENCES produto_versoes(id) ON DELETE RESTRICT,
  quantidade     NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
  quantidade_boa NUMERIC(14,4) NOT NULL DEFAULT 0,
  quantidade_refugo NUMERIC(14,4) NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL DEFAULT 'ABERTA'
                 CHECK (status IN ('ABERTA','LIBERADA','EM_PRODUCAO','PAUSADA','CONCLUIDA',
                                   'ENTREGUE','CANCELADA')),
  prioridade     INTEGER NOT NULL DEFAULT 5 CHECK (prioridade BETWEEN 1 AND 9),
  data_inicio_prevista DATE,
  data_fim_prevista    DATE,
  data_inicio_real     TEXT,
  data_fim_real        TEXT,
  materiais_baixados   INTEGER NOT NULL DEFAULT 0,
  observacao     TEXT,
  encerrada_em   TEXT,                     -- OP encerrada não aceita apontamento
  usuario_id     TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_op_status ON ordens_producao(status);
CREATE INDEX IF NOT EXISTS ix_op_item ON ordens_producao(pedido_item_id);

/* Uma OP grande vira lotes; cada lote anda sozinho pelo chão de fábrica. */
CREATE TABLE IF NOT EXISTS lotes_producao (
  id         TEXT PRIMARY KEY,
  codigo     TEXT    NOT NULL UNIQUE,
  ordem_id   TEXT    NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
  quantidade NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
  status     TEXT    NOT NULL DEFAULT 'ABERTO'
             CHECK (status IN ('ABERTO','EM_PRODUCAO','CONCLUIDO','CANCELADO')),
  criado_em  TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

/*
 * As operações desta OP, copiadas do roteiro da versão no momento da abertura.
 * É aqui que mora o andamento real — e é isto que substitui as colunas
 * CORTE/SILK/COSTURA/EMBALAGEM da planilha, sem presumir que todo produto
 * tenha as quatro.
 */
CREATE TABLE IF NOT EXISTS op_operacoes (
  id             TEXT PRIMARY KEY,
  ordem_id       TEXT    NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
  lote_id        TEXT    REFERENCES lotes_producao(id) ON DELETE CASCADE,
  operacao_id    TEXT    NOT NULL REFERENCES operacoes(id) ON DELETE RESTRICT,
  sequencia      INTEGER NOT NULL,
  centro_id      TEXT    REFERENCES centros_trabalho(id) ON DELETE SET NULL,
  maquina_id     TEXT    REFERENCES maquinas(id) ON DELETE SET NULL,
  status         TEXT    NOT NULL DEFAULT 'AGUARDANDO'
                 CHECK (status IN ('AGUARDANDO','LIBERADA','EM_EXECUCAO','PAUSADA',
                                   'CONCLUIDA','PULADA','CANCELADA')),
  tempo_previsto_min NUMERIC(14,4) NOT NULL DEFAULT 0,
  tempo_real_min     NUMERIC(14,4) NOT NULL DEFAULT 0,
  custo_previsto     NUMERIC(14,4) NOT NULL DEFAULT 0,
  custo_real         NUMERIC(14,4) NOT NULL DEFAULT 0,
  quantidade_boa     NUMERIC(14,4) NOT NULL DEFAULT 0,
  quantidade_refugo  NUMERIC(14,4) NOT NULL DEFAULT 0,
  iniciada_em    TEXT,
  concluida_em   TEXT,
  observacao     TEXT,
  UNIQUE (ordem_id, lote_id, sequencia)
);
CREATE INDEX IF NOT EXISTS ix_op_oper_status ON op_operacoes(status, centro_id);

/* O que a OP precisa consumir, explodido da ficha na abertura. */
CREATE TABLE IF NOT EXISTS ordem_materiais (
  id              TEXT PRIMARY KEY,
  ordem_id        TEXT    NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
  material_id     TEXT    NOT NULL REFERENCES materiais(id) ON DELETE RESTRICT,
  quantidade_prevista NUMERIC(14,4) NOT NULL CHECK (quantidade_prevista >= 0),
  quantidade_consumida NUMERIC(14,4) NOT NULL DEFAULT 0,
  custo_previsto  NUMERIC(14,4) NOT NULL DEFAULT 0,
  custo_real      NUMERIC(14,4) NOT NULL DEFAULT 0,
  UNIQUE (ordem_id, material_id)
);

CREATE TABLE IF NOT EXISTS apontamentos (
  id             TEXT PRIMARY KEY,
  codigo         TEXT    NOT NULL UNIQUE,
  op_operacao_id TEXT    NOT NULL REFERENCES op_operacoes(id) ON DELETE CASCADE,
  colaborador_id TEXT    REFERENCES colaboradores(id) ON DELETE SET NULL,
  maquina_id     TEXT    REFERENCES maquinas(id) ON DELETE SET NULL,
  inicio         TEXT    NOT NULL,
  fim            TEXT,
  minutos        NUMERIC(14,4) NOT NULL DEFAULT 0,
  quantidade_boa NUMERIC(14,4) NOT NULL DEFAULT 0,
  quantidade_refugo NUMERIC(14,4) NOT NULL DEFAULT 0,
  custo_mo       NUMERIC(14,4) NOT NULL DEFAULT 0,
  -- Preparado para o §27: quando a máquina apontar sozinha, a origem muda.
  origem         TEXT    NOT NULL DEFAULT 'MANUAL'
                 CHECK (origem IN ('MANUAL','TABLET','HORIMETRO','INTEGRACAO')),
  ciclos_maquina INTEGER,
  observacao     TEXT,
  cancelado_em   TEXT,
  usuario_id     TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_apont_operacao ON apontamentos(op_operacao_id);

/* Todo movimento no kanban vira linha: o §25 pede o histórico do arrasto. */
CREATE TABLE IF NOT EXISTS op_movimentos (
  id             TEXT PRIMARY KEY,
  ordem_id       TEXT    NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
  op_operacao_id TEXT    REFERENCES op_operacoes(id) ON DELETE SET NULL,
  de_status      TEXT,
  para_status    TEXT    NOT NULL,
  de_centro_id   TEXT    REFERENCES centros_trabalho(id) ON DELETE SET NULL,
  para_centro_id TEXT    REFERENCES centros_trabalho(id) ON DELETE SET NULL,
  motivo         TEXT,
  usuario_id     TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nome   TEXT,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);
CREATE INDEX IF NOT EXISTS ix_op_mov_ordem ON op_movimentos(ordem_id, criado_em);

CREATE TABLE IF NOT EXISTS ocorrencias (
  id             TEXT PRIMARY KEY,
  codigo         TEXT    NOT NULL UNIQUE,
  data           DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  centro_id      TEXT    REFERENCES centros_trabalho(id) ON DELETE SET NULL,
  ordem_id       TEXT    REFERENCES ordens_producao(id) ON DELETE SET NULL,
  maquina_id     TEXT    REFERENCES maquinas(id) ON DELETE SET NULL,
  motivo         TEXT    NOT NULL DEFAULT 'OUTRO'
                 CHECK (motivo IN ('FALTA_MATERIAL','QUEBRA_EQUIPAMENTO','FALTA_PESSOAL',
                                   'RETRABALHO','ENERGIA','AGUARDANDO_SETOR','TREINAMENTO','OUTRO')),
  minutos_parado NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (minutos_parado >= 0),
  descricao      TEXT,
  acao           TEXT,
  resolvida      INTEGER NOT NULL DEFAULT 0,
  usuario_id     TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

/* ======================================================== 11. QUALIDADE == */

CREATE TABLE IF NOT EXISTS tipos_defeito (
  id         TEXT PRIMARY KEY,
  codigo     TEXT NOT NULL UNIQUE,
  nome       TEXT NOT NULL UNIQUE,
  categoria  TEXT,                         -- COSTURA, TECIDO, ESTAMPA, MEDIDA
  gravidade  TEXT NOT NULL DEFAULT 'MEDIA' CHECK (gravidade IN ('BAIXA','MEDIA','ALTA')),
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS inspecoes (
  id             TEXT PRIMARY KEY,
  codigo         TEXT    NOT NULL UNIQUE,
  ordem_id       TEXT    REFERENCES ordens_producao(id) ON DELETE SET NULL,
  op_operacao_id TEXT    REFERENCES op_operacoes(id) ON DELETE SET NULL,
  data           DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  quantidade_inspecionada NUMERIC(14,4) NOT NULL CHECK (quantidade_inspecionada > 0),
  quantidade_aprovada     NUMERIC(14,4) NOT NULL DEFAULT 0,
  quantidade_rejeitada    NUMERIC(14,4) NOT NULL DEFAULT 0,
  quantidade_retrabalho   NUMERIC(14,4) NOT NULL DEFAULT 0,
  colaborador_id TEXT    REFERENCES colaboradores(id) ON DELETE SET NULL,
  centro_id      TEXT    REFERENCES centros_trabalho(id) ON DELETE SET NULL,
  resultado      TEXT    NOT NULL DEFAULT 'APROVADO'
                 CHECK (resultado IN ('APROVADO','APROVADO_COM_RESSALVA','REPROVADO')),
  observacao     TEXT,
  usuario_id     TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  CHECK (quantidade_aprovada + quantidade_rejeitada <= quantidade_inspecionada)
);

CREATE TABLE IF NOT EXISTS inspecao_defeitos (
  id          TEXT PRIMARY KEY,
  inspecao_id TEXT    NOT NULL REFERENCES inspecoes(id) ON DELETE CASCADE,
  tipo_id     TEXT    NOT NULL REFERENCES tipos_defeito(id) ON DELETE RESTRICT,
  quantidade  NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
  observacao  TEXT
);

/* ======================================================== 12. EXPEDIÇÃO == */

CREATE TABLE IF NOT EXISTS transportadoras (
  id        TEXT PRIMARY KEY,
  codigo    TEXT NOT NULL UNIQUE,
  nome      TEXT NOT NULL UNIQUE,
  cnpj      TEXT,
  telefone  TEXT,
  contato   TEXT,
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS romaneios (
  id                TEXT PRIMARY KEY,
  codigo            TEXT    NOT NULL UNIQUE,
  pedido_id         TEXT    REFERENCES pedidos(id) ON DELETE SET NULL,
  cliente_id        TEXT    NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  data              DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  transportadora_id TEXT    REFERENCES transportadoras(id) ON DELETE SET NULL,
  motorista         TEXT,
  placa             TEXT,
  volumes           INTEGER NOT NULL DEFAULT 1,
  peso_kg           NUMERIC(14,4),
  status            TEXT    NOT NULL DEFAULT 'EM_CONFERENCIA'
                    CHECK (status IN ('EM_CONFERENCIA','CONFERIDO','EXPEDIDO','ENTREGUE','CANCELADO')),
  entregue_em       DATE,
  recebido_por      TEXT,
  observacao        TEXT,
  usuario_id        TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em         TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS romaneio_itens (
  id             TEXT PRIMARY KEY,
  romaneio_id    TEXT    NOT NULL REFERENCES romaneios(id) ON DELETE CASCADE,
  pedido_item_id TEXT    REFERENCES pedido_itens(id) ON DELETE SET NULL,
  ordem_id       TEXT    REFERENCES ordens_producao(id) ON DELETE SET NULL,
  descricao      TEXT,
  quantidade     NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
  conferida      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notas_fiscais (
  id          TEXT PRIMARY KEY,
  numero      TEXT    NOT NULL,
  serie       TEXT    NOT NULL DEFAULT '1',
  chave       TEXT    UNIQUE,
  pedido_id   TEXT    REFERENCES pedidos(id) ON DELETE SET NULL,
  romaneio_id TEXT    REFERENCES romaneios(id) ON DELETE SET NULL,
  cliente_id  TEXT    REFERENCES clientes(id) ON DELETE SET NULL,
  emissao     DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  valor_total NUMERIC(14,4) NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'EMITIDA'
              CHECK (status IN ('EMITIDA','AUTORIZADA','CANCELADA','DENEGADA')),
  observacao  TEXT,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  UNIQUE (numero, serie)
);

/* ======================================================= 13. FINANCEIRO == */

CREATE TABLE IF NOT EXISTS centros_custo (
  id        TEXT PRIMARY KEY,
  codigo    TEXT NOT NULL UNIQUE,
  nome      TEXT NOT NULL UNIQUE,
  tipo      TEXT NOT NULL DEFAULT 'OPERACIONAL'
            CHECK (tipo IN ('OPERACIONAL','ADMINISTRATIVO','COMERCIAL','INVESTIMENTO')),
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS categorias_financeiras (
  id        TEXT PRIMARY KEY,
  codigo    TEXT NOT NULL UNIQUE,
  nome      TEXT NOT NULL,
  tipo      TEXT NOT NULL CHECK (tipo IN ('RECEBER','PAGAR')),
  grupo     TEXT,
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  UNIQUE (nome, tipo)
);

CREATE TABLE IF NOT EXISTS contas_bancarias (
  id            TEXT PRIMARY KEY,
  codigo        TEXT NOT NULL UNIQUE,
  nome          TEXT NOT NULL UNIQUE,
  tipo          TEXT NOT NULL DEFAULT 'BANCO' CHECK (tipo IN ('CAIXA','BANCO','APLICACAO')),
  banco         TEXT,
  agencia       TEXT,
  conta         TEXT,
  saldo_inicial NUMERIC(14,4) NOT NULL DEFAULT 0,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS titulos (
  id            TEXT PRIMARY KEY,
  codigo        TEXT    NOT NULL UNIQUE,
  tipo          TEXT    NOT NULL CHECK (tipo IN ('RECEBER','PAGAR')),
  descricao     TEXT    NOT NULL,
  cliente_id    TEXT    REFERENCES clientes(id) ON DELETE SET NULL,
  fornecedor_id TEXT    REFERENCES fornecedores(id) ON DELETE SET NULL,
  pedido_id     TEXT    REFERENCES pedidos(id) ON DELETE SET NULL,
  nota_fiscal_id TEXT   REFERENCES notas_fiscais(id) ON DELETE SET NULL,
  categoria_id  TEXT    REFERENCES categorias_financeiras(id) ON DELETE SET NULL,
  centro_custo_id TEXT  REFERENCES centros_custo(id) ON DELETE SET NULL,
  documento     TEXT,
  valor         NUMERIC(14,4) NOT NULL CHECK (valor > 0),
  pago          NUMERIC(14,4) NOT NULL DEFAULT 0,
  emissao       DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  vencimento    DATE    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'ABERTO'
                CHECK (status IN ('ABERTO','PARCIAL','QUITADO','CANCELADO')),
  observacao    TEXT,
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),  -- [PORT]
  CHECK (pago <= valor)
);
CREATE INDEX IF NOT EXISTS ix_titulos_venc ON titulos(vencimento, status);

CREATE TABLE IF NOT EXISTS baixas (
  id         TEXT PRIMARY KEY,
  titulo_id  TEXT    NOT NULL REFERENCES titulos(id) ON DELETE CASCADE,
  conta_id   TEXT    REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  data       DATE    NOT NULL DEFAULT (date('now')),  -- [PORT]
  valor      NUMERIC(14,4) NOT NULL CHECK (valor > 0),
  juros      NUMERIC(14,4) NOT NULL DEFAULT 0,
  desconto   NUMERIC(14,4) NOT NULL DEFAULT 0,
  forma      TEXT,
  observacao TEXT,
  estorno_de TEXT    REFERENCES baixas(id) ON DELETE SET NULL,
  usuario_id TEXT    REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em  TEXT    NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

CREATE TABLE IF NOT EXISTS custos_fixos (
  id              TEXT PRIMARY KEY,
  codigo          TEXT NOT NULL UNIQUE,
  descricao       TEXT NOT NULL,
  tipo            TEXT NOT NULL DEFAULT 'OUTRO'
                  CHECK (tipo IN ('ALUGUEL','ENERGIA','AGUA','MANUTENCAO','ADMINISTRATIVO',
                                  'IMPOSTO','SEGURO','DEPRECIACAO','SOFTWARE','OUTRO')),
  centro_custo_id TEXT REFERENCES centros_custo(id) ON DELETE SET NULL,
  valor_mensal    NUMERIC(14,4) NOT NULL DEFAULT 0,
  observacao      TEXT,
  ativo           INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now'))  -- [PORT]
);

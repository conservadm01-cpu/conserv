/**
 * Migrações incrementais para bancos que já existem.
 *
 * O schema.sql cuida de tabelas novas (CREATE TABLE IF NOT EXISTS), mas colunas
 * adicionadas a tabelas antigas precisam de ALTER — e o SQLite não tem
 * "ADD COLUMN IF NOT EXISTS". Estas funções conferem antes de alterar, então
 * rodar duas vezes não quebra nada.
 */

const colunas = (db, tabela) =>
  db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);

export function adicionarColuna(db, tabela, coluna, definicao) {
  const existe = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(tabela);
  if (!existe) return false;
  if (colunas(db, tabela).includes(coluna)) return false;
  db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
  return true;
}

export function aplicarMigracoes(db) {
  const feitas = [];
  const alterar = (tabela, coluna, definicao) => {
    if (adicionarColuna(db, tabela, coluna, definicao)) feitas.push(`${tabela}.${coluna}`);
  };

  // Engenharia: a etapa deixa de ser só um nome e passa a ter setor,
  // equipamento e tempo padrão — é o que permite custear e planejar.
  alterar('etapas', 'departamento_id', 'INTEGER REFERENCES departamentos(id) ON DELETE SET NULL');
  alterar('etapas', 'equipamento_id', 'INTEGER REFERENCES equipamentos(id) ON DELETE SET NULL');
  alterar('etapas', 'tempo_por_peca_min', 'REAL NOT NULL DEFAULT 0');

  // Estoque em mais de um local.
  alterar('movimentos_estoque', 'local_id', 'INTEGER REFERENCES locais_estoque(id) ON DELETE SET NULL');
  alterar('materiais', 'grupo_id', 'INTEGER REFERENCES grupos_material(id) ON DELETE SET NULL');
  alterar('materiais', 'local_padrao_id', 'INTEGER REFERENCES locais_estoque(id) ON DELETE SET NULL');

  // Usuário do sistema ligado à pessoa do RH, com permissões próprias.
  alterar('usuarios', 'colaborador_id', 'INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL');
  alterar('usuarios', 'permissoes', 'TEXT');
  alterar('usuarios', 'nivel_acesso', "TEXT NOT NULL DEFAULT 'consulta'");
  // Primeiro acesso: senha entregue pelo administrador tem de ser trocada na entrada.
  alterar('usuarios', 'senha_provisoria', 'INTEGER NOT NULL DEFAULT 0');
  alterar('usuarios', 'senha_alterada_em', 'TEXT');
  alterar('usuarios', 'ultimo_acesso', 'TEXT');

  // Cadastros completos: endereço, dados fiscais e condição de pagamento.
  for (const [coluna, tipo] of [
    ['inscricao_estadual', 'TEXT'], ['cep', 'TEXT'], ['endereco', 'TEXT'], ['numero', 'TEXT'],
    ['complemento', 'TEXT'], ['bairro', 'TEXT'],
    ['prazo_pagamento_dias', 'INTEGER NOT NULL DEFAULT 0'],
    ['limite_credito', 'REAL NOT NULL DEFAULT 0'],
    ['condicao_pagamento', 'TEXT'],
    // Cadastro juntado a outro: guarda para onde foi, para não voltar como duplicata.
    ['mesclado_em', 'INTEGER'],
  ]) alterar('clientes', coluna, tipo);

  for (const [coluna, tipo] of [
    ['inscricao_estadual', 'TEXT'], ['cep', 'TEXT'], ['endereco', 'TEXT'], ['numero', 'TEXT'],
    ['bairro', 'TEXT'], ['cidade', 'TEXT'], ['uf', 'TEXT'],
    ['condicao_pagamento', 'TEXT'], ['observacao', 'TEXT'],
  ]) alterar('fornecedores', coluna, tipo);

  for (const [coluna, tipo] of [
    ['rg', 'TEXT'], ['data_nascimento', 'TEXT'], ['cep', 'TEXT'], ['endereco', 'TEXT'],
    ['numero', 'TEXT'], ['bairro', 'TEXT'], ['cidade', 'TEXT'], ['uf', 'TEXT'],
    ['pix', 'TEXT'], ['contato_emergencia', 'TEXT'], ['data_demissao', 'TEXT'],
  ]) alterar('colaboradores', coluna, tipo);

  // Ficha de produção: o material passa a dizer em que setor é consumido, para
  // a via do corte não vir com saco plástico e a da embalagem não vir com tecido.
  alterar('ficha_tecnica', 'setor', 'TEXT');

  // A capa da ordem de produção imprime a nota fiscal e a data em que ela saiu.
  alterar('pedidos', 'data_nota_fiscal', 'TEXT');

  // O pedido passa a saber de onde veio: do orçamento aprovado e da oportunidade.
  alterar('pedidos', 'orcamento_id', 'INTEGER REFERENCES orcamentos(id) ON DELETE SET NULL');
  alterar('pedidos', 'oportunidade_id', 'INTEGER REFERENCES oportunidades(id) ON DELETE SET NULL');
  alterar('pedidos', 'condicao_pagamento', 'TEXT');

  return feitas;
}

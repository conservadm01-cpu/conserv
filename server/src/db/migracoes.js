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

  return feitas;
}

import { useApi } from '../lib/hooks';
import TabelaCrud, { type Coluna, type CampoForm } from '../components/TabelaCrud';
import type { Cliente, Simples } from '../tipos';

const COLUNAS: Coluna<Cliente>[] = [
  { chave: 'nome', rotulo: 'Cliente' },
  { chave: 'categoria', rotulo: 'Categoria' },
  { chave: 'cnpj', rotulo: 'CNPJ' },
  { chave: 'contato', rotulo: 'Contato' },
  { chave: 'telefone', rotulo: 'Telefone' },
  { chave: 'email', rotulo: 'E-mail' },
  { chave: 'cidade', rotulo: 'Cidade' },
];

export default function Clientes() {
  const { dados: categorias } = useApi<Simples[]>('/categorias-cliente');

  const campos: CampoForm[] = [
    { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
    {
      nome: 'categoria_id', rotulo: 'Categoria', tipo: 'select',
      opcoes: (categorias ?? []).map((c) => ({ valor: c.id, rotulo: c.nome })),
    },
    { nome: 'cnpj', rotulo: 'CNPJ' },
    { nome: 'contato', rotulo: 'Contato' },
    { nome: 'telefone', rotulo: 'Telefone' },
    { nome: 'email', rotulo: 'E-mail' },
    { nome: 'cidade', rotulo: 'Cidade' },
    { nome: 'uf', rotulo: 'UF' },
    { nome: 'observacao', rotulo: 'Observação' },
  ];

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Clientes</h1>
          <p>Base comercial usada nos pedidos e na segmentação por categoria</p>
        </div>
      </header>
      <TabelaCrud<Cliente>
        titulo="Clientes"
        recurso="/clientes"
        colunas={COLUNAS}
        campos={campos}
      />
    </>
  );
}

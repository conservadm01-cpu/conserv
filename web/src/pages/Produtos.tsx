import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { moeda } from '../lib/formato';
import TabelaCrud, { type Coluna, type CampoForm } from '../components/TabelaCrud';
import { Etiqueta } from '../components/ui';
import type { Produto, Simples } from '../tipos';

const COLUNAS: Coluna<Produto>[] = [
  { chave: 'descricao', rotulo: 'Produto', render: (p) => <Link to={`/produtos/${p.id}`}>{p.descricao}</Link> },
  { chave: 'grupo', rotulo: 'Grupo' },
  { chave: 'linha', rotulo: 'Linha' },
  { chave: 'preco_padrao', rotulo: 'Preço padrão', num: true, render: (p) => moeda(p.preco_padrao) },
  {
    chave: 'itens_ficha', rotulo: 'Ficha técnica',
    render: (p) => p.itens_ficha > 0
      ? <Etiqueta texto={`${p.itens_ficha} materiais`} tom="verde" />
      : <Etiqueta texto="sem ficha" tom="amarela" />,
  },
];

export default function Produtos() {
  const { dados: grupos } = useApi<Simples[]>('/grupos-produto');

  const campos: CampoForm[] = [
    { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true },
    { nome: 'codigo', rotulo: 'Código' },
    {
      nome: 'grupo_id', rotulo: 'Grupo', tipo: 'select',
      opcoes: (grupos ?? []).map((g) => ({ valor: g.id, rotulo: g.nome })),
    },
    {
      nome: 'linha', rotulo: 'Linha', tipo: 'select', padrao: 'LEVE',
      opcoes: [
        { valor: 'LEVE', rotulo: 'Leve' },
        { valor: 'PESADA', rotulo: 'Pesada' },
        { valor: 'AMBAS', rotulo: 'Ambas' },
      ],
    },
    { nome: 'preco_padrao', rotulo: 'Preço padrão', tipo: 'numero', padrao: 0 },
  ];

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Produtos e ficha técnica</h1>
          <p>Clique no produto para definir os materiais consumidos e o custo de mão de obra por etapa</p>
        </div>
      </header>
      <TabelaCrud<Produto>
        titulo="Produtos"
        recurso="/produtos"
        colunas={COLUNAS}
        campos={campos}
        acoesExtras={(p) => <Link className="botao pequeno" to={`/produtos/${p.id}`}>Ficha</Link>}
      />
    </>
  );
}

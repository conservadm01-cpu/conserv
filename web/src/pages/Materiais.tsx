import { useApi } from '../lib/hooks';
import { moeda, decimal } from '../lib/formato';
import TabelaCrud, { type Coluna, type CampoForm } from '../components/TabelaCrud';
import type { CampoFiltro } from '../components/Filtros';
import type { Material, Fornecedor } from '../tipos';

const TIPOS = ['TECIDO', 'AVIAMENTO', 'EMBALAGEM', 'TINTA', 'ETIQUETA', 'SERVICO', 'OUTRO'];
const UNIDADES = ['UN', 'MT', 'M2', 'KG', 'L', 'PC', 'CX', 'RL'];

const COLUNAS: Coluna<Material>[] = [
  { chave: 'codigo', rotulo: 'Código' },
  { chave: 'descricao', rotulo: 'Material' },
  { chave: 'tipo', rotulo: 'Tipo' },
  { chave: 'unidade', rotulo: 'Un.' },
  { chave: 'custo_unitario', rotulo: 'Custo unit.', num: true, render: (m) => moeda(m.custo_unitario) },
  { chave: 'estoque_min', rotulo: 'Estoque mín.', num: true, render: (m) => decimal(m.estoque_min) },
  { chave: 'localizacao', rotulo: 'Localização' },
];

export default function Materiais() {
  const { dados: fornecedores } = useApi<Fornecedor[]>('/fornecedores?ativo=true');

  const campos: CampoForm[] = [
    { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true },
    { nome: 'codigo', rotulo: 'Código' },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', padrao: 'TECIDO', opcoes: TIPOS.map((t) => ({ valor: t, rotulo: t })) },
    { nome: 'unidade', rotulo: 'Unidade', tipo: 'select', padrao: 'UN', opcoes: UNIDADES.map((u) => ({ valor: u, rotulo: u })) },
    { nome: 'custo_unitario', rotulo: 'Custo unitário', tipo: 'numero', padrao: 0 },
    { nome: 'estoque_min', rotulo: 'Estoque mínimo', tipo: 'numero', padrao: 0, ajuda: 'Gera alerta quando o saldo cai a este nível' },
    { nome: 'localizacao', rotulo: 'Localização' },
    {
      nome: 'fornecedor_id', rotulo: 'Fornecedor', tipo: 'select',
      opcoes: (fornecedores ?? []).map((f) => ({ valor: f.id, rotulo: f.nome })),
    },
  ];

  const filtros: CampoFiltro[] = [
    { chave: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: TIPOS.map((t) => ({ valor: t, rotulo: t })) },
    { chave: 'unidade', rotulo: 'Unidade', tipo: 'select', opcoes: UNIDADES.map((u) => ({ valor: u, rotulo: u })) },
    { chave: 'fornecedor_id', rotulo: 'Fornecedor', tipo: 'select',
      opcoes: (fornecedores ?? []).map((f) => ({ valor: f.id, rotulo: f.nome })) },
    { chave: 'ativo', rotulo: 'só ativos', tipo: 'marcar' },
  ];

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Cadastro de materiais</h1>
          <p>Tecidos, aviamentos, tintas e embalagens usados na ficha técnica dos produtos</p>
        </div>
      </header>
      <TabelaCrud<Material>
        titulo="Materiais"
        descricao="O saldo é controlado na tela de Estoque"
        recurso="/materiais"
        colunas={COLUNAS}
        campos={campos}
        filtros={filtros}
        filtrosIniciais={{ ativo: 'true' }}
      />
    </>
  );
}

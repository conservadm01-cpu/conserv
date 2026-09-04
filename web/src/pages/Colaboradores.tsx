import { useApi } from '../lib/hooks';
import { moeda, data } from '../lib/formato';
import TabelaCrud, { type Coluna, type CampoForm } from '../components/TabelaCrud';
import { Etiqueta, Indicador } from '../components/ui';
import type { Colaborador, Departamento, CustoSetor } from '../tipos';

const COLUNAS: Coluna<Colaborador>[] = [
  { chave: 'nome', rotulo: 'Nome' },
  { chave: 'cargo', rotulo: 'Cargo' },
  { chave: 'departamento', rotulo: 'Setor' },
  { chave: 'data_admissao', rotulo: 'Admissão', render: (c) => data(c.data_admissao) },
  { chave: 'salario', rotulo: 'Salário', num: true, render: (c) => moeda(c.salario) },
  { chave: 'vale_transporte', rotulo: 'Vale-transporte', num: true, render: (c) => moeda(c.vale_transporte) },
  {
    chave: 'produtivo', rotulo: 'Produção',
    render: (c) => (c.produtivo ? <Etiqueta texto="produtivo" tom="verde" /> : <Etiqueta texto="apoio" />),
  },
  { chave: 'status', rotulo: 'Situação', render: (c) => <Etiqueta texto={c.status} tom={c.status === 'ATIVO' ? 'verde' : 'amarela'} /> },
];

export default function Colaboradores() {
  const { dados: setores } = useApi<Departamento[]>('/engenharia/departamentos');
  const { dados: custos, recarregar } = useApi<CustoSetor[]>('/engenharia/custo-setores');

  const folha = (custos ?? []).reduce((s, c) => s + c.folha_por_pessoa * c.com_salario, 0);
  const pessoas = (custos ?? []).reduce((s, c) => s + c.pessoas, 0);
  const incompletos = (custos ?? []).filter((c) => c.incompleto || c.sem_salario).length;

  const campos: CampoForm[] = [
    { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
    { nome: 'cargo', rotulo: 'Cargo' },
    {
      nome: 'departamento_id', rotulo: 'Setor', tipo: 'select',
      opcoes: (setores ?? []).map((d) => ({ valor: d.id, rotulo: d.nome })),
      ajuda: 'O setor define de qual folha sai o custo da hora desta pessoa',
    },
    { nome: 'data_admissao', rotulo: 'Admissão', tipo: 'data' },
    { nome: 'salario', rotulo: 'Salário', tipo: 'numero', padrao: 0 },
    { nome: 'vale_transporte', rotulo: 'Vale-transporte (empresa)', tipo: 'numero', padrao: 0 },
    { nome: 'produtivo', rotulo: 'Produtivo (1 ou 0)', tipo: 'numero', padrao: 1,
      ajuda: '1 para quem produz; 0 para apoio e administrativo' },
    {
      nome: 'status', rotulo: 'Situação', tipo: 'select', padrao: 'ATIVO',
      opcoes: [
        { valor: 'ATIVO', rotulo: 'Ativo' },
        { valor: 'AFASTADO', rotulo: 'Afastado' },
        { valor: 'INATIVO', rotulo: 'Inativo' },
      ],
    },
    { nome: 'cpf', rotulo: 'CPF' },
    { nome: 'telefone', rotulo: 'Telefone' },
    { nome: 'email', rotulo: 'E-mail' },
  ];

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Colaboradores</h1>
          <p>A equipe de cada setor — é dela que sai o custo do minuto de produção</p>
        </div>
      </header>

      <div className="grade c3">
        <Indicador rotulo="Pessoas nos setores" valor={pessoas} />
        <Indicador rotulo="Folha estimada com encargos" valor={moeda(folha)} nota="salário + encargos + vale-transporte" />
        <Indicador rotulo="Setores com folha incompleta" valor={incompletos}
          tom={incompletos ? 'perigo' : 'sucesso'}
          nota={incompletos ? 'o custo desses setores sai subestimado' : 'todos com salário cadastrado'} />
      </div>

      <TabelaCrud<Colaborador>
        titulo="Cadastro"
        recurso="/colaboradores"
        colunas={COLUNAS}
        campos={campos}
        aoMudar={recarregar}
      />
    </>
  );
}

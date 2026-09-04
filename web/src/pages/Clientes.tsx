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
  { chave: 'prazo_pagamento_dias', rotulo: 'Prazo', num: true, render: (c) => `${c.prazo_pagamento_dias ?? 0} d` },
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
    { nome: 'inscricao_estadual', rotulo: 'Inscrição estadual' },
    { nome: 'cep', rotulo: 'CEP' },
    { nome: 'endereco', rotulo: 'Endereço' },
    { nome: 'numero', rotulo: 'Número' },
    { nome: 'complemento', rotulo: 'Complemento' },
    { nome: 'bairro', rotulo: 'Bairro' },
    { nome: 'cidade', rotulo: 'Cidade' },
    { nome: 'uf', rotulo: 'UF' },
    { nome: 'prazo_pagamento_dias', rotulo: 'Prazo de pagamento (dias)', tipo: 'numero', padrao: 0,
      ajuda: 'Vira o vencimento padrão ao faturar um pedido deste cliente' },
    { nome: 'condicao_pagamento', rotulo: 'Condição de pagamento', ajuda: 'Ex.: 28/56 dias' },
    { nome: 'limite_credito', rotulo: 'Limite de crédito', tipo: 'numero', padrao: 0 },
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

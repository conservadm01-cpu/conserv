import { useState } from 'react';
import TabelaCrud, { type Coluna, type CampoForm } from '../components/TabelaCrud';
import type { Simples, Fornecedor, Etapa } from '../tipos';

const ABAS = ['Vendedores', 'Categorias de cliente', 'Grupos de produto', 'Fornecedores',
              'Etapas do processo', 'Categorias financeiras', 'Contas bancárias'] as const;

const NOME_SIMPLES: Coluna<Simples>[] = [{ chave: 'nome', rotulo: 'Nome' }];
const CAMPO_NOME: CampoForm[] = [{ nome: 'nome', rotulo: 'Nome', obrigatorio: true }];

export default function Cadastros() {
  const [aba, setAba] = useState<(typeof ABAS)[number]>('Vendedores');

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Tabelas auxiliares</h1>
          <p>Listas que alimentam os pedidos, a produção e os relatórios</p>
        </div>
      </header>

      <div className="abas">
        {ABAS.map((a) => (
          <button key={a} className={`aba${aba === a ? ' ativa' : ''}`} onClick={() => setAba(a)}>{a}</button>
        ))}
      </div>

      {aba === 'Vendedores' && (
        <TabelaCrud<Simples>
          titulo="Vendedores"
          recurso="/vendedores"
          colunas={[
            { chave: 'nome', rotulo: 'Nome' },
            { chave: 'email', rotulo: 'E-mail' },
            { chave: 'telefone', rotulo: 'Telefone' },
          ]}
          campos={[
            { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
            { nome: 'email', rotulo: 'E-mail' },
            { nome: 'telefone', rotulo: 'Telefone' },
          ]}
        />
      )}

      {aba === 'Categorias de cliente' && (
        <TabelaCrud<Simples>
          titulo="Categorias de cliente"
          descricao="Cosmético, Pet, Havanna, Indústria…"
          recurso="/categorias-cliente"
          colunas={NOME_SIMPLES}
          campos={CAMPO_NOME}
        />
      )}

      {aba === 'Grupos de produto' && (
        <TabelaCrud<Simples>
          titulo="Grupos de produto"
          descricao="Avental, Camiseta, Jaleco, Sacola…"
          recurso="/grupos-produto"
          colunas={NOME_SIMPLES}
          campos={CAMPO_NOME}
        />
      )}

      {aba === 'Fornecedores' && (
        <TabelaCrud<Fornecedor>
          titulo="Fornecedores"
          recurso="/fornecedores"
          colunas={[
            { chave: 'nome', rotulo: 'Fornecedor' },
            { chave: 'cnpj', rotulo: 'CNPJ' },
            { chave: 'contato', rotulo: 'Contato' },
            { chave: 'telefone', rotulo: 'Telefone' },
            { chave: 'cidade', rotulo: 'Cidade' },
            { chave: 'prazo_entrega_dias', rotulo: 'Prazo (dias)', num: true },
            { chave: 'condicao_pagamento', rotulo: 'Pagamento' },
          ]}
          campos={[
            { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
            { nome: 'cnpj', rotulo: 'CNPJ' },
            { nome: 'inscricao_estadual', rotulo: 'Inscrição estadual' },
            { nome: 'contato', rotulo: 'Contato' },
            { nome: 'telefone', rotulo: 'Telefone' },
            { nome: 'email', rotulo: 'E-mail' },
            { nome: 'cep', rotulo: 'CEP' },
            { nome: 'endereco', rotulo: 'Endereço' },
            { nome: 'numero', rotulo: 'Número' },
            { nome: 'bairro', rotulo: 'Bairro' },
            { nome: 'cidade', rotulo: 'Cidade' },
            { nome: 'uf', rotulo: 'UF' },
            { nome: 'prazo_entrega_dias', rotulo: 'Prazo de entrega (dias)', tipo: 'numero', padrao: 0 },
            { nome: 'condicao_pagamento', rotulo: 'Condição de pagamento', ajuda: 'Ex.: 30/60 dias' },
            { nome: 'observacao', rotulo: 'Observação' },
          ]}
        />
      )}

      {aba === 'Categorias financeiras' && (
        <TabelaCrud<Simples & { tipo: string; grupo: string | null }>
          titulo="Categorias financeiras"
          descricao="O plano de contas: onde cada receita e cada despesa é classificada"
          recurso="/financeiro/categorias"
          colunas={[
            { chave: 'nome', rotulo: 'Categoria' },
            { chave: 'tipo', rotulo: 'Natureza', render: (c) => (c.tipo === 'RECEBER' ? 'Receita' : 'Despesa') },
            { chave: 'grupo', rotulo: 'Grupo' },
          ]}
          campos={[
            { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
            { nome: 'tipo', rotulo: 'Natureza', tipo: 'select', padrao: 'PAGAR',
              opcoes: [{ valor: 'RECEBER', rotulo: 'Receita' }, { valor: 'PAGAR', rotulo: 'Despesa' }] },
            { nome: 'grupo', rotulo: 'Grupo', ajuda: 'Ex.: Matéria-prima, Estrutura, Pessoal' },
          ]}
        />
      )}

      {aba === 'Contas bancárias' && (
        <TabelaCrud<Simples & { tipo: string; banco: string | null; saldo_inicial: number }>
          titulo="Contas e caixa"
          descricao="Onde o dinheiro entra e de onde sai"
          recurso="/financeiro/contas-bancarias"
          colunas={[
            { chave: 'nome', rotulo: 'Conta' },
            { chave: 'tipo', rotulo: 'Tipo' },
            { chave: 'banco', rotulo: 'Banco' },
            { chave: 'saldo_inicial', rotulo: 'Saldo inicial', num: true },
          ]}
          campos={[
            { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
            { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', padrao: 'BANCO',
              opcoes: ['CAIXA', 'BANCO', 'APLICACAO'].map((t) => ({ valor: t, rotulo: t })) },
            { nome: 'banco', rotulo: 'Banco' },
            { nome: 'agencia', rotulo: 'Agência' },
            { nome: 'conta', rotulo: 'Conta' },
            { nome: 'saldo_inicial', rotulo: 'Saldo inicial', tipo: 'numero', padrao: 0 },
          ]}
        />
      )}

      {aba === 'Etapas do processo' && (
        <TabelaCrud<Etapa>
          titulo="Etapas do processo produtivo"
          descricao="A ordem define o roteiro das ordens de produção abertas daqui em diante"
          recurso="/etapas"
          permiteExcluir={false}
          buscavel={false}
          colunas={[
            { chave: 'ordem', rotulo: 'Ordem', num: true },
            { chave: 'codigo', rotulo: 'Código' },
            { chave: 'nome', rotulo: 'Nome' },
            { chave: 'ativo', rotulo: 'Ativa', render: (e) => (e.ativo ? 'Sim' : 'Não') },
          ]}
          campos={[
            { nome: 'codigo', rotulo: 'Código', obrigatorio: true, ajuda: 'Sem espaços, ex.: ACABAMENTO' },
            { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
            { nome: 'ordem', rotulo: 'Ordem no roteiro', tipo: 'numero', obrigatorio: true },
            { nome: 'ativo', rotulo: 'Ativa (1 ou 0)', tipo: 'numero', padrao: 1 },
          ]}
        />
      )}
    </>
  );
}

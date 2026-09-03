import { useState } from 'react';
import TabelaCrud, { type Coluna, type CampoForm } from '../components/TabelaCrud';
import type { Simples, Fornecedor, Etapa } from '../tipos';

const ABAS = ['Vendedores', 'Categorias de cliente', 'Grupos de produto', 'Fornecedores', 'Etapas do processo'] as const;

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
            { chave: 'prazo_entrega_dias', rotulo: 'Prazo (dias)', num: true },
          ]}
          campos={[
            { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
            { nome: 'cnpj', rotulo: 'CNPJ' },
            { nome: 'contato', rotulo: 'Contato' },
            { nome: 'telefone', rotulo: 'Telefone' },
            { nome: 'email', rotulo: 'E-mail' },
            { nome: 'prazo_entrega_dias', rotulo: 'Prazo de entrega (dias)', tipo: 'numero', padrao: 0 },
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

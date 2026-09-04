import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { data, moeda, numero } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Etiqueta, Indicador } from '../components/ui';
import { BarraFiltros, useFiltros, type CampoFiltro } from '../components/Filtros';
import type { ItemCarteira, Simples, Cliente } from '../tipos';

export default function Carteira() {
  const { dados: grupos } = useApi<Simples[]>('/grupos-produto');
  const { dados: clientes } = useApi<Cliente[]>('/clientes?ativo=true');
  const { dados: vendedores } = useApi<Simples[]>('/vendedores?ativo=true');

  const filtros = useFiltros('/pedidos/itens/carteira', { somente_abertos: 'true', limite: '1000' });
  const { dados, carregando, erro } = useApi<ItemCarteira[]>(filtros.caminho, [filtros.caminho]);

  const campos: CampoFiltro[] = [
    { chave: 'busca', rotulo: 'Cliente, produto ou pedido', tipo: 'busca' },
    { chave: 'grupo', rotulo: 'Grupo', tipo: 'select',
      opcoes: (grupos ?? []).map((g) => ({ valor: g.nome, rotulo: g.nome })) },
    { chave: 'cliente_id', rotulo: 'Cliente', tipo: 'select',
      opcoes: (clientes ?? []).map((c) => ({ valor: c.id, rotulo: c.nome })) },
    { chave: 'vendedor', rotulo: 'Vendedor', tipo: 'select',
      opcoes: (vendedores ?? []).map((v) => ({ valor: v.nome, rotulo: v.nome })) },
    { chave: 'linha', rotulo: 'Linha', tipo: 'select',
      opcoes: [{ valor: 'LEVE', rotulo: 'Leve' }, { valor: 'PESADA', rotulo: 'Pesada' }, { valor: 'AMBAS', rotulo: 'Ambas' }] },
    { chave: 'entrega_de', rotulo: 'Entrega de', tipo: 'data' },
    { chave: 'entrega_ate', rotulo: 'até', tipo: 'data' },
    { chave: 'atrasados', rotulo: 'só atrasados', tipo: 'marcar' },
  ];

  const linhas = useMemo(() => dados ?? [], [dados]);

  const totais = useMemo(
    () => linhas.reduce(
      (acc, i) => ({
        pecas: acc.pecas + i.quantidade,
        faturar: acc.faturar + i.total,
        liquidar: acc.liquidar + i.liquidacao,
        atrasados: acc.atrasados + ((i.dias_atraso ?? 0) > 0 ? 1 : 0),
      }),
      { pecas: 0, faturar: 0, liquidar: 0, atrasados: 0 }
    ),
    [linhas]
  );

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Carteira</h1>
          <p>Itens de pedido com a situação de produção — a visão que a planilha “PCP + MO” trazia</p>
        </div>
        <div className="acoes">
          <button onClick={() => exportarCsv(linhas)} disabled={linhas.length === 0}>Exportar CSV</button>
        </div>
      </header>

      <div className="grade c4">
        <Indicador rotulo="Itens" valor={numero(linhas.length)} />
        <Indicador rotulo="Peças" valor={numero(totais.pecas)} />
        <Indicador rotulo="A faturar" valor={moeda(totais.faturar)} />
        <Indicador rotulo="Atrasados" valor={numero(totais.atrasados)} tom={totais.atrasados ? 'perigo' : 'sucesso'} />
      </div>

      <Cartao>
        <BarraFiltros
          campos={campos}
          valores={filtros.valores}
          aoMudar={filtros.definir}
          aoLimpar={filtros.limpar}
          ativos={filtros.ativos}
          extra={
            <label className="marcar filtro-marcar">
              <input type="checkbox" style={{ width: 'auto' }}
                checked={filtros.valores.somente_abertos === 'false'}
                onChange={(e) => filtros.definir('somente_abertos', e.target.checked ? 'false' : 'true')} />
              incluir entregues
            </label>
          }
        />

        {carregando && <Carregando />}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {!carregando && linhas.length === 0 && <Vazio texto="Nenhum item na carteira com estes filtros." />}
        {linhas.length > 0 && (
          <div className="tabela-rolagem" style={{ maxHeight: '64vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Pedido</th><th>Cliente</th><th>Produto</th><th>Grupo</th>
                  <th className="num">Qtd</th><th className="num">Unit.</th><th className="num">Total</th>
                  <th>Entrega</th><th className="num">Sem.</th><th>Produção</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((i) => (
                  <tr key={i.item_id}>
                    <td><Link to={`/pedidos/${i.pedido_id}`}>{i.pedido_numero}</Link></td>
                    <td title={i.cliente}>{i.cliente.slice(0, 26)}</td>
                    <td title={i.produto}>{i.produto.slice(0, 38)}</td>
                    <td>{i.grupo ?? '—'}</td>
                    <td className="num">{numero(i.quantidade)}</td>
                    <td className="num">{moeda(i.preco_unitario)}</td>
                    <td className="num">{moeda(i.total)}</td>
                    <td>
                      {data(i.data_entrega)}
                      {(i.dias_atraso ?? 0) > 0 && <div><span className="etiqueta vermelha">{i.dias_atraso}d</span></div>}
                    </td>
                    <td className="num">{i.semana_entrega ?? '—'}</td>
                    <td>
                      {i.ordem_id
                        ? <Link to={`/producao/${i.ordem_id}`}><Etiqueta status={i.ordem_status ?? 'ABERTA'} /></Link>
                        : <Etiqueta texto="Sem OP" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </>
  );
}

/** Exporta a carteira filtrada em CSV separado por ponto e vírgula (padrão Excel pt-BR). */
function exportarCsv(linhas: ItemCarteira[]) {
  const cabecalho = [
    'Pedido', 'Data pedido', 'Cliente', 'Categoria', 'Vendedor', 'Produto', 'Grupo', 'Linha',
    'Quantidade', 'Preço unitário', 'Total', 'Liquidação', 'Data entrega', 'Semana', 'Situação OP', 'Dias atraso',
  ];
  const csv = [
    cabecalho.join(';'),
    ...linhas.map((i) =>
      [
        i.pedido_numero, i.data_pedido, i.cliente, i.categoria ?? '', i.vendedor ?? '',
        i.produto, i.grupo ?? '', i.linha, i.quantidade,
        String(i.preco_unitario).replace('.', ','), String(i.total).replace('.', ','),
        String(i.liquidacao).replace('.', ','), i.data_entrega ?? '', i.semana_entrega ?? '',
        i.ordem_status ?? '', i.dias_atraso ?? 0,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(';')
    ),
  ].join('\n');

  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `carteira-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

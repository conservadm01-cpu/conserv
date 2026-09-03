import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useDebounce } from '../lib/hooks';
import { query } from '../lib/api';
import { data, moeda, numero } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Etiqueta, Campo, Indicador } from '../components/ui';
import type { ItemCarteira, Simples } from '../tipos';

export default function Carteira() {
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState('');
  const [somenteAtraso, setSomenteAtraso] = useState(false);
  const [incluirEntregues, setIncluirEntregues] = useState(false);
  const buscaLenta = useDebounce(busca);

  const { dados: grupos } = useApi<Simples[]>('/grupos-produto');
  const caminho = `/pedidos/itens/carteira${query({
    busca: buscaLenta, grupo, somente_abertos: incluirEntregues ? 'false' : 'true', limite: 1000,
  })}`;
  const { dados, carregando, erro } = useApi<ItemCarteira[]>(caminho, [caminho]);

  const linhas = useMemo(
    () => (dados ?? []).filter((i) => !somenteAtraso || (i.dias_atraso ?? 0) > 0),
    [dados, somenteAtraso]
  );

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
        <div className="filtros" style={{ marginBottom: 14 }}>
          <Campo rotulo="Buscar">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, produto ou pedido" />
          </Campo>
          <Campo rotulo="Grupo">
            <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
              <option value="">Todos</option>
              {grupos?.map((g) => <option key={g.id} value={g.nome}>{g.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Filtros">
            <div style={{ display: 'flex', gap: 14, paddingTop: 7, fontSize: 13 }}>
              <label style={{ display: 'flex', gap: 6, margin: 0, fontWeight: 400 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={somenteAtraso}
                  onChange={(e) => setSomenteAtraso(e.target.checked)} /> só atrasados
              </label>
              <label style={{ display: 'flex', gap: 6, margin: 0, fontWeight: 400 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={incluirEntregues}
                  onChange={(e) => setIncluirEntregues(e.target.checked)} /> incluir entregues
              </label>
            </div>
          </Campo>
        </div>

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

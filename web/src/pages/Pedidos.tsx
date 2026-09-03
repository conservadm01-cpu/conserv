import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useDebounce } from '../lib/hooks';
import { query } from '../lib/api';
import { data, moeda, numero, hoje } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Etiqueta, Campo } from '../components/ui';
import FormularioPedido from '../components/FormularioPedido';
import type { Pedido } from '../tipos';

export default function Pedidos() {
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [novo, setNovo] = useState(false);
  const buscaLenta = useDebounce(busca);

  const caminho = `/pedidos${query({ busca: buscaLenta, situacao, de, ate, limite: 500 })}`;
  const { dados, carregando, erro, recarregar } = useApi<Pedido[]>(caminho, [caminho]);

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Pedidos</h1>
          <p>Entrada de pedidos e acompanhamento comercial</p>
        </div>
        <div className="acoes">
          <button className="primario" onClick={() => setNovo(true)}>Novo pedido</button>
        </div>
      </header>

      <Cartao>
        <div className="filtros" style={{ marginBottom: 14 }}>
          <Campo rotulo="Buscar">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número ou cliente" />
          </Campo>
          <Campo rotulo="Situação">
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="">Todas</option>
              <option value="ABERTO">Aberto</option>
              <option value="FATURADO">Faturado</option>
              <option value="ENTREGUE">Entregue</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </Campo>
          <Campo rotulo="Pedido a partir de"><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
          <Campo rotulo="Até"><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} max={hoje()} /></Campo>
        </div>

        {carregando && <Carregando />}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {dados && dados.length === 0 && <Vazio texto="Nenhum pedido encontrado." />}
        {dados && dados.length > 0 && (
          <div className="tabela-rolagem" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Nº</th><th>Cliente</th><th>Categoria</th><th>Vendedor</th>
                  <th>Data</th><th>Entrega</th>
                  <th className="num">Itens</th><th className="num">Peças</th><th className="num">Total</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {dados.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/pedidos/${p.id}`}>{p.numero}</Link></td>
                    <td title={p.cliente}>{p.cliente.slice(0, 28)}</td>
                    <td>{p.categoria ?? '—'}</td>
                    <td>{p.vendedor ?? '—'}</td>
                    <td>{data(p.data_pedido)}</td>
                    <td>
                      {data(p.data_entrega)}
                      {p.atrasado === 1 && <div><span className="etiqueta vermelha">atrasado</span></div>}
                    </td>
                    <td className="num">{p.itens}</td>
                    <td className="num">{numero(p.pecas)}</td>
                    <td className="num">{moeda(p.total)}</td>
                    <td><Etiqueta status={p.situacao} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <FormularioPedido
        aberto={novo}
        aoFechar={() => setNovo(false)}
        aoSalvar={() => { setNovo(false); recarregar(); }}
      />
    </>
  );
}

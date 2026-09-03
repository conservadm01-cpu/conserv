import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { data, moeda, numero } from '../lib/formato';
import { Cartao, Carregando, Aviso, Etiqueta, Indicador } from '../components/ui';
import type { PedidoDetalhe as TPedido } from '../tipos';

export default function PedidoDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { dados: pedido, carregando, erro, recarregar } = useApi<TPedido>(`/pedidos/${id}`);
  const [falha, setFalha] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function abrirOrdem(itemId: number) {
    setOcupado(true);
    setFalha('');
    try {
      await api.post('/ordens', { pedido_item_id: itemId });
      recarregar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível abrir a ordem');
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar() {
    if (!confirm('Cancelar este pedido? Itens já em produção mantêm o histórico.')) return;
    setOcupado(true);
    try {
      await api.delete(`/pedidos/${id}`);
      navegar('/pedidos');
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível cancelar');
      setOcupado(false);
    }
  }

  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!pedido) return null;

  const semOrdem = pedido.itens.filter((i) => !i.ordem_id);

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Pedido {pedido.numero} <Etiqueta status={pedido.situacao} /></h1>
          <p>
            {pedido.cliente}
            {pedido.categoria && ` · ${pedido.categoria}`}
            {pedido.vendedor && ` · vendedor ${pedido.vendedor}`}
          </p>
        </div>
        <div className="acoes">
          <Link className="botao" to="/pedidos">Voltar</Link>
          <button className="perigo" onClick={cancelar} disabled={ocupado}>Cancelar pedido</button>
        </div>
      </header>

      <Aviso tipo="erro">{falha}</Aviso>

      <div className="grade c4">
        <Indicador rotulo="Data do pedido" valor={data(pedido.data_pedido)} nota={`semana ${pedido.semana_pedido ?? '—'}`} />
        <Indicador rotulo="Entrega prevista" valor={data(pedido.data_entrega)} nota={`semana ${pedido.semana_entrega ?? '—'}`} />
        <Indicador rotulo="Peças" valor={numero(pedido.pecas)} nota={`${pedido.itens.length} itens`} />
        <Indicador rotulo="Valor total" valor={moeda(pedido.total)} nota={`a liquidar ${moeda(pedido.liquidacao)}`} />
      </div>

      <Cartao
        titulo="Itens do pedido"
        acao={
          semOrdem.length > 0 ? (
            <button
              className="primario pequeno"
              disabled={ocupado}
              onClick={async () => {
                for (const item of semOrdem) await abrirOrdem(item.id);
              }}
            >
              Abrir ordens dos {semOrdem.length} itens sem OP
            </button>
          ) : null
        }
      >
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Produto</th><th>Grupo</th><th>Linha</th>
                <th className="num">Qtd</th><th className="num">Unit.</th><th className="num">Total</th>
                <th>Entrega</th><th>Ordem de produção</th>
              </tr>
            </thead>
            <tbody>
              {pedido.itens.map((i) => (
                <tr key={i.id}>
                  <td>{i.produto}</td>
                  <td>{i.grupo ?? '—'}</td>
                  <td>{i.linha}</td>
                  <td className="num">{numero(i.quantidade)}</td>
                  <td className="num">{moeda(i.preco_unitario)}</td>
                  <td className="num">{moeda(i.total)}</td>
                  <td>{data(i.data_entrega ?? pedido.data_entrega)}</td>
                  <td>
                    {i.ordem_id ? (
                      <Link to={`/producao/${i.ordem_id}`}>
                        {i.ordem_numero} <Etiqueta status={i.ordem_status ?? 'ABERTA'} />
                      </Link>
                    ) : (
                      <button className="pequeno" disabled={ocupado} onClick={() => abrirOrdem(i.id)}>Abrir OP</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pedido.observacao && (
          <p style={{ marginTop: 14, color: 'var(--texto-fraco)' }}>
            <strong>Observação:</strong> {pedido.observacao}
          </p>
        )}
      </Cartao>
    </>
  );
}

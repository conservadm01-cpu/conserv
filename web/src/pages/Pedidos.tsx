import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, pode } from '../lib/api';
import { useApi } from '../lib/hooks';
import { data, moeda, numero } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Etiqueta } from '../components/ui';
import { BarraFiltros, useFiltros, type CampoFiltro } from '../components/Filtros';
import FormularioPedido from '../components/FormularioPedido';
import type { Pedido, Cliente, Simples } from '../tipos';

export default function Pedidos() {
  const [editando, setEditando] = useState<number | 'novo' | null>(null);
  const [falha, setFalha] = useState('');

  const { dados: clientes } = useApi<Cliente[]>('/clientes?ativo=true');
  const { dados: vendedores } = useApi<Simples[]>('/vendedores?ativo=true');

  const filtros = useFiltros('/pedidos', { limite: '500' });
  const { dados, carregando, erro, recarregar } = useApi<Pedido[]>(filtros.caminho, [filtros.caminho]);

  const campos: CampoFiltro[] = [
    { chave: 'busca', rotulo: 'Número, cliente ou NF', tipo: 'busca' },
    { chave: 'situacao', rotulo: 'Situação', tipo: 'select',
      opcoes: [
        { valor: 'ABERTO', rotulo: 'Aberto' }, { valor: 'FATURADO', rotulo: 'Faturado' },
        { valor: 'ENTREGUE', rotulo: 'Entregue' }, { valor: 'CANCELADO', rotulo: 'Cancelado' },
      ] },
    { chave: 'cliente_id', rotulo: 'Cliente', tipo: 'select',
      opcoes: (clientes ?? []).map((c) => ({ valor: c.id, rotulo: c.nome })) },
    { chave: 'vendedor_id', rotulo: 'Vendedor', tipo: 'select',
      opcoes: (vendedores ?? []).map((v) => ({ valor: v.id, rotulo: v.nome })) },
    { chave: 'de', rotulo: 'Pedido de', tipo: 'data' },
    { chave: 'ate', rotulo: 'até', tipo: 'data' },
    { chave: 'atrasados', rotulo: 'só atrasados', tipo: 'marcar' },
  ];

  async function excluir(p: Pedido) {
    const aviso = p.situacao === 'ABERTO'
      ? `Excluir o pedido ${p.numero}? Itens e ordens em aberto vão junto.`
      : `Cancelar o pedido ${p.numero}? O histórico de produção é preservado.`;
    if (!confirm(aviso)) return;
    setFalha('');
    try {
      await api.delete(`/pedidos/${p.id}`);
      recarregar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível remover');
    }
  }

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Pedidos</h1>
          <p>Entrada de pedidos e acompanhamento comercial</p>
        </div>
        {pode('pedidos.editar') && (
          <div className="acoes">
            <button className="primario" onClick={() => setEditando('novo')}>Novo pedido</button>
          </div>
        )}
      </header>

      <Cartao>
        <BarraFiltros campos={campos} valores={filtros.valores} aoMudar={filtros.definir}
          aoLimpar={filtros.limpar} ativos={filtros.ativos} />

        {carregando && <Carregando />}
        <Aviso tipo="erro">{falha || erro}</Aviso>
        {dados && dados.length === 0 && <Vazio texto="Nenhum pedido encontrado." />}
        {dados && dados.length > 0 && (
          <div className="tabela-rolagem" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Nº</th><th>Cliente</th><th>Categoria</th><th>Vendedor</th>
                  <th>Data</th><th>Entrega</th>
                  <th className="num">Itens</th><th className="num">Peças</th><th className="num">Total</th>
                  <th>Situação</th><th />
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
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {pode('pedidos.editar') && (
                        <>
                          <button className="pequeno" onClick={() => setEditando(p.id)}>Editar</button>{' '}
                          <button className="pequeno perigo" onClick={() => excluir(p)}>
                            {p.situacao === 'ABERTO' ? 'Excluir' : 'Cancelar'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dados && dados.length > 0 && (
          <div className="rodape-lista">
            <span>{numero(dados.length)} pedidos · {numero(dados.reduce((s, p) => s + p.pecas, 0))} peças</span>
            <span>{moeda(dados.reduce((s, p) => s + p.total, 0))}</span>
          </div>
        )}
      </Cartao>

      <FormularioPedido
        aberto={editando !== null}
        pedidoId={typeof editando === 'number' ? editando : null}
        aoFechar={() => setEditando(null)}
        aoSalvar={() => { setEditando(null); recarregar(); }}
      />
    </>
  );
}

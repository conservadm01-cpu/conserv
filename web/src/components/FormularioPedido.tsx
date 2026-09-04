import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { moeda, hoje } from '../lib/formato';
import { Modal, Aviso, Campo } from './ui';
import type { Cliente, Produto, Simples, PedidoDetalhe } from '../tipos';

type LinhaItem = {
  id?: number;
  produto_id: number | '';
  quantidade: string;
  preco_unitario: string;
  liquidacao: string;
};

const LINHA_VAZIA: LinhaItem = { produto_id: '', quantidade: '', preco_unitario: '', liquidacao: '' };

/**
 * Cria e edita pedido no mesmo formulário — a diferença é só o `pedidoId`.
 * Itens que já existem levam o id junto, para o servidor atualizar em vez de
 * apagar e recriar (o que derrubaria as ordens de produção abertas).
 */
export default function FormularioPedido({ aberto, pedidoId = null, aoFechar, aoSalvar }: {
  aberto: boolean; pedidoId?: number | null; aoFechar: () => void; aoSalvar: () => void;
}) {
  const { dados: clientes } = useApi<Cliente[]>(aberto ? '/clientes?ativo=true' : null);
  const { dados: produtos } = useApi<Produto[]>(aberto ? '/produtos?ativo=true' : null);
  const { dados: vendedores } = useApi<Simples[]>(aberto ? '/vendedores?ativo=true' : null);
  const { dados: existente } = useApi<PedidoDetalhe>(
    aberto && pedidoId ? `/pedidos/${pedidoId}` : null, [pedidoId]
  );

  const [numero, setNumero] = useState('');
  const [clienteId, setClienteId] = useState<number | ''>('');
  const [vendedorId, setVendedorId] = useState<number | ''>('');
  const [dataPedido, setDataPedido] = useState(hoje());
  const [dataEntrega, setDataEntrega] = useState('');
  const [observacao, setObservacao] = useState('');
  const [itens, setItens] = useState<LinhaItem[]>([{ ...LINHA_VAZIA }]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    if (pedidoId && existente) {
      setNumero(existente.numero);
      setClienteId(existente.cliente_id);
      setVendedorId(existente.vendedor_id ?? '');
      setDataPedido(existente.data_pedido);
      setDataEntrega(existente.data_entrega ?? '');
      setObservacao(existente.observacao ?? '');
      setItens(
        existente.itens.map((i) => ({
          id: i.id,
          produto_id: i.produto_id,
          quantidade: String(i.quantidade),
          preco_unitario: String(i.preco_unitario),
          liquidacao: String(i.liquidacao),
        }))
      );
    } else if (!pedidoId) {
      setNumero(''); setClienteId(''); setVendedorId('');
      setDataPedido(hoje()); setDataEntrega(''); setObservacao('');
      setItens([{ ...LINHA_VAZIA }]);
    }
    setErro('');
  }, [aberto, pedidoId, existente]);

  const alterarItem = (i: number, campos: Partial<LinhaItem>) =>
    setItens((atual) => atual.map((linha, idx) => (idx === i ? { ...linha, ...campos } : linha)));

  /** Ao escolher o produto, sugere o preço padrão do cadastro. */
  const escolherProduto = (i: number, id: number) => {
    const produto = produtos?.find((p) => p.id === id);
    alterarItem(i, {
      produto_id: id,
      preco_unitario: itens[i].preco_unitario || String(produto?.preco_padrao ?? ''),
    });
  };

  const total = itens.reduce(
    (s, i) => s + (Number(i.quantidade) || 0) * (Number(i.preco_unitario) || 0),
    0
  );

  async function salvar() {
    setErro('');
    const validos = itens.filter((i) => i.produto_id && Number(i.quantidade) > 0);
    if (!numero.trim()) return setErro('Informe o número do pedido.');
    if (!clienteId) return setErro('Selecione o cliente.');
    if (validos.length === 0) return setErro('Adicione ao menos um item com produto e quantidade.');

    setSalvando(true);
    const corpo = {
      numero: numero.trim(),
      cliente_id: Number(clienteId),
      vendedor_id: vendedorId ? Number(vendedorId) : null,
      data_pedido: dataPedido,
      data_entrega: dataEntrega || null,
      observacao: observacao.trim() || null,
      itens: validos.map((i) => ({
        ...(i.id ? { id: i.id } : {}),
        produto_id: Number(i.produto_id),
        quantidade: Number(i.quantidade),
        preco_unitario: Number(i.preco_unitario) || 0,
        liquidacao: Number(i.liquidacao) || 0,
        data_entrega: dataEntrega || null,
      })),
    };
    try {
      if (pedidoId) await api.put(`/pedidos/${pedidoId}`, corpo);
      else await api.post('/pedidos', corpo);
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o pedido');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={pedidoId ? `Editar pedido ${numero}` : 'Novo pedido'}
      aberto={aberto}
      aoFechar={aoFechar}
      largo
      rodape={
        <>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : pedidoId ? 'Salvar alterações' : 'Salvar e abrir ordens'}
          </button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      <div className="linha-campos">
        <Campo rotulo="Número do pedido">
          <input value={numero} onChange={(e) => setNumero(e.target.value)} autoFocus={!pedidoId} />
        </Campo>
        <Campo rotulo="Cliente">
          <select value={clienteId} onChange={(e) => setClienteId(Number(e.target.value) || '')}>
            <option value="">Selecione…</option>
            {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Vendedor">
          <select value={vendedorId} onChange={(e) => setVendedorId(Number(e.target.value) || '')}>
            <option value="">—</option>
            {vendedores?.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Data do pedido">
          <input type="date" value={dataPedido} onChange={(e) => setDataPedido(e.target.value)} />
        </Campo>
        <Campo rotulo="Data de entrega">
          <input type="date" value={dataEntrega} onChange={(e) => setDataEntrega(e.target.value)} />
        </Campo>
        <Campo rotulo="Observação">
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Campo>
      </div>

      <h4 style={{ margin: '16px 0 8px', fontSize: 13.5 }}>Itens</h4>
      <div className="tabela-rolagem">
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 240 }}>Produto</th>
              <th style={{ width: 96 }}>Qtd</th>
              <th style={{ width: 110 }}>Preço unit.</th>
              <th style={{ width: 110 }}>Liquidação</th>
              <th className="num">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {itens.map((item, i) => (
              <tr key={i}>
                <td>
                  <select value={item.produto_id} onChange={(e) => escolherProduto(i, Number(e.target.value))}>
                    <option value="">Selecione…</option>
                    {produtos?.map((p) => <option key={p.id} value={p.id}>{p.descricao}</option>)}
                  </select>
                </td>
                <td><input type="number" min="0" step="any" value={item.quantidade}
                  onChange={(e) => alterarItem(i, { quantidade: e.target.value })} /></td>
                <td><input type="number" min="0" step="any" value={item.preco_unitario}
                  onChange={(e) => alterarItem(i, { preco_unitario: e.target.value })} /></td>
                <td><input type="number" min="0" step="any" value={item.liquidacao}
                  onChange={(e) => alterarItem(i, { liquidacao: e.target.value })} /></td>
                <td className="num">
                  {moeda((Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0))}
                </td>
                <td>
                  <button className="pequeno perigo" disabled={itens.length === 1}
                    onClick={() => setItens((a) => a.filter((_, idx) => idx !== i))}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <button className="pequeno" onClick={() => setItens((a) => [...a, { ...LINHA_VAZIA }])}>+ Adicionar item</button>
        <strong>Total do pedido: {moeda(total)}</strong>
      </div>
    </Modal>
  );
}

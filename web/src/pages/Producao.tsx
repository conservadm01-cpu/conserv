import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, pode } from '../lib/api';
import { useApi, useDebounce } from '../lib/hooks';
import { data, numero, moeda } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Etiqueta, Barra, Modal, Campo } from '../components/ui';
import { BarraFiltros, useFiltros, type CampoFiltro } from '../components/Filtros';
import type { ColunaQuadro, OrdemLista, Etapa, Simples, Cliente, ItemCarteira } from '../tipos';

export default function Producao() {
  const [visao, setVisao] = useState<'quadro' | 'lista'>('quadro');
  const [abrindo, setAbrindo] = useState(false);
  const [recarga, setRecarga] = useState(0);

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Produção (PCP)</h1>
          <p>Acompanhamento das ordens pelo roteiro Matéria-prima → Corte → Silk → Costura → Embalagem → NF → Entrega</p>
        </div>
        <div className="acoes">
          <div className="abas" style={{ borderBottom: 0, marginBottom: 0 }}>
            <button className={`aba${visao === 'quadro' ? ' ativa' : ''}`} onClick={() => setVisao('quadro')}>Quadro</button>
            <button className={`aba${visao === 'lista' ? ' ativa' : ''}`} onClick={() => setVisao('lista')}>Lista</button>
          </div>
          {pode('producao.ordens') && (
            <button className="primario" onClick={() => setAbrindo(true)}>Nova ordem de produção</button>
          )}
        </div>
      </header>

      <NovaOrdem
        aberto={abrindo}
        aoFechar={() => setAbrindo(false)}
        aoAbrir={() => setRecarga((n) => n + 1)}
      />

      {visao === 'quadro' ? <Quadro recarga={recarga} /> : <Lista recarga={recarga} />}
    </>
  );
}

/**
 * Abre a ordem de um item que ainda não tem produção.
 *
 * A OP nasce sempre de um item vendido — é o que garante que a fábrica produza
 * o que foi pedido, na quantidade e no preço combinados. Por isso o formulário
 * escolhe o item da carteira em vez de digitar cliente e produto de novo.
 */
function NovaOrdem({ aberto, aoFechar, aoAbrir }: { aberto: boolean; aoFechar: () => void; aoAbrir: () => void }) {
  const [busca, setBusca] = useState('');
  const [itemId, setItemId] = useState<number | null>(null);
  const [dataPrevista, setDataPrevista] = useState('');
  const [observacao, setObservacao] = useState('');
  const [falha, setFalha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const navegar = useNavigate();
  const termo = useDebounce(busca);

  const { dados: itens, carregando } = useApi<ItemCarteira[]>(
    aberto ? `/pedidos/itens/carteira?sem_ordem=true&limite=60${termo ? `&busca=${encodeURIComponent(termo)}` : ''}` : null,
    [aberto, termo]
  );
  const escolhido = itens?.find((i) => i.item_id === itemId) ?? null;

  const fechar = () => {
    setItemId(null);
    setDataPrevista('');
    setObservacao('');
    setFalha('');
    aoFechar();
  };

  async function abrir() {
    if (!itemId) return setFalha('Escolha o item do pedido que vai para produção.');
    setOcupado(true);
    setFalha('');
    try {
      const ordem = await api.post<{ id: number }>('/ordens', {
        pedido_item_id: itemId,
        data_prevista: dataPrevista || null,
        observacao: observacao || null,
      });
      aoAbrir();
      fechar();
      navegar(`/producao/${ordem.id}`);
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível abrir a ordem');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo="Nova ordem de produção"
      aberto={aberto}
      aoFechar={fechar}
      largo
      rodape={
        <>
          <button onClick={fechar}>Cancelar</button>
          <button className="primario" disabled={ocupado || !itemId} onClick={abrir}>
            {ocupado ? 'Abrindo…' : 'Abrir ordem'}
          </button>
        </>
      }
    >
      <Aviso tipo="erro">{falha}</Aviso>
      <Campo rotulo="Buscar item na carteira">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Cliente, produto ou número do pedido"
          autoFocus
        />
      </Campo>

      {carregando && <Carregando />}
      {itens && itens.length === 0 && (
        <Vazio texto="Nenhum item de pedido sem ordem. Cadastre o pedido primeiro em Pedidos." />
      )}
      {itens && itens.length > 0 && (
        <div className="tabela-rolagem" style={{ maxHeight: '38vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 34 }} /><th>Pedido</th><th>Cliente</th><th>Produto</th>
                <th className="num">Qtd</th><th className="num">Valor</th><th>Entrega</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.item_id} onClick={() => { setItemId(i.item_id); setDataPrevista(i.data_entrega ?? ''); }}
                    style={{ cursor: 'pointer' }}>
                  <td><input type="radio" style={{ width: 'auto' }} checked={itemId === i.item_id} readOnly /></td>
                  <td>{i.pedido_numero}</td>
                  <td title={i.cliente}>{i.cliente.slice(0, 24)}</td>
                  <td title={i.produto}>{i.produto.slice(0, 32)}</td>
                  <td className="num">{numero(i.quantidade)}</td>
                  <td className="num">{moeda(i.total)}</td>
                  <td>{data(i.data_entrega)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="linha-campos" style={{ marginTop: 14 }}>
        <Campo rotulo="Entrega prevista">
          <input type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} />
        </Campo>
        <Campo rotulo="Observação da ordem">
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)}
                 placeholder="Instrução para o chão de fábrica" />
        </Campo>
      </div>
      {escolhido && (
        <p className="ajuda">
          A ordem abre com o roteiro completo e a ficha técnica de <b>{escolhido.produto}</b> explodida em
          necessidade de material. Sem data prevista, vale a entrega do item.
        </p>
      )}
    </Modal>
  );
}

function Quadro({ recarga }: { recarga: number }) {
  const navegar = useNavigate();
  const { dados, carregando, erro } = useApi<ColunaQuadro[]>('/ordens/quadro', [recarga]);

  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return null;

  const total = dados.reduce((s, c) => s + c.ordens.length, 0);
  if (total === 0) return <Cartao><Vazio texto="Nenhuma ordem em aberto. Abra pedidos para gerar ordens de produção." /></Cartao>;

  return (
    <div className="quadro">
      {dados.map(({ etapa, ordens }) => (
        <div className="coluna" key={etapa.id}>
          <div className="coluna-cabeca">
            <strong>{etapa.nome}</strong>
            <span className="etiqueta">{ordens.length}</span>
          </div>
          <div className="coluna-corpo">
            {ordens.length === 0 && <div style={{ padding: 12, color: 'var(--texto-suave)', fontSize: 12.5 }}>Fila vazia</div>}
            {ordens.map((o) => (
              <div
                key={o.id}
                className={`ficha${(o.dias_atraso ?? 0) > 0 ? ' atrasada' : ''}`}
                onClick={() => navegar(`/producao/${o.id}`)}
              >
                <b title={o.produto}>{o.produto.slice(0, 40)}</b>
                <div style={{ color: 'var(--texto-fraco)', fontSize: 12 }}>{o.cliente}</div>
                <div className="meta">
                  <span>{o.numero} · {numero(o.quantidade)} pç</span>
                  <span>
                    {(o.dias_atraso ?? 0) > 0
                      ? <span style={{ color: 'var(--perigo)' }}>{o.dias_atraso}d atraso</span>
                      : data(o.data_prevista)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Lista({ recarga }: { recarga: number }) {
  const [falha, setFalha] = useState('');
  const { dados: etapas } = useApi<Etapa[]>('/etapas');
  const { dados: grupos } = useApi<Simples[]>('/grupos-produto');
  const { dados: clientes } = useApi<Cliente[]>('/clientes?ativo=true');

  const filtros = useFiltros('/ordens', { limite: '400' });
  const { dados, carregando, erro, recarregar } = useApi<OrdemLista[]>(filtros.caminho, [filtros.caminho, recarga]);

  async function cancelar(o: OrdemLista) {
    if (!confirm(`Cancelar a ordem ${o.numero}? Se nada foi apontado nela, a OP é removida.`)) return;
    setFalha('');
    try {
      await api.delete(`/ordens/${o.id}`);
      recarregar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível cancelar');
    }
  }

  const campos: CampoFiltro[] = [
    { chave: 'busca', rotulo: 'OP, cliente, produto ou pedido', tipo: 'busca' },
    { chave: 'status', rotulo: 'Situação', tipo: 'select',
      opcoes: [
        { valor: 'ABERTA', rotulo: 'Aberta' }, { valor: 'EM_PRODUCAO', rotulo: 'Em produção' },
        { valor: 'CONCLUIDA', rotulo: 'Concluída' }, { valor: 'ENTREGUE', rotulo: 'Entregue' },
        { valor: 'CANCELADA', rotulo: 'Cancelada' },
      ] },
    { chave: 'etapa', rotulo: 'Parada na etapa', tipo: 'select',
      opcoes: (etapas ?? []).map((e) => ({ valor: e.codigo, rotulo: e.nome })) },
    { chave: 'grupo', rotulo: 'Grupo', tipo: 'select',
      opcoes: (grupos ?? []).map((g) => ({ valor: g.nome, rotulo: g.nome })) },
    { chave: 'cliente_id', rotulo: 'Cliente', tipo: 'select',
      opcoes: (clientes ?? []).map((c) => ({ valor: c.id, rotulo: c.nome })) },
    { chave: 'de', rotulo: 'Entrega de', tipo: 'data' },
    { chave: 'ate', rotulo: 'até', tipo: 'data' },
    { chave: 'atrasadas', rotulo: 'só atrasadas', tipo: 'marcar' },
  ];

  return (
    <Cartao
      titulo={<h3>Ordens de produção {dados ? <small style={{ fontWeight: 400 }}>· {dados.length}</small> : null}</h3>}
    >
      <BarraFiltros campos={campos} valores={filtros.valores} aoMudar={filtros.definir}
        aoLimpar={filtros.limpar} ativos={filtros.ativos} />

      {carregando && <Carregando />}
      <Aviso tipo="erro">{falha || erro}</Aviso>
      {dados && dados.length === 0 && <Vazio texto="Nenhuma ordem encontrada com estes filtros." />}
      {dados && dados.length > 0 && (
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>OP</th><th>Pedido</th><th>Cliente</th><th>Produto</th>
                <th className="num">Qtd</th><th className="num">Valor</th>
                <th>Etapa atual</th><th style={{ width: 110 }}>Progresso</th>
                <th>Entrega</th><th>Situação</th><th />
              </tr>
            </thead>
            <tbody>
              {dados.map((o) => (
                <tr key={o.id}>
                  <td><Link to={`/producao/${o.id}`}>{o.numero}</Link></td>
                  <td><Link to={`/pedidos/${o.pedido_id}`}>{o.pedido_numero}</Link></td>
                  <td title={o.cliente}>{o.cliente.slice(0, 26)}</td>
                  <td title={o.produto}>{o.produto.slice(0, 34)}</td>
                  <td className="num">{numero(o.quantidade)}</td>
                  <td className="num">{moeda(o.valor_item)}</td>
                  <td>{o.etapa_atual ?? '—'}</td>
                  <td><Barra valor={o.etapas_concluidas} total={o.etapas_total} /></td>
                  <td>
                    {data(o.data_prevista)}
                    {(o.dias_atraso ?? 0) > 0 && <div><span className="etiqueta vermelha">{o.dias_atraso}d</span></div>}
                  </td>
                  <td><Etiqueta status={o.status} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link className="botao pequeno" to={`/producao/${o.id}`}>Abrir</Link>{' '}
                    {pode('producao.ordens') && o.status !== 'CANCELADA' && o.status !== 'ENTREGUE' && (
                      <button className="pequeno perigo" onClick={() => cancelar(o)}>Cancelar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}

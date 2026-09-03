import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi, useDebounce } from '../lib/hooks';
import { query } from '../lib/api';
import { data, numero, moeda } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Etiqueta, Barra, Campo } from '../components/ui';
import type { ColunaQuadro, OrdemLista, Etapa } from '../tipos';

export default function Producao() {
  const [visao, setVisao] = useState<'quadro' | 'lista'>('quadro');
  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Produção (PCP)</h1>
          <p>Acompanhamento das ordens pelo roteiro Matéria-prima → Corte → Silk → Costura → Embalagem → NF → Entrega</p>
        </div>
        <div className="abas" style={{ borderBottom: 0, marginBottom: 0 }}>
          <button className={`aba${visao === 'quadro' ? ' ativa' : ''}`} onClick={() => setVisao('quadro')}>Quadro</button>
          <button className={`aba${visao === 'lista' ? ' ativa' : ''}`} onClick={() => setVisao('lista')}>Lista</button>
        </div>
      </header>
      {visao === 'quadro' ? <Quadro /> : <Lista />}
    </>
  );
}

function Quadro() {
  const navegar = useNavigate();
  const { dados, carregando, erro } = useApi<ColunaQuadro[]>('/ordens/quadro');

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

function Lista() {
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [etapa, setEtapa] = useState('');
  const buscaLenta = useDebounce(busca);

  const { dados: etapas } = useApi<Etapa[]>('/etapas');
  const caminho = `/ordens${query({ busca: buscaLenta, status, etapa, abertas: status ? 'false' : 'true', limite: 400 })}`;
  const { dados, carregando, erro } = useApi<OrdemLista[]>(caminho, [caminho]);

  return (
    <Cartao
      titulo={<h3>Ordens de produção {dados ? <small style={{ fontWeight: 400 }}>· {dados.length}</small> : null}</h3>}
    >
      <div className="filtros" style={{ marginBottom: 14 }}>
        <Campo rotulo="Buscar">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="OP, cliente, produto ou pedido" />
        </Campo>
        <Campo rotulo="Situação">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Em aberto</option>
            <option value="ABERTA">Aberta</option>
            <option value="EM_PRODUCAO">Em produção</option>
            <option value="CONCLUIDA">Concluída</option>
            <option value="ENTREGUE">Entregue</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        </Campo>
        <Campo rotulo="Parada na etapa">
          <select value={etapa} onChange={(e) => setEtapa(e.target.value)}>
            <option value="">Todas</option>
            {etapas?.map((e) => <option key={e.id} value={e.codigo}>{e.nome}</option>)}
          </select>
        </Campo>
      </div>

      {carregando && <Carregando />}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {dados && dados.length === 0 && <Vazio texto="Nenhuma ordem encontrada com estes filtros." />}
      {dados && dados.length > 0 && (
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>OP</th><th>Pedido</th><th>Cliente</th><th>Produto</th>
                <th className="num">Qtd</th><th className="num">Valor</th>
                <th>Etapa atual</th><th style={{ width: 110 }}>Progresso</th>
                <th>Entrega</th><th>Situação</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}

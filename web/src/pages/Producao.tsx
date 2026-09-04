import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, pode } from '../lib/api';
import { useApi } from '../lib/hooks';
import { data, numero, moeda } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Etiqueta, Barra } from '../components/ui';
import { BarraFiltros, useFiltros, type CampoFiltro } from '../components/Filtros';
import type { ColunaQuadro, OrdemLista, Etapa, Simples, Cliente } from '../tipos';

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
  const [falha, setFalha] = useState('');
  const { dados: etapas } = useApi<Etapa[]>('/etapas');
  const { dados: grupos } = useApi<Simples[]>('/grupos-produto');
  const { dados: clientes } = useApi<Cliente[]>('/clientes?ativo=true');

  const filtros = useFiltros('/ordens', { limite: '400' });
  const { dados, carregando, erro, recarregar } = useApi<OrdemLista[]>(filtros.caminho, [filtros.caminho]);

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

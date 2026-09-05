import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { moeda, numero, mesCurto, data as dataBR } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Etiqueta, Indicador, Campo } from '../components/ui';
import type {
  CarteiraConsolidada, Cliente, LinhaPcpMo, LinhaPedidoMes, OrdemLista, RelatorioCliente,
} from '../tipos';

type LinhaCusto = {
  id: number; numero: string; status: string; quantidade: number;
  cliente: string; produto: string; grupo: string | null; pedido_numero: string;
  receita: number; custo_mo: number; custo_material: number;
  custo_total: number; margem: number; margem_percentual: number;
};

type LinhaCliente = {
  cliente_id: number; cliente: string; categoria: string | null;
  pedidos: number; pecas: number; valor: number;
};

type LinhaMes = { mes: string; pedidos: number; pecas: number; valor: number; ticket_medio: number };

const ABAS = [
  'Carteira em produção',
  'PCP e mão de obra',
  'Pedidos por cliente',
  'Pedidos do mês',
  'Margem por ordem',
  'Ranking de clientes',
  'Vendas mensais',
  'Fichas de produção',
] as const;

/** Etapas do roteiro, na ordem em que a planilha as mostrava. */
const ETAPAS = [
  { codigo: 'MATERIA_PRIMA', rotulo: 'M. prima' },
  { codigo: 'CORTE', rotulo: 'Corte' },
  { codigo: 'SILK', rotulo: 'Silk' },
  { codigo: 'COSTURA', rotulo: 'Costura' },
  { codigo: 'EMBALAGEM', rotulo: 'Embalagem' },
  { codigo: 'ENTREGA', rotulo: 'Entrega' },
];

/** Botão de exportação: baixa o mesmo recorte que está na tela, em CSV. */
function Exportar({ caminho, arquivo }: { caminho: string; arquivo: string }) {
  const [falha, setFalha] = useState('');
  return (
    <>
      <button
        className="pequeno"
        onClick={async () => {
          setFalha('');
          try {
            await api.baixarArquivo(caminho, arquivo);
          } catch (e) {
            setFalha(e instanceof ApiError ? e.message : 'Falha ao exportar');
          }
        }}
      >
        Exportar CSV
      </button>
      <Aviso tipo="erro">{falha}</Aviso>
    </>
  );
}

export default function Relatorios() {
  const [aba, setAba] = useState<(typeof ABAS)[number]>('Carteira em produção');
  const [ano, setAno] = useState(new Date().getFullYear());
  const anos = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Relatórios</h1>
          <p>A carteira, o PCP e a rentabilidade — e a ficha que a fábrica imprime</p>
        </div>
        <div className="acoes">
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} style={{ width: 110 }}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </header>

      <div className="abas">
        {ABAS.map((a) => (
          <button key={a} className={`aba${aba === a ? ' ativa' : ''}`} onClick={() => setAba(a)}>{a}</button>
        ))}
      </div>

      {aba === 'Carteira em produção' && <Carteira />}
      {aba === 'PCP e mão de obra' && <PcpMaoDeObra ano={ano} />}
      {aba === 'Pedidos por cliente' && <PorCliente ano={ano} />}
      {aba === 'Pedidos do mês' && <PedidosMes ano={ano} />}
      {aba === 'Margem por ordem' && <Margem />}
      {aba === 'Ranking de clientes' && <Clientes ano={ano} />}
      {aba === 'Vendas mensais' && <Mensal ano={ano} />}
      {aba === 'Fichas de produção' && <Fichas />}
    </>
  );
}

function Margem() {
  const { dados, carregando, erro } = useApi<LinhaCusto[]>('/indicadores/custos/ordens?limite=400');
  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados || dados.length === 0) return <Cartao><Vazio texto="Nenhuma ordem de produção registrada." /></Cartao>;

  const totais = dados.reduce(
    (a, l) => ({ receita: a.receita + l.receita, custo: a.custo + l.custo_total, margem: a.margem + l.margem }),
    { receita: 0, custo: 0, margem: 0 }
  );

  return (
    <Cartao
      titulo="Receita × custo por ordem de produção"
      acao={<small>MO lançada nas etapas + material efetivamente baixado</small>}
    >
      <div className="tabela-rolagem" style={{ maxHeight: '64vh', overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>OP</th><th>Cliente</th><th>Produto</th>
              <th className="num">Qtd</th><th className="num">Receita</th>
              <th className="num">MO</th><th className="num">Material</th>
              <th className="num">Custo</th><th className="num">Margem</th><th className="num">%</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((l) => (
              <tr key={l.id}>
                <td><Link to={`/producao/${l.id}`}>{l.numero}</Link></td>
                <td title={l.cliente}>{l.cliente.slice(0, 24)}</td>
                <td title={l.produto}>{l.produto.slice(0, 30)}</td>
                <td className="num">{numero(l.quantidade)}</td>
                <td className="num">{moeda(l.receita)}</td>
                <td className="num">{moeda(l.custo_mo)}</td>
                <td className="num">{moeda(l.custo_material)}</td>
                <td className="num">{moeda(l.custo_total)}</td>
                <td className="num" style={{ color: l.margem >= 0 ? 'var(--sucesso)' : 'var(--perigo)' }}>
                  {moeda(l.margem)}
                </td>
                <td className="num">{l.margem_percentual}%</td>
                <td><Etiqueta status={l.status} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}><strong>Total</strong></td>
              <td className="num"><strong>{moeda(totais.receita)}</strong></td>
              <td colSpan={2} />
              <td className="num"><strong>{moeda(totais.custo)}</strong></td>
              <td className="num"><strong>{moeda(totais.margem)}</strong></td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Cartao>
  );
}

function Clientes({ ano }: { ano: number }) {
  const { dados, carregando, erro } = useApi<LinhaCliente[]>(`/indicadores/clientes/ranking?ano=${ano}`, [ano]);
  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados || dados.length === 0) return <Cartao><Vazio texto={`Sem vendas em ${ano}.`} /></Cartao>;

  const total = dados.reduce((s, l) => s + l.valor, 0);

  return (
    <Cartao titulo={`Maiores clientes — ${ano}`}>
      <div className="tabela-rolagem" style={{ maxHeight: '64vh', overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>#</th><th>Cliente</th><th>Categoria</th>
              <th className="num">Pedidos</th><th className="num">Peças</th>
              <th className="num">Faturamento</th><th className="num">Participação</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((l, i) => (
              <tr key={l.cliente_id}>
                <td>{i + 1}</td>
                <td>{l.cliente}</td>
                <td>{l.categoria ?? '—'}</td>
                <td className="num">{l.pedidos}</td>
                <td className="num">{numero(l.pecas)}</td>
                <td className="num">{moeda(l.valor)}</td>
                <td className="num">{total > 0 ? ((l.valor / total) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

function Mensal({ ano }: { ano: number }) {
  const { dados, carregando, erro } = useApi<LinhaMes[]>(`/indicadores/vendas/mensal?ano=${ano}`, [ano]);
  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados || dados.length === 0) return <Cartao><Vazio texto={`Sem vendas em ${ano}.`} /></Cartao>;

  const totais = dados.reduce(
    (a, l) => ({ pedidos: a.pedidos + l.pedidos, pecas: a.pecas + l.pecas, valor: a.valor + l.valor }),
    { pedidos: 0, pecas: 0, valor: 0 }
  );

  return (
    <Cartao titulo={`Vendas mês a mês — ${ano}`}>
      <table>
        <thead>
          <tr>
            <th>Mês</th><th className="num">Pedidos</th><th className="num">Peças</th>
            <th className="num">Faturamento</th><th className="num">Ticket médio/peça</th>
          </tr>
        </thead>
        <tbody>
          {dados.map((l) => (
            <tr key={l.mes}>
              <td>{mesCurto(l.mes)}</td>
              <td className="num">{l.pedidos}</td>
              <td className="num">{numero(l.pecas)}</td>
              <td className="num">{moeda(l.valor)}</td>
              <td className="num">{moeda(l.ticket_medio)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Total</strong></td>
            <td className="num"><strong>{totais.pedidos}</strong></td>
            <td className="num"><strong>{numero(totais.pecas)}</strong></td>
            <td className="num"><strong>{moeda(totais.valor)}</strong></td>
            <td className="num"><strong>{moeda(totais.pecas > 0 ? totais.valor / totais.pecas : 0)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </Cartao>
  );
}

/**
 * Carteira em produção: o quadro "TOTAIS" da planilha, agora somado uma vez só
 * sobre os mesmos itens que o PCP enxerga.
 */
function Carteira() {
  const { dados, carregando, erro } = useApi<CarteiraConsolidada>('/relatorios/carteira');
  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return null;

  return (
    <>
      <div className="grade c4">
        <Indicador rotulo="Peças em carteira" valor={numero(dados.pecas)} nota={`${dados.pedidos} pedidos`} />
        <Indicador rotulo="A faturar" valor={moeda(dados.faturar)} nota={`${dados.itens} itens em aberto`} />
        <Indicador rotulo="A liquidar" valor={moeda(dados.liquidar)} nota="saldo já acertado com o cliente" />
        <Indicador rotulo="Ticket médio / peça" valor={moeda(dados.ticket_medio)} />
      </div>

      <div className="grade c2" style={{ marginTop: 16 }}>
        <Cartao titulo="Carteira por grupo de produto">
          {dados.por_grupo.length === 0 ? (
            <Vazio texto="Nenhum item em carteira." />
          ) : (
            <table>
              <thead>
                <tr><th>Grupo</th><th className="num">Peças</th><th className="num">A faturar</th><th className="num">A liquidar</th></tr>
              </thead>
              <tbody>
                {dados.por_grupo.map((g) => (
                  <tr key={g.grupo}>
                    <td>{g.grupo}</td>
                    <td className="num">{numero(g.pecas)}</td>
                    <td className="num">{moeda(g.faturar)}</td>
                    <td className="num">{moeda(g.liquidar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>

        <Cartao
          titulo="Mão de obra ainda em produção"
          acao={<small>{moeda(dados.mo_em_producao_total)} no total</small>}
        >
          {dados.mo_em_producao.length === 0 ? (
            <Vazio texto="Nenhuma etapa aberta." />
          ) : (
            <table>
              <thead>
                <tr><th>Etapa</th><th className="num">Ordens</th><th className="num">Custo de MO</th></tr>
              </thead>
              <tbody>
                {dados.mo_em_producao.map((e) => (
                  <tr key={e.codigo}>
                    <td>{e.etapa}</td>
                    <td className="num">{e.ordens}</td>
                    <td className="num">{moeda(e.custo_mo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="ajuda">
            Só as etapas que ainda não fecharam entram na conta — é o que de fato falta pagar.
          </p>
        </Cartao>
      </div>
    </>
  );
}

/** Mapa de PCP com mão de obra por etapa — a aba "PCP + MO". */
function PcpMaoDeObra({ ano }: { ano: number }) {
  const [somenteCarteira, setSomenteCarteira] = useState(true);
  const consulta = `ano=${ano}${somenteCarteira ? '&situacao=CARTEIRA' : ''}`;
  const { dados, carregando, erro } = useApi<LinhaPcpMo[]>(`/relatorios/pcp-mo?${consulta}`, [ano, somenteCarteira]);

  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;

  const linhas = dados ?? [];
  const totais = linhas.reduce(
    (a, l) => ({ pecas: a.pecas + l.quantidade, valor: a.valor + l.total, mo: a.mo + l.mo_total }),
    { pecas: 0, valor: 0, mo: 0 }
  );

  return (
    <Cartao
      titulo={`PCP e mão de obra — ${ano}`}
      acao={
        <div className="linha-acoes">
          <label className="marcador">
            <input type="checkbox" checked={somenteCarteira} onChange={(e) => setSomenteCarteira(e.target.checked)} />
            só o que está em carteira
          </label>
          <Exportar caminho={`/relatorios/pcp-mo?${consulta}&formato=csv`} arquivo={`pcp-mo-${ano}.csv`} />
        </div>
      }
    >
      {linhas.length === 0 ? (
        <Vazio texto={`Nenhum item em ${ano}.`} />
      ) : (
        <div className="tabela-rolagem" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Pedido</th><th>Cliente</th><th>Produto</th>
                <th className="num">Qtd</th><th className="num">Total</th>
                {ETAPAS.map((e) => <th key={e.codigo}>{e.rotulo}</th>)}
                <th className="num">MO</th><th className="num">Margem</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.item_id}>
                  <td>
                    {l.ordem_id
                      ? <Link to={`/producao/${l.ordem_id}`}>{l.pedido_numero}</Link>
                      : l.pedido_numero}
                    <small className="nota-celula"> sem. {l.semana_pedido}</small>
                  </td>
                  <td title={l.cliente}>{l.cliente.slice(0, 22)}</td>
                  <td title={l.produto}>{l.produto.slice(0, 26)}</td>
                  <td className="num">{numero(l.quantidade)}</td>
                  <td className="num">{moeda(l.total)}</td>
                  {ETAPAS.map((e) => (
                    <td key={e.codigo} className="num">
                      {l.etapas[e.codigo]?.status === 'CONCLUIDA' ? 'OK' : ''}
                    </td>
                  ))}
                  <td className="num">{moeda(l.mo_total)}</td>
                  <td className="num">{moeda(l.margem_bruta)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}><strong>Total</strong></td>
                <td className="num"><strong>{numero(totais.pecas)}</strong></td>
                <td className="num"><strong>{moeda(totais.valor)}</strong></td>
                <td colSpan={ETAPAS.length} />
                <td className="num"><strong>{moeda(totais.mo)}</strong></td>
                <td className="num"><strong>{moeda(totais.valor - totais.mo)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Cartao>
  );
}

/** Relatório de pedidos de um cliente — a aba que a Conserv mantinha por conta grande. */
function PorCliente({ ano }: { ano: number }) {
  const [clienteId, setClienteId] = useState<number | ''>('');
  const [todoPeriodo, setTodoPeriodo] = useState(false);
  const { dados: clientes } = useApi<Cliente[]>('/clientes?ativo=true&limite=1000');
  const consulta = `cliente_id=${clienteId}${todoPeriodo ? '' : `&ano=${ano}`}`;
  const { dados, carregando, erro } = useApi<RelatorioCliente>(
    clienteId ? `/relatorios/pedidos-cliente?${consulta}` : null,
    [clienteId, ano, todoPeriodo]
  );

  return (
    <Cartao
      titulo="Pedidos por cliente"
      acao={
        clienteId ? (
          <Exportar caminho={`/relatorios/pedidos-cliente?${consulta}&formato=csv`} arquivo="pedidos-cliente.csv" />
        ) : null
      }
    >
      <div className="linha-campos" style={{ alignItems: 'end' }}>
        <Campo rotulo="Cliente">
          <select value={clienteId} onChange={(e) => setClienteId(Number(e.target.value) || '')}>
            <option value="">Selecione…</option>
            {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <div className="campo">
          <label className="marcador">
            <input type="checkbox" checked={todoPeriodo} onChange={(e) => setTodoPeriodo(e.target.checked)} />
            todo o período
          </label>
        </div>
      </div>

      {!clienteId && <Vazio texto="Escolha um cliente para ver o histórico de pedidos." />}
      {carregando && <Carregando />}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {dados && (
        <>
          <div className="grade c4" style={{ marginTop: 12 }}>
            <Indicador rotulo="Itens" valor={numero(dados.total.itens)} />
            <Indicador rotulo="Peças" valor={numero(dados.total.pecas)} />
            <Indicador rotulo="Faturamento" valor={moeda(dados.total.valor)} />
            <Indicador
              rotulo="Ticket médio / peça"
              valor={moeda(dados.total.pecas > 0 ? dados.total.valor / dados.total.pecas : 0)}
            />
          </div>
          <div className="tabela-rolagem" style={{ maxHeight: '52vh', overflowY: 'auto', marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Pedido</th><th>Data</th><th>Produto</th><th>Grupo</th>
                  <th className="num">Qtd</th><th className="num">Valor unid.</th>
                  <th className="num">Total</th><th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((i, n) => (
                  <tr key={`${i.pedido_numero}-${n}`}>
                    <td>{i.pedido_numero}</td>
                    <td>{dataBR(i.data_pedido)}</td>
                    <td title={i.produto}>{i.produto.slice(0, 30)}</td>
                    <td>{i.grupo ?? '—'}</td>
                    <td className="num">{numero(i.quantidade)}</td>
                    <td className="num">{moeda(i.preco_unitario)}</td>
                    <td className="num">{moeda(i.total)}</td>
                    <td><Etiqueta status={i.situacao} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Cartao>
  );
}

/** Pedidos do mês, agrupados por pedido — a tabela dinâmica da planilha. */
function PedidosMes({ ano }: { ano: number }) {
  const [mes, setMes] = useState('');
  const consulta = `ano=${ano}${mes ? `&mes=${mes}` : ''}`;
  const { dados, carregando, erro } = useApi<LinhaPedidoMes[]>(`/relatorios/pedidos-mes?${consulta}`, [ano, mes]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  const linhas = dados ?? [];
  const totais = linhas.reduce((a, l) => ({ pecas: a.pecas + l.pecas, valor: a.valor + l.valor }), { pecas: 0, valor: 0 });

  return (
    <Cartao
      titulo={`Pedidos do mês — ${ano}`}
      acao={
        <div className="linha-acoes">
          <select value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: 130 }}>
            <option value="">Todos os meses</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
              <option key={m} value={m}>{mesCurto(m)}</option>
            ))}
          </select>
          <Exportar caminho={`/relatorios/pedidos-mes?${consulta}&formato=csv`} arquivo={`pedidos-${ano}${mes ? `-${mes}` : ''}.csv`} />
        </div>
      }
    >
      {carregando && <Carregando />}
      {!carregando && linhas.length === 0 && <Vazio texto="Nenhum pedido no período." />}
      {linhas.length > 0 && (
        <div className="tabela-rolagem" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th><th className="num">Semana</th><th>Pedido</th><th>Cliente</th>
                <th>Vendedor</th><th className="num">Itens</th><th className="num">Peças</th><th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.pedido_id}>
                  <td>{dataBR(l.data_pedido)}</td>
                  <td className="num">{l.semana}</td>
                  <td><Link to={`/pedidos/${l.pedido_id}`}>{l.pedido_numero}</Link></td>
                  <td title={l.cliente}>{l.cliente.slice(0, 28)}</td>
                  <td>{l.vendedor ?? '—'}</td>
                  <td className="num">{l.itens}</td>
                  <td className="num">{numero(l.pecas)}</td>
                  <td className="num">{moeda(l.valor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}><strong>Total ({linhas.length} pedidos)</strong></td>
                <td />
                <td className="num"><strong>{numero(totais.pecas)}</strong></td>
                <td className="num"><strong>{moeda(totais.valor)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Cartao>
  );
}

/**
 * Fila de impressão das fichas: as ordens abertas, com o dossiê a um clique.
 * Quem está no PCP imprime daqui sem precisar abrir ordem por ordem.
 */
function Fichas() {
  const { dados, carregando, erro } = useApi<OrdemLista[]>('/ordens?limite=300');
  const [falha, setFalha] = useState('');
  const [ocupada, setOcupada] = useState<number | null>(null);

  async function imprimir(id: number) {
    setFalha('');
    setOcupada(id);
    try {
      await api.abrirDocumento(`/fichas/ordens/${id}/impressao`);
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Falha ao gerar a ficha');
    } finally {
      setOcupada(null);
    }
  }

  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados || dados.length === 0) return <Cartao><Vazio texto="Nenhuma ordem aberta." /></Cartao>;

  return (
    <Cartao titulo="Fichas de produção" acao={<small>ordens abertas · dossiê completo em A4</small>}>
      <Aviso tipo="erro">{falha}</Aviso>
      <div className="tabela-rolagem" style={{ maxHeight: '64vh', overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>OP</th><th>Cliente</th><th>Produto</th><th className="num">Qtd</th>
              <th>Entrega</th><th>Situação</th><th />
            </tr>
          </thead>
          <tbody>
            {dados.map((o) => (
              <tr key={o.id}>
                <td><Link to={`/producao/${o.id}`}>{o.numero}</Link></td>
                <td title={o.cliente}>{o.cliente.slice(0, 24)}</td>
                <td title={o.produto}>{o.produto.slice(0, 30)}</td>
                <td className="num">{numero(o.quantidade)}</td>
                <td>{dataBR(o.data_prevista)}</td>
                <td><Etiqueta status={o.status} /></td>
                <td>
                  <button className="pequeno primario" disabled={ocupada === o.id} onClick={() => imprimir(o.id)}>
                    {ocupada === o.id ? 'Gerando…' : 'Imprimir ficha'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

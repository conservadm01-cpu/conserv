import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useApi } from '../lib/hooks';
import { moeda, moedaCurta, numero, data, mesCurto, decimal } from '../lib/formato';
import { Cartao, Indicador, Carregando, Aviso, Vazio, Etiqueta } from '../components/ui';
import type { Dashboard as TDashboard } from '../tipos';

const CORES = ['#1f6feb', '#10874a', '#b26a00', '#7d4bd1', '#c2382f', '#0e8a9c', '#8a6d3b', '#5f6b7a'];

export default function Dashboard() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const { dados, carregando, erro } = useApi<TDashboard>(`/indicadores/dashboard?ano=${ano}`, [ano]);

  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return null;

  const { carteira, por_grupo, vendas_mes, vendas_categoria, producao_etapas, custo_mo } = dados;
  const anos = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const serieMes = vendas_mes.map((m) => ({ ...m, rotulo: mesCurto(m.mes) }));

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Painel</h1>
          <p>Posição de {data(dados.referencia)} — carteira, produção e materiais</p>
        </div>
        <div className="acoes">
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} style={{ width: 110 }}>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </header>

      <div className="grade c4">
        <Indicador rotulo="Peças em carteira" valor={numero(carteira.pecas)}
          nota={`${carteira.itens} itens em ${carteira.pedidos} pedidos`} />
        <Indicador rotulo="A faturar" valor={moedaCurta(carteira.faturar)} nota={moeda(carteira.faturar)} />
        <Indicador rotulo="A liquidar" valor={moedaCurta(carteira.liquidar)} nota={moeda(carteira.liquidar)} />
        <Indicador rotulo="Ticket médio por peça" valor={moeda(carteira.ticket_medio)} />
        <Indicador rotulo="Itens atrasados" valor={numero(carteira.itens_atrasados)}
          tom={carteira.itens_atrasados > 0 ? 'perigo' : 'sucesso'}
          nota={<Link to="/carteira">ver carteira</Link>} />
        <Indicador rotulo="MO em produção" valor={moedaCurta(custo_mo.total)}
          nota={custo_mo.etapas.filter((e) => e.custo > 0).map((e) => e.nome).join(', ') || 'sem custo lançado'} />
        <Indicador rotulo="Entregas em 7 dias" valor={numero(dados.entregas_semana.length)} />
        <Indicador rotulo="Materiais abaixo do mínimo" valor={numero(dados.alertas_estoque.length)}
          tom={dados.alertas_estoque.length > 0 ? 'perigo' : 'sucesso'}
          nota={<Link to="/compras">necessidade de compra</Link>} />
      </div>

      <div className="grade c2" style={{ marginTop: 16 }}>
        <Cartao titulo={`Vendas ${ano}`} acao={<small>valor faturado por mês</small>}>
          {serieMes.length === 0 ? <Vazio texto="Sem vendas registradas neste ano." /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={serieMes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => [moeda(Number(v)), 'Faturado']} />
                <Line type="monotone" dataKey="valor" stroke="#1f6feb" strokeWidth={2} dot={{ r: 3 }} name="valor" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Cartao>

        <Cartao titulo="Fila de produção por etapa" acao={<Link to="/producao">abrir quadro</Link>}>
          {/* Cada ordem aparece só na etapa em que está parada — mesma leitura do quadro do PCP. */}
          {producao_etapas.every((e) => e.pecas_na_fila === 0) ? (
            <Vazio texto="Nenhuma ordem em aberto." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={producao_etapas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={54} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => [numero(Number(v)), 'Peças na fila']} />
                <Bar dataKey="pecas_na_fila" fill="#1f6feb" radius={[4, 4, 0, 0]} name="Peças na fila" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Cartao>

        <Cartao titulo="Carteira por grupo de produto">
          {por_grupo.length === 0 ? <Vazio texto="Carteira vazia." /> : (
            <div className="tabela-rolagem" style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr><th>Grupo</th><th className="num">Peças</th><th className="num">A faturar</th><th className="num">A liquidar</th></tr>
                </thead>
                <tbody>
                  {por_grupo.map((g) => (
                    <tr key={g.grupo}>
                      <td>{g.grupo}</td>
                      <td className="num">{numero(g.pecas)}</td>
                      <td className="num">{moeda(g.faturar)}</td>
                      <td className="num">{moeda(g.liquidar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>

        <Cartao titulo={`Vendas por categoria de cliente — ${ano}`}>
          {vendas_categoria.length === 0 ? <Vazio texto="Sem dados no período." /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={vendas_categoria.slice(0, 8)} dataKey="valor" nameKey="categoria"
                  cx="50%" cy="50%" outerRadius={82} innerRadius={44} paddingAngle={2}>
                  {vendas_categoria.slice(0, 8).map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => moeda(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Cartao>
      </div>

      <div className="grade c2" style={{ marginTop: 16 }}>
        <Cartao titulo="Itens atrasados" acao={<Link to="/carteira">ver todos</Link>}>
          {dados.atrasados.length === 0 ? <Vazio texto="Nenhum item atrasado. 👏" /> : (
            <div className="tabela-rolagem">
              <table>
                <thead>
                  <tr><th>Pedido</th><th>Cliente</th><th>Produto</th><th className="num">Qtd</th><th>Entrega</th><th className="num">Atraso</th></tr>
                </thead>
                <tbody>
                  {dados.atrasados.map((i) => (
                    <tr key={i.item_id}>
                      <td><Link to={`/pedidos/${i.pedido_id}`}>{i.pedido_numero}</Link></td>
                      <td>{i.cliente}</td>
                      <td title={i.produto}>{i.produto.slice(0, 34)}</td>
                      <td className="num">{numero(i.quantidade)}</td>
                      <td>{data(i.data_entrega)}</td>
                      <td className="num"><span className="etiqueta vermelha">{i.dias_atraso}d</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>

        <Cartao titulo="Materiais abaixo do estoque mínimo" acao={<Link to="/estoque">ver estoque</Link>}>
          {dados.alertas_estoque.length === 0 ? <Vazio texto="Estoque dentro dos mínimos." /> : (
            <div className="tabela-rolagem" style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr><th>Material</th><th className="num">Saldo</th><th className="num">Mínimo</th><th /></tr>
                </thead>
                <tbody>
                  {dados.alertas_estoque.map((m) => (
                    <tr key={m.id}>
                      <td>{m.descricao}</td>
                      <td className="num">{decimal(m.saldo)} {m.unidade}</td>
                      <td className="num">{decimal(m.estoque_min)}</td>
                      <td><Etiqueta texto={m.saldo <= 0 ? 'Zerado' : 'Abaixo do mínimo'} tom={m.saldo <= 0 ? 'vermelha' : 'amarela'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      </div>
    </>
  );
}

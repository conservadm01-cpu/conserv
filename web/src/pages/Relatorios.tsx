import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { moeda, numero, mesCurto } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Etiqueta } from '../components/ui';

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

const ABAS = ['Margem por ordem', 'Ranking de clientes', 'Vendas mensais'] as const;

export default function Relatorios() {
  const [aba, setAba] = useState<(typeof ABAS)[number]>('Margem por ordem');
  const [ano, setAno] = useState(new Date().getFullYear());
  const anos = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Relatórios</h1>
          <p>Rentabilidade da produção e desempenho comercial</p>
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

      {aba === 'Margem por ordem' && <Margem />}
      {aba === 'Ranking de clientes' && <Clientes ano={ano} />}
      {aba === 'Vendas mensais' && <Mensal ano={ano} />}
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

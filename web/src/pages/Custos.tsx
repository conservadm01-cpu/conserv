import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useApi } from '../lib/hooks';
import { moeda, decimal, numero } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Indicador, Etiqueta } from '../components/ui';
import type { TaxaIndireta } from '../tipos';

type LinhaProduto = {
  id: number; produto: string; grupo: string | null; preco: number;
  material: number; mao_de_obra: number; indireto: number; total: number;
  margem: number; margem_percentual: number; minutos_por_peca: number; completo: boolean;
};

const CORES = ['#1f6feb', '#10874a', '#b26a00'];

export default function Custos() {
  const [soPrejuizo, setSoPrejuizo] = useState(false);
  const { dados, carregando, erro } =
    useApi<{ taxa_indireta: TaxaIndireta; produtos: LinhaProduto[] }>('/indicadores/custos/produtos?limite=400');

  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return null;

  const linhas = dados.produtos.filter((p) => !soPrejuizo || p.margem < 0);
  const negativas = dados.produtos.filter((p) => p.margem < 0).length;
  const incompletos = dados.produtos.filter((p) => !p.completo).length;

  const soma = dados.produtos.reduce(
    (a, p) => ({
      material: a.material + p.material,
      mao_de_obra: a.mao_de_obra + p.mao_de_obra,
      indireto: a.indireto + p.indireto,
    }),
    { material: 0, mao_de_obra: 0, indireto: 0 }
  );
  const fatias = [
    { nome: 'Material', valor: soma.material },
    { nome: 'Mão de obra', valor: soma.mao_de_obra },
    { nome: 'Custo indireto', valor: soma.indireto },
  ].filter((f) => f.valor > 0);

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Formação de custo</h1>
          <p>O que cada peça custa de verdade: material, mão de obra e a parte do custo fixo da fábrica</p>
        </div>
        <div className="acoes">
          <label style={{ display: 'flex', gap: 6, margin: 0, fontWeight: 400, alignItems: 'center' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={soPrejuizo}
              onChange={(e) => setSoPrejuizo(e.target.checked)} /> só margem negativa
          </label>
        </div>
      </header>

      <div className="grade c4">
        <Indicador rotulo="Produtos custeados" valor={dados.produtos.length} />
        <Indicador rotulo="Com margem negativa" valor={negativas} tom={negativas ? 'perigo' : 'sucesso'}
          nota={negativas ? 'preço abaixo do custo formado' : 'nenhum produto no prejuízo'} />
        <Indicador rotulo="Custo indireto" valor={`${moeda(dados.taxa_indireta.por_hora)}/h`}
          nota={`${moeda(dados.taxa_indireta.total)}/mês rateados`} />
        <Indicador rotulo="Custeio incompleto" valor={incompletos}
          nota={incompletos ? 'falta ficha técnica, processo ou custo fixo' : 'todos com dados completos'} />
      </div>

      {dados.taxa_indireta.avisos.map((a, i) => <Aviso key={i} tipo="info">{a}</Aviso>)}

      {fatias.length > 0 && (
        <div className="grade c2" style={{ marginTop: 16 }}>
          <Cartao titulo="Composição média do custo" acao={<small>soma de todos os produtos custeados</small>}>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={fatias} dataKey="valor" nameKey="nome" cx="50%" cy="50%"
                  innerRadius={48} outerRadius={86} paddingAngle={2}>
                  {fatias.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => moeda(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </Cartao>

          <Cartao titulo="Como a conta é feita">
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--texto-fraco)', fontSize: 13, lineHeight: 1.7 }}>
              <li><strong>Material</strong>: ficha técnica × custo do material, já com a perda.</li>
              <li>
                <strong>Mão de obra</strong>: tempo padrão de cada etapa × custo do minuto do setor.
                O custo do minuto é a folha com encargos e vale-transporte dividida pelos minutos
                que o setor produz no mês.
              </li>
              <li>
                <strong>Custo indireto</strong>: os minutos que a peça ocupa a fábrica ×{' '}
                {moeda(dados.taxa_indireta.por_minuto)} — o custo fixo mensal dividido pela
                capacidade real ({numero(dados.taxa_indireta.capacidade.horas_mes)} h,
                já com a ocupação de {dados.taxa_indireta.capacidade.ocupacao_percentual}%).
              </li>
            </ul>
            <p style={{ color: 'var(--texto-fraco)', fontSize: 12.5, marginBottom: 0 }}>
              Ajuste jornada, encargos e ocupação em <Link to="/engenharia">Engenharia</Link>;
              o tempo de cada operação fica na ficha do produto.
            </p>
          </Cartao>
        </div>
      )}

      <Cartao titulo={`Custo por produto (${linhas.length})`}>
        {linhas.length === 0 ? (
          <Vazio texto="Nenhum produto com ficha técnica ou processo cadastrado ainda." />
        ) : (
          <div className="tabela-rolagem" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Produto</th><th>Grupo</th>
                  <th className="num">Material</th><th className="num">MO</th><th className="num">Indireto</th>
                  <th className="num">Custo</th><th className="num">Preço</th>
                  <th className="num">Margem</th><th className="num">%</th>
                  <th className="num">Min/pç</th><th />
                </tr>
              </thead>
              <tbody>
                {linhas.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/produtos/${p.id}`} title={p.produto}>{p.produto.slice(0, 40)}</Link></td>
                    <td>{p.grupo ?? '—'}</td>
                    <td className="num">{moeda(p.material)}</td>
                    <td className="num">{moeda(p.mao_de_obra)}</td>
                    <td className="num">{moeda(p.indireto)}</td>
                    <td className="num"><strong>{moeda(p.total)}</strong></td>
                    <td className="num">{moeda(p.preco)}</td>
                    <td className="num" style={{ color: p.margem >= 0 ? 'var(--sucesso)' : 'var(--perigo)' }}>
                      {moeda(p.margem)}
                    </td>
                    <td className="num">{decimal(p.margem_percentual)}%</td>
                    <td className="num">{decimal(p.minutos_por_peca)}</td>
                    <td>{p.completo ? null : <Etiqueta texto="incompleto" tom="amarela" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </>
  );
}

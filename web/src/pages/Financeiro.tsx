import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, Legend, ReferenceLine,
} from 'recharts';
import { api, ApiError, pode } from '../lib/api';
import { useApi } from '../lib/hooks';
import { BarraFiltros, useFiltros, type CampoFiltro } from '../components/Filtros';
import { moeda, moedaCurta, numero, data, decimal, hoje, mesCurto } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Campo, Indicador, Etiqueta, Modal } from '../components/ui';
import type {
  ResumoFinanceiro, Titulo, CategoriaFinanceira, ContaBancaria, Cliente, Fornecedor,
} from '../tipos';

const ABAS = ['Posição', 'A receber', 'A pagar'] as const;

const TOM_STATUS: Record<string, string> = {
  ABERTO: '', PARCIAL: 'azul', QUITADO: 'verde', CANCELADO: '',
};
const ROTULO_STATUS: Record<string, string> = {
  ABERTO: 'Aberto', PARCIAL: 'Parcial', QUITADO: 'Quitado', CANCELADO: 'Cancelado',
};

export default function Financeiro() {
  const [aba, setAba] = useState<(typeof ABAS)[number]>('Posição');
  const [novo, setNovo] = useState<'RECEBER' | 'PAGAR' | null>(null);
  const [recarga, setRecarga] = useState(0);

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Financeiro</h1>
          <p>Contas a pagar e a receber, com a previsão de caixa das próximas semanas</p>
        </div>
        {pode('financeiro.lancar') && (
          <div className="acoes">
            <button onClick={() => setNovo('PAGAR')}>Nova conta a pagar</button>
            <button className="primario" onClick={() => setNovo('RECEBER')}>Nova conta a receber</button>
          </div>
        )}
      </header>

      <div className="abas">
        {ABAS.map((a) => (
          <button key={a} className={`aba${aba === a ? ' ativa' : ''}`} onClick={() => setAba(a)}>{a}</button>
        ))}
      </div>

      {aba === 'Posição' && <Posicao chave={recarga} />}
      {aba === 'A receber' && <Titulos tipo="RECEBER" chave={recarga} aoMudar={() => setRecarga((n) => n + 1)} />}
      {aba === 'A pagar' && <Titulos tipo="PAGAR" chave={recarga} aoMudar={() => setRecarga((n) => n + 1)} />}

      <FormularioTitulo
        tipo={novo}
        aoFechar={() => setNovo(null)}
        aoSalvar={() => { setNovo(null); setRecarga((n) => n + 1); }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ posição */

function Posicao({ chave }: { chave: number }) {
  const ano = new Date().getFullYear();
  const { dados, carregando, erro } = useApi<ResumoFinanceiro>(`/financeiro/resumo?ano=${ano}`, [chave]);

  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return null;

  const { receber, pagar } = dados;
  const saldoPrevisto = receber.aberto - pagar.aberto;

  const fluxo = dados.fluxo.map((s) => ({
    ...s,
    rotulo: data(s.inicio).slice(0, 5),
    saidasNegativas: -s.saidas,
  }));
  const realizado = dados.realizado
    .filter((m) => m.recebido > 0 || m.pago > 0)
    .map((m) => ({ ...m, rotulo: mesCurto(m.mes), pagoNegativo: -m.pago }));

  return (
    <>
      <div className="grade c4">
        <Indicador rotulo="A receber em aberto" valor={moedaCurta(receber.aberto)}
          nota={`${receber.titulos} títulos · ${moeda(receber.aberto)}`} />
        <Indicador rotulo="Recebimentos vencidos" valor={moedaCurta(receber.vencido)}
          tom={receber.vencido > 0 ? 'perigo' : 'sucesso'}
          nota={`${receber.titulos_vencidos} títulos em atraso`} />
        <Indicador rotulo="A pagar em aberto" valor={moedaCurta(pagar.aberto)}
          nota={`${pagar.titulos} títulos · ${moeda(pagar.aberto)}`} />
        <Indicador rotulo="Saldo previsto" valor={moedaCurta(saldoPrevisto)}
          tom={saldoPrevisto >= 0 ? 'sucesso' : 'perigo'}
          nota="tudo o que há em aberto, dos dois lados" />
        <Indicador rotulo="Entra em 7 dias" valor={moeda(receber.proximos_7)} />
        <Indicador rotulo="Sai em 7 dias" valor={moeda(pagar.proximos_7)} />
        <Indicador rotulo="Entra em 30 dias" valor={moeda(receber.proximos_30)} />
        <Indicador rotulo="Sai em 30 dias" valor={moeda(pagar.proximos_30)} />
      </div>

      <Cartao
        titulo="Fluxo de caixa previsto"
        acao={<small>próximas 12 semanas · o vencido pesa na semana corrente</small>}
      >
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={fluxo} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip
              formatter={(v, n) => [moeda(Math.abs(Number(v))), String(n)]}
              labelFormatter={(l) => `Semana de ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#8a95a3" />
            <Bar dataKey="entradas" name="Entradas" fill="#10874a" radius={[3, 3, 0, 0]} />
            <Bar dataKey="saidasNegativas" name="Saídas" fill="#c2382f" radius={[0, 0, 3, 3]} />
            <Line type="monotone" dataKey="acumulado" name="Saldo acumulado" stroke="#1f6feb" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Cartao>

      <div className="grade c2">
        <Cartao titulo="Idade dos recebimentos" acao={<small>há quanto tempo está vencido</small>}>
          <TabelaAging faixas={dados.aging_receber} />
        </Cartao>
        <Cartao titulo="Idade dos pagamentos">
          <TabelaAging faixas={dados.aging_pagar} />
        </Cartao>
      </div>

      {realizado.length > 0 && (
        <Cartao titulo={`Caixa realizado em ${ano}`} acao={<small>o que efetivamente entrou e saiu</small>}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={realizado} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
              <Tooltip formatter={(v, n) => [moeda(Math.abs(Number(v))), String(n)]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#8a95a3" />
              <Bar dataKey="recebido" name="Recebido" fill="#10874a" radius={[3, 3, 0, 0]} />
              <Bar dataKey="pagoNegativo" name="Pago" fill="#c2382f" radius={[0, 0, 3, 3]} />
            </BarChart>
          </ResponsiveContainer>
        </Cartao>
      )}

      <div className="grade c2">
        <Cartao titulo="Maiores valores a receber">
          <TabelaRanking linhas={dados.maiores_devedores} rotulo="Cliente" />
        </Cartao>
        <Cartao titulo="Maiores valores a pagar">
          <TabelaRanking linhas={dados.maiores_credores} rotulo="Fornecedor" />
        </Cartao>
      </div>
    </>
  );
}

const TabelaAging = ({ faixas }: { faixas: ResumoFinanceiro['aging_receber'] }) => {
  const total = faixas.reduce((s, f) => s + f.valor, 0);
  return (
    <table>
      <thead>
        <tr><th>Faixa</th><th className="num">Títulos</th><th className="num">Valor</th><th className="num">%</th></tr>
      </thead>
      <tbody>
        {faixas.map((f) => (
          <tr key={f.faixa}>
            <td>{f.faixa}</td>
            <td className="num">{f.titulos}</td>
            <td className="num">{moeda(f.valor)}</td>
            <td className="num">{total > 0 ? decimal((f.valor / total) * 100) : '0'}%</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr><td><strong>Total</strong></td><td /><td className="num"><strong>{moeda(total)}</strong></td><td /></tr>
      </tfoot>
    </table>
  );
};

const TabelaRanking = ({ linhas, rotulo }: { linhas: ResumoFinanceiro['maiores_devedores']; rotulo: string }) =>
  linhas.length === 0 ? <Vazio texto="Nada em aberto." /> : (
    <table>
      <thead>
        <tr><th>{rotulo}</th><th className="num">Títulos</th><th className="num">Em aberto</th><th className="num">Vencido</th></tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.parte}>
            <td>{l.parte}</td>
            <td className="num">{l.titulos}</td>
            <td className="num">{moeda(l.aberto)}</td>
            <td className="num">
              {l.vencido > 0
                ? <span style={{ color: 'var(--perigo)' }}>{moeda(l.vencido)} · {l.maior_atraso}d</span>
                : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

/* ------------------------------------------------------------------ títulos */

function Titulos({ tipo, chave, aoMudar }: {
  tipo: 'RECEBER' | 'PAGAR'; chave: number; aoMudar: () => void;
}) {
  const [baixando, setBaixando] = useState<Titulo | null>(null);
  const [editando, setEditando] = useState<Titulo | null>(null);
  const [falha, setFalha] = useState('');

  const { dados: categorias } = useApi<CategoriaFinanceira[]>('/financeiro/categorias');
  const filtros = useFiltros('/financeiro/titulos', { tipo, limite: '500' });
  const { dados, carregando, erro, recarregar } = useApi<Titulo[]>(filtros.caminho, [filtros.caminho, chave]);

  const campos: CampoFiltro[] = [
    { chave: 'busca', rotulo: tipo === 'RECEBER' ? 'Cliente, descrição ou NF' : 'Fornecedor, descrição ou NF', tipo: 'busca' },
    { chave: 'status', rotulo: 'Situação', tipo: 'select',
      opcoes: Object.entries(ROTULO_STATUS).map(([v, r]) => ({ valor: v, rotulo: r })) },
    { chave: 'categoria', rotulo: 'Categoria', tipo: 'select',
      opcoes: (categorias ?? []).filter((c) => c.tipo === tipo).map((c) => ({ valor: c.nome, rotulo: c.nome })) },
    { chave: 'de', rotulo: 'Vencimento de', tipo: 'data' },
    { chave: 'ate', rotulo: 'até', tipo: 'data' },
    { chave: 'valor_min', rotulo: 'Valor mínimo', tipo: 'numero' },
    { chave: 'vencidos', rotulo: 'só vencidos', tipo: 'marcar' },
  ];

  async function excluir(t: Titulo) {
    const aviso = t.pago > 0
      ? `Cancelar "${t.descricao}"? As baixas ficam no histórico.`
      : `Excluir "${t.descricao}"?`;
    if (!confirm(aviso)) return;
    setFalha('');
    try {
      await api.delete(`/financeiro/titulos/${t.id}`);
      recarregar();
      aoMudar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível remover');
    }
  }

  const total = (dados ?? []).reduce((s, t) => s + t.saldo, 0);
  const vencido = (dados ?? []).filter((t) => t.dias_atraso > 0).reduce((s, t) => s + t.saldo, 0);

  const atualizar = () => { recarregar(); aoMudar(); };

  return (
    <>
      <div className="grade c3">
        <Indicador rotulo="Títulos listados" valor={numero(dados?.length ?? 0)} />
        <Indicador rotulo="Saldo em aberto" valor={moeda(total)} />
        <Indicador rotulo="Vencido" valor={moeda(vencido)} tom={vencido > 0 ? 'perigo' : 'sucesso'} />
      </div>

      <Cartao titulo={tipo === 'RECEBER' ? 'Contas a receber' : 'Contas a pagar'}>
        <BarraFiltros campos={campos} valores={filtros.valores} aoMudar={filtros.definir}
          aoLimpar={filtros.limpar} ativos={filtros.ativos} />

        {carregando && <Carregando />}
        <Aviso tipo="erro">{falha || erro}</Aviso>
        {dados && dados.length === 0 && <Vazio texto="Nenhum título com estes filtros." />}
        {dados && dados.length > 0 && (
          <div className="tabela-rolagem" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Vencimento</th><th>{tipo === 'RECEBER' ? 'Cliente' : 'Fornecedor'}</th>
                  <th>Descrição</th><th>Categoria</th><th>Doc.</th>
                  <th className="num">Valor</th><th className="num">Pago</th><th className="num">Saldo</th>
                  <th>Situação</th><th />
                </tr>
              </thead>
              <tbody>
                {dados.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {data(t.vencimento)}
                      {t.dias_atraso > 0 && <div><Etiqueta texto={`${t.dias_atraso}d`} tom="vermelha" /></div>}
                    </td>
                    <td title={t.parte ?? ''}>{(t.parte ?? '—').slice(0, 24)}</td>
                    <td title={t.descricao}>
                      {t.descricao.slice(0, 34)}
                      {t.pedido_id && (
                        <div><Link to={`/pedidos/${t.pedido_id}`} style={{ fontSize: 12 }}>pedido {t.pedido_numero}</Link></div>
                      )}
                    </td>
                    <td>{t.categoria ?? '—'}</td>
                    <td>{t.documento ?? '—'}</td>
                    <td className="num">{moeda(t.valor)}</td>
                    <td className="num">{t.pago > 0 ? moeda(t.pago) : '—'}</td>
                    <td className="num"><strong>{moeda(t.saldo)}</strong></td>
                    <td><Etiqueta texto={ROTULO_STATUS[t.status]} tom={TOM_STATUS[t.status]} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {pode('financeiro.baixar') && t.saldo > 0 && t.status !== 'CANCELADO' && (
                        <><button className="pequeno" onClick={() => setBaixando(t)}>
                          {tipo === 'RECEBER' ? 'Receber' : 'Pagar'}
                        </button>{' '}</>
                      )}
                      {pode('financeiro.lancar') && t.status !== 'CANCELADO' && (
                        <>
                          <button className="pequeno" onClick={() => setEditando(t)}>Editar</button>{' '}
                          <button className="pequeno perigo" onClick={() => excluir(t)}>
                            {t.pago > 0 ? 'Cancelar' : 'Excluir'}
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
      </Cartao>

      <FormularioBaixa titulo={baixando} aoFechar={() => setBaixando(null)}
        aoSalvar={() => { setBaixando(null); atualizar(); }} />
      <EditarTitulo titulo={editando} aoFechar={() => setEditando(null)}
        aoSalvar={() => { setEditando(null); atualizar(); }} />
    </>
  );
}

/** Edição do título já lançado: valor, vencimento, categoria e documento. */
function EditarTitulo({ titulo, aoFechar, aoSalvar }: {
  titulo: Titulo | null; aoFechar: () => void; aoSalvar: () => void;
}) {
  const { dados: categorias } = useApi<CategoriaFinanceira[]>(titulo ? '/financeiro/categorias' : null);
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [documento, setDocumento] = useState('');
  const [categoriaId, setCategoriaId] = useState<number | ''>('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!titulo) return;
    setDescricao(titulo.descricao);
    setValor(String(titulo.valor));
    setVencimento(titulo.vencimento);
    setDocumento(titulo.documento ?? '');
    setCategoriaId(titulo.categoria_id ?? '');
    setObservacao(titulo.observacao ?? '');
    setErro('');
  }, [titulo]);

  async function salvar() {
    if (!titulo) return;
    if (!descricao.trim()) return setErro('Informe a descrição.');
    if (!(Number(valor) > 0)) return setErro('O valor precisa ser maior que zero.');
    if (Number(valor) < titulo.pago) {
      return setErro(`O valor não pode ficar abaixo do que já foi pago (${moeda(titulo.pago)}).`);
    }
    setSalvando(true);
    setErro('');
    try {
      await api.put(`/financeiro/titulos/${titulo.id}`, {
        descricao: descricao.trim(),
        valor: Number(valor),
        vencimento,
        documento: documento.trim() || null,
        categoria_id: categoriaId ? Number(categoriaId) : null,
        observacao: observacao.trim() || null,
      });
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={titulo ? `Editar — ${titulo.descricao.slice(0, 40)}` : ''}
      aberto={Boolean(titulo)}
      aoFechar={aoFechar}
      rodape={
        <>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      {titulo && titulo.pago > 0 && (
        <Aviso tipo="info">
          Este título já tem {moeda(titulo.pago)} baixado. O valor não pode ficar abaixo disso.
        </Aviso>
      )}
      <Campo rotulo="Descrição">
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus />
      </Campo>
      <div className="linha-campos">
        <Campo rotulo="Valor">
          <input type="number" min="0" step="any" value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>
        <Campo rotulo="Vencimento">
          <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </Campo>
        <Campo rotulo="Documento">
          <input value={documento} onChange={(e) => setDocumento(e.target.value)} />
        </Campo>
        <Campo rotulo="Categoria">
          <select value={categoriaId} onChange={(e) => setCategoriaId(Number(e.target.value) || '')}>
            <option value="">—</option>
            {(categorias ?? []).filter((c) => c.tipo === titulo?.tipo)
              .map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
      </div>
      <Campo rotulo="Observação">
        <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </Campo>
    </Modal>
  );
}

/* --------------------------------------------------------------- baixa ---- */

function FormularioBaixa({ titulo, aoFechar, aoSalvar }: {
  titulo: Titulo | null; aoFechar: () => void; aoSalvar: () => void;
}) {
  const { dados: contas } = useApi<ContaBancaria[]>(titulo ? '/financeiro/contas-bancarias?ativo=true' : null);
  const { dados: detalhe } = useApi<Titulo>(titulo ? `/financeiro/titulos/${titulo.id}` : null, [titulo?.id]);

  const [valor, setValor] = useState('');
  const [juros, setJuros] = useState('');
  const [desconto, setDesconto] = useState('');
  const [dia, setDia] = useState(hoje());
  const [forma, setForma] = useState('PIX');
  const [contaId, setContaId] = useState<number | ''>('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const saldo = detalhe?.saldo ?? titulo?.saldo ?? 0;

  async function salvar() {
    if (!titulo) return;
    const v = Number(valor || saldo);
    if (!(v > 0)) return setErro('Informe o valor da baixa.');
    setSalvando(true);
    setErro('');
    try {
      await api.post('/financeiro/baixas', {
        titulo_id: titulo.id,
        data: dia,
        valor: v,
        juros: Number(juros) || 0,
        desconto: Number(desconto) || 0,
        forma,
        conta_id: contaId ? Number(contaId) : null,
      });
      setValor(''); setJuros(''); setDesconto('');
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível registrar a baixa');
    } finally {
      setSalvando(false);
    }
  }

  async function estornar(id: number) {
    if (!confirm('Estornar esta baixa? O título volta ao saldo anterior.')) return;
    await api.delete(`/financeiro/baixas/${id}`);
    aoSalvar();
  }

  return (
    <Modal
      titulo={titulo ? `${titulo.tipo === 'RECEBER' ? 'Receber' : 'Pagar'} — ${titulo.descricao}` : ''}
      aberto={Boolean(titulo)}
      aoFechar={aoFechar}
      largo
      rodape={
        <>
          <button onClick={aoFechar}>Fechar</button>
          <button className="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Registrando…' : 'Registrar baixa'}
          </button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      {titulo && (
        <p style={{ marginTop: 0, color: 'var(--texto-fraco)' }}>
          {titulo.parte} · vencimento {data(titulo.vencimento)}
          {titulo.dias_atraso > 0 && <> · <span style={{ color: 'var(--perigo)' }}>{titulo.dias_atraso} dias em atraso</span></>}
          <br />
          Valor {moeda(titulo.valor)} · pago {moeda(detalhe?.pago ?? titulo.pago)} ·{' '}
          <strong>saldo {moeda(saldo)}</strong>
        </p>
      )}

      <div className="linha-campos">
        <Campo rotulo="Valor">
          <input type="number" min="0" step="any" value={valor}
            onChange={(e) => setValor(e.target.value)} placeholder={String(saldo)} autoFocus />
        </Campo>
        <Campo rotulo="Juros / multa">
          <input type="number" min="0" step="any" value={juros} onChange={(e) => setJuros(e.target.value)} />
        </Campo>
        <Campo rotulo="Desconto">
          <input type="number" min="0" step="any" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Data"><input type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></Campo>
        <Campo rotulo="Forma">
          <select value={forma} onChange={(e) => setForma(e.target.value)}>
            {['PIX', 'BOLETO', 'TRANSFERENCIA', 'DINHEIRO', 'CARTAO', 'CHEQUE', 'OUTRO'].map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Conta">
          <select value={contaId} onChange={(e) => setContaId(Number(e.target.value) || '')}>
            <option value="">—</option>
            {contas?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--texto-suave)', marginTop: 0 }}>
        Deixe o valor em branco para quitar o saldo inteiro. Juros somam ao que foi abatido; desconto reduz.
      </p>

      {detalhe && detalhe.baixas && detalhe.baixas.length > 0 && (
        <>
          <h4 style={{ margin: '16px 0 8px', fontSize: 13.5 }}>Baixas registradas</h4>
          <table>
            <thead>
              <tr><th>Data</th><th className="num">Valor</th><th className="num">Juros</th><th className="num">Desconto</th><th>Forma</th><th /></tr>
            </thead>
            <tbody>
              {detalhe.baixas.map((b) => (
                <tr key={b.id}>
                  <td>{data(b.data)}</td>
                  <td className="num">{moeda(b.valor)}</td>
                  <td className="num">{b.juros > 0 ? moeda(b.juros) : '—'}</td>
                  <td className="num">{b.desconto > 0 ? moeda(b.desconto) : '—'}</td>
                  <td>{b.forma}</td>
                  <td><button className="pequeno perigo" onClick={() => estornar(b.id)}>estornar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------- novo título ---- */

function FormularioTitulo({ tipo, aoFechar, aoSalvar }: {
  tipo: 'RECEBER' | 'PAGAR' | null; aoFechar: () => void; aoSalvar: () => void;
}) {
  const aberto = Boolean(tipo);
  const { dados: categorias } = useApi<CategoriaFinanceira[]>(aberto ? '/financeiro/categorias' : null);
  const { dados: clientes } = useApi<Cliente[]>(aberto && tipo === 'RECEBER' ? '/clientes?ativo=true' : null);
  const { dados: fornecedores } = useApi<Fornecedor[]>(aberto && tipo === 'PAGAR' ? '/fornecedores?ativo=true' : null);

  const [descricao, setDescricao] = useState('');
  const [parteId, setParteId] = useState<number | ''>('');
  const [categoriaId, setCategoriaId] = useState<number | ''>('');
  const [documento, setDocumento] = useState('');
  const [valor, setValor] = useState('');
  const [parcelas, setParcelas] = useState('1');
  const [intervalo, setIntervalo] = useState('30');
  const [vencimento, setVencimento] = useState(hoje());
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!tipo) return;
    if (!descricao.trim()) return setErro('Informe a descrição.');
    if (!parteId) return setErro(tipo === 'RECEBER' ? 'Selecione o cliente.' : 'Selecione o fornecedor.');
    if (!(Number(valor) > 0)) return setErro('Informe um valor maior que zero.');

    setSalvando(true);
    setErro('');
    try {
      await api.post('/financeiro/titulos', {
        tipo,
        descricao: descricao.trim(),
        categoria_id: categoriaId ? Number(categoriaId) : null,
        cliente_id: tipo === 'RECEBER' ? Number(parteId) : null,
        fornecedor_id: tipo === 'PAGAR' ? Number(parteId) : null,
        documento: documento.trim() || null,
        valor: Number(valor),
        parcelas: Number(parcelas) || 1,
        intervalo_dias: Number(intervalo) || 30,
        vencimento,
      });
      setDescricao(''); setValor(''); setDocumento(''); setParcelas('1');
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível lançar o título');
    } finally {
      setSalvando(false);
    }
  }

  const opcoesCategoria = (categorias ?? []).filter((c) => c.tipo === tipo);
  const partes = tipo === 'RECEBER' ? clientes : fornecedores;
  const valorParcela = (Number(valor) || 0) / (Number(parcelas) || 1);

  return (
    <Modal
      titulo={tipo === 'RECEBER' ? 'Nova conta a receber' : 'Nova conta a pagar'}
      aberto={aberto}
      aoFechar={aoFechar}
      rodape={
        <>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Lançando…' : 'Lançar'}
          </button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      <Campo rotulo="Descrição">
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus />
      </Campo>
      <div className="linha-campos">
        <Campo rotulo={tipo === 'RECEBER' ? 'Cliente' : 'Fornecedor'}>
          <select value={parteId} onChange={(e) => setParteId(Number(e.target.value) || '')}>
            <option value="">Selecione…</option>
            {partes?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Categoria">
          <select value={categoriaId} onChange={(e) => setCategoriaId(Number(e.target.value) || '')}>
            <option value="">—</option>
            {opcoesCategoria.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Documento / NF">
          <input value={documento} onChange={(e) => setDocumento(e.target.value)} />
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Valor total">
          <input type="number" min="0" step="any" value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>
        <Campo rotulo="Parcelas">
          <input type="number" min="1" max="60" value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
        </Campo>
        <Campo rotulo="Dias entre parcelas">
          <input type="number" min="1" max="365" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
        </Campo>
        <Campo rotulo="1º vencimento">
          <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </Campo>
      </div>
      {Number(parcelas) > 1 && (
        <Aviso tipo="info">
          {parcelas} parcelas de aproximadamente {moeda(valorParcela)}, a cada {intervalo} dias
          a partir de {data(vencimento)}.
        </Aviso>
      )}
    </Modal>
  );
}

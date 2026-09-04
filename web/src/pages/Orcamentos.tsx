import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, query, pode } from '../lib/api';
import { useApi, useDebounce } from '../lib/hooks';
import { moeda, moedaCurta, numero, data, decimal, hoje } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Campo, Indicador, Etiqueta, Modal } from '../components/ui';
import type {
  Orcamento, DesempenhoOrcamentos, Cliente, Simples, Produto, Precificacao, Oportunidade,
} from '../tipos';

const TOM_STATUS: Record<string, string> = {
  RASCUNHO: '', ENVIADO: 'azul', EM_NEGOCIACAO: 'amarela',
  APROVADO: 'verde', RECUSADO: 'vermelha', EXPIRADO: 'vermelha',
};
const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: 'Rascunho', ENVIADO: 'Enviado', EM_NEGOCIACAO: 'Em negociação',
  APROVADO: 'Aprovado', RECUSADO: 'Recusado', EXPIRADO: 'Expirado',
};

export default function Orcamentos() {
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [aberto, setAberto] = useState<number | null>(null);
  const [novo, setNovo] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const buscaLenta = useDebounce(busca);

  const caminho = `/orcamentos${query({ busca: buscaLenta, status, abertos: status ? '' : 'true', })}`;
  const { dados, carregando, erro } = useApi<Orcamento[]>(caminho, [caminho, recarga]);
  const { dados: desempenho } = useApi<DesempenhoOrcamentos>('/orcamentos/desempenho', [recarga]);

  const atualizar = () => setRecarga((n) => n + 1);

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Orçamentos</h1>
          <p>Propostas precificadas a partir do custo real da peça</p>
        </div>
        {pode('orcamentos.editar') && (
          <div className="acoes">
            <button className="primario" onClick={() => setNovo(true)}>Novo orçamento</button>
          </div>
        )}
      </header>

      {desempenho && (
        <div className="grade c4">
          <Indicador rotulo="Orçamentos" valor={numero(desempenho.total)}
            nota={moeda(desempenho.valor_total)} />
          <Indicador rotulo="Aprovados" valor={numero(desempenho.aprovados)}
            nota={moeda(desempenho.valor_aprovado)} tom="sucesso" />
          <Indicador rotulo="Conversão" valor={`${decimal(desempenho.conversao)}%`}
            nota={`${desempenho.recusados} recusados`} />
          <Indicador rotulo="Ticket médio" valor={moedaCurta(desempenho.ticket_medio)}
            nota="dos orçamentos aprovados" />
        </div>
      )}

      <Cartao titulo="Propostas">
        <div className="filtros" style={{ marginBottom: 14 }}>
          <Campo rotulo="Buscar">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número ou cliente" />
          </Campo>
          <Campo rotulo="Situação">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Em aberto</option>
              {Object.entries(ROTULO_STATUS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </Campo>
        </div>

        {carregando && <Carregando />}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {dados && dados.length === 0 && <Vazio texto="Nenhum orçamento com estes filtros." />}
        {dados && dados.length > 0 && (
          <div className="tabela-rolagem" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Número</th><th>Cliente</th><th>Vendedor</th><th>Data</th><th>Validade</th>
                  <th className="num">Itens</th><th className="num">Valor</th>
                  <th className="num">Margem</th><th>Situação</th><th />
                </tr>
              </thead>
              <tbody>
                {dados.map((o) => (
                  <tr key={o.id}>
                    <td>{o.numero}</td>
                    <td title={o.parte ?? ''}>{(o.parte ?? '—').slice(0, 26)}</td>
                    <td>{o.vendedor ?? '—'}</td>
                    <td>{data(o.data)}</td>
                    <td>
                      {data(o.validade)}
                      {o.vencido === 1 && <div><Etiqueta texto="vencido" tom="vermelha" /></div>}
                    </td>
                    <td className="num">{o.itens}</td>
                    <td className="num">{moeda(o.valor_total)}</td>
                    <td className="num">
                      {o.valor_total > 0
                        ? `${decimal(((o.valor_total - o.frete - o.custo_total) / (o.valor_total - o.frete)) * 100)}%`
                        : '—'}
                    </td>
                    <td>
                      <Etiqueta texto={ROTULO_STATUS[o.status]} tom={TOM_STATUS[o.status]} />
                      {o.pedido_id && (
                        <div><Link to={`/pedidos/${o.pedido_id}`} style={{ fontSize: 12 }}>pedido {o.pedido_numero}</Link></div>
                      )}
                    </td>
                    <td><button className="pequeno" onClick={() => setAberto(o.id)}>Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      {desempenho && desempenho.por_vendedor.length > 0 && (
        <Cartao titulo="Desempenho por vendedor">
          <table>
            <thead>
              <tr><th>Vendedor</th><th className="num">Orçamentos</th><th className="num">Aprovados</th>
                <th className="num">Conversão</th><th className="num">Valor aprovado</th></tr>
            </thead>
            <tbody>
              {desempenho.por_vendedor.map((v) => (
                <tr key={v.vendedor}>
                  <td>{v.vendedor}</td>
                  <td className="num">{v.orcamentos}</td>
                  <td className="num">{v.aprovados}</td>
                  <td className="num">{v.orcamentos > 0 ? decimal((v.aprovados / v.orcamentos) * 100) : '0'}%</td>
                  <td className="num">{moeda(v.valor_aprovado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}

      <DetalheOrcamento id={aberto} aoFechar={() => setAberto(null)} aoMudar={atualizar} />
      <EditorOrcamento aberto={novo} aoFechar={() => setNovo(false)}
        aoSalvar={() => { setNovo(false); atualizar(); }} />
    </>
  );
}

function DetalheOrcamento({ id, aoFechar, aoMudar }: {
  id: number | null; aoFechar: () => void; aoMudar: () => void;
}) {
  const { dados, recarregar } = useApi<Orcamento>(id ? `/orcamentos/${id}` : null, [id]);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function mudarStatus(status: string) {
    setOcupado(true);
    setErro('');
    try {
      await api.put(`/orcamentos/${id}`, { status });
      setOk(`Orçamento marcado como ${ROTULO_STATUS[status].toLowerCase()}.`);
      recarregar();
      aoMudar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível atualizar');
    } finally {
      setOcupado(false);
    }
  }

  async function converter() {
    if (!confirm('Aprovar e gerar o pedido? As ordens de produção são abertas na sequência.')) return;
    setOcupado(true);
    setErro('');
    try {
      const r = await api.post<{ pedido_id: number }>(`/orcamentos/${id}/converter`, {});
      setOk(`Pedido gerado. As ordens de produção já estão abertas.`);
      recarregar();
      aoMudar();
      return r;
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível converter');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal
      titulo={dados ? `Orçamento ${dados.numero}` : 'Orçamento'}
      aberto={Boolean(id)}
      aoFechar={aoFechar}
      largo
      rodape={
        <>
          <button onClick={aoFechar}>Fechar</button>
          {dados && !dados.pedido_id && pode('orcamentos.editar') && (
            <>
              {dados.status === 'RASCUNHO' && (
                <button onClick={() => mudarStatus('ENVIADO')} disabled={ocupado}>Marcar como enviado</button>
              )}
              {(dados.status === 'ENVIADO' || dados.status === 'EM_NEGOCIACAO') && (
                <button onClick={() => mudarStatus('RECUSADO')} disabled={ocupado}>Recusado</button>
              )}
            </>
          )}
          {dados && !dados.pedido_id && pode('orcamentos.aprovar') && (
            <button className="primario" onClick={converter} disabled={ocupado}>
              Aprovar e gerar pedido
            </button>
          )}
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      {!dados ? <Carregando /> : (
        <>
          <p style={{ marginTop: 0, color: 'var(--texto-fraco)' }}>
            {dados.parte}
            {dados.vendedor && ` · ${dados.vendedor}`}
            {' · '}emitido em {data(dados.data)}
            {dados.validade && ` · válido até ${data(dados.validade)}`}
            {dados.condicao_pagamento && ` · ${dados.condicao_pagamento}`}
            {dados.prazo_entrega_dias > 0 && ` · entrega em ${dados.prazo_entrega_dias} dias`}
          </p>

          {dados.pedido_id && (
            <Aviso tipo="ok">
              Convertido no pedido <Link to={`/pedidos/${dados.pedido_id}`}>{dados.pedido_numero}</Link>.
            </Aviso>
          )}

          <div className="grade c4">
            <Indicador rotulo="Valor da proposta" valor={moeda(dados.valor_total)}
              nota={dados.desconto ? `bruto ${moeda(dados.valor_bruto)} − ${moeda(dados.desconto)}` : ''} />
            <Indicador rotulo="Custo" valor={moeda(dados.custo_total)}
              nota={`${numero(dados.pecas)} peças`} />
            <Indicador rotulo="Margem" valor={moeda(dados.margem ?? 0)}
              tom={(dados.margem ?? 0) >= 0 ? 'sucesso' : 'perigo'}
              nota={`${decimal(dados.margem_percentual ?? 0)}% da venda`} />
            <Indicador rotulo="Ocupa a fábrica" valor={`${numero(dados.minutos_fabrica ?? 0)} min`}
              nota={`${decimal((dados.minutos_fabrica ?? 0) / 60)} horas de produção`} />
          </div>

          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Produto</th><th className="num">Qtd</th><th className="num">Preço</th>
                  <th className="num">Custo</th><th className="num">Margem</th><th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas?.map((l) => (
                  <tr key={l.id} className={l.margem_percentual < 0 ? '' : ''}>
                    <td title={l.produto}>{l.produto.slice(0, 40)}</td>
                    <td className="num">{numero(l.quantidade)}</td>
                    <td className="num">{moeda(l.preco_unitario)}</td>
                    <td className="num">{moeda(l.custo_unitario)}</td>
                    <td className="num" style={{ color: l.margem_percentual >= 0 ? 'var(--sucesso)' : 'var(--perigo)' }}>
                      {decimal(l.margem_percentual)}%
                    </td>
                    <td className="num">{moeda(l.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}><strong>Total da proposta</strong></td>
                  <td className="num"><strong>{moeda(dados.valor_total)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {dados.observacao && (
            <p style={{ marginTop: 14, color: 'var(--texto-fraco)' }}>
              <strong>Observação:</strong> {dados.observacao}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

type LinhaEditor = {
  produto_id: number | '';
  quantidade: string;
  preco_unitario: string;
  custo_unitario: number;
  precificacao: Precificacao | null;
};

const LINHA_VAZIA: LinhaEditor = {
  produto_id: '', quantidade: '', preco_unitario: '', custo_unitario: 0, precificacao: null,
};

function EditorOrcamento({ aberto, aoFechar, aoSalvar }: {
  aberto: boolean; aoFechar: () => void; aoSalvar: () => void;
}) {
  const { dados: clientes } = useApi<Cliente[]>(aberto ? '/clientes?ativo=true' : null);
  const { dados: produtos } = useApi<Produto[]>(aberto ? '/produtos?ativo=true' : null);
  const { dados: vendedores } = useApi<Simples[]>(aberto ? '/vendedores?ativo=true' : null);
  const { dados: oportunidades } = useApi<Oportunidade[]>(aberto ? '/crm/oportunidades?abertas=true' : null);
  const { dados: proximo } = useApi<{ numero: string }>(aberto ? '/orcamentos/proximo-numero' : null);

  const [clienteId, setClienteId] = useState<number | ''>('');
  const [prospect, setProspect] = useState('');
  const [vendedorId, setVendedorId] = useState<number | ''>('');
  const [oportunidadeId, setOportunidadeId] = useState<number | ''>('');
  const [validade, setValidade] = useState('');
  const [prazo, setPrazo] = useState('30');
  const [condicao, setCondicao] = useState('');
  const [desconto, setDesconto] = useState('0');
  const [frete, setFrete] = useState('0');
  const [margemAlvo, setMargemAlvo] = useState('35');
  const [linhas, setLinhas] = useState<LinhaEditor[]>([{ ...LINHA_VAZIA }]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setClienteId(''); setProspect(''); setVendedorId(''); setOportunidadeId('');
    setValidade(''); setCondicao(''); setDesconto('0'); setFrete('0');
    setLinhas([{ ...LINHA_VAZIA }]);
    setErro('');
  }, [aberto]);

  /** Ao escolher o produto, busca o custo formado e sugere o preço pela margem alvo. */
  async function escolherProduto(indice: number, produtoId: number) {
    setLinhas((atual) => atual.map((l, i) => (i === indice ? { ...l, produto_id: produtoId } : l)));
    try {
      const p = await api.get<Precificacao>(
        `/orcamentos/precificar/${produtoId}${query({ margem: margemAlvo })}`
      );
      setLinhas((atual) =>
        atual.map((l, i) =>
          i === indice
            ? {
                ...l,
                produto_id: produtoId,
                custo_unitario: p.custo_unitario,
                preco_unitario: l.preco_unitario || String(p.preco_sugerido),
                precificacao: p,
              }
            : l
        )
      );
    } catch {
      /* sem custo formado, o vendedor digita o preço na mão */
    }
  }

  const alterar = (i: number, campos: Partial<LinhaEditor>) =>
    setLinhas((atual) => atual.map((l, idx) => (idx === i ? { ...l, ...campos } : l)));

  const bruto = linhas.reduce(
    (s, l) => s + (Number(l.quantidade) || 0) * (Number(l.preco_unitario) || 0), 0
  );
  const custo = linhas.reduce((s, l) => s + (Number(l.quantidade) || 0) * l.custo_unitario, 0);
  const total = bruto * (1 - (Number(desconto) || 0) / 100) + (Number(frete) || 0);
  const margem = total - (Number(frete) || 0) - custo;
  const margemPct = total - (Number(frete) || 0) > 0 ? (margem / (total - (Number(frete) || 0))) * 100 : 0;

  async function salvar() {
    const validas = linhas.filter((l) => l.produto_id && Number(l.quantidade) > 0);
    if (!clienteId && !prospect.trim()) return setErro('Escolha o cliente ou informe o prospect.');
    if (validas.length === 0) return setErro('Adicione ao menos um item com produto e quantidade.');

    setSalvando(true);
    setErro('');
    try {
      await api.post('/orcamentos', {
        cliente_id: clienteId ? Number(clienteId) : null,
        prospect: prospect.trim() || null,
        oportunidade_id: oportunidadeId ? Number(oportunidadeId) : null,
        vendedor_id: vendedorId ? Number(vendedorId) : null,
        data: hoje(),
        validade: validade || null,
        prazo_entrega_dias: Number(prazo) || 0,
        condicao_pagamento: condicao.trim() || null,
        desconto_percentual: Number(desconto) || 0,
        frete: Number(frete) || 0,
        status: 'RASCUNHO',
        itens: validas.map((l, i) => ({
          produto_id: Number(l.produto_id),
          quantidade: Number(l.quantidade),
          preco_unitario: Number(l.preco_unitario) || 0,
          custo_unitario: l.custo_unitario || undefined,
          sequencia: i + 1,
        })),
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
      titulo={`Novo orçamento${proximo ? ` — ${proximo.numero}` : ''}`}
      aberto={aberto}
      aoFechar={aoFechar}
      largo
      rodape={
        <>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar orçamento'}
          </button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      <div className="linha-campos">
        <Campo rotulo="Cliente">
          <select value={clienteId} onChange={(e) => setClienteId(Number(e.target.value) || '')}>
            <option value="">— prospect novo —</option>
            {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Prospect">
          <input value={prospect} onChange={(e) => setProspect(e.target.value)} disabled={Boolean(clienteId)} />
        </Campo>
        <Campo rotulo="Vendedor">
          <select value={vendedorId} onChange={(e) => setVendedorId(Number(e.target.value) || '')}>
            <option value="">—</option>
            {vendedores?.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Oportunidade">
          <select value={oportunidadeId} onChange={(e) => setOportunidadeId(Number(e.target.value) || '')}>
            <option value="">—</option>
            {oportunidades?.map((o) => <option key={o.id} value={o.id}>{o.titulo.slice(0, 40)}</option>)}
          </select>
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Validade"><input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} /></Campo>
        <Campo rotulo="Prazo de entrega (dias)">
          <input type="number" min="0" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </Campo>
        <Campo rotulo="Condição de pagamento">
          <input value={condicao} onChange={(e) => setCondicao(e.target.value)} placeholder="Ex.: 28/56 dias" />
        </Campo>
        <Campo rotulo="Margem alvo (%)">
          <input type="number" min="0" max="99" value={margemAlvo} onChange={(e) => setMargemAlvo(e.target.value)} />
        </Campo>
      </div>

      <Aviso tipo="info">
        Ao escolher o produto, o preço vem sugerido pela margem alvo sobre o custo formado
        (material + mão de obra + rateio da fábrica). Você pode sobrescrever — a margem
        recalcula na hora.
      </Aviso>

      <div className="tabela-rolagem">
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Produto</th>
              <th style={{ width: 88 }}>Qtd</th>
              <th style={{ width: 100 }}>Preço</th>
              <th className="num">Custo</th>
              <th className="num">Margem</th>
              <th className="num">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const totalLinha = (Number(l.quantidade) || 0) * (Number(l.preco_unitario) || 0);
              const preco = Number(l.preco_unitario) || 0;
              const margemLinha = preco > 0 ? ((preco - l.custo_unitario) / preco) * 100 : 0;
              return (
                <tr key={i}>
                  <td>
                    <select value={l.produto_id} onChange={(e) => escolherProduto(i, Number(e.target.value))}>
                      <option value="">Selecione…</option>
                      {produtos?.map((p) => <option key={p.id} value={p.id}>{p.descricao}</option>)}
                    </select>
                    {l.precificacao && (
                      <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 3 }}>
                        sugerido {moeda(l.precificacao.preco_sugerido)} · tabela {moeda(l.precificacao.preco_tabela)}
                        {' · '}{decimal(l.precificacao.minutos_por_peca)} min/pç
                      </div>
                    )}
                  </td>
                  <td>
                    <input type="number" min="0" step="any" value={l.quantidade}
                      onChange={(e) => alterar(i, { quantidade: e.target.value })} />
                  </td>
                  <td>
                    <input type="number" min="0" step="any" value={l.preco_unitario}
                      onChange={(e) => alterar(i, { preco_unitario: e.target.value })} />
                  </td>
                  <td className="num">{l.custo_unitario > 0 ? moeda(l.custo_unitario) : '—'}</td>
                  <td className="num" style={{ color: margemLinha >= 0 ? 'var(--sucesso)' : 'var(--perigo)' }}>
                    {l.custo_unitario > 0 && preco > 0 ? `${decimal(margemLinha)}%` : '—'}
                  </td>
                  <td className="num">{moeda(totalLinha)}</td>
                  <td>
                    <button className="pequeno perigo" disabled={linhas.length === 1}
                      onClick={() => setLinhas((a) => a.filter((_, idx) => idx !== i))}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10, gap: 16, flexWrap: 'wrap' }}>
        <button className="pequeno" onClick={() => setLinhas((a) => [...a, { ...LINHA_VAZIA }])}>
          + Adicionar item
        </button>
        <div className="linha-campos" style={{ flex: '1 1 260px', maxWidth: 300 }}>
          <Campo rotulo="Desconto (%)">
            <input type="number" min="0" max="100" step="any" value={desconto}
              onChange={(e) => setDesconto(e.target.value)} />
          </Campo>
          <Campo rotulo="Frete">
            <input type="number" min="0" step="any" value={frete} onChange={(e) => setFrete(e.target.value)} />
          </Campo>
        </div>
        <div style={{ textAlign: 'right', fontSize: 13.5 }}>
          <div>Bruto <strong>{moeda(bruto)}</strong></div>
          <div>Custo <strong>{moeda(custo)}</strong></div>
          <div style={{ fontSize: 16, marginTop: 4 }}>
            Total <strong>{moeda(total)}</strong>
          </div>
          <div style={{ color: margem >= 0 ? 'var(--sucesso)' : 'var(--perigo)' }}>
            Margem <strong>{moeda(margem)}</strong> ({decimal(margemPct)}%)
          </div>
        </div>
      </div>
    </Modal>
  );
}

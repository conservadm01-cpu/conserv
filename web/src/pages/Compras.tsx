import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api, ApiError, pode } from '../lib/api';
import { useApi } from '../lib/hooks';
import { BarraFiltros, useFiltros, type CampoFiltro } from '../components/Filtros';
import { data, decimal, moeda, moedaCurta, numero, hoje } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Campo, Indicador, Etiqueta, Modal } from '../components/ui';
import Necessidade from '../components/NecessidadeCompra';
import type {
  Fornecedor, LocalEstoque, Material, PedidoCompra, Requisicao, ResumoCompras,
} from '../tipos';

const ABAS = ['Painel', 'Necessidade', 'Requisições', 'Pedidos de compra'] as const;
type Aba = (typeof ABAS)[number];

const URGENCIAS = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as const;
const TOM_URGENCIA: Record<string, string> = {
  BAIXA: '', NORMAL: '', ALTA: 'amarela', URGENTE: 'vermelha',
};
const ROTULO_ORIGEM: Record<string, string> = {
  MANUAL: 'Manual', MRP: 'MRP', ESTOQUE_MINIMO: 'Estoque mínimo',
};
const ROTULO_REQUISICAO: Record<string, string> = {
  ABERTA: 'Aberta', PARCIAL: 'Parcial', ATENDIDA: 'Atendida', CANCELADA: 'Cancelada',
};
const TOM_REQUISICAO: Record<string, string> = {
  ABERTA: 'amarela', PARCIAL: 'azul', ATENDIDA: 'verde', CANCELADA: '',
};
const ROTULO_PEDIDO: Record<string, string> = {
  RASCUNHO: 'Rascunho', ENVIADO: 'Enviado', CONFIRMADO: 'Confirmado',
  PARCIAL: 'Parcial', RECEBIDO: 'Recebido', CANCELADO: 'Cancelado',
};
const TOM_PEDIDO: Record<string, string> = {
  RASCUNHO: '', ENVIADO: 'azul', CONFIRMADO: 'azul', PARCIAL: 'amarela',
  RECEBIDO: 'verde', CANCELADO: '',
};

export default function Compras() {
  const [aba, setAba] = useState<Aba>('Painel');
  const [recarga, setRecarga] = useState(0);
  const atualizar = () => setRecarga((n) => n + 1);

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Compras</h1>
          <p>Da necessidade de material ao recebimento: requisição, pedido, entrega e título a pagar</p>
        </div>
      </header>

      <div className="abas">
        {ABAS.map((a) => (
          <button key={a} className={`aba${aba === a ? ' ativa' : ''}`} onClick={() => setAba(a)}>{a}</button>
        ))}
      </div>

      {aba === 'Painel' && <Painel chave={recarga} aoIr={setAba} />}
      {aba === 'Necessidade' && <Necessidade />}
      {aba === 'Requisições' && <Requisicoes chave={recarga} aoMudar={atualizar} />}
      {aba === 'Pedidos de compra' && <Pedidos chave={recarga} aoMudar={atualizar} />}
    </>
  );
}

/* ------------------------------------------------------------------- painel */

function Painel({ chave, aoIr }: { chave: number; aoIr: (a: Aba) => void }) {
  const { dados, carregando, erro } = useApi<ResumoCompras>('/compras/resumo', [chave]);

  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return null;

  const fornecedores = dados.por_fornecedor.map((f) => ({
    ...f,
    rotulo: f.fornecedor.length > 18 ? `${f.fornecedor.slice(0, 17)}…` : f.fornecedor,
  }));

  return (
    <>
      <div className="grade c3">
        <Indicador rotulo="Requisições em aberto" valor={numero(dados.requisicoes_abertas)}
          nota={`${dados.requisicoes_urgentes} com urgência alta`}
          tom={dados.requisicoes_urgentes > 0 ? 'perigo' : undefined} />
        <Indicador rotulo="Valor requisitado" valor={moedaCurta(dados.valor_requisitado)}
          nota={moeda(dados.valor_requisitado)} />
        <Indicador rotulo="Pedidos em andamento" valor={numero(dados.pedidos_abertos)}
          nota={`${dados.pedidos_atrasados} com entrega atrasada`}
          tom={dados.pedidos_atrasados > 0 ? 'perigo' : 'sucesso'} />
        <Indicador rotulo="Valor comprometido" valor={moedaCurta(dados.valor_em_pedido)}
          nota="pedidos ainda não recebidos por completo" />
      </div>

      <div className="grade c2">
        <Cartao titulo="Entregas previstas"
          acao={<button className="pequeno" onClick={() => aoIr('Pedidos de compra')}>Ver pedidos</button>}>
          {dados.entregas_previstas.length === 0
            ? <Vazio texto="Nenhum pedido de compra aguardando entrega." />
            : (
              <table>
                <thead>
                  <tr><th>Previsão</th><th>Pedido</th><th>Fornecedor</th><th className="num">Valor</th><th /></tr>
                </thead>
                <tbody>
                  {dados.entregas_previstas.map((p) => (
                    <tr key={p.id}>
                      <td>{data(p.previsao_entrega)}</td>
                      <td className="mono">{p.numero}</td>
                      <td title={p.fornecedor}>{p.fornecedor.slice(0, 22)}</td>
                      <td className="num">{moeda(p.valor_total)}</td>
                      <td>
                        {p.dias_atraso > 0
                          ? <Etiqueta texto={`${p.dias_atraso}d`} tom="vermelha" />
                          : <Etiqueta texto={ROTULO_PEDIDO[p.status]} tom={TOM_PEDIDO[p.status]} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </Cartao>

        <Cartao titulo="Compras por fornecedor" acao={<small>tudo que já foi pedido</small>}>
          {fornecedores.length === 0
            ? <Vazio texto="Ainda não há pedidos de compra emitidos." />
            : (
              <ResponsiveContainer width="100%" height={40 + fornecedores.length * 30}>
                <BarChart data={fornecedores} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <YAxis type="category" dataKey="rotulo" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => moeda(Number(v))} />
                  <Bar dataKey="valor" name="Comprado" fill="#2f6f9f" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </Cartao>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- requisições */

function Requisicoes({ chave, aoMudar }: { chave: number; aoMudar: () => void }) {
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const [nova, setNova] = useState(false);
  const [editando, setEditando] = useState<Requisicao | null>(null);
  const [falha, setFalha] = useState('');
  const [recado, setRecado] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const filtros = useFiltros('/compras/requisicoes', { abertas: 'true', limite: '400' });
  const { dados, carregando, erro, recarregar } = useApi<Requisicao[]>(filtros.caminho, [filtros.caminho, chave]);

  const escreve = pode('compras.editar');
  const lista = dados ?? [];
  const selecionaveis = lista.filter((r) => r.pendente > 0 && r.status !== 'CANCELADA');
  const selecionadas = lista.filter((r) => marcadas.includes(r.id));
  const valorSelecionado = selecionadas.reduce((s, r) => s + r.pendente * r.custo_unitario, 0);

  useEffect(() => { setMarcadas([]); }, [filtros.caminho, chave]);

  const campos: CampoFiltro[] = [
    { chave: 'busca', rotulo: 'Material, código ou justificativa', tipo: 'busca' },
    { chave: 'status', rotulo: 'Situação', tipo: 'select',
      opcoes: Object.entries(ROTULO_REQUISICAO).map(([v, r]) => ({ valor: v, rotulo: r })) },
    { chave: 'urgencia', rotulo: 'Urgência', tipo: 'select',
      opcoes: URGENCIAS.map((u) => ({ valor: u, rotulo: u[0] + u.slice(1).toLowerCase() })) },
    { chave: 'origem', rotulo: 'Origem', tipo: 'select',
      opcoes: Object.entries(ROTULO_ORIGEM).map(([v, r]) => ({ valor: v, rotulo: r })) },
    { chave: 'de', rotulo: 'Criada de', tipo: 'data' },
    { chave: 'ate', rotulo: 'até', tipo: 'data' },
    { chave: 'abertas', rotulo: 'só em aberto', tipo: 'marcar' },
  ];

  function alternar(id: number) {
    setMarcadas((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  async function acao(rotina: () => Promise<string>) {
    setOcupado(true);
    setFalha('');
    setRecado('');
    try {
      setRecado(await rotina());
      recarregar();
      aoMudar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível concluir');
    } finally {
      setOcupado(false);
    }
  }

  const gerarMrp = () => acao(async () => {
    const r = await api.post<{ criadas: Requisicao[]; puladas: Array<{ material: string }> }>(
      '/compras/requisicoes/gerar-mrp', {}
    );
    return r.criadas.length === 0
      ? `Nada novo a requisitar. ${r.puladas.length} material(is) já têm requisição em aberto.`
      : `${r.criadas.length} requisição(ões) criadas a partir do MRP.`;
  });

  const gerarMinimo = () => acao(async () => {
    const r = await api.post<{ criadas: Requisicao[] }>('/compras/requisicoes/gerar-minimo', {});
    return r.criadas.length === 0
      ? 'Nenhum material abaixo do estoque mínimo sem requisição.'
      : `${r.criadas.length} requisição(ões) de reposição criadas.`;
  });

  const gerarPedidos = () => acao(async () => {
    const criados = await api.post<PedidoCompra[]>('/compras/requisicoes/gerar-pedidos', { ids: marcadas });
    setMarcadas([]);
    return `${criados.length} pedido(s) de compra: ${criados.map((p) => p.numero).join(', ')}.`;
  });

  async function excluir(r: Requisicao) {
    const aviso = r.atendida > 0
      ? `Cancelar a requisição de "${r.material}"? O que já foi pedido continua valendo.`
      : `Excluir a requisição de "${r.material}"?`;
    if (!confirm(aviso)) return;
    await acao(async () => {
      await api.delete(`/compras/requisicoes/${r.id}`);
      return r.atendida > 0 ? 'Requisição cancelada.' : 'Requisição excluída.';
    });
  }

  return (
    <>
      <div className="grade c3">
        <Indicador rotulo="Requisições listadas" valor={numero(lista.length)} />
        <Indicador rotulo="Selecionadas" valor={numero(marcadas.length)}
          nota={marcadas.length > 0 ? moeda(valorSelecionado) : 'marque para gerar pedidos'} />
        <Indicador rotulo="Urgentes" valor={numero(lista.filter((r) => r.urgencia === 'URGENTE' || r.urgencia === 'ALTA').length)}
          tom={lista.some((r) => r.urgencia === 'URGENTE') ? 'perigo' : undefined} />
      </div>

      <Cartao
        titulo="Requisições de compra"
        acao={escreve && (
          <div className="acoes">
            <button className="pequeno" onClick={gerarMrp} disabled={ocupado}>Gerar do MRP</button>
            <button className="pequeno" onClick={gerarMinimo} disabled={ocupado}>Gerar do estoque mínimo</button>
            <button className="pequeno primario" onClick={() => setNova(true)}>Nova requisição</button>
          </div>
        )}
      >
        <BarraFiltros campos={campos} valores={filtros.valores} aoMudar={filtros.definir}
          aoLimpar={filtros.limpar} ativos={filtros.ativos} />

        {carregando && <Carregando />}
        <Aviso tipo="erro">{falha || erro}</Aviso>
        {recado && <Aviso tipo="ok">{recado}</Aviso>}
        {!carregando && lista.length === 0 && (
          <Vazio texto="Nenhuma requisição com estes filtros. Gere do MRP para partir da necessidade das ordens em aberto." />
        )}

        {lista.length > 0 && (
          <>
            <div className="tabela-rolagem" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    {escreve && (
                      <th style={{ width: 28 }}>
                        <input
                          type="checkbox"
                          style={{ width: 'auto' }}
                          checked={selecionaveis.length > 0 && marcadas.length === selecionaveis.length}
                          onChange={(e) => setMarcadas(e.target.checked ? selecionaveis.map((r) => r.id) : [])}
                        />
                      </th>
                    )}
                    <th>Material</th><th>Fornecedor</th>
                    <th className="num">Pedir</th><th className="num">Saldo</th>
                    <th className="num">Valor</th>
                    <th>Necessidade</th><th>Urgência</th><th>Origem</th><th>Situação</th><th />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((r) => (
                    <tr key={r.id}>
                      {escreve && (
                        <td>
                          <input
                            type="checkbox"
                            style={{ width: 'auto' }}
                            disabled={r.pendente <= 0 || r.status === 'CANCELADA'}
                            checked={marcadas.includes(r.id)}
                            onChange={() => alternar(r.id)}
                          />
                        </td>
                      )}
                      <td>
                        {r.material}
                        {r.codigo && <div className="sub">{r.codigo}</div>}
                      </td>
                      <td>{r.fornecedor ?? <span className="sub">sem fornecedor</span>}</td>
                      <td className="num"><strong>{decimal(r.pendente)}</strong> {r.unidade}</td>
                      <td className="num">{decimal(r.saldo)}</td>
                      <td className="num">{moeda(r.pendente * r.custo_unitario)}</td>
                      <td>{data(r.necessidade_em)}</td>
                      <td><Etiqueta texto={r.urgencia[0] + r.urgencia.slice(1).toLowerCase()} tom={TOM_URGENCIA[r.urgencia]} /></td>
                      <td><span className="sub">{ROTULO_ORIGEM[r.origem]}</span></td>
                      <td><Etiqueta texto={ROTULO_REQUISICAO[r.status]} tom={TOM_REQUISICAO[r.status]} /></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {escreve && r.status !== 'CANCELADA' && (
                          <>
                            <button className="pequeno" onClick={() => setEditando(r)}>Editar</button>{' '}
                            <button className="pequeno perigo" onClick={() => excluir(r)}>
                              {r.atendida > 0 ? 'Cancelar' : 'Excluir'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {escreve && (
              <div className="rodape-lista">
                <span>
                  {marcadas.length > 0
                    ? `${marcadas.length} requisição(ões) selecionadas · ${moeda(valorSelecionado)}`
                    : 'Marque as requisições para agrupá-las em pedidos por fornecedor.'}
                </span>
                <button className="primario" disabled={marcadas.length === 0 || ocupado} onClick={gerarPedidos}>
                  Gerar pedidos de compra
                </button>
              </div>
            )}
          </>
        )}
      </Cartao>

      <FormularioRequisicao
        aberto={nova}
        requisicao={editando}
        aoFechar={() => { setNova(false); setEditando(null); }}
        aoSalvar={() => { setNova(false); setEditando(null); recarregar(); aoMudar(); }}
      />
    </>
  );
}

/** Requisição avulsa — ou ajuste de quantidade/urgência de uma já aberta. */
function FormularioRequisicao({ aberto, requisicao, aoFechar, aoSalvar }: {
  aberto: boolean; requisicao: Requisicao | null; aoFechar: () => void; aoSalvar: () => void;
}) {
  const visivel = aberto || Boolean(requisicao);
  const { dados: materiais } = useApi<Material[]>(visivel ? '/materiais?limite=1000' : null);

  const [materialId, setMaterialId] = useState<number | ''>('');
  const [quantidade, setQuantidade] = useState('');
  const [urgencia, setUrgencia] = useState<string>('NORMAL');
  const [necessidade, setNecessidade] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!visivel) return;
    setMaterialId(requisicao?.material_id ?? '');
    setQuantidade(requisicao ? String(requisicao.quantidade) : '');
    setUrgencia(requisicao?.urgencia ?? 'NORMAL');
    setNecessidade(requisicao?.necessidade_em ?? '');
    setJustificativa(requisicao?.justificativa ?? '');
    setErro('');
  }, [visivel, requisicao]);

  const material = (materiais ?? []).find((m) => m.id === materialId);

  async function salvar() {
    if (!requisicao && !materialId) return setErro('Escolha o material.');
    if (!(Number(quantidade) > 0)) return setErro('A quantidade precisa ser maior que zero.');
    if (requisicao && Number(quantidade) < requisicao.atendida) {
      return setErro(`A quantidade não pode ficar abaixo do que já foi pedido (${decimal(requisicao.atendida)}).`);
    }
    setSalvando(true);
    setErro('');
    const corpo = {
      quantidade: Number(quantidade),
      urgencia,
      necessidade_em: necessidade || null,
      justificativa: justificativa.trim() || null,
    };
    try {
      if (requisicao) await api.put(`/compras/requisicoes/${requisicao.id}`, corpo);
      else await api.post('/compras/requisicoes', { ...corpo, material_id: Number(materialId) });
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={requisicao ? `Requisição · ${requisicao.material}` : 'Nova requisição de compra'}
      aberto={visivel}
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
      <div className="grade c2">
        <Campo rotulo="Material">
          {requisicao ? (
            <input value={requisicao.material} disabled />
          ) : (
            <select value={materialId} onChange={(e) => setMaterialId(Number(e.target.value) || '')}>
              <option value="">Selecione…</option>
              {(materiais ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.descricao}{m.codigo ? ` · ${m.codigo}` : ''}</option>
              ))}
            </select>
          )}
        </Campo>
        <Campo rotulo={`Quantidade${material ? ` (${material.unidade})` : requisicao ? ` (${requisicao.unidade})` : ''}`}>
          <input type="number" min="0" step="0.001" value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)} />
        </Campo>
        <Campo rotulo="Urgência">
          <select value={urgencia} onChange={(e) => setUrgencia(e.target.value)}>
            {URGENCIAS.map((u) => <option key={u} value={u}>{u[0] + u.slice(1).toLowerCase()}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Necessário em">
          <input type="date" value={necessidade} onChange={(e) => setNecessidade(e.target.value)} />
        </Campo>
      </div>
      <Campo rotulo="Justificativa">
        <textarea rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
      </Campo>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ pedidos */

function Pedidos({ chave, aoMudar }: { chave: number; aoMudar: () => void }) {
  const [abrindo, setAbrindo] = useState<number | null>(null);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<PedidoCompra | null>(null);
  const [falha, setFalha] = useState('');

  const { dados: fornecedores } = useApi<Fornecedor[]>('/fornecedores?limite=500');
  const filtros = useFiltros('/compras/pedidos', { limite: '400' });
  const { dados, carregando, erro, recarregar } = useApi<PedidoCompra[]>(filtros.caminho, [filtros.caminho, chave]);

  const escreve = pode('compras.editar');
  const lista = dados ?? [];
  const total = lista.filter((p) => p.status !== 'CANCELADO').reduce((s, p) => s + p.valor_total, 0);
  const atrasados = lista.filter((p) => p.dias_atraso > 0).length;

  const campos: CampoFiltro[] = [
    { chave: 'busca', rotulo: 'Número, fornecedor ou observação', tipo: 'busca' },
    { chave: 'status', rotulo: 'Situação', tipo: 'select',
      opcoes: Object.entries(ROTULO_PEDIDO).map(([v, r]) => ({ valor: v, rotulo: r })) },
    { chave: 'fornecedor_id', rotulo: 'Fornecedor', tipo: 'select',
      opcoes: (fornecedores ?? []).map((f) => ({ valor: f.id, rotulo: f.nome })) },
    { chave: 'de', rotulo: 'Emissão de', tipo: 'data' },
    { chave: 'ate', rotulo: 'até', tipo: 'data' },
    { chave: 'valor_min', rotulo: 'Valor mínimo', tipo: 'numero' },
    { chave: 'abertos', rotulo: 'só em andamento', tipo: 'marcar' },
    { chave: 'atrasados', rotulo: 'só atrasados', tipo: 'marcar' },
  ];

  const atualizar = () => { recarregar(); aoMudar(); };

  async function excluir(p: PedidoCompra) {
    const recebido = p.status === 'PARCIAL' || p.status === 'RECEBIDO';
    const aviso = recebido
      ? `Cancelar o pedido ${p.numero}? As entregas já lançadas continuam no estoque.`
      : `Excluir o pedido ${p.numero}?`;
    if (!confirm(aviso)) return;
    setFalha('');
    try {
      await api.delete(`/compras/pedidos/${p.id}`);
      atualizar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível remover');
    }
  }

  return (
    <>
      <div className="grade c3">
        <Indicador rotulo="Pedidos listados" valor={numero(lista.length)} />
        <Indicador rotulo="Valor dos pedidos" valor={moeda(total)} />
        <Indicador rotulo="Com entrega atrasada" valor={numero(atrasados)}
          tom={atrasados > 0 ? 'perigo' : 'sucesso'} />
      </div>

      <Cartao
        titulo="Pedidos de compra"
        acao={escreve && <button className="pequeno primario" onClick={() => setNovo(true)}>Novo pedido</button>}
      >
        <BarraFiltros campos={campos} valores={filtros.valores} aoMudar={filtros.definir}
          aoLimpar={filtros.limpar} ativos={filtros.ativos} />

        {carregando && <Carregando />}
        <Aviso tipo="erro">{falha || erro}</Aviso>
        {!carregando && lista.length === 0 && (
          <Vazio texto="Nenhum pedido de compra com estes filtros." />
        )}
        {lista.length > 0 && (
          <div className="tabela-rolagem" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Pedido</th><th>Fornecedor</th><th>Emissão</th><th>Previsão</th>
                  <th className="num">Itens</th><th className="num">A receber</th>
                  <th className="num">Valor</th><th>Situação</th><th />
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.numero}</td>
                    <td title={p.fornecedor}>{p.fornecedor.slice(0, 26)}</td>
                    <td>{data(p.data)}</td>
                    <td>
                      {data(p.previsao_entrega)}
                      {p.dias_atraso > 0 && <div><Etiqueta texto={`${p.dias_atraso}d de atraso`} tom="vermelha" /></div>}
                    </td>
                    <td className="num">{p.itens}</td>
                    <td className="num">{p.quantidade_pendente > 0 ? decimal(p.quantidade_pendente) : '—'}</td>
                    <td className="num"><strong>{moeda(p.valor_total)}</strong></td>
                    <td><Etiqueta texto={ROTULO_PEDIDO[p.status]} tom={TOM_PEDIDO[p.status]} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="pequeno" onClick={() => setAbrindo(p.id)}>Abrir</button>{' '}
                      {escreve && p.status !== 'CANCELADO' && (
                        <>
                          <button className="pequeno" onClick={() => setEditando(p)}>Editar</button>{' '}
                          <button className="pequeno perigo" onClick={() => excluir(p)}>
                            {p.status === 'PARCIAL' || p.status === 'RECEBIDO' ? 'Cancelar' : 'Excluir'}
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

      <DetalhePedido id={abrindo} aoFechar={() => setAbrindo(null)} aoMudar={atualizar} />
      <FormularioPedidoCompra
        aberto={novo}
        pedido={editando}
        aoFechar={() => { setNovo(false); setEditando(null); }}
        aoSalvar={() => { setNovo(false); setEditando(null); atualizar(); }}
      />
    </>
  );
}

/** Pedido aberto: itens, entregas já lançadas e o formulário de recebimento. */
function DetalhePedido({ id, aoFechar, aoMudar }: {
  id: number | null; aoFechar: () => void; aoMudar: () => void;
}) {
  const [recarga, setRecarga] = useState(0);
  const [recebendo, setRecebendo] = useState(false);
  const { dados: pedido, carregando, erro } = useApi<PedidoCompra>(
    id ? `/compras/pedidos/${id}` : null, [id, recarga]
  );
  const [falha, setFalha] = useState('');

  useEffect(() => { setRecebendo(false); setFalha(''); }, [id]);

  const podeReceber = pode('compras.receber');
  const pendente = (pedido?.linhas ?? []).some((l) => l.pendente > 0);

  async function estornar(recebimentoId: number) {
    if (!confirm('Estornar esta entrega? O estoque volta ao que era e o título a pagar é cancelado.')) return;
    setFalha('');
    try {
      await api.delete(`/compras/recebimentos/${recebimentoId}`);
      setRecarga((n) => n + 1);
      aoMudar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível estornar');
    }
  }

  return (
    <Modal
      titulo={pedido ? `Pedido de compra ${pedido.numero}` : 'Pedido de compra'}
      aberto={id !== null}
      aoFechar={aoFechar}
      largo
      rodape={
        <>
          <button onClick={aoFechar}>Fechar</button>
          {podeReceber && pendente && pedido?.status !== 'CANCELADO' && !recebendo && (
            <button className="primario" onClick={() => setRecebendo(true)}>Lançar recebimento</button>
          )}
        </>
      }
    >
      {carregando && <Carregando />}
      <Aviso tipo="erro">{falha || erro}</Aviso>

      {pedido && (
        <>
          <div className="grade c4">
            <Indicador rotulo="Fornecedor" valor={pedido.fornecedor} />
            <Indicador rotulo="Emissão" valor={data(pedido.data)}
              nota={pedido.previsao_entrega ? `entrega ${data(pedido.previsao_entrega)}` : 'sem previsão'} />
            <Indicador rotulo="Valor total" valor={moeda(pedido.valor_total)}
              nota={`bruto ${moeda(pedido.valor_bruto)} · frete ${moeda(pedido.frete)}`} />
            <Indicador rotulo="Situação" valor={ROTULO_PEDIDO[pedido.status]}
              nota={pedido.condicao_pagamento ?? `${pedido.prazo_pagamento_dias} dias`}
              tom={pedido.dias_atraso > 0 ? 'perigo' : undefined} />
          </div>

          {recebendo && (
            <FormularioRecebimento
              pedido={pedido}
              aoCancelar={() => setRecebendo(false)}
              aoSalvar={() => { setRecebendo(false); setRecarga((n) => n + 1); aoMudar(); }}
            />
          )}

          <Cartao titulo="Itens">
            <table>
              <thead>
                <tr>
                  <th>Material</th><th className="num">Pedido</th><th className="num">Recebido</th>
                  <th className="num">Pendente</th><th className="num">Preço</th><th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {(pedido.linhas ?? []).map((l) => (
                  <tr key={l.id}>
                    <td>{l.material}{l.codigo && <div className="sub">{l.codigo}</div>}</td>
                    <td className="num">{decimal(l.quantidade)} {l.unidade}</td>
                    <td className="num">{decimal(l.recebido)}</td>
                    <td className="num">
                      {l.pendente > 0 ? <strong>{decimal(l.pendente)}</strong> : <Etiqueta texto="Completo" tom="verde" />}
                    </td>
                    <td className="num">{moeda(l.preco_unitario)}</td>
                    <td className="num">{moeda(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>

          <Cartao titulo="Entregas lançadas">
            {(pedido.recebimentos ?? []).length === 0
              ? <Vazio texto="Nada recebido ainda." />
              : (
                <table>
                  <thead>
                    <tr>
                      <th>Data</th><th>NF</th><th>Local</th><th className="num">Itens</th>
                      <th className="num">Valor</th><th>Lançado por</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {(pedido.recebimentos ?? []).map((r) => (
                      <tr key={r.id}>
                        <td>{data(r.data)}</td>
                        <td className="mono">{r.nota_fiscal ?? '—'}</td>
                        <td>{r.local ?? '—'}</td>
                        <td className="num">{r.itens}</td>
                        <td className="num">{moeda(r.valor ?? 0)}</td>
                        <td>{r.usuario ?? '—'}{r.titulo_id && <div className="sub">gerou título a pagar</div>}</td>
                        <td>
                          {podeReceber && (
                            <button className="pequeno perigo" onClick={() => estornar(r.id)}>Estornar</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </Cartao>

          {pedido.observacao && <Aviso tipo="info">{pedido.observacao}</Aviso>}
        </>
      )}
    </Modal>
  );
}

/** Recebimento total ou parcial: o que entra vira movimento de estoque e título. */
function FormularioRecebimento({ pedido, aoCancelar, aoSalvar }: {
  pedido: PedidoCompra; aoCancelar: () => void; aoSalvar: () => void;
}) {
  const { dados: locais } = useApi<LocalEstoque[]>('/locais-estoque');
  const pendentes = (pedido.linhas ?? []).filter((l) => l.pendente > 0);

  const [quantidades, setQuantidades] = useState<Record<number, string>>({});
  const [dataEntrega, setDataEntrega] = useState(hoje());
  const [notaFiscal, setNotaFiscal] = useState('');
  const [localId, setLocalId] = useState<number | ''>('');
  const [gerarTitulo, setGerarTitulo] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setQuantidades(Object.fromEntries(pendentes.map((l) => [l.id, String(l.pendente)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido.id]);

  const itens = pendentes
    .map((l) => ({ linha: l, quantidade: Number(quantidades[l.id] ?? 0) }))
    .filter((i) => i.quantidade > 0);
  const valor = itens.reduce((s, i) => s + i.quantidade * i.linha.preco_unitario, 0);
  const parcial = itens.some((i) => i.quantidade < i.linha.pendente) || itens.length < pendentes.length;

  async function salvar() {
    if (itens.length === 0) return setErro('Informe a quantidade recebida de ao menos um item.');
    const excedido = itens.find((i) => i.quantidade > i.linha.pendente + 1e-6);
    if (excedido) return setErro(`"${excedido.linha.material}" recebe no máximo ${decimal(excedido.linha.pendente)}.`);

    setSalvando(true);
    setErro('');
    try {
      await api.post(`/compras/pedidos/${pedido.id}/receber`, {
        data: dataEntrega,
        nota_fiscal: notaFiscal.trim() || null,
        local_id: localId === '' ? null : Number(localId),
        gerar_titulo: gerarTitulo,
        itens: itens.map((i) => ({ item_id: i.linha.id, quantidade: i.quantidade })),
      });
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível lançar o recebimento');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao
      titulo="Lançar recebimento"
      acao={<small>{parcial ? 'entrega parcial' : 'entrega total do que falta'}</small>}
      rodape={
        <div className="rodape-lista">
          <span>{itens.length} item(ns) · {moeda(valor)}{gerarTitulo ? ' · gera conta a pagar' : ''}</span>
          <span>
            <button onClick={aoCancelar}>Cancelar</button>{' '}
            <button className="primario" onClick={salvar} disabled={salvando}>
              {salvando ? 'Lançando…' : 'Confirmar entrada'}
            </button>
          </span>
        </div>
      }
    >
      <div className="grade c4">
        <Campo rotulo="Data da entrada">
          <input type="date" value={dataEntrega} onChange={(e) => setDataEntrega(e.target.value)} />
        </Campo>
        <Campo rotulo="Nota fiscal">
          <input value={notaFiscal} onChange={(e) => setNotaFiscal(e.target.value)} placeholder="número da NF" />
        </Campo>
        <Campo rotulo="Local de estoque">
          <select value={localId} onChange={(e) => setLocalId(Number(e.target.value) || '')}>
            <option value="">Padrão do material</option>
            {(locais ?? []).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Financeiro">
          <label className="marcar" style={{ paddingTop: 7 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={gerarTitulo}
              onChange={(e) => setGerarTitulo(e.target.checked)} />
            gerar conta a pagar
          </label>
        </Campo>
      </div>

      <table>
        <thead>
          <tr>
            <th>Material</th><th className="num">Pendente</th>
            <th className="num" style={{ width: 140 }}>Recebendo</th><th className="num">Valor</th>
          </tr>
        </thead>
        <tbody>
          {pendentes.map((l) => (
            <tr key={l.id}>
              <td>{l.material}{l.codigo && <div className="sub">{l.codigo}</div>}</td>
              <td className="num">{decimal(l.pendente)} {l.unidade}</td>
              <td className="num">
                <input type="number" min="0" step="0.001" max={l.pendente}
                  value={quantidades[l.id] ?? ''}
                  onChange={(e) => setQuantidades((q) => ({ ...q, [l.id]: e.target.value }))} />
              </td>
              <td className="num">{moeda(Number(quantidades[l.id] ?? 0) * l.preco_unitario)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Cartao>
  );
}

type LinhaEditor = {
  id?: number; material_id: number | ''; quantidade: string; preco_unitario: string;
  recebido: number; requisicao_id: number | null;
};

const LINHA_VAZIA: LinhaEditor = {
  material_id: '', quantidade: '', preco_unitario: '', recebido: 0, requisicao_id: null,
};

/** Emissão e edição do pedido de compra. Itens já recebidos ficam travados. */
function FormularioPedidoCompra({ aberto, pedido, aoFechar, aoSalvar }: {
  aberto: boolean; pedido: PedidoCompra | null; aoFechar: () => void; aoSalvar: () => void;
}) {
  const visivel = aberto || Boolean(pedido);
  const { dados: fornecedores } = useApi<Fornecedor[]>(visivel ? '/fornecedores?limite=500' : null);
  const { dados: materiais } = useApi<Material[]>(visivel ? '/materiais?limite=1000' : null);
  const { dados: completo } = useApi<PedidoCompra>(pedido ? `/compras/pedidos/${pedido.id}` : null, [pedido?.id]);

  const [fornecedorId, setFornecedorId] = useState<number | ''>('');
  const [dataPedido, setDataPedido] = useState(hoje());
  const [previsao, setPrevisao] = useState('');
  const [condicao, setCondicao] = useState('');
  const [prazo, setPrazo] = useState('0');
  const [frete, setFrete] = useState('0');
  const [desconto, setDesconto] = useState('0');
  const [status, setStatus] = useState('RASCUNHO');
  const [observacao, setObservacao] = useState('');
  const [linhas, setLinhas] = useState<LinhaEditor[]>([{ ...LINHA_VAZIA }]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!visivel) return;
    setErro('');
    if (!pedido) {
      setFornecedorId(''); setDataPedido(hoje()); setPrevisao(''); setCondicao('');
      setPrazo('0'); setFrete('0'); setDesconto('0'); setStatus('RASCUNHO');
      setObservacao(''); setLinhas([{ ...LINHA_VAZIA }]);
    }
  }, [visivel, pedido]);

  useEffect(() => {
    if (!completo) return;
    setFornecedorId(completo.fornecedor_id);
    setDataPedido(completo.data);
    setPrevisao(completo.previsao_entrega ?? '');
    setCondicao(completo.condicao_pagamento ?? '');
    setPrazo(String(completo.prazo_pagamento_dias));
    setFrete(String(completo.frete));
    setDesconto(String(completo.desconto));
    setStatus(completo.status);
    setObservacao(completo.observacao ?? '');
    setLinhas((completo.linhas ?? []).map((l) => ({
      id: l.id, material_id: l.material_id, quantidade: String(l.quantidade),
      preco_unitario: String(l.preco_unitario), recebido: l.recebido, requisicao_id: l.requisicao_id,
    })));
  }, [completo]);

  const travado = Boolean(pedido) && linhas.some((l) => l.recebido > 0);
  const derivado = status === 'PARCIAL' || status === 'RECEBIDO';

  function mudar(indice: number, campo: keyof LinhaEditor, valor: string) {
    setLinhas((atual) => atual.map((l, i) => {
      if (i !== indice) return l;
      if (campo === 'material_id') {
        const material = (materiais ?? []).find((m) => m.id === Number(valor));
        // Ao escolher o material já sugere o último custo cadastrado.
        return {
          ...l,
          material_id: Number(valor) || '',
          preco_unitario: l.preco_unitario || String(material?.custo_unitario ?? ''),
        };
      }
      return { ...l, [campo]: valor };
    }));
  }

  const bruto = linhas.reduce((s, l) => s + Number(l.quantidade || 0) * Number(l.preco_unitario || 0), 0);
  const total = bruto + Number(frete || 0) - Number(desconto || 0);

  async function salvar() {
    if (!fornecedorId) return setErro('Escolha o fornecedor.');
    const itens = linhas
      .filter((l) => l.material_id && Number(l.quantidade) > 0)
      .map((l) => ({
        material_id: Number(l.material_id),
        quantidade: Number(l.quantidade),
        preco_unitario: Number(l.preco_unitario || 0),
        requisicao_id: l.requisicao_id,
      }));
    if (itens.length === 0) return setErro('Inclua ao menos um item com quantidade.');
    if (Number(desconto || 0) > bruto) return setErro('O desconto não pode passar do valor dos itens.');

    setSalvando(true);
    setErro('');
    const corpo = {
      fornecedor_id: Number(fornecedorId),
      data: dataPedido,
      previsao_entrega: previsao || null,
      condicao_pagamento: condicao.trim() || null,
      prazo_pagamento_dias: Number(prazo || 0),
      frete: Number(frete || 0),
      desconto: Number(desconto || 0),
      status: derivado ? undefined : status,
      observacao: observacao.trim() || null,
      itens,
    };
    try {
      if (pedido) await api.put(`/compras/pedidos/${pedido.id}`, travado ? { ...corpo, itens: undefined } : corpo);
      else await api.post('/compras/pedidos', corpo);
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o pedido');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={pedido ? `Editar pedido ${pedido.numero}` : 'Novo pedido de compra'}
      aberto={visivel}
      aoFechar={aoFechar}
      largo
      rodape={
        <>
          <span className="rodape-lista" style={{ marginRight: 'auto' }}>
            Itens {moeda(bruto)} · Total {moeda(total)}
          </span>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar pedido'}
          </button>
        </>
      }
    >
      <div className="grade c4">
        <Campo rotulo="Fornecedor">
          <select value={fornecedorId} onChange={(e) => setFornecedorId(Number(e.target.value) || '')}>
            <option value="">Selecione…</option>
            {(fornecedores ?? []).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Emissão">
          <input type="date" value={dataPedido} onChange={(e) => setDataPedido(e.target.value)} />
        </Campo>
        <Campo rotulo="Previsão de entrega">
          <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
        </Campo>
        <Campo rotulo="Situação">
          {derivado ? (
            // PARCIAL e RECEBIDO saem do que já entrou; mexer aqui só confundiria.
            <input value={ROTULO_PEDIDO[status]} disabled />
          ) : (
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(ROTULO_PEDIDO)
                .filter(([v]) => v !== 'PARCIAL' && v !== 'RECEBIDO')
                .map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          )}
        </Campo>
        <Campo rotulo="Condição de pagamento">
          <input value={condicao} onChange={(e) => setCondicao(e.target.value)} placeholder="30/60 dias" />
        </Campo>
        <Campo rotulo="Prazo (dias)">
          <input type="number" min="0" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </Campo>
        <Campo rotulo="Frete">
          <input type="number" min="0" step="0.01" value={frete} onChange={(e) => setFrete(e.target.value)} />
        </Campo>
        <Campo rotulo="Desconto">
          <input type="number" min="0" step="0.01" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
        </Campo>
      </div>

      {travado && (
        <Aviso tipo="info">
          Este pedido já teve entrega lançada: os itens ficam travados. Estorne o recebimento para alterá-los.
        </Aviso>
      )}

      <table>
        <thead>
          <tr>
            <th>Material</th><th className="num" style={{ width: 130 }}>Quantidade</th>
            <th className="num" style={{ width: 130 }}>Preço unitário</th>
            <th className="num">Total</th><th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => {
            const material = (materiais ?? []).find((m) => m.id === l.material_id);
            return (
              <tr key={l.id ?? `nova-${i}`}>
                <td>
                  <select value={l.material_id} disabled={travado}
                    onChange={(e) => mudar(i, 'material_id', e.target.value)}>
                    <option value="">Selecione…</option>
                    {(materiais ?? []).map((m) => (
                      <option key={m.id} value={m.id}>{m.descricao}{m.codigo ? ` · ${m.codigo}` : ''}</option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <input type="number" min="0" step="0.001" value={l.quantidade} disabled={travado}
                    onChange={(e) => mudar(i, 'quantidade', e.target.value)} />
                  {material && <div className="sub">{material.unidade}</div>}
                </td>
                <td className="num">
                  <input type="number" min="0" step="0.0001" value={l.preco_unitario} disabled={travado}
                    onChange={(e) => mudar(i, 'preco_unitario', e.target.value)} />
                </td>
                <td className="num">{moeda(Number(l.quantidade || 0) * Number(l.preco_unitario || 0))}</td>
                <td>
                  {!travado && linhas.length > 1 && (
                    <button className="pequeno perigo"
                      onClick={() => setLinhas((a) => a.filter((_, x) => x !== i))}>×</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!travado && (
        <button className="pequeno" onClick={() => setLinhas((a) => [...a, { ...LINHA_VAZIA }])}>
          + Adicionar item
        </button>
      )}

      <Campo rotulo="Observação">
        <textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </Campo>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, query } from '../lib/api';
import { useApi } from '../lib/hooks';
import { data, decimal, moeda, numero, hoje } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Campo, Etiqueta } from '../components/ui';
import TabelaCrud from '../components/TabelaCrud';
import { BarraFiltros, useFiltros, type CampoFiltro } from '../components/Filtros';
import type {
  Apontamento as TApontamento, Produtividade, Eficiencia, Ocorrencia,
  OrdemLista, Etapa, Colaborador, Equipamento, Departamento,
} from '../tipos';

const ABAS = ['Apontar', 'Histórico', 'Produtividade', 'Eficiência por setor', 'Ocorrências'] as const;

export default function Apontamento() {
  const [aba, setAba] = useState<(typeof ABAS)[number]>('Apontar');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Apontamento de produção</h1>
          <p>O que cada pessoa produziu, em quanto tempo e o que parou a fábrica</p>
        </div>
        {aba !== 'Apontar' && aba !== 'Histórico' && (
          <div className="acoes">
            <div><label>De</label><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
            <div><label>Até</label><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} max={hoje()} /></div>
          </div>
        )}
      </header>

      <div className="abas">
        {ABAS.map((a) => (
          <button key={a} className={`aba${aba === a ? ' ativa' : ''}`} onClick={() => setAba(a)}>{a}</button>
        ))}
      </div>

      {aba === 'Apontar' && <Apontar />}
      {aba === 'Histórico' && <Historico />}
      {aba === 'Produtividade' && <TabelaProdutividade de={de} ate={ate} />}
      {aba === 'Eficiência por setor' && <TabelaEficiencia de={de} ate={ate} />}
      {aba === 'Ocorrências' && <Ocorrencias />}
    </>
  );
}

function Apontar() {
  const { dados: ordens } = useApi<OrdemLista[]>('/ordens?limite=300');
  const { dados: etapas } = useApi<Etapa[]>('/etapas');
  const { dados: pessoas } = useApi<Colaborador[]>('/colaboradores?ativo=true');
  const { dados: maquinas } = useApi<Equipamento[]>('/engenharia/equipamentos?ativo=true');

  const [ordemId, setOrdemId] = useState<number | ''>('');
  const [etapaId, setEtapaId] = useState<number | ''>('');
  const [colaboradorId, setColaboradorId] = useState<number | ''>('');
  const [equipamentoId, setEquipamentoId] = useState<number | ''>('');
  const [dia, setDia] = useState(hoje());
  const [quantidade, setQuantidade] = useState('');
  const [refugo, setRefugo] = useState('');
  const [minutos, setMinutos] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);

  const caminho = `/apontamentos${query({ limite: 60 })}`;
  const { dados: recentes, recarregar } = useApi<TApontamento[]>(caminho, [caminho]);

  const ordem = ordens?.find((o) => o.id === ordemId);

  async function enviar() {
    setErro('');
    setOk('');
    if (!ordemId || !etapaId) return setErro('Escolha a ordem e a etapa.');
    if (!(Number(quantidade) > 0) && !(Number(refugo) > 0)) {
      return setErro('Informe a quantidade produzida ou o refugo.');
    }
    setSalvando(true);
    try {
      await api.post('/apontamentos', {
        ordem_id: Number(ordemId),
        etapa_id: Number(etapaId),
        colaborador_id: colaboradorId ? Number(colaboradorId) : null,
        equipamento_id: equipamentoId ? Number(equipamentoId) : null,
        data: dia,
        quantidade: Number(quantidade) || 0,
        refugo: Number(refugo) || 0,
        minutos: Number(minutos) || 0,
      });
      setOk('Apontamento registrado. A etapa avançou sozinha na ordem.');
      setQuantidade('');
      setRefugo('');
      setMinutos('');
      recarregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível registrar');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: number) {
    if (!confirm('Excluir este apontamento? A etapa volta ao estado anterior.')) return;
    await api.delete(`/apontamentos/${id}`);
    recarregar();
  }

  return (
    <div className="grade c2">
      <Cartao titulo="Novo apontamento">
        <Aviso tipo="erro">{erro}</Aviso>
        <Aviso tipo="ok">{ok}</Aviso>
        <Campo rotulo="Ordem de produção">
          <select value={ordemId} onChange={(e) => setOrdemId(Number(e.target.value) || '')}>
            <option value="">Selecione…</option>
            {ordens?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.numero} · {o.cliente.slice(0, 20)} · {o.produto.slice(0, 26)} ({numero(o.quantidade)} pç)
              </option>
            ))}
          </select>
        </Campo>
        <div className="linha-campos">
          <Campo rotulo="Etapa">
            <select value={etapaId} onChange={(e) => setEtapaId(Number(e.target.value) || '')}>
              <option value="">Selecione…</option>
              {etapas?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Data"><input type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></Campo>
        </div>
        <div className="linha-campos">
          <Campo rotulo="Quem produziu">
            <select value={colaboradorId} onChange={(e) => setColaboradorId(Number(e.target.value) || '')}>
              <option value="">—</option>
              {pessoas?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Equipamento">
            <select value={equipamentoId} onChange={(e) => setEquipamentoId(Number(e.target.value) || '')}>
              <option value="">—</option>
              {maquinas?.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </Campo>
        </div>
        <div className="linha-campos">
          <Campo rotulo="Peças boas">
            <input type="number" min="0" step="any" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
          </Campo>
          <Campo rotulo="Refugo">
            <input type="number" min="0" step="any" value={refugo} onChange={(e) => setRefugo(e.target.value)} />
          </Campo>
          <Campo rotulo="Minutos gastos">
            <input type="number" min="0" step="any" value={minutos} onChange={(e) => setMinutos(e.target.value)}
              placeholder="deixe vazio para usar o tempo padrão" />
          </Campo>
        </div>
        {ordem && (
          <p style={{ color: 'var(--texto-fraco)', fontSize: 12.5, marginTop: 0 }}>
            {ordem.numero}: {numero(ordem.quantidade)} peças previstas · {ordem.etapas_concluidas} de{' '}
            {ordem.etapas_total} etapas concluídas
          </p>
        )}
        <button className="primario" onClick={enviar} disabled={salvando}>
          {salvando ? 'Registrando…' : 'Registrar apontamento'}
        </button>
      </Cartao>

      <Cartao titulo="Últimos apontamentos">
        {!recentes ? <Carregando /> : recentes.length === 0 ? <Vazio texto="Nada apontado ainda." /> : (
          <div className="tabela-rolagem" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Data</th><th>OP</th><th>Etapa</th><th>Quem</th>
                  <th className="num">Peças</th><th className="num">Min</th><th className="num">MO</th><th />
                </tr>
              </thead>
              <tbody>
                {recentes.map((a) => (
                  <tr key={a.id}>
                    <td>{data(a.data)}</td>
                    <td><Link to={`/producao/${a.ordem_id}`}>{a.ordem}</Link></td>
                    <td>{a.etapa}</td>
                    <td>{a.colaborador ?? '—'}</td>
                    <td className="num">
                      {decimal(a.quantidade)}
                      {a.refugo > 0 && <span className="etiqueta vermelha" style={{ marginLeft: 4 }}>−{decimal(a.refugo)}</span>}
                    </td>
                    <td className="num">{decimal(a.minutos)}</td>
                    <td className="num">{moeda(a.custo_mo)}</td>
                    <td><button className="pequeno perigo" onClick={() => excluir(a.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  );
}

/** Todo o histórico apontado, com os filtros que o chão de fábrica costuma pedir. */
function Historico() {
  const [falha, setFalha] = useState('');
  const { dados: ordens } = useApi<OrdemLista[]>('/ordens?limite=300');
  const { dados: etapas } = useApi<Etapa[]>('/etapas');
  const { dados: pessoas } = useApi<Colaborador[]>('/colaboradores?ativo=true');
  const { dados: maquinas } = useApi<Equipamento[]>('/engenharia/equipamentos?ativo=true');

  const filtros = useFiltros('/apontamentos', { limite: '400' });
  const { dados, carregando, erro, recarregar } = useApi<TApontamento[]>(filtros.caminho, [filtros.caminho]);

  const lista = dados ?? [];
  const pecas = lista.reduce((s, a) => s + a.quantidade, 0);
  const minutos = lista.reduce((s, a) => s + a.minutos, 0);
  const custo = lista.reduce((s, a) => s + a.custo_mo, 0);

  const campos: CampoFiltro[] = [
    { chave: 'busca', rotulo: 'OP, cliente, produto ou pessoa', tipo: 'busca' },
    { chave: 'ordem_id', rotulo: 'Ordem', tipo: 'select',
      opcoes: (ordens ?? []).map((o) => ({ valor: o.id, rotulo: `${o.numero} · ${o.produto.slice(0, 22)}` })) },
    { chave: 'etapa_id', rotulo: 'Etapa', tipo: 'select',
      opcoes: (etapas ?? []).map((e) => ({ valor: e.id, rotulo: e.nome })) },
    { chave: 'colaborador_id', rotulo: 'Quem produziu', tipo: 'select',
      opcoes: (pessoas ?? []).map((p) => ({ valor: p.id, rotulo: p.nome })) },
    { chave: 'equipamento_id', rotulo: 'Equipamento', tipo: 'select',
      opcoes: (maquinas ?? []).map((m) => ({ valor: m.id, rotulo: m.nome })) },
    { chave: 'de', rotulo: 'De', tipo: 'data' },
    { chave: 'ate', rotulo: 'até', tipo: 'data' },
    { chave: 'com_refugo', rotulo: 'só com refugo', tipo: 'marcar' },
  ];

  async function excluir(id: number) {
    if (!confirm('Excluir este apontamento? A etapa volta ao estado anterior.')) return;
    setFalha('');
    try {
      await api.delete(`/apontamentos/${id}`);
      recarregar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível excluir');
    }
  }

  return (
    <Cartao titulo="Histórico de apontamentos"
      acao={<small>{decimal(pecas)} peças · {decimal(minutos)} min · {moeda(custo)} de mão de obra</small>}>
      <BarraFiltros campos={campos} valores={filtros.valores} aoMudar={filtros.definir}
        aoLimpar={filtros.limpar} ativos={filtros.ativos} />

      {carregando && <Carregando />}
      <Aviso tipo="erro">{falha || erro}</Aviso>
      {!carregando && lista.length === 0 && <Vazio texto="Nenhum apontamento com estes filtros." />}
      {lista.length > 0 && (
        <div className="tabela-rolagem" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th><th>OP</th><th>Etapa</th><th>Quem</th><th>Equipamento</th>
                <th className="num">Peças</th><th className="num">Refugo</th>
                <th className="num">Min</th><th className="num">Mão de obra</th><th />
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id}>
                  <td>{data(a.data)}</td>
                  <td><Link to={`/producao/${a.ordem_id}`}>{a.ordem}</Link></td>
                  <td>{a.etapa}</td>
                  <td>{a.colaborador ?? '—'}</td>
                  <td>{a.equipamento ?? '—'}</td>
                  <td className="num">{decimal(a.quantidade)}</td>
                  <td className="num">{a.refugo > 0 ? <Etiqueta texto={decimal(a.refugo)} tom="vermelha" /> : '—'}</td>
                  <td className="num">{decimal(a.minutos)}</td>
                  <td className="num">{moeda(a.custo_mo)}</td>
                  <td><button className="pequeno perigo" onClick={() => excluir(a.id)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="rodape-lista"><span>{lista.length} apontamento(s)</span></div>
    </Cartao>
  );
}

function TabelaProdutividade({ de, ate }: { de: string; ate: string }) {
  const caminho = `/apontamentos/produtividade${query({ de, ate })}`;
  const { dados, carregando } = useApi<Produtividade[]>(caminho, [caminho]);
  if (carregando) return <Carregando />;
  if (!dados || dados.length === 0) return <Cartao><Vazio texto="Sem apontamentos no período." /></Cartao>;

  return (
    <Cartao titulo="Produtividade por pessoa" acao={<small>peças por hora efetivamente apontadas</small>}>
      <div className="tabela-rolagem">
        <table>
          <thead>
            <tr>
              <th>Colaborador</th><th>Setor</th><th className="num">Apontamentos</th>
              <th className="num">Peças</th><th className="num">Refugo</th>
              <th className="num">Minutos</th><th className="num">Peças/hora</th><th className="num">Custo MO</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((l) => (
              <tr key={l.id}>
                <td>{l.colaborador}</td>
                <td>{l.departamento ?? '—'}</td>
                <td className="num">{l.apontamentos}</td>
                <td className="num">{numero(l.pecas)}</td>
                <td className="num">{l.refugo > 0 ? <span className="etiqueta vermelha">{decimal(l.refugo)}</span> : '—'}</td>
                <td className="num">{decimal(l.minutos)}</td>
                <td className="num"><strong>{decimal(l.pecas_hora)}</strong></td>
                <td className="num">{moeda(l.custo_mo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}

function TabelaEficiencia({ de, ate }: { de: string; ate: string }) {
  const caminho = `/apontamentos/eficiencia${query({ de, ate })}`;
  const { dados, carregando } = useApi<Eficiencia[]>(caminho, [caminho]);
  if (carregando) return <Carregando />;
  if (!dados || dados.length === 0) return <Cartao><Vazio texto="Nenhum setor produtivo cadastrado." /></Cartao>;

  return (
    <>
      <Aviso tipo="info">
        Eficiência é o tempo apontado dividido pelo tempo disponível do setor no período.
        Sem informar as datas, o cálculo considera um único dia.
      </Aviso>
      <Cartao titulo="Eficiência e paradas por setor">
        <table>
          <thead>
            <tr>
              <th>Setor</th><th className="num">Pessoas</th><th className="num">Disponível (min)</th>
              <th className="num">Produzido (min)</th><th className="num">Parado (min)</th>
              <th className="num">Eficiência</th><th className="num">Parada</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((l) => (
              <tr key={l.id}>
                <td>{l.departamento}</td>
                <td className="num">{l.pessoas}</td>
                <td className="num">{numero(l.minutos_disponiveis)}</td>
                <td className="num">{numero(l.minutos_produzidos)}</td>
                <td className="num">{numero(l.minutos_parados)}</td>
                <td className="num">
                  <span className={`etiqueta ${l.eficiencia_percentual >= 70 ? 'verde' : l.eficiencia_percentual >= 40 ? 'amarela' : 'vermelha'}`}>
                    {decimal(l.eficiencia_percentual)}%
                  </span>
                </td>
                <td className="num">{decimal(l.parada_percentual)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartao>
    </>
  );
}

function Ocorrencias() {
  const { dados: setores } = useApi<Departamento[]>('/engenharia/departamentos');
  const { dados: maquinas } = useApi<Equipamento[]>('/engenharia/equipamentos?ativo=true');

  return (
    <TabelaCrud<Ocorrencia>
      titulo="Ocorrências de produção"
      descricao="O que interrompeu a linha, por quanto tempo e como foi resolvido"
      recurso="/ocorrencias"
      colunas={[
        { chave: 'data', rotulo: 'Data', render: (o) => data(o.data) },
        { chave: 'departamento', rotulo: 'Setor' },
        { chave: 'motivo', rotulo: 'Motivo' },
        { chave: 'minutos_parado', rotulo: 'Parado (min)', num: true, render: (o) => decimal(o.minutos_parado) },
        { chave: 'descricao', rotulo: 'Descrição' },
        {
          chave: 'resolvida', rotulo: 'Situação',
          render: (o) => (o.resolvida ? <Etiqueta texto="resolvida" tom="verde" /> : <Etiqueta texto="aberta" tom="amarela" />),
        },
      ]}
      campos={[
        { nome: 'data', rotulo: 'Data', tipo: 'data', padrao: hoje(), obrigatorio: true },
        {
          nome: 'motivo', rotulo: 'Motivo', tipo: 'select', padrao: 'OUTRO',
          opcoes: [
            { valor: 'FALTA_MATERIAL', rotulo: 'Falta de material' },
            { valor: 'QUEBRA_EQUIPAMENTO', rotulo: 'Quebra de equipamento' },
            { valor: 'FALTA_PESSOAL', rotulo: 'Falta de pessoal' },
            { valor: 'RETRABALHO', rotulo: 'Retrabalho' },
            { valor: 'ENERGIA', rotulo: 'Energia' },
            { valor: 'AGUARDANDO_SETOR', rotulo: 'Aguardando outro setor' },
            { valor: 'TREINAMENTO', rotulo: 'Treinamento' },
            { valor: 'OUTRO', rotulo: 'Outro' },
          ],
        },
        { nome: 'departamento_id', rotulo: 'Setor', tipo: 'select',
          opcoes: (setores ?? []).map((d) => ({ valor: d.id, rotulo: d.nome })) },
        { nome: 'equipamento_id', rotulo: 'Equipamento', tipo: 'select',
          opcoes: (maquinas ?? []).map((m) => ({ valor: m.id, rotulo: m.nome })) },
        { nome: 'minutos_parado', rotulo: 'Minutos parado', tipo: 'numero', padrao: 0 },
        { nome: 'descricao', rotulo: 'O que aconteceu' },
        { nome: 'acao', rotulo: 'Ação tomada' },
        { nome: 'resolvida', rotulo: 'Resolvida (1 ou 0)', tipo: 'numero', padrao: 0 },
      ]}
    />
  );
}

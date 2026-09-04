import { useEffect, useState } from 'react';
import { api, ApiError, pode } from '../lib/api';
import { useApi } from '../lib/hooks';
import { BarraFiltros, useFiltros, type CampoFiltro } from '../components/Filtros';
import { data, decimal, moeda, numero, hoje } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Campo, Indicador, Etiqueta, Modal } from '../components/ui';
import type { Inventario as Contagem, LinhaInventario, LocalEstoque, Material } from '../tipos';

const ROTULO: Record<string, string> = { ABERTO: 'Aberto', FECHADO: 'Fechado', CANCELADO: 'Cancelado' };
const TOM: Record<string, string> = { ABERTO: 'amarela', FECHADO: 'verde', CANCELADO: '' };

export default function Inventario() {
  const [abrindo, setAbrindo] = useState<number | null>(null);
  const [novo, setNovo] = useState(false);
  const [falha, setFalha] = useState('');

  const { dados: locais } = useApi<LocalEstoque[]>('/locais-estoque');
  const filtros = useFiltros('/compras/inventarios', {});
  const { dados, carregando, erro, recarregar } = useApi<Contagem[]>(filtros.caminho, [filtros.caminho]);

  const escreve = pode('materiais.mover');
  const lista = dados ?? [];

  const campos: CampoFiltro[] = [
    { chave: 'busca', rotulo: 'Descrição da contagem', tipo: 'busca' },
    { chave: 'status', rotulo: 'Situação', tipo: 'select',
      opcoes: Object.entries(ROTULO).map(([v, r]) => ({ valor: v, rotulo: r })) },
    { chave: 'de', rotulo: 'De', tipo: 'data' },
    { chave: 'ate', rotulo: 'até', tipo: 'data' },
  ];

  async function excluir(c: Contagem) {
    const aviso = c.status === 'FECHADO'
      ? `Cancelar "${c.descricao}"? Os ajustes já lançados no estoque permanecem.`
      : `Excluir a contagem "${c.descricao}"?`;
    if (!confirm(aviso)) return;
    setFalha('');
    try {
      await api.delete(`/compras/inventarios/${c.id}`);
      recarregar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível remover');
    }
  }

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Inventário</h1>
          <p>Contagem física do almoxarifado: o fechamento ajusta o saldo com a diferença apurada</p>
        </div>
        {escreve && (
          <div className="acoes">
            <button className="primario" onClick={() => setNovo(true)}>Nova contagem</button>
          </div>
        )}
      </header>

      <div className="grade c3">
        <Indicador rotulo="Contagens" valor={numero(lista.length)} />
        <Indicador rotulo="Em aberto" valor={numero(lista.filter((c) => c.status === 'ABERTO').length)} />
        <Indicador rotulo="Fechadas" valor={numero(lista.filter((c) => c.status === 'FECHADO').length)} />
      </div>

      <Cartao titulo="Contagens">
        <BarraFiltros campos={campos} valores={filtros.valores} aoMudar={filtros.definir}
          aoLimpar={filtros.limpar} ativos={filtros.ativos} />

        {carregando && <Carregando />}
        <Aviso tipo="erro">{falha || erro}</Aviso>
        {!carregando && lista.length === 0 && (
          <Vazio texto="Nenhuma contagem registrada. Abra uma para conferir o saldo do almoxarifado." />
        )}
        {lista.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Data</th><th>Descrição</th><th>Local</th>
                <th className="num">Materiais</th><th className="num">Contados</th>
                <th>Situação</th><th />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td>{data(c.data)}</td>
                  <td>{c.descricao}</td>
                  <td>{c.local ?? 'todos'}</td>
                  <td className="num">{c.materiais ?? 0}</td>
                  <td className="num">{c.contados ?? 0}</td>
                  <td><Etiqueta texto={ROTULO[c.status]} tom={TOM[c.status]} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="pequeno" onClick={() => setAbrindo(c.id)}>
                      {c.status === 'ABERTO' ? 'Contar' : 'Abrir'}
                    </button>{' '}
                    {escreve && c.status !== 'CANCELADO' && (
                      <button className="pequeno perigo" onClick={() => excluir(c)}>
                        {c.status === 'FECHADO' ? 'Cancelar' : 'Excluir'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>

      <Contar id={abrindo} aoFechar={() => setAbrindo(null)} aoMudar={recarregar} />
      <NovaContagem
        aberto={novo}
        locais={locais ?? []}
        aoFechar={() => setNovo(false)}
        aoSalvar={(id) => { setNovo(false); recarregar(); setAbrindo(id); }}
      />
    </>
  );
}

/** Folha de contagem: cada linha salva ao sair do campo; o fechamento ajusta o estoque. */
function Contar({ id, aoFechar, aoMudar }: {
  id: number | null; aoFechar: () => void; aoMudar: () => void;
}) {
  const [recarga, setRecarga] = useState(0);
  const [rascunho, setRascunho] = useState<Record<number, string>>({});
  const [falha, setFalha] = useState('');
  const [fechando, setFechando] = useState(false);
  const { dados: contagem, carregando, erro } = useApi<Contagem>(
    id ? `/compras/inventarios/${id}` : null, [id, recarga]
  );

  useEffect(() => { setRascunho({}); setFalha(''); }, [id]);

  const escreve = pode('materiais.mover');
  const aberto = contagem?.status === 'ABERTO';

  async function salvarLinha(linha: LinhaInventario, valor: string) {
    if (valor === '' || !contagem) return;
    if (Number(valor) === linha.contado) return;
    setFalha('');
    try {
      await api.put(`/compras/inventarios/${contagem.id}/contagem`, {
        material_id: linha.material_id,
        contado: Number(valor),
      });
      setRecarga((n) => n + 1);
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível gravar a contagem');
    }
  }

  async function fechar() {
    if (!contagem) return;
    const aviso = contagem.pendentes
      ? `Ainda faltam ${contagem.pendentes} material(is) sem contagem — eles ficam como estão. Fechar mesmo assim?`
      : `Fechar a contagem? ${contagem.divergencias} ajuste(s) serão lançados no estoque.`;
    if (!confirm(aviso)) return;
    setFechando(true);
    setFalha('');
    try {
      await api.post(`/compras/inventarios/${contagem.id}/fechar`, {});
      setRecarga((n) => n + 1);
      aoMudar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível fechar');
    } finally {
      setFechando(false);
    }
  }

  return (
    <Modal
      titulo={contagem ? `Inventário · ${contagem.descricao}` : 'Inventário'}
      aberto={id !== null}
      aoFechar={aoFechar}
      largo
      rodape={
        <>
          <button onClick={aoFechar}>Fechar</button>
          {escreve && aberto && (
            <button className="primario" onClick={fechar} disabled={fechando}>
              {fechando ? 'Ajustando…' : 'Fechar e ajustar estoque'}
            </button>
          )}
        </>
      }
    >
      {carregando && <Carregando />}
      <Aviso tipo="erro">{falha || erro}</Aviso>

      {contagem && (
        <>
          <div className="grade c4">
            <Indicador rotulo="Materiais" valor={numero(contagem.linhas?.length ?? 0)}
              nota={contagem.local ? `local ${contagem.local}` : 'todos os locais'} />
            <Indicador rotulo="Contados" valor={numero(contagem.contados ?? 0)}
              nota={`${contagem.pendentes ?? 0} pendentes`} />
            <Indicador rotulo="Divergências" valor={numero(contagem.divergencias ?? 0)}
              tom={(contagem.divergencias ?? 0) > 0 ? 'perigo' : 'sucesso'} />
            <Indicador rotulo="Valor da diferença" valor={moeda(contagem.valor_divergencia ?? 0)}
              tom={(contagem.valor_divergencia ?? 0) < 0 ? 'perigo' : undefined} />
          </div>

          <div className="tabela-rolagem" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Material</th><th className="num">Sistema</th>
                  <th className="num" style={{ width: 140 }}>Contado</th>
                  <th className="num">Diferença</th><th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {(contagem.linhas ?? []).map((l) => (
                  <tr key={l.id}>
                    <td>{l.material}{l.codigo && <div className="sub">{l.codigo}</div>}</td>
                    <td className="num">{decimal(l.saldo_sistema)} {l.unidade}</td>
                    <td className="num">
                      {aberto && escreve ? (
                        <input
                          type="number" min="0" step="0.001"
                          value={rascunho[l.id] ?? (l.contado ?? '')}
                          onChange={(e) => setRascunho((r) => ({ ...r, [l.id]: e.target.value }))}
                          onBlur={(e) => salvarLinha(l, e.target.value)}
                        />
                      ) : (
                        l.contado === null ? <span className="sub">não contado</span> : decimal(l.contado)
                      )}
                    </td>
                    <td className="num">
                      {l.diferenca === null ? '—' : (
                        <strong style={{ color: l.diferenca === 0 ? undefined : 'var(--perigo)' }}>
                          {l.diferenca > 0 ? '+' : ''}{decimal(l.diferenca)}
                        </strong>
                      )}
                    </td>
                    <td className="num">{l.valor_diferenca === null ? '—' : moeda(l.valor_diferenca)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!aberto && (
            <Aviso tipo="info">
              Contagem {ROTULO[contagem.status].toLowerCase()}
              {contagem.fechado_em ? ` em ${data(contagem.fechado_em.slice(0, 10))}` : ''}
              {contagem.usuario ? ` por ${contagem.usuario}` : ''}.
            </Aviso>
          )}
        </>
      )}
    </Modal>
  );
}

/** Abertura da contagem: tudo que está ativo, ou só os materiais escolhidos. */
function NovaContagem({ aberto, locais, aoFechar, aoSalvar }: {
  aberto: boolean; locais: LocalEstoque[]; aoFechar: () => void; aoSalvar: (id: number) => void;
}) {
  const { dados: materiais } = useApi<Material[]>(aberto ? '/materiais?limite=1000' : null);
  const [descricao, setDescricao] = useState('');
  const [dataContagem, setDataContagem] = useState(hoje());
  const [localId, setLocalId] = useState<number | ''>('');
  const [escolhidos, setEscolhidos] = useState<number[]>([]);
  const [parcial, setParcial] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setDescricao(`Contagem de ${data(hoje())}`);
    setDataContagem(hoje());
    setLocalId('');
    setEscolhidos([]);
    setParcial(false);
    setErro('');
  }, [aberto]);

  async function salvar() {
    if (!descricao.trim()) return setErro('Descreva a contagem.');
    if (parcial && escolhidos.length === 0) return setErro('Escolha ao menos um material.');
    setSalvando(true);
    setErro('');
    try {
      const criado = await api.post<Contagem>('/compras/inventarios', {
        descricao: descricao.trim(),
        data: dataContagem,
        local_id: localId === '' ? null : Number(localId),
        materiais: parcial ? escolhidos : undefined,
      });
      aoSalvar(criado.id);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível abrir a contagem');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Nova contagem de estoque"
      aberto={aberto}
      aoFechar={aoFechar}
      rodape={
        <>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Abrindo…' : 'Abrir contagem'}
          </button>
        </>
      }
    >
      <Campo rotulo="Descrição">
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </Campo>
      <div className="grade c2">
        <Campo rotulo="Data">
          <input type="date" value={dataContagem} onChange={(e) => setDataContagem(e.target.value)} />
        </Campo>
        <Campo rotulo="Local (referência)">
          <select value={localId} onChange={(e) => setLocalId(Number(e.target.value) || '')}>
            <option value="">Todos</option>
            {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </Campo>
      </div>

      <label className="marcar">
        <input type="checkbox" style={{ width: 'auto' }} checked={parcial}
          onChange={(e) => setParcial(e.target.checked)} />
        contar só alguns materiais
      </label>

      {parcial && (
        <div className="tabela-rolagem" style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
          <table>
            <tbody>
              {(materiais ?? []).map((m) => (
                <tr key={m.id}>
                  <td style={{ width: 30 }}>
                    <input type="checkbox" style={{ width: 'auto' }} checked={escolhidos.includes(m.id)}
                      onChange={() => setEscolhidos((a) =>
                        a.includes(m.id) ? a.filter((x) => x !== m.id) : [...a, m.id])} />
                  </td>
                  <td>{m.descricao}{m.codigo && <span className="sub"> · {m.codigo}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

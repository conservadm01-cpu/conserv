import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, pode } from '../lib/api';
import { useApi } from '../lib/hooks';
import { data, decimal, moeda, numero } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Indicador, Etiqueta, Campo } from '../components/ui';
import type {
  DataInvertida, GrupoDuplicata, GrupoPedidoRepetido, NomeSuspeito, PedidoParado, ResumoQualidade,
} from '../tipos';

const ABAS = [
  'Cadastros repetidos', 'Pedidos repetidos', 'Nomes', 'Pedidos parados', 'Datas',
] as const;
type Aba = (typeof ABAS)[number];

const CONFIANCA: Record<string, { rotulo: string; tom: string; nota: string }> = {
  identico: {
    rotulo: 'Mesmo nome', tom: 'verde',
    nota: 'Só muda acento, ponto ou espaço — é o mesmo nome escrito de dois jeitos.',
  },
  nucleo: {
    rotulo: 'Provável', tom: 'amarela',
    nota: 'Muda um "LTDA" ou um parêntese. Quase sempre é a mesma empresa, mas confira.',
  },
  parecido: {
    rotulo: 'Confira', tom: 'vermelha',
    nota: 'O nome difere por uma ou duas letras. Pode ser erro de digitação — ou duas empresas diferentes.',
  },
};

export default function Qualidade() {
  const [aba, setAba] = useState<Aba>('Cadastros repetidos');
  const [recarga, setRecarga] = useState(0);
  const { dados: resumo } = useApi<ResumoQualidade>('/qualidade/resumo', [recarga]);
  const atualizar = () => setRecarga((n) => n + 1);

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Qualidade do cadastro</h1>
          <p>
            O que a planilha trouxe torto: o mesmo cliente em dois cadastros, nome com número
            colado, venda antiga que ninguém baixou e entrega marcada antes do pedido
          </p>
        </div>
      </header>

      {resumo && (
        <div className="grade c3">
          <Indicador rotulo="Cadastros repetidos" valor={numero(resumo.duplicatas.cadastros)}
            nota={`${resumo.duplicatas.grupos} grupos · ${resumo.duplicatas.identicos} com o mesmo nome`}
            tom={resumo.duplicatas.grupos > 0 ? 'perigo' : 'sucesso'} />
          <Indicador rotulo="Nomes com sujeira" valor={numero(resumo.nomes)}
            tom={resumo.nomes > 0 ? 'perigo' : 'sucesso'} />
          <Indicador rotulo="Pedidos parados" valor={numero(resumo.parados.pedidos)}
            nota={`${moeda(resumo.parados.valor)} · maior espera ${resumo.parados.maior_atraso} dias`}
            tom={resumo.parados.pedidos > 0 ? 'perigo' : 'sucesso'} />
          <Indicador rotulo="Entregas antes do pedido" valor={numero(resumo.datas.itens)}
            nota={`${resumo.datas.com_sugestao} com correção sugerida`}
            tom={resumo.datas.itens > 0 ? 'perigo' : 'sucesso'} />
          <Indicador rotulo="Vendas lançadas duas vezes" valor={numero(resumo.pedidos_repetidos.repetidos)}
            nota={`${resumo.pedidos_repetidos.a_confirmar} outros a conferir · ${moeda(resumo.pedidos_repetidos.valor)}`}
            tom={resumo.pedidos_repetidos.repetidos > 0 ? 'perigo' : 'sucesso'} />
        </div>
      )}

      <div className="abas">
        {ABAS.map((a) => (
          <button key={a} className={`aba${aba === a ? ' ativa' : ''}`} onClick={() => setAba(a)}>{a}</button>
        ))}
      </div>

      {aba === 'Cadastros repetidos' && <Duplicatas chave={recarga} aoMudar={atualizar} />}
      {aba === 'Pedidos repetidos' && <Repetidos chave={recarga} aoMudar={atualizar} />}
      {aba === 'Nomes' && <Nomes chave={recarga} aoMudar={atualizar} />}
      {aba === 'Pedidos parados' && <Parados chave={recarga} aoMudar={atualizar} />}
      {aba === 'Datas' && <Datas chave={recarga} aoMudar={atualizar} />}
    </>
  );
}

/* ------------------------------------------------------------- duplicatas */

function Duplicatas({ chave, aoMudar }: { chave: number; aoMudar: () => void }) {
  const [escolha, setEscolha] = useState<Record<string, number>>({});
  const [falha, setFalha] = useState('');
  const [recado, setRecado] = useState('');
  const [ocupado, setOcupado] = useState('');
  const { dados, carregando, erro, recarregar } = useApi<GrupoDuplicata[]>('/qualidade/duplicatas', [chave]);

  const escreve = pode('qualidade');
  const grupos = dados ?? [];

  async function juntar(grupo: GrupoDuplicata) {
    const manter = escolha[grupo.chave] ?? grupo.manter;
    const juntar = grupo.membros.filter((m) => m.id !== manter);
    const fica = grupo.membros.find((m) => m.id === manter)!;
    const movimento = juntar.reduce(
      (s, m) => s + m.pedidos + m.orcamentos + m.oportunidades + m.titulos, 0
    );

    const aviso = `Juntar ${juntar.length} cadastro(s) em "${fica.nome}"?\n\n`
      + `${movimento} registro(s) passam a apontar para ele e os outros ficam inativos.`;
    if (!confirm(aviso)) return;

    setOcupado(grupo.chave);
    setFalha('');
    setRecado('');
    try {
      const r = await api.post<{ movidos: Record<string, number>; renumerados: Array<{ de: string; para: string }> }>(
        '/qualidade/duplicatas/mesclar',
        { manter, juntar: juntar.map((m) => m.id) }
      );
      const total = Object.values(r.movidos).reduce((s, n) => s + n, 0);
      setRecado(
        `"${fica.nome}" ficou com ${total} registro(s) dos cadastros juntados.`
        + (r.renumerados.length
          ? ` ${r.renumerados.length} pedido(s) foram renumerados por conflito: `
            + r.renumerados.map((x) => `${x.de} → ${x.para}`).join(', ') + '.'
          : '')
      );
      recarregar();
      aoMudar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível juntar');
    } finally {
      setOcupado('');
    }
  }

  if (carregando) return <Carregando />;

  return (
    <>
      <Aviso tipo="erro">{falha || erro}</Aviso>
      {recado && <Aviso tipo="ok">{recado}</Aviso>}
      {grupos.length === 0 && <Vazio texto="Nenhum cadastro repetido. O cadastro de clientes está limpo." />}

      {grupos.map((grupo) => {
        const manter = escolha[grupo.chave] ?? grupo.manter;
        const info = CONFIANCA[grupo.confianca];
        return (
          <Cartao
            key={grupo.chave}
            titulo={
              <div>
                <h3>{grupo.membros[0].nome}</h3>
                <small>{info.nota}</small>
              </div>
            }
            acao={<Etiqueta texto={info.rotulo} tom={info.tom} />}
          >
            <table>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Fica</th><th>Cadastro</th><th>CNPJ</th><th>Cidade</th>
                  <th className="num">Pedidos</th><th className="num">Orçam.</th>
                  <th className="num">Oportun.</th><th className="num">Títulos</th>
                  <th>Último pedido</th>
                </tr>
              </thead>
              <tbody>
                {grupo.membros.map((m) => (
                  <tr key={m.id} className={m.id === manter ? 'destacada' : undefined}>
                    <td>
                      <label className="marcar" style={{ margin: 0 }}>
                        <input
                          type="radio"
                          style={{ width: 'auto' }}
                          name={`manter-${grupo.chave}`}
                          checked={m.id === manter}
                          disabled={!escreve}
                          onChange={() => setEscolha((e) => ({ ...e, [grupo.chave]: m.id }))}
                        />
                        {m.id === manter ? 'fica' : 'junta'}
                      </label>
                    </td>
                    <td>
                      <Link to="/clientes">{m.nome}</Link>
                      {m.ativo === 0 && <div><Etiqueta texto="inativo" /></div>}
                    </td>
                    <td>{m.cnpj ?? '—'}</td>
                    <td>{[m.cidade, m.uf].filter(Boolean).join('/') || '—'}</td>
                    <td className="num">{m.pedidos}</td>
                    <td className="num">{m.orcamentos}</td>
                    <td className="num">{m.oportunidades}</td>
                    <td className="num">{m.titulos}</td>
                    <td>{data(m.ultimo_pedido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {escreve && (
              <div className="rodape-lista">
                <span>
                  Tudo dos outros cadastros passa para o marcado, e eles ficam inativos com a
                  anotação de para onde foram.
                </span>
                <button className="primario" disabled={ocupado === grupo.chave} onClick={() => juntar(grupo)}>
                  {ocupado === grupo.chave ? 'Juntando…' : 'Juntar neste cadastro'}
                </button>
              </div>
            )}
          </Cartao>
        );
      })}
    </>
  );
}

/* -------------------------------------------------------- pedidos repetidos */

const CONFIANCA_PEDIDO: Record<string, { rotulo: string; tom: string }> = {
  repetido: { rotulo: 'Mesma venda', tom: 'vermelha' },
  confira: { rotulo: 'Confira', tom: 'amarela' },
};

function Repetidos({ chave, aoMudar }: { chave: number; aoMudar: () => void }) {
  const [escolha, setEscolha] = useState<Record<string, number>>({});
  const [falha, setFalha] = useState('');
  const [recado, setRecado] = useState('');
  const [ocupado, setOcupado] = useState('');
  const { dados, carregando, erro, recarregar } =
    useApi<GrupoPedidoRepetido[]>('/qualidade/pedidos-repetidos', [chave]);

  const escreve = pode('qualidade');
  const grupos = dados ?? [];

  async function cancelar(grupo: GrupoPedidoRepetido) {
    const manter = escolha[grupo.chave] ?? grupo.manter;
    const cair = grupo.membros.filter((m) => m.id !== manter);
    const fica = grupo.membros.find((m) => m.id === manter)!;

    const aviso = `Cancelar ${cair.map((m) => m.numero).join(', ')} e ficar com ${fica.numero}?\n\n`
      + 'Os pedidos cancelados saem da carteira e suas ordens são encerradas. '
      + 'Pedido com produção já apontada é recusado.';
    if (!confirm(aviso)) return;

    setOcupado(grupo.chave);
    setFalha('');
    setRecado('');
    try {
      const r = await api.post<{ cancelados: number; ordens: number; recusados: Array<{ numero: string; motivo: string }> }>(
        '/qualidade/pedidos-repetidos/cancelar', { ids: cair.map((m) => m.id) }
      );
      setRecado(
        `${r.cancelados} pedido(s) cancelados e ${r.ordens} ordem(ns) encerradas.`
        + (r.recusados.length
          ? ` Não deu para cancelar ${r.recusados.map((x) => `${x.numero} (${x.motivo})`).join(', ')}.`
          : '')
      );
      recarregar();
      aoMudar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível cancelar');
    } finally {
      setOcupado('');
    }
  }

  if (carregando) return <Carregando />;

  return (
    <>
      <Aviso tipo="erro">{falha || erro}</Aviso>
      {recado && <Aviso tipo="ok">{recado}</Aviso>}
      {grupos.length === 0 && <Vazio texto="Nenhuma venda aparece lançada duas vezes." />}

      {grupos.map((grupo) => {
        const manter = escolha[grupo.chave] ?? grupo.manter;
        const info = CONFIANCA_PEDIDO[grupo.confianca];
        return (
          <Cartao
            key={grupo.chave}
            titulo={
              <div>
                <h3>{grupo.cliente} · {data(grupo.data_pedido)}</h3>
                <small>{grupo.motivo}</small>
              </div>
            }
            acao={<Etiqueta texto={info.rotulo} tom={info.tom} />}
          >
            <table>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Fica</th><th>Pedido</th><th>Situação</th>
                  <th className="num">Itens</th><th className="num">Peças</th><th className="num">Valor</th>
                  <th className="num">OPs</th><th className="num">Apontado</th><th className="num">Títulos</th>
                </tr>
              </thead>
              <tbody>
                {grupo.membros.map((m) => (
                  <tr key={m.id} className={m.id === manter ? 'destacada' : undefined}>
                    <td>
                      <label className="marcar" style={{ margin: 0 }}>
                        <input
                          type="radio"
                          style={{ width: 'auto' }}
                          name={`pedido-${grupo.chave}`}
                          checked={m.id === manter}
                          disabled={!escreve}
                          onChange={() => setEscolha((e) => ({ ...e, [grupo.chave]: m.id }))}
                        />
                        {m.id === manter ? 'fica' : 'cancela'}
                      </label>
                    </td>
                    <td><Link to={`/pedidos/${m.id}`} className="mono">{m.numero}</Link></td>
                    <td><Etiqueta status={m.situacao} /></td>
                    <td className="num">{m.itens}</td>
                    <td className="num">{decimal(m.pecas)}</td>
                    <td className="num"><strong>{moeda(m.valor)}</strong></td>
                    <td className="num">{m.ordens || '—'}</td>
                    <td className="num">
                      {m.apontamentos > 0
                        ? <Etiqueta texto={`${m.apontamentos}`} tom="verde" />
                        : '—'}
                    </td>
                    <td className="num">{m.titulos || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {escreve && (
              <div className="rodape-lista">
                <span>
                  Confira os itens dos dois antes de decidir — a mesma venda às vezes vem com o
                  produto quebrado por tamanho de um lado e consolidado do outro.
                </span>
                <button className="perigo" disabled={ocupado === grupo.chave} onClick={() => cancelar(grupo)}>
                  {ocupado === grupo.chave ? 'Cancelando…' : 'Cancelar os outros'}
                </button>
              </div>
            )}
          </Cartao>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ nomes */

function Nomes({ chave, aoMudar }: { chave: number; aoMudar: () => void }) {
  const [falha, setFalha] = useState('');
  const [ocupado, setOcupado] = useState(0);
  const { dados, carregando, erro, recarregar } = useApi<NomeSuspeito[]>('/qualidade/nomes', [chave]);

  const escreve = pode('qualidade');
  const lista = dados ?? [];

  async function aplicar(n: NomeSuspeito) {
    setOcupado(n.id);
    setFalha('');
    try {
      await api.put(`/qualidade/nomes/${n.id}`, { nome: n.sugestao });
      recarregar();
      aoMudar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível corrigir');
    } finally {
      setOcupado(0);
    }
  }

  return (
    <Cartao titulo="Nomes com sujeira de digitação">
      {carregando && <Carregando />}
      <Aviso tipo="erro">{falha || erro}</Aviso>
      {!carregando && lista.length === 0 && <Vazio texto="Nenhum nome com sobra de digitação." />}
      {lista.length > 0 && (
        <table>
          <thead>
            <tr><th>Como está</th><th>Como ficaria</th><th>O que há</th><th /></tr>
          </thead>
          <tbody>
            {lista.map((n) => (
              <tr key={n.id}>
                <td className="mono">{n.nome}</td>
                <td className="mono"><strong>{n.sugestao}</strong></td>
                <td><span className="sub">{n.motivos.join('; ')}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {n.conflito ? (
                    <Etiqueta texto={`já existe "${n.conflito.nome}" — junte os dois`} tom="amarela" />
                  ) : escreve && (
                    <button className="pequeno primario" disabled={ocupado === n.id} onClick={() => aplicar(n)}>
                      Corrigir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Cartao>
  );
}

/* -------------------------------------------------------- pedidos parados */

function Parados({ chave, aoMudar }: { chave: number; aoMudar: () => void }) {
  const [dias, setDias] = useState('180');
  const [marcados, setMarcados] = useState<number[]>([]);
  const [falha, setFalha] = useState('');
  const [recado, setRecado] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const caminho = `/qualidade/parados?dias=${Number(dias) || 180}`;
  const { dados, carregando, erro, recarregar } = useApi<PedidoParado[]>(caminho, [caminho, chave]);

  const escreve = pode('qualidade');
  const lista = dados ?? [];
  useEffect(() => { setMarcados([]); }, [caminho, chave]);

  const valorMarcado = lista.filter((p) => marcados.includes(p.id)).reduce((s, p) => s + p.valor, 0);

  async function encerrar() {
    const aviso = `Dar baixa em ${marcados.length} pedido(s)?\n\n`
      + 'Eles saem da carteira e as ordens que ainda estavam abertas são fechadas junto.';
    if (!confirm(aviso)) return;
    setOcupado(true);
    setFalha('');
    setRecado('');
    try {
      const r = await api.post<{ pedidos: number; ordens: number }>(
        '/qualidade/parados/encerrar', { ids: marcados }
      );
      setRecado(`${r.pedidos} pedido(s) baixados e ${r.ordens} ordem(ns) encerradas.`);
      setMarcados([]);
      recarregar();
      aoMudar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível encerrar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Cartao
      titulo="Pedidos que passaram da entrega e ninguém baixou"
      acao={
        <div className="filtro-campo">
          <Campo rotulo="Vencidos há mais de (dias)">
            <input type="number" min="1" value={dias} onChange={(e) => setDias(e.target.value)} />
          </Campo>
        </div>
      }
    >
      <p className="ajuda" style={{ color: 'var(--texto-fraco)', fontSize: 13, marginTop: 0 }}>
        Quase sempre é venda antiga que foi entregue e o sistema nunca soube. Enquanto ficarem
        assim, entram na carteira e no indicador de atraso como se ainda fossem produzir.
      </p>

      {carregando && <Carregando />}
      <Aviso tipo="erro">{falha || erro}</Aviso>
      {recado && <Aviso tipo="ok">{recado}</Aviso>}
      {!carregando && lista.length === 0 && <Vazio texto="Nenhum pedido parado nessa janela." />}

      {lista.length > 0 && (
        <>
          <div className="tabela-rolagem" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  {escreve && (
                    <th style={{ width: 28 }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={marcados.length === lista.length}
                        onChange={(e) => setMarcados(e.target.checked ? lista.map((p) => p.id) : [])}
                      />
                    </th>
                  )}
                  <th>Pedido</th><th>Cliente</th><th>Emissão</th><th>Entrega</th>
                  <th className="num">Peças</th><th className="num">Valor</th>
                  <th className="num">Espera</th><th className="num">OPs abertas</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id}>
                    {escreve && (
                      <td>
                        <input
                          type="checkbox"
                          style={{ width: 'auto' }}
                          checked={marcados.includes(p.id)}
                          onChange={() => setMarcados((a) =>
                            a.includes(p.id) ? a.filter((x) => x !== p.id) : [...a, p.id])}
                        />
                      </td>
                    )}
                    <td><Link to={`/pedidos/${p.id}`} className="mono">{p.numero}</Link></td>
                    <td title={p.cliente}>{p.cliente.slice(0, 28)}</td>
                    <td>{data(p.data_pedido)}</td>
                    <td>{data(p.data_entrega)}</td>
                    <td className="num">{decimal(p.pecas)}</td>
                    <td className="num">{moeda(p.valor)}</td>
                    <td className="num"><Etiqueta texto={`${p.dias_atraso}d`} tom="vermelha" /></td>
                    <td className="num">{p.ordens_abertas || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {escreve && (
            <div className="rodape-lista">
              <span>
                {marcados.length > 0
                  ? `${marcados.length} pedido(s) · ${moeda(valorMarcado)}`
                  : 'Marque os que já foram entregues de fato.'}
              </span>
              <button className="primario" disabled={marcados.length === 0 || ocupado} onClick={encerrar}>
                Dar baixa nos marcados
              </button>
            </div>
          )}
        </>
      )}
    </Cartao>
  );
}

/* ------------------------------------------------------------------ datas */

function Datas({ chave, aoMudar }: { chave: number; aoMudar: () => void }) {
  const [falha, setFalha] = useState('');
  const [ocupado, setOcupado] = useState(0);
  const [manual, setManual] = useState<Record<number, string>>({});
  const { dados, carregando, erro, recarregar } = useApi<DataInvertida[]>('/qualidade/datas', [chave]);

  const escreve = pode('qualidade');
  const lista = dados ?? [];

  async function aplicar(d: DataInvertida) {
    const nova = manual[d.item_id] || d.sugestao;
    if (!nova) return setFalha('Informe a data de entrega correta.');
    setOcupado(d.item_id);
    setFalha('');
    try {
      await api.put(`/qualidade/datas/${d.item_id}`, { data: nova });
      recarregar();
      aoMudar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível corrigir');
    } finally {
      setOcupado(0);
    }
  }

  return (
    <Cartao titulo="Entrega marcada antes da venda">
      <p className="ajuda" style={{ color: 'var(--texto-fraco)', fontSize: 13, marginTop: 0 }}>
        Pedido de dezembro com entrega em janeiro do mesmo ano: é o ano digitado errado. É o que
        faz um pedido aparecer com centenas de dias de atraso.
      </p>

      {carregando && <Carregando />}
      <Aviso tipo="erro">{falha || erro}</Aviso>
      {!carregando && lista.length === 0 && <Vazio texto="Nenhuma entrega anterior ao pedido." />}

      {lista.length > 0 && (
        <div className="tabela-rolagem" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Pedido</th><th>Cliente</th><th>Produto</th>
                <th>Emissão</th><th>Entrega gravada</th>
                <th style={{ width: 160 }}>Corrigir para</th><th />
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <tr key={d.item_id}>
                  <td><Link to={`/pedidos/${d.pedido_id}`} className="mono">{d.numero}</Link></td>
                  <td title={d.cliente}>{d.cliente.slice(0, 22)}</td>
                  <td title={d.produto}>{d.produto.slice(0, 26)}</td>
                  <td>{data(d.data_pedido)}</td>
                  <td>
                    {data(d.data_entrega)}
                    <div><Etiqueta texto={`${d.dias}d antes`} tom="vermelha" /></div>
                  </td>
                  <td>
                    <input
                      type="date"
                      min={d.data_pedido}
                      value={manual[d.item_id] ?? d.sugestao ?? ''}
                      disabled={!escreve}
                      onChange={(e) => setManual((m) => ({ ...m, [d.item_id]: e.target.value }))}
                    />
                  </td>
                  <td>
                    {escreve && (
                      <button className="pequeno primario" disabled={ocupado === d.item_id}
                        onClick={() => aplicar(d)}>
                        Corrigir
                      </button>
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

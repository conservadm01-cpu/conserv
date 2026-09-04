import { useEffect, useState } from 'react';
import { api, ApiError, pode } from '../lib/api';
import { useApi } from '../lib/hooks';
import { BarraFiltros, useFiltros, type CampoFiltro } from '../components/Filtros';
import { moeda, moedaCurta, numero, data, decimal, hoje } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Campo, Indicador, Etiqueta, Modal } from '../components/ui';
import type {
  ResumoComercial, ColunaFunil, Oportunidade, EtapaFunil, Cliente, Simples, Orcamento,
} from '../tipos';

const ORIGENS = [
  { valor: 'INDICACAO', rotulo: 'Indicação' },
  { valor: 'CLIENTE_ATIVO', rotulo: 'Cliente ativo' },
  { valor: 'SITE', rotulo: 'Site' },
  { valor: 'REDES', rotulo: 'Redes sociais' },
  { valor: 'FEIRA', rotulo: 'Feira' },
  { valor: 'PROSPECCAO', rotulo: 'Prospecção' },
  { valor: 'OUTRO', rotulo: 'Outro' },
];

const TIPOS_INTERACAO = [
  { valor: 'LIGACAO', rotulo: 'Ligação' },
  { valor: 'VISITA', rotulo: 'Visita' },
  { valor: 'REUNIAO', rotulo: 'Reunião' },
  { valor: 'WHATSAPP', rotulo: 'WhatsApp' },
  { valor: 'EMAIL', rotulo: 'E-mail' },
  { valor: 'PROPOSTA', rotulo: 'Proposta' },
  { valor: 'OUTRO', rotulo: 'Outro' },
];

export default function Crm() {
  const [aba, setAba] = useState<'Funil' | 'Oportunidades'>('Funil');
  const [aberta, setAberta] = useState<number | null>(null);
  const [nova, setNova] = useState(false);
  const [editando, setEditando] = useState<Oportunidade | null>(null);
  const [recarga, setRecarga] = useState(0);

  const { dados: etapas } = useApi<EtapaFunil[]>('/crm/etapas-funil');
  const atualizar = () => setRecarga((n) => n + 1);

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Funil comercial</h1>
          <p>Oportunidades em aberto, com o valor ponderado pela chance de fechar</p>
        </div>
        {pode('crm.editar') && (
          <div className="acoes">
            <button className="primario" onClick={() => setNova(true)}>Nova oportunidade</button>
          </div>
        )}
      </header>

      <div className="abas">
        {(['Funil', 'Oportunidades'] as const).map((a) => (
          <button key={a} className={`aba${aba === a ? ' ativa' : ''}`} onClick={() => setAba(a)}>{a}</button>
        ))}
      </div>

      {aba === 'Funil' && <Quadro chave={recarga} aoAbrir={setAberta} />}
      {aba === 'Oportunidades' && (
        <Lista chave={recarga} etapas={etapas ?? []} aoAbrir={setAberta} aoEditar={setEditando} aoMudar={atualizar} />
      )}

      <DetalheOportunidade
        id={aberta}
        etapas={etapas ?? []}
        aoFechar={() => setAberta(null)}
        aoMudar={atualizar}
      />
      <NovaOportunidade
        aberto={nova}
        oportunidade={editando}
        etapas={etapas ?? []}
        aoFechar={() => { setNova(false); setEditando(null); }}
        aoSalvar={() => { setNova(false); setEditando(null); atualizar(); }}
      />
    </>
  );
}

/** Kanban do funil: uma coluna por etapa aberta. */
function Quadro({ chave, aoAbrir }: { chave: number; aoAbrir: (id: number) => void }) {
  const { dados: resumo, carregando, erro } = useApi<ResumoComercial>('/crm/resumo', [chave]);

  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!resumo) return null;

  return (
    <>

      <div className="grade c4">
        <Indicador rotulo="Em aberto" valor={numero(resumo.abertas)}
          nota={`${moeda(resumo.valor_aberto)} em jogo`} />
        <Indicador rotulo="Valor ponderado" valor={moedaCurta(resumo.valor_ponderado)}
          nota="pela probabilidade de cada etapa" />
        <Indicador rotulo="Taxa de conversão" valor={`${decimal(resumo.conversao)}%`}
          tom={resumo.conversao >= 50 ? 'sucesso' : undefined}
          nota={`${resumo.ganhas} ganhas · ${resumo.perdidas} perdidas`} />
        <Indicador rotulo="Paradas há 14+ dias" valor={numero(resumo.paradas.length)}
          tom={resumo.paradas.length > 0 ? 'perigo' : 'sucesso'}
          nota="sem interação registrada" />
      </div>

      <div className="quadro">
        {resumo.funil.filter((c) => c.etapa.tipo === 'ABERTA').map((coluna) => (
          <ColunaKanban key={coluna.etapa.id} coluna={coluna} aoAbrir={aoAbrir} />
        ))}
      </div>

      <div className="grade c2">
        <Cartao titulo="Próximos contatos" acao={<small>o que ficou combinado</small>}>
          {resumo.agenda.length === 0 ? <Vazio texto="Nada agendado." /> : (
            <div className="tabela-rolagem">
              <table>
                <thead><tr><th>Quando</th><th>Cliente</th><th>Próximo passo</th><th>Origem</th></tr></thead>
                <tbody>
                  {resumo.agenda.map((a) => (
                    <tr key={a.id} className={a.proxima_data && a.proxima_data < hoje() ? '' : ''}>
                      <td>
                        {data(a.proxima_data)}
                        {a.proxima_data && a.proxima_data < hoje() && <> <Etiqueta texto="atrasado" tom="vermelha" /></>}
                      </td>
                      <td>{a.parte ?? '—'}</td>
                      <td>{a.proximo_passo ?? a.resumo.slice(0, 40)}</td>
                      <td>
                        {a.oportunidade_id
                          ? <button className="pequeno" onClick={() => aoAbrir(a.oportunidade_id!)}>abrir</button>
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>

        <Cartao titulo="Por que perdemos" acao={<small>motivos declarados no fechamento</small>}>
          {resumo.motivos_perda.length === 0 ? <Vazio texto="Nenhuma perda registrada com motivo." /> : (
            <table>
              <thead><tr><th>Motivo</th><th className="num">Negócios</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {resumo.motivos_perda.map((m) => (
                  <tr key={m.motivo}>
                    <td>{m.motivo}</td>
                    <td className="num">{m.total}</td>
                    <td className="num">{moeda(m.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cartao>
      </div>

      {resumo.paradas.length > 0 && (
        <Cartao titulo="Oportunidades paradas" acao={<small>sem movimento há mais de duas semanas</small>}>
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr><th>Negócio</th><th>Cliente</th><th>Etapa</th><th>Vendedor</th>
                  <th className="num">Valor</th><th className="num">Parada há</th><th /></tr>
              </thead>
              <tbody>
                {resumo.paradas.map((o) => (
                  <tr key={o.id} className="">
                    <td>{o.titulo.slice(0, 40)}</td>
                    <td>{o.parte ?? '—'}</td>
                    <td>{resumo.funil.find((c) => c.etapa.id === o.etapa_id)?.etapa.nome}</td>
                    <td>{o.vendedor ?? '—'}</td>
                    <td className="num">{moeda(o.valor_estimado)}</td>
                    <td className="num"><Etiqueta texto={`${o.dias_parada}d`} tom="amarela" /></td>
                    <td><button className="pequeno" onClick={() => aoAbrir(o.id)}>abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}

    </>
  );
}

/** Lista filtrável: o mesmo funil visto como tabela, com edição e exclusão. */
function Lista({ chave, etapas, aoAbrir, aoEditar, aoMudar }: {
  chave: number; etapas: EtapaFunil[];
  aoAbrir: (id: number) => void; aoEditar: (o: Oportunidade) => void; aoMudar: () => void;
}) {
  const [falha, setFalha] = useState('');
  const { dados: vendedores } = useApi<Simples[]>('/vendedores?ativo=true');
  const filtros = useFiltros('/crm/oportunidades', { abertas: 'true', limite: '400' });
  const { dados, carregando, erro, recarregar } = useApi<Oportunidade[]>(
    filtros.caminho, [filtros.caminho, chave]
  );

  const escreve = pode('crm.editar');
  const lista = dados ?? [];
  const total = lista.reduce((s, o) => s + o.valor_estimado, 0);

  const campos: CampoFiltro[] = [
    { chave: 'busca', rotulo: 'Negócio, cliente ou observação', tipo: 'busca' },
    { chave: 'etapa_id', rotulo: 'Etapa', tipo: 'select',
      opcoes: etapas.map((e) => ({ valor: e.id, rotulo: e.nome })) },
    { chave: 'vendedor_id', rotulo: 'Vendedor', tipo: 'select',
      opcoes: (vendedores ?? []).map((v) => ({ valor: v.id, rotulo: v.nome })) },
    { chave: 'origem', rotulo: 'Origem', tipo: 'select', opcoes: ORIGENS.map((o) => ({ valor: o.valor, rotulo: o.rotulo })) },
    { chave: 'previsao_de', rotulo: 'Previsão de', tipo: 'data' },
    { chave: 'previsao_ate', rotulo: 'até', tipo: 'data' },
    { chave: 'valor_min', rotulo: 'Valor mínimo', tipo: 'numero' },
    { chave: 'abertas', rotulo: 'só em aberto', tipo: 'marcar' },
    { chave: 'paradas', rotulo: 'só paradas', tipo: 'marcar' },
  ];

  async function excluir(o: Oportunidade) {
    if (!confirm(`Excluir a oportunidade "${o.titulo}"? As interações registradas somem junto.`)) return;
    setFalha('');
    try {
      await api.delete(`/crm/oportunidades/${o.id}`);
      recarregar();
      aoMudar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível remover');
    }
  }

  return (
    <>
      <div className="grade c3">
        <Indicador rotulo="Oportunidades listadas" valor={numero(lista.length)} />
        <Indicador rotulo="Valor em jogo" valor={moeda(total)} />
        <Indicador rotulo="Paradas há 14+ dias"
          valor={numero(lista.filter((o) => (o.dias_parada ?? 0) >= 14).length)} />
      </div>

      <Cartao titulo="Oportunidades">
        <BarraFiltros campos={campos} valores={filtros.valores} aoMudar={filtros.definir}
          aoLimpar={filtros.limpar} ativos={filtros.ativos} />

        {carregando && <Carregando />}
        <Aviso tipo="erro">{falha || erro}</Aviso>
        {!carregando && lista.length === 0 && <Vazio texto="Nenhuma oportunidade com estes filtros." />}
        {lista.length > 0 && (
          <div className="tabela-rolagem" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Negócio</th><th>Cliente</th><th>Etapa</th><th>Vendedor</th><th>Origem</th>
                  <th className="num">Valor</th><th>Previsão</th><th className="num">Parada</th><th />
                </tr>
              </thead>
              <tbody>
                {lista.map((o) => (
                  <tr key={o.id}>
                    <td title={o.titulo}>{o.titulo.slice(0, 38)}</td>
                    <td>{o.parte ?? '—'}</td>
                    <td><Etiqueta texto={o.etapa ?? '—'} tom={o.etapa_tipo === 'GANHA' ? 'verde' : o.etapa_tipo === 'PERDIDA' ? 'vermelha' : 'azul'} /></td>
                    <td>{o.vendedor ?? '—'}</td>
                    <td><span className="sub">{ORIGENS.find((x) => x.valor === o.origem)?.rotulo ?? o.origem}</span></td>
                    <td className="num">{moeda(o.valor_estimado)}</td>
                    <td>{data(o.previsao_fechamento)}</td>
                    <td className="num">
                      {(o.dias_parada ?? 0) >= 14
                        ? <Etiqueta texto={`${o.dias_parada}d`} tom="amarela" />
                        : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="pequeno" onClick={() => aoAbrir(o.id)}>Abrir</button>{' '}
                      {escreve && (
                        <>
                          <button className="pequeno" onClick={() => aoEditar(o)}>Editar</button>{' '}
                          <button className="pequeno perigo" onClick={() => excluir(o)}>Excluir</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="rodape-lista"><span>{lista.length} oportunidade(s)</span></div>
      </Cartao>
    </>
  );
}

function ColunaKanban({ coluna, aoAbrir }: { coluna: ColunaFunil; aoAbrir: (id: number) => void }) {
  return (
    <div className="coluna">
      <div className="coluna-cabeca">
        <div>
          <strong>{coluna.etapa.nome}</strong>
          <div style={{ fontSize: 11, color: 'var(--texto-suave)' }}>
            {moedaCurta(coluna.valor)} · {coluna.etapa.probabilidade}%
          </div>
        </div>
        <span className="etiqueta">{coluna.total}</span>
      </div>
      <div className="coluna-corpo">
        {coluna.oportunidades.length === 0 && (
          <div style={{ padding: 12, color: 'var(--texto-suave)', fontSize: 12.5 }}>Sem negócios</div>
        )}
        {coluna.oportunidades.map((o) => (
          <div
            key={o.id}
            className={`ficha${(o.dias_parada ?? 0) >= 14 ? ' atrasada' : ''}`}
            onClick={() => aoAbrir(o.id)}
          >
            <b title={o.titulo}>{o.titulo.slice(0, 42)}</b>
            <div style={{ color: 'var(--texto-fraco)', fontSize: 12 }}>{o.parte ?? '—'}</div>
            <div className="meta">
              <span>{moeda(o.valor_estimado)}</span>
              <span>
                {(o.dias_parada ?? 0) >= 14
                  ? <span style={{ color: 'var(--perigo)' }}>{o.dias_parada}d parada</span>
                  : data(o.previsao_fechamento)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetalheOportunidade({ id, etapas, aoFechar, aoMudar }: {
  id: number | null; etapas: EtapaFunil[]; aoFechar: () => void; aoMudar: () => void;
}) {
  const { dados, recarregar } = useApi<Oportunidade>(id ? `/crm/oportunidades/${id}` : null, [id]);
  const [tipo, setTipo] = useState('LIGACAO');
  const [resumo, setResumo] = useState('');
  const [proximoPasso, setProximoPasso] = useState('');
  const [proximaData, setProximaData] = useState('');
  const [motivoPerda, setMotivoPerda] = useState('');
  const [erro, setErro] = useState('');

  async function mover(etapaId: number) {
    const etapa = etapas.find((e) => e.id === etapaId);
    if (etapa?.tipo === 'PERDIDA' && !motivoPerda.trim()) {
      return setErro('Informe o motivo da perda antes de mover para esta etapa.');
    }
    setErro('');
    try {
      await api.put(`/crm/oportunidades/${id}/etapa`, {
        etapa_id: etapaId,
        motivo_perda: motivoPerda.trim() || null,
      });
      recarregar();
      aoMudar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível mover');
    }
  }

  async function registrar() {
    if (resumo.trim().length < 3) return setErro('Escreva o que aconteceu.');
    setErro('');
    try {
      await api.post('/crm/interacoes', {
        oportunidade_id: id,
        tipo,
        resumo: resumo.trim(),
        proximo_passo: proximoPasso.trim() || null,
        proxima_data: proximaData || null,
      });
      setResumo(''); setProximoPasso(''); setProximaData('');
      recarregar();
      aoMudar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível registrar');
    }
  }

  const podeEditar = pode('crm.editar');

  return (
    <Modal
      titulo={dados?.titulo ?? 'Oportunidade'}
      aberto={Boolean(id)}
      aoFechar={aoFechar}
      largo
      rodape={<button onClick={aoFechar}>Fechar</button>}
    >
      <Aviso tipo="erro">{erro}</Aviso>
      {!dados ? <Carregando /> : (
        <>
          <p style={{ marginTop: 0, color: 'var(--texto-fraco)' }}>
            {dados.parte}
            {dados.vendedor && ` · ${dados.vendedor}`}
            {' · '}origem {ORIGENS.find((o) => o.valor === dados.origem)?.rotulo ?? dados.origem}
            {dados.contato && ` · ${dados.contato}`}
            {dados.telefone && ` · ${dados.telefone}`}
          </p>

          <div className="grade c3">
            <Indicador rotulo="Valor estimado" valor={moeda(dados.valor_estimado)} />
            <Indicador rotulo="Probabilidade" valor={`${dados.probabilidade ?? dados.probabilidade_etapa}%`}
              nota={dados.etapa} />
            <Indicador rotulo="Previsão" valor={data(dados.previsao_fechamento)}
              nota={dados.fechada_em ? `fechada em ${data(dados.fechada_em)}` : ''} />
          </div>

          {dados.motivo_perda && <Aviso tipo="erro">Perdida: {dados.motivo_perda}</Aviso>}

          {podeEditar && dados.etapa_tipo === 'ABERTA' && (
            <>
              <h4 style={{ margin: '18px 0 8px', fontSize: 13.5 }}>Mover para</h4>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {etapas.map((e) => (
                  <button key={e.id} className="pequeno" disabled={e.id === dados.etapa_id}
                    onClick={() => mover(e.id)}>
                    {e.nome}
                  </button>
                ))}
              </div>
              <Campo rotulo="Motivo, se for perda">
                <input value={motivoPerda} onChange={(ev) => setMotivoPerda(ev.target.value)}
                  placeholder="Preço, prazo, concorrente…" />
              </Campo>
            </>
          )}

          {dados.orcamentos && dados.orcamentos.length > 0 && (
            <>
              <h4 style={{ margin: '18px 0 8px', fontSize: 13.5 }}>Orçamentos</h4>
              <table>
                <thead>
                  <tr><th>Número</th><th>Data</th><th className="num">Valor</th><th>Situação</th></tr>
                </thead>
                <tbody>
                  {dados.orcamentos.map((o: Orcamento) => (
                    <tr key={o.id}>
                      <td>{o.numero}</td>
                      <td>{data(o.data)}</td>
                      <td className="num">{moeda(o.valor_total)}</td>
                      <td><Etiqueta texto={o.status.replace('_', ' ').toLowerCase()}
                        tom={o.status === 'APROVADO' ? 'verde' : o.status === 'RECUSADO' ? 'vermelha' : 'azul'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h4 style={{ margin: '18px 0 8px', fontSize: 13.5 }}>Histórico</h4>
          {dados.interacoes?.length === 0 && <Vazio texto="Nenhuma interação registrada." />}
          {dados.interacoes && dados.interacoes.length > 0 && (
            <div className="tabela-rolagem" style={{ maxHeight: 220, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Data</th><th>Tipo</th><th>O que aconteceu</th><th>Próximo passo</th></tr></thead>
                <tbody>
                  {dados.interacoes.map((i) => (
                    <tr key={i.id}>
                      <td>{data(i.data)}</td>
                      <td>{TIPOS_INTERACAO.find((t) => t.valor === i.tipo)?.rotulo ?? i.tipo}</td>
                      <td>{i.resumo}</td>
                      <td>
                        {i.proximo_passo ?? '—'}
                        {i.proxima_data && <div style={{ fontSize: 11.5, color: 'var(--texto-suave)' }}>{data(i.proxima_data)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {podeEditar && (
            <>
              <h4 style={{ margin: '18px 0 8px', fontSize: 13.5 }}>Registrar contato</h4>
              <div className="linha-campos">
                <Campo rotulo="Tipo">
                  <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    {TIPOS_INTERACAO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Próximo passo">
                  <input value={proximoPasso} onChange={(e) => setProximoPasso(e.target.value)} />
                </Campo>
                <Campo rotulo="Quando">
                  <input type="date" value={proximaData} onChange={(e) => setProximaData(e.target.value)} />
                </Campo>
              </div>
              <Campo rotulo="O que aconteceu">
                <textarea rows={3} value={resumo} onChange={(e) => setResumo(e.target.value)} />
              </Campo>
              <button className="primario" onClick={registrar}>Registrar</button>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function NovaOportunidade({ aberto, oportunidade = null, etapas, aoFechar, aoSalvar }: {
  aberto: boolean; oportunidade?: Oportunidade | null; etapas: EtapaFunil[];
  aoFechar: () => void; aoSalvar: () => void;
}) {
  const visivel = aberto || Boolean(oportunidade);
  const { dados: clientes } = useApi<Cliente[]>(visivel ? '/clientes?ativo=true' : null);
  const { dados: vendedores } = useApi<Simples[]>(visivel ? '/vendedores?ativo=true' : null);

  const [titulo, setTitulo] = useState('');
  const [clienteId, setClienteId] = useState<number | ''>('');
  const [prospect, setProspect] = useState('');
  const [contato, setContato] = useState('');
  const [telefone, setTelefone] = useState('');
  const [vendedorId, setVendedorId] = useState<number | ''>('');
  const [etapaId, setEtapaId] = useState<number | ''>('');
  const [origem, setOrigem] = useState('INDICACAO');
  const [valor, setValor] = useState('');
  const [previsao, setPrevisao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const primeiraAberta = etapas.find((e) => e.tipo === 'ABERTA');

  useEffect(() => {
    if (!visivel) return;
    setTitulo(oportunidade?.titulo ?? '');
    setClienteId(oportunidade?.cliente_id ?? '');
    setProspect(oportunidade?.prospect ?? '');
    setContato(oportunidade?.contato ?? '');
    setTelefone(oportunidade?.telefone ?? '');
    setVendedorId(oportunidade?.vendedor_id ?? '');
    setEtapaId(oportunidade?.etapa_id ?? '');
    setOrigem(oportunidade?.origem ?? 'INDICACAO');
    setValor(oportunidade ? String(oportunidade.valor_estimado) : '');
    setPrevisao(oportunidade?.previsao_fechamento ?? '');
    setErro('');
  }, [visivel, oportunidade]);

  async function salvar() {
    if (!titulo.trim()) return setErro('Descreva o negócio.');
    if (!clienteId && !prospect.trim()) return setErro('Escolha o cliente ou informe o prospect.');
    setSalvando(true);
    setErro('');
    const corpo = {
      titulo: titulo.trim(),
      cliente_id: clienteId ? Number(clienteId) : null,
      prospect: prospect.trim() || null,
      contato: contato.trim() || null,
      telefone: telefone.trim() || null,
      vendedor_id: vendedorId ? Number(vendedorId) : null,
      etapa_id: Number(etapaId || primeiraAberta?.id),
      origem,
      valor_estimado: Number(valor) || 0,
      previsao_fechamento: previsao || null,
    };
    try {
      if (oportunidade) await api.put(`/crm/oportunidades/${oportunidade.id}`, corpo);
      else await api.post('/crm/oportunidades', corpo);
      setTitulo(''); setProspect(''); setValor(''); setContato('');
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível criar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={oportunidade ? 'Editar oportunidade' : 'Nova oportunidade'}
      aberto={visivel}
      aoFechar={aoFechar}
      rodape={
        <>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : oportunidade ? 'Salvar' : 'Criar'}
          </button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      <Campo rotulo="Negócio">
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ex.: Uniforme da equipe de loja" autoFocus />
      </Campo>
      <div className="linha-campos">
        <Campo rotulo="Cliente">
          <select value={clienteId} onChange={(e) => setClienteId(Number(e.target.value) || '')}>
            <option value="">— prospect novo —</option>
            {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Prospect (se ainda não é cliente)">
          <input value={prospect} onChange={(e) => setProspect(e.target.value)} disabled={Boolean(clienteId)} />
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Contato"><input value={contato} onChange={(e) => setContato(e.target.value)} /></Campo>
        <Campo rotulo="Telefone"><input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></Campo>
        <Campo rotulo="Vendedor">
          <select value={vendedorId} onChange={(e) => setVendedorId(Number(e.target.value) || '')}>
            <option value="">—</option>
            {vendedores?.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Etapa">
          <select value={etapaId || primeiraAberta?.id || ''} onChange={(e) => setEtapaId(Number(e.target.value) || '')}>
            {etapas.filter((e) => e.tipo === 'ABERTA').map((e) => (
              <option key={e.id} value={e.id}>{e.nome} ({e.probabilidade}%)</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Origem">
          <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
            {ORIGENS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Valor estimado">
          <input type="number" min="0" step="any" value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>
        <Campo rotulo="Previsão de fechamento">
          <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />
        </Campo>
      </div>
    </Modal>
  );
}

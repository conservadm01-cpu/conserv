import { useState } from 'react';
import { api, ApiError, pode } from '../lib/api';
import { useApi } from '../lib/hooks';
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
  const [aberta, setAberta] = useState<number | null>(null);
  const [nova, setNova] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const { dados: resumo, carregando, erro } = useApi<ResumoComercial>('/crm/resumo', [recarga]);
  const { dados: etapas } = useApi<EtapaFunil[]>('/crm/etapas-funil');

  const atualizar = () => setRecarga((n) => n + 1);

  if (carregando) return <Carregando />;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!resumo) return null;

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
          <ColunaKanban key={coluna.etapa.id} coluna={coluna} aoAbrir={setAberta} />
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
                          ? <button className="pequeno" onClick={() => setAberta(a.oportunidade_id!)}>abrir</button>
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
                    <td><button className="pequeno" onClick={() => setAberta(o.id)}>abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}

      <DetalheOportunidade
        id={aberta}
        etapas={etapas ?? []}
        aoFechar={() => setAberta(null)}
        aoMudar={atualizar}
      />
      <NovaOportunidade
        aberto={nova}
        etapas={etapas ?? []}
        aoFechar={() => setNova(false)}
        aoSalvar={() => { setNova(false); atualizar(); }}
      />
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

function NovaOportunidade({ aberto, etapas, aoFechar, aoSalvar }: {
  aberto: boolean; etapas: EtapaFunil[]; aoFechar: () => void; aoSalvar: () => void;
}) {
  const { dados: clientes } = useApi<Cliente[]>(aberto ? '/clientes?ativo=true' : null);
  const { dados: vendedores } = useApi<Simples[]>(aberto ? '/vendedores?ativo=true' : null);

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

  async function salvar() {
    if (!titulo.trim()) return setErro('Descreva o negócio.');
    if (!clienteId && !prospect.trim()) return setErro('Escolha o cliente ou informe o prospect.');
    setSalvando(true);
    setErro('');
    try {
      await api.post('/crm/oportunidades', {
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
      });
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
      titulo="Nova oportunidade"
      aberto={aberto}
      aoFechar={aoFechar}
      rodape={
        <>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Criando…' : 'Criar'}
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

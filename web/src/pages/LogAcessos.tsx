import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/hooks';
import { data, numero } from '../lib/formato';
import { BarraFiltros, useFiltros, type CampoFiltro } from '../components/Filtros';
import { Cartao, Carregando, Aviso, Vazio, Indicador, Etiqueta } from '../components/ui';
import type { EventoSenha, LinhaLogSenha, ResumoAcessos, SituacaoAcesso } from '../tipos';

const EVENTOS: Record<EventoSenha, { rotulo: string; tom: string }> = {
  CRIACAO: { rotulo: 'Acesso criado', tom: 'azul' },
  PROVISORIA: { rotulo: 'Senha provisória', tom: 'amarela' },
  PRIMEIRO_ACESSO: { rotulo: 'Primeiro acesso', tom: 'verde' },
  TROCA: { rotulo: 'Senha trocada', tom: 'verde' },
  RESET: { rotulo: 'Redefinida pelo admin', tom: 'amarela' },
  LOGIN: { rotulo: 'Entrada', tom: '' },
  FALHA: { rotulo: 'Tentativa recusada', tom: 'vermelha' },
  BLOQUEIO: { rotulo: 'Acesso inativo', tom: 'vermelha' },
};

/** Data e hora do log, que vem como "AAAA-MM-DD HH:MM:SS" em UTC do SQLite. */
const quando = (iso: string) => `${data(iso.slice(0, 10))} ${iso.slice(11, 16)}`;

export default function LogAcessos() {
  const [aba, setAba] = useState<'Situação' | 'Histórico'>('Situação');
  const { dados: resumo } = useApi<ResumoAcessos>('/usuarios/log-senhas/resumo');

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Acessos e senhas</h1>
          <p>
            Quem entrou, quem trocou a senha e quem tentou sem conseguir. A senha em si nunca é
            guardada aqui — só o que aconteceu com ela
          </p>
        </div>
      </header>

      {resumo && (
        <div className="grade c4">
          <Indicador rotulo="Senhas provisórias em aberto" valor={numero(resumo.provisorias)}
            nota="aguardando a primeira entrada"
            tom={resumo.provisorias > 0 ? 'perigo' : 'sucesso'} />
          <Indicador rotulo="Tentativas recusadas em 24h" valor={numero(resumo.falhas_24h)}
            tom={resumo.falhas_24h > 5 ? 'perigo' : undefined} />
          <Indicador rotulo="Nunca entraram" valor={numero(resumo.nunca_entraram)} />
          <Indicador rotulo="Sem trocar há 6 meses" valor={numero(resumo.sem_troca)}
            tom={resumo.sem_troca > 0 ? 'perigo' : 'sucesso'} />
        </div>
      )}

      <div className="abas">
        {(['Situação', 'Histórico'] as const).map((a) => (
          <button key={a} className={`aba${aba === a ? ' ativa' : ''}`} onClick={() => setAba(a)}>{a}</button>
        ))}
      </div>

      {aba === 'Situação' && <Situacao />}
      {aba === 'Histórico' && <Historico />}
    </>
  );
}

/* ------------------------------------------------------------- situação */

function Situacao() {
  const [falha, setFalha] = useState('');
  const [ocupado, setOcupado] = useState(0);
  const { dados, carregando, erro, recarregar } = useApi<SituacaoAcesso[]>('/usuarios/situacao');
  const lista = dados ?? [];

  /**
   * Uma senha provisória fácil de ditar por telefone — e que morre na entrada.
   * Sai só uma vez, aqui na tela: nem o log guarda.
   */
  async function sortear(u: SituacaoAcesso) {
    const senha = String(Math.floor(100000 + Math.random() * 900000));
    if (!confirm(`Gerar nova senha provisória para ${u.nome}?\n\nA senha atual deixa de valer.`)) return;
    setOcupado(u.id);
    setFalha('');
    try {
      await api.put(`/usuarios/${u.id}/senha`, { senha, provisoria: true });
      recarregar();
      alert(`Senha provisória de ${u.nome}: ${senha}\n\n`
        + 'Anote agora e entregue à pessoa — ela não é mostrada de novo, e o sistema exige a '
        + 'troca na primeira entrada.');
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível gerar');
    } finally {
      setOcupado(0);
    }
  }

  return (
    <Cartao titulo="Situação do acesso de cada pessoa">
      {carregando && <Carregando />}
      <Aviso tipo="erro">{falha || erro}</Aviso>
      {!carregando && lista.length === 0 && <Vazio texto="Nenhum usuário cadastrado." />}
      {lista.length > 0 && (
        <div className="tabela-rolagem" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Pessoa</th><th>E-mail</th><th>Colaborador</th>
                <th>Senha</th><th>Última troca</th><th>Último acesso</th>
                <th className="num">Recusas 7d</th><th />
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} className={u.ativo ? undefined : 'apagada'}>
                  <td>
                    {u.nome}
                    <div className="sub">{u.perfil} · {u.nivel_acesso}</div>
                  </td>
                  <td className="mono">{u.email}</td>
                  <td>
                    {u.colaborador ?? <span className="sub">sem vínculo</span>}
                    {u.cargo && <div className="sub">{u.cargo}</div>}
                  </td>
                  <td>
                    {!u.ativo ? <Etiqueta texto="inativo" tom="vermelha" />
                      : u.senha_provisoria ? <Etiqueta texto="provisória" tom="amarela" />
                      : <Etiqueta texto="definida" tom="verde" />}
                  </td>
                  <td>{u.senha_alterada_em ? quando(u.senha_alterada_em) : <span className="sub">nunca</span>}</td>
                  <td>
                    {u.ultimo_acesso
                      ? quando(u.ultimo_acesso)
                      : <Etiqueta texto="nunca entrou" tom="amarela" />}
                  </td>
                  <td className="num">
                    {u.falhas_7d > 0 ? <Etiqueta texto={String(u.falhas_7d)} tom="vermelha" /> : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="pequeno" disabled={ocupado === u.id || !u.ativo}
                      onClick={() => sortear(u)}>
                      Gerar provisória
                    </button>
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

/* ------------------------------------------------------------ histórico */

function Historico() {
  const { dados: pessoas } = useApi<SituacaoAcesso[]>('/usuarios/situacao');
  const filtros = useFiltros('/usuarios/log-senhas', { limite: '400' });
  const { dados, carregando, erro } = useApi<LinhaLogSenha[]>(filtros.caminho, [filtros.caminho]);
  const lista = dados ?? [];

  const campos: CampoFiltro[] = [
    { chave: 'usuario_id', rotulo: 'Pessoa', tipo: 'select',
      opcoes: (pessoas ?? []).map((p) => ({ valor: p.id, rotulo: p.nome })) },
    { chave: 'evento', rotulo: 'Evento', tipo: 'select',
      opcoes: Object.entries(EVENTOS).map(([v, e]) => ({ valor: v, rotulo: e.rotulo })) },
    { chave: 'de', rotulo: 'De', tipo: 'data' },
    { chave: 'ate', rotulo: 'até', tipo: 'data' },
  ];

  return (
    <Cartao
      titulo="Histórico"
      acao={<small>a senha nunca é registrada — só o evento, quem fez e de onde</small>}
    >
      <BarraFiltros campos={campos} valores={filtros.valores} aoMudar={filtros.definir}
        aoLimpar={filtros.limpar} ativos={filtros.ativos} />

      {carregando && <Carregando />}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!carregando && lista.length === 0 && <Vazio texto="Nada registrado com estes filtros." />}
      {lista.length > 0 && (
        <div className="tabela-rolagem" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr><th>Quando</th><th>Pessoa</th><th>Evento</th><th>O que houve</th>
                <th>Feito por</th><th>Origem</th></tr>
            </thead>
            <tbody>
              {lista.map((l) => {
                const e = EVENTOS[l.evento] ?? { rotulo: l.evento, tom: '' };
                return (
                  <tr key={l.id}>
                    <td className="mono">{quando(l.criado_em)}</td>
                    <td>
                      {l.usuario_nome}
                      {l.usuario_id === null && <div className="sub">cadastro removido</div>}
                    </td>
                    <td><Etiqueta texto={e.rotulo} tom={e.tom} /></td>
                    <td><span className="sub">{l.detalhe ?? '—'}</span></td>
                    <td>{l.autor_nome ?? <span className="sub">a própria pessoa</span>}</td>
                    <td className="mono" title={l.agente ?? ''}>{l.origem ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="rodape-lista"><span>{lista.length} evento(s)</span></div>
    </Cartao>
  );
}

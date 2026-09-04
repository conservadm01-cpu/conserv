import { useEffect, useState } from 'react';
import { api, ApiError, sessao } from '../lib/api';
import { useApi } from '../lib/hooks';
import { data } from '../lib/formato';
import { Cartao, Carregando, Aviso, Vazio, Campo, Modal, Etiqueta, Indicador } from '../components/ui';
import type { CatalogoPermissoes, UsuarioSistema, PermissoesUsuario, Colaborador } from '../tipos';

const PERFIS = ['ADMIN', 'GESTOR', 'PCP', 'ALMOXARIFE', 'VENDEDOR', 'OPERADOR'];

export default function Permissoes() {
  const { dados: catalogo } = useApi<CatalogoPermissoes>('/auth/areas');
  const { dados: usuarios, carregando, erro, recarregar } = useApi<UsuarioSistema[]>('/usuarios');
  const [editando, setEditando] = useState<UsuarioSistema | null>(null);
  const [novo, setNovo] = useState(false);
  const [senhaDe, setSenhaDe] = useState<UsuarioSistema | null>(null);
  const [falha, setFalha] = useState('');

  const eu = sessao.usuario();

  async function alternarAtivo(u: UsuarioSistema) {
    setFalha('');
    try {
      await api.put(`/usuarios/${u.id}`, { ativo: u.ativo ? 0 : 1 });
      recarregar();
    } catch (e) {
      setFalha(e instanceof ApiError ? e.message : 'Não foi possível alterar');
    }
  }

  return (
    <>
      <header className="cabecalho">
        <div>
          <h1>Usuários e permissões</h1>
          <p>Quem entra no sistema e o que cada um pode ver e alterar</p>
        </div>
        <div className="acoes">
          <button className="primario" onClick={() => setNovo(true)}>Novo usuário</button>
        </div>
      </header>

      <div className="grade c3">
        <Indicador rotulo="Usuários" valor={usuarios?.length ?? 0} />
        <Indicador rotulo="Ativos" valor={(usuarios ?? []).filter((u) => u.ativo).length} />
        <Indicador rotulo="Níveis de acesso" valor={catalogo?.niveis.length ?? 0} />
      </div>

      <Aviso tipo="erro">{falha || erro}</Aviso>

      <Cartao titulo="Usuários">
        {carregando && <Carregando />}
        {usuarios && usuarios.length === 0 && <Vazio texto="Nenhum usuário cadastrado." />}
        {usuarios && usuarios.length > 0 && (
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Nome</th><th>E-mail</th><th>Perfil</th><th>Nível de acesso</th>
                  <th>Colaborador</th><th>Criado em</th><th>Situação</th><th />
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  const nivel = catalogo?.niveis.find((n) => n.id === u.nivel_acesso);
                  const ajustado = Boolean(u.permissoes);
                  return (
                    <tr key={u.id}>
                      <td>
                        {u.nome}
                        {u.id === eu?.id && <> <Etiqueta texto="você" tom="azul" /></>}
                      </td>
                      <td>{u.email}</td>
                      <td>{u.perfil}</td>
                      <td>
                        {nivel?.nome ?? u.nivel_acesso}
                        {ajustado && <> <Etiqueta texto="ajustado" tom="amarela" /></>}
                      </td>
                      <td>{u.colaborador ?? '—'}</td>
                      <td>{data(u.criado_em?.slice(0, 10))}</td>
                      <td>
                        {u.ativo
                          ? <Etiqueta texto="ativo" tom="verde" />
                          : <Etiqueta texto="inativo" tom="vermelha" />}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="pequeno" onClick={() => setEditando(u)}>Permissões</button>{' '}
                        <button className="pequeno" onClick={() => setSenhaDe(u)}>Senha</button>{' '}
                        <button className="pequeno" onClick={() => alternarAtivo(u)} disabled={u.id === eu?.id}>
                          {u.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      {catalogo && (
        <Cartao titulo="Níveis de acesso" acao={<small>o ponto de partida de cada função</small>}>
          <div className="tabela-rolagem">
            <table>
              <thead><tr><th>Nível</th><th>O que alcança</th><th className="num">Áreas</th></tr></thead>
              <tbody>
                {catalogo.niveis.map((n) => (
                  <tr key={n.id}>
                    <td><strong>{n.nome}</strong></td>
                    <td>{n.descricao}</td>
                    <td className="num">{n.areas.length} de {catalogo.todas.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}

      <EditorPermissoes
        usuario={editando}
        catalogo={catalogo}
        aoFechar={() => setEditando(null)}
        aoSalvar={() => { setEditando(null); recarregar(); }}
      />
      <NovoUsuario
        aberto={novo}
        catalogo={catalogo}
        aoFechar={() => setNovo(false)}
        aoSalvar={() => { setNovo(false); recarregar(); }}
      />
      <TrocarSenha usuario={senhaDe} aoFechar={() => setSenhaDe(null)} />
    </>
  );
}

/** Nível + ajustes por área. O que difere do nível fica marcado na tela. */
function EditorPermissoes({ usuario, catalogo, aoFechar, aoSalvar }: {
  usuario: UsuarioSistema | null;
  catalogo: CatalogoPermissoes | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const { dados } = useApi<PermissoesUsuario>(
    usuario ? `/usuarios/${usuario.id}/permissoes` : null, [usuario?.id]
  );
  const [nivelId, setNivelId] = useState('');
  const [areas, setAreas] = useState<Record<string, boolean>>({});
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!dados) return;
    setNivelId(dados.nivel_acesso);
    setAreas(dados.efetivas);
    setErro('');
  }, [dados]);

  /** Trocar de nível reinicia as marcações a partir do conjunto do nível novo. */
  function trocarNivel(id: string) {
    setNivelId(id);
    const nivel = catalogo?.niveis.find((n) => n.id === id);
    if (nivel && catalogo) {
      setAreas(Object.fromEntries(catalogo.todas.map((a) => [a, nivel.areas.includes(a)])));
    }
  }

  async function salvar() {
    if (!usuario) return;
    setSalvando(true);
    setErro('');
    try {
      await api.put(`/usuarios/${usuario.id}/permissoes`, { nivel_acesso: nivelId, areas });
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  const nivel = catalogo?.niveis.find((n) => n.id === nivelId);
  const ehAdmin = usuario?.perfil === 'ADMIN';

  return (
    <Modal
      titulo={usuario ? `Permissões — ${usuario.nome}` : ''}
      aberto={Boolean(usuario)}
      aoFechar={aoFechar}
      largo
      rodape={
        <>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={salvando || ehAdmin}>
            {salvando ? 'Salvando…' : 'Salvar permissões'}
          </button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      {ehAdmin && (
        <Aviso tipo="info">
          Este usuário tem perfil <strong>ADMIN</strong> e alcança todas as áreas por definição —
          é a trava que impede alguém trancar o próprio sistema. Para restringi-lo, mude antes o perfil.
        </Aviso>
      )}

      <Campo rotulo="Nível de acesso">
        <select value={nivelId} onChange={(e) => trocarNivel(e.target.value)} disabled={ehAdmin}>
          {catalogo?.niveis.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
        </select>
      </Campo>
      {nivel && <p style={{ marginTop: -6, color: 'var(--texto-fraco)', fontSize: 12.5 }}>{nivel.descricao}</p>}

      <p style={{ fontSize: 12.5, color: 'var(--texto-fraco)' }}>
        Marque ou desmarque para ajustar sobre o nível. Só as diferenças são gravadas — ao trocar
        de nível depois, o conjunto novo entra por inteiro.
      </p>

      {catalogo?.areas.map((grupo) => (
        <div key={grupo.grupo} style={{ marginBottom: 14 }}>
          <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em',
                       color: 'var(--texto-suave)', margin: '0 0 6px' }}>
            {grupo.grupo}
          </h4>
          <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {grupo.itens.map((item) => {
              const noNivel = nivel?.areas.includes(item.id) ?? false;
              const marcado = areas[item.id] ?? false;
              return (
                <label key={item.id} style={{
                  display: 'flex', gap: 8, alignItems: 'center', margin: 0,
                  fontWeight: 400, fontSize: 13, padding: '3px 0',
                }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={marcado}
                    disabled={ehAdmin}
                    onChange={(e) => setAreas((a) => ({ ...a, [item.id]: e.target.checked }))}
                  />
                  <span>{item.nome}</span>
                  {marcado !== noNivel && <Etiqueta texto={marcado ? 'liberado' : 'bloqueado'} tom={marcado ? 'verde' : 'amarela'} />}
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </Modal>
  );
}

function NovoUsuario({ aberto, catalogo, aoFechar, aoSalvar }: {
  aberto: boolean; catalogo: CatalogoPermissoes | null; aoFechar: () => void; aoSalvar: () => void;
}) {
  const { dados: colaboradores } = useApi<Colaborador[]>(aberto ? '/colaboradores?ativo=true' : null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState('OPERADOR');
  const [nivel, setNivel] = useState('consulta');
  const [colaboradorId, setColaboradorId] = useState<number | ''>('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim() || !email.trim()) return setErro('Informe nome e e-mail.');
    if (senha.length < 6) return setErro('A senha precisa de ao menos 6 caracteres.');
    setSalvando(true);
    setErro('');
    try {
      await api.post('/usuarios/novo', {
        nome: nome.trim(), email: email.trim(), senha,
        perfil, nivel_acesso: nivel,
        colaborador_id: colaboradorId ? Number(colaboradorId) : null,
      });
      setNome(''); setEmail(''); setSenha('');
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível criar o usuário');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Novo usuário"
      aberto={aberto}
      aoFechar={aoFechar}
      rodape={
        <>
          <button onClick={aoFechar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={salvando}>
            {salvando ? 'Criando…' : 'Criar usuário'}
          </button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      <div className="linha-campos">
        <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></Campo>
        <Campo rotulo="E-mail"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
      </div>
      <div className="linha-campos">
        <Campo rotulo="Senha inicial">
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <Campo rotulo="Perfil">
          <select value={perfil} onChange={(e) => setPerfil(e.target.value)}>
            {PERFIS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Nível de acesso">
          <select value={nivel} onChange={(e) => setNivel(e.target.value)}>
            {catalogo?.niveis.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
          </select>
        </Campo>
      </div>
      <Campo rotulo="Vincular ao colaborador">
        <select value={colaboradorId} onChange={(e) => setColaboradorId(Number(e.target.value) || '')}>
          <option value="">—</option>
          {colaboradores?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Campo>
    </Modal>
  );
}

function TrocarSenha({ usuario, aoFechar }: { usuario: UsuarioSistema | null; aoFechar: () => void }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  async function salvar() {
    if (!usuario) return;
    if (senha.length < 6) return setErro('A senha precisa de ao menos 6 caracteres.');
    setErro('');
    try {
      await api.put(`/usuarios/${usuario.id}/senha`, { senha });
      setOk('Senha redefinida.');
      setSenha('');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível redefinir');
    }
  }

  return (
    <Modal
      titulo={usuario ? `Redefinir senha — ${usuario.nome}` : ''}
      aberto={Boolean(usuario)}
      aoFechar={aoFechar}
      rodape={
        <>
          <button onClick={aoFechar}>Fechar</button>
          <button className="primario" onClick={salvar}>Redefinir</button>
        </>
      }
    >
      <Aviso tipo="erro">{erro}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      <Campo rotulo="Nova senha">
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
      </Campo>
    </Modal>
  );
}

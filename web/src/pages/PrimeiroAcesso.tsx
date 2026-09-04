import { useState, type FormEvent } from 'react';
import { api, sessao, ApiError, type Usuario } from '../lib/api';
import { Aviso, Campo } from '../components/ui';

const MINIMO = 6;

/**
 * Primeiro acesso: a senha que o administrador entregou vale uma entrada só.
 *
 * Enquanto a pessoa não escolher a sua, nenhuma tela do sistema abre — nem o
 * painel. É o que faz a senha provisória ser mesmo provisória, em vez de virar
 * a senha que todo mundo na fábrica sabe.
 */
export default function PrimeiroAcesso({ usuario, aoConcluir, aoSair }: {
  usuario: Usuario; aoConcluir: () => void; aoSair: () => void;
}) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (nova.length < MINIMO) return setErro(`A nova senha precisa de ao menos ${MINIMO} caracteres.`);
    if (nova !== repetida) return setErro('A repetição não confere com a nova senha.');
    if (nova === atual) return setErro('A nova senha precisa ser diferente da provisória.');

    setEnviando(true);
    setErro('');
    try {
      await api.put('/auth/senha', { senha_atual: atual, senha_nova: nova });
      const eu = sessao.usuario();
      if (eu) sessao.entrar(sessao.token()!, { ...eu, senha_provisoria: 0 }, sessao.permissoes());
      aoConcluir();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível definir a senha');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-tela">
      <form className="login-caixa" onSubmit={enviar}>
        <h1>Bem-vindo, {usuario.nome.split(' ')[0]}</h1>
        <p className="sub">
          Você entrou com uma senha provisória. Escolha a sua para continuar — ela não fica
          visível para ninguém, nem para quem administra o sistema.
        </p>
        <Aviso tipo="erro">{erro}</Aviso>

        <Campo rotulo="Senha provisória">
          <input type="password" value={atual} onChange={(e) => setAtual(e.target.value)}
            required autoFocus autoComplete="current-password" />
        </Campo>
        <Campo rotulo={`Nova senha (mínimo de ${MINIMO} caracteres)`}>
          <input type="password" value={nova} onChange={(e) => setNova(e.target.value)}
            required autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Repita a nova senha">
          <input type="password" value={repetida} onChange={(e) => setRepetida(e.target.value)}
            required autoComplete="new-password" />
        </Campo>

        <button className="primario" style={{ width: '100%', marginTop: 6 }} disabled={enviando}>
          {enviando ? 'Salvando…' : 'Definir minha senha e entrar'}
        </button>
        <button type="button" className="pequeno" style={{ width: '100%', marginTop: 8 }} onClick={aoSair}>
          Sair
        </button>
      </form>
    </div>
  );
}

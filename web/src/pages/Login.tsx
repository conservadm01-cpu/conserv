import { useState, type FormEvent } from 'react';
import { api, sessao, ApiError, type Usuario } from '../lib/api';
import { Aviso, Campo } from '../components/ui';

export default function Login({ aoEntrar }: { aoEntrar: (u: Usuario) => void }) {
  const [email, setEmail] = useState('admin@conserv.com.br');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro('');
    try {
      const r = await api.post<{ token: string; usuario: Usuario }>('/auth/login', { email, senha });
      sessao.entrar(r.token, r.usuario);
      aoEntrar(r.usuario);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível entrar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-tela">
      <form className="login-caixa" onSubmit={enviar}>
        <h1>ERP Conserv</h1>
        <p className="sub">Controle de materiais e processos</p>
        <Aviso tipo="erro">{erro}</Aviso>
        <Campo rotulo="E-mail">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Campo>
        <Campo rotulo="Senha">
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </Campo>
        <button className="primario" style={{ width: '100%', marginTop: 6 }} disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

const CHAVE_TOKEN = 'conserv.token';
const CHAVE_USUARIO = 'conserv.usuario';

export type Perfil = 'ADMIN' | 'GESTOR' | 'PCP' | 'ALMOXARIFE' | 'VENDEDOR' | 'OPERADOR';
export type Usuario = { sub?: number; id?: number; nome: string; email: string; perfil: Perfil };

export const sessao = {
  token: () => localStorage.getItem(CHAVE_TOKEN),
  usuario: (): Usuario | null => {
    const bruto = localStorage.getItem(CHAVE_USUARIO);
    return bruto ? (JSON.parse(bruto) as Usuario) : null;
  },
  entrar(token: string, usuario: Usuario) {
    localStorage.setItem(CHAVE_TOKEN, token);
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  },
  sair() {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_USUARIO);
  },
};

export class ApiError extends Error {
  status: number;
  detalhes?: unknown;
  constructor(status: number, mensagem: string, detalhes?: unknown) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

async function requisicao<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const token = sessao.token();
  const ehFormData = init.body instanceof FormData;
  const resposta = await fetch(`/api${caminho}`, {
    ...init,
    headers: {
      ...(ehFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (resposta.status === 401) {
    sessao.sair();
    window.location.hash = '#/login';
    throw new ApiError(401, 'Sessão expirada. Entre novamente.');
  }

  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) {
    throw new ApiError(resposta.status, corpo?.erro ?? 'Falha na requisição', corpo?.detalhes);
  }
  return corpo as T;
}

/** Monta a query string ignorando filtros vazios. */
export function query(params: Record<string, unknown>): string {
  const busca = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') busca.set(k, String(v));
  }
  const str = busca.toString();
  return str ? `?${str}` : '';
}

export const api = {
  get: <T,>(caminho: string) => requisicao<T>(caminho),
  post: <T,>(caminho: string, corpo?: unknown) =>
    requisicao<T>(caminho, { method: 'POST', body: JSON.stringify(corpo ?? {}) }),
  put: <T,>(caminho: string, corpo?: unknown) =>
    requisicao<T>(caminho, { method: 'PUT', body: JSON.stringify(corpo ?? {}) }),
  delete: <T,>(caminho: string) => requisicao<T>(caminho, { method: 'DELETE' }),
  upload: <T,>(caminho: string, dados: FormData) =>
    requisicao<T>(caminho, { method: 'POST', body: dados }),
};

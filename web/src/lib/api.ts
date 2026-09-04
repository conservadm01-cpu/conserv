const CHAVE_TOKEN = 'conserv.token';
const CHAVE_USUARIO = 'conserv.usuario';
const CHAVE_PERMISSOES = 'conserv.permissoes';

export type Perfil = 'ADMIN' | 'GESTOR' | 'PCP' | 'ALMOXARIFE' | 'VENDEDOR' | 'OPERADOR';
export type Usuario = {
  sub?: number; id?: number; nome: string; email: string;
  perfil: Perfil; nivel_acesso?: string;
  /** Senha entregue pelo administrador: a tela exige a troca antes de abrir. */
  senha_provisoria?: number;
};
export type Permissoes = Record<string, boolean>;

const ler = <T,>(chave: string): T | null => {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : null;
  } catch {
    return null;
  }
};

export const sessao = {
  token: () => localStorage.getItem(CHAVE_TOKEN),
  usuario: () => ler<Usuario>(CHAVE_USUARIO),
  permissoes: () => ler<Permissoes>(CHAVE_PERMISSOES) ?? {},
  entrar(token: string, usuario: Usuario, permissoes: Permissoes) {
    localStorage.setItem(CHAVE_TOKEN, token);
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
    localStorage.setItem(CHAVE_PERMISSOES, JSON.stringify(permissoes));
  },
  atualizarPermissoes(permissoes: Permissoes) {
    localStorage.setItem(CHAVE_PERMISSOES, JSON.stringify(permissoes));
  },
  sair() {
    for (const c of [CHAVE_TOKEN, CHAVE_USUARIO, CHAVE_PERMISSOES]) localStorage.removeItem(c);
  },
};

/** Atalho de leitura das permissões da sessão, usado para esconder o que não se pode fazer. */
export const pode = (area: string) => Boolean(sessao.permissoes()[area]);

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

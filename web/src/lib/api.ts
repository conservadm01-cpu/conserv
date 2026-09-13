const CHAVE_TOKEN = 'csvsist.token';
const CHAVE_USUARIO = 'csvsist.usuario';
const CHAVE_PERMISSOES = 'csvsist.permissoes';

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

/**
 * Busca um recurso que não é JSON — a ficha impressa e os relatórios em CSV.
 * Passa pelo mesmo cabeçalho de autorização das outras chamadas.
 */
async function baixar(caminho: string): Promise<Blob> {
  const token = sessao.token();
  const resposta = await fetch(`/api${caminho}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (resposta.status === 401) {
    sessao.sair();
    window.location.hash = '#/login';
    throw new ApiError(401, 'Sessão expirada. Entre novamente.');
  }
  if (!resposta.ok) {
    const texto = await resposta.text();
    let mensagem = 'Falha ao gerar o documento';
    try {
      mensagem = JSON.parse(texto)?.erro ?? mensagem;
    } catch {
      /* resposta sem JSON: fica a mensagem padrão */
    }
    throw new ApiError(resposta.status, mensagem);
  }
  return resposta.blob();
}

export const api = {
  get: <T,>(caminho: string) => requisicao<T>(caminho),
  patch: <T,>(caminho: string, corpo?: unknown) =>
    requisicao<T>(caminho, { method: 'PATCH', body: JSON.stringify(corpo ?? {}) }),
  post: <T,>(caminho: string, corpo?: unknown) =>
    requisicao<T>(caminho, { method: 'POST', body: JSON.stringify(corpo ?? {}) }),
  put: <T,>(caminho: string, corpo?: unknown) =>
    requisicao<T>(caminho, { method: 'PUT', body: JSON.stringify(corpo ?? {}) }),
  delete: <T,>(caminho: string) => requisicao<T>(caminho, { method: 'DELETE' }),
  upload: <T,>(caminho: string, dados: FormData) =>
    requisicao<T>(caminho, { method: 'POST', body: dados }),

  /**
   * Abre um documento do servidor numa aba nova, já pronto para imprimir.
   * O arquivo vem por fetch (e não por link direto) porque a rota exige o
   * token da sessão, que um <a href> não carregaria.
   */
  async abrirDocumento(caminho: string) {
    const url = URL.createObjectURL(await baixar(caminho));
    const janela = window.open(url, '_blank');
    if (!janela) {
      URL.revokeObjectURL(url);
      throw new ApiError(0, 'O navegador bloqueou a janela. Libere os pop-ups deste site para imprimir.');
    }
    // Revogar cedo demais mata a aba recém-aberta; um minuto cobre o carregamento.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  /** Baixa um arquivo (CSV dos relatórios) com o nome informado. */
  async baixarArquivo(caminho: string, nomeArquivo: string) {
    const url = URL.createObjectURL(await baixar(caminho));
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};

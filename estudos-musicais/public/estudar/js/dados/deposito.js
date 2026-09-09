// Depósito: a única porta por onde os dados entram e saem.
//
// Hoje o aplicativo guarda tudo no localStorage do aparelho. Amanhã pode ser
// Supabase, PostgreSQL, Firebase ou uma API REST. Para que essa troca não
// obrigue a mexer nas telas, ninguém fora daqui chama localStorage: as telas
// falam com os repositórios, os repositórios falam com o depósito, e o
// depósito é a peça trocável.
//
// Um depósito precisa saber fazer quatro coisas:
//   ler()        -> o estado guardado, ou null se não houver nada
//   gravar(e)    -> guarda o estado; devolve true se conseguiu
//   remover()    -> apaga o que está guardado
//   disponivel() -> diz se dá para guardar neste ambiente

export const CHAVE_V2 = 'msa.escola.v2';
export const CHAVE_V1 = 'msa.escola.v1';
export const CHAVE_V0 = 'msa.progresso.v1';
export const PREFIXO_DE_BACKUP = 'msa.backup.';

const armazenamentoDoNavegador = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (erro) {
    // Navegador com armazenamento bloqueado: o app roda só nesta sessão.
    return null;
  }
};

// ---------------------------------------------------- depósito no aparelho

export function criarDepositoLocal(chave = CHAVE_V2) {
  return {
    tipo: 'local',
    chave,
    disponivel() {
      const loja = armazenamentoDoNavegador();
      if (!loja) return false;
      try {
        loja.setItem('msa.teste', '1');
        loja.removeItem('msa.teste');
        return true;
      } catch (erro) {
        return false;
      }
    },
    ler() {
      const loja = armazenamentoDoNavegador();
      if (!loja) return null;
      try {
        const bruto = loja.getItem(chave);
        return bruto ? JSON.parse(bruto) : null;
      } catch (erro) {
        console.warn(`Não foi possível ler "${chave}":`, erro);
        return null;
      }
    },
    gravar(estado) {
      const loja = armazenamentoDoNavegador();
      if (!loja) return false;
      try {
        loja.setItem(chave, JSON.stringify(estado));
        return true;
      } catch (erro) {
        // Aparelho sem espaço: o app continua funcionando nesta sessão,
        // só não guarda o que foi feito.
        console.warn('Não foi possível guardar os dados:', erro);
        return false;
      }
    },
    remover() {
      const loja = armazenamentoDoNavegador();
      if (!loja) return false;
      try {
        loja.removeItem(chave);
        return true;
      } catch (erro) {
        return false;
      }
    },
    // Usado pela migração: ler e escrever chaves vizinhas (V1, backups)
    // sem que o resto do aplicativo precise conhecer o localStorage.
    lerChave(outra) {
      const loja = armazenamentoDoNavegador();
      if (!loja) return null;
      try {
        const bruto = loja.getItem(outra);
        return bruto ? JSON.parse(bruto) : null;
      } catch (erro) {
        return null;
      }
    },
    gravarChave(outra, valor) {
      const loja = armazenamentoDoNavegador();
      if (!loja) return false;
      try {
        loja.setItem(outra, JSON.stringify(valor));
        return true;
      } catch (erro) {
        console.warn(`Não foi possível guardar "${outra}":`, erro);
        return false;
      }
    },
    removerChave(outra) {
      const loja = armazenamentoDoNavegador();
      if (!loja) return false;
      try {
        loja.removeItem(outra);
        return true;
      } catch (erro) {
        return false;
      }
    },
    chaves() {
      const loja = armazenamentoDoNavegador();
      if (!loja) return [];
      try {
        const lista = [];
        for (let i = 0; i < loja.length; i++) lista.push(loja.key(i));
        return lista.filter(Boolean);
      } catch (erro) {
        return [];
      }
    },
  };
}

// ------------------------------------------------- depósito só na memória

// Serve para os testes e para quando o navegador bloqueia o armazenamento:
// o app funciona, mas o que foi feito não sobrevive ao fechar a página.
export function criarDepositoEmMemoria(inicial = null) {
  const memoria = new Map();
  const guardar = (c, v) => memoria.set(c, JSON.stringify(v));
  const buscar = (c) => (memoria.has(c) ? JSON.parse(memoria.get(c)) : null);
  if (inicial) guardar(CHAVE_V2, inicial);
  return {
    tipo: 'memoria',
    chave: CHAVE_V2,
    disponivel: () => true,
    ler: () => buscar(CHAVE_V2),
    gravar: (estado) => { guardar(CHAVE_V2, estado); return true; },
    remover: () => { memoria.delete(CHAVE_V2); return true; },
    lerChave: buscar,
    gravarChave: (c, v) => { guardar(c, v); return true; },
    removerChave: (c) => { memoria.delete(c); return true; },
    chaves: () => [...memoria.keys()],
  };
}

// ------------------------------------------- depósito remoto (para depois)

// Esqueleto do dia em que os dados forem para um servidor. Fica aqui para
// deixar explícito o contrato que qualquer depósito precisa cumprir: quem
// escrever o adaptador de Supabase, Firebase ou API REST implementa estas
// mesmas funções e o resto do aplicativo não muda uma linha.
export function criarDepositoRemoto({ carregar, salvar, apagar } = {}) {
  const exigir = (funcao, nome) => {
    if (typeof funcao !== 'function') throw new Error(`Depósito remoto sem a função "${nome}".`);
    return funcao;
  };
  return {
    tipo: 'remoto',
    chave: CHAVE_V2,
    disponivel: () => true,
    ler: () => exigir(carregar, 'carregar')(),
    gravar: (estado) => exigir(salvar, 'salvar')(estado),
    remover: () => exigir(apagar, 'apagar')(),
    lerChave: () => null,
    gravarChave: () => false,
    removerChave: () => false,
    chaves: () => [],
  };
}

// ------------------------------------------------------- depósito em uso

let atual = null;

export function depositoAtual() {
  if (!atual) atual = criarDepositoLocal();
  return atual;
}

export function definirDeposito(deposito) {
  atual = deposito;
  return atual;
}

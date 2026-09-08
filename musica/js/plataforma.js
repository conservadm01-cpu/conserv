// Ponte com a plataforma.
//
// O app de estudo nasceu para rodar sozinho, com cadastro próprio no aparelho.
// Servido DENTRO da plataforma, ele não pode ter cadastro próprio: a regra da
// casa é que ninguém entra sem ter sido cadastrado por alguém com permissão.
//
// Então, quando a página injeta `window.__PLATAFORMA__`, este módulo:
//   • adota a identidade já autenticada no servidor;
//   • preenche a ficha com o que o cadastro da plataforma tem, sem perguntar
//     de novo o que a instituição já sabe;
//   • e desliga as telas de entrar, cadastrar e trocar de aluno.
//
// Sem a injeção, nada muda: o app continua funcionando sozinho, offline.

const CHAVE_DO_VINCULO = 'msa.plataforma.vinculo';

export const dadosDaPlataforma = () =>
  (typeof window === 'undefined' ? null : window.__PLATAFORMA__ ?? null);

export const integrado = () => Boolean(dadosDaPlataforma());

function lerVinculo() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_DO_VINCULO) || '{}');
  } catch {
    return {};
  }
}

function gravarVinculo(vinculo) {
  try {
    localStorage.setItem(CHAVE_DO_VINCULO, JSON.stringify(vinculo));
  } catch {
    // Aparelho sem armazenamento local: o estudo desta sessão não persiste,
    // e o app já lida com isso em outros pontos.
  }
}

/**
 * Liga o usuário da plataforma a um aluno local, criando-o na primeira vez.
 * O mesmo aparelho pode ser usado por mais de uma pessoa: cada uma ganha o seu
 * progresso, e a chave do vínculo é o identificador do servidor.
 */
export function adotar(banco) {
  const dados = dadosDaPlataforma();
  if (!dados) return null;

  const vinculo = lerVinculo();
  const ficha = { nome: dados.nome, ...(dados.ficha || {}) };
  let usuario = vinculo[dados.id] ? banco.usuarioPorId(vinculo[dados.id]) : null;

  if (usuario) {
    // O cadastro da plataforma é a fonte: o que mudou lá vale aqui.
    try {
      banco.atualizarUsuario(usuario.id, ficha);
    } catch {
      // Nome repetido por outro aluno no mesmo aparelho: mantém o que já está.
    }
    usuario = banco.usuarioPorId(usuario.id);
  } else {
    usuario = criarSemColidir(banco, ficha);
    vinculo[dados.id] = usuario.id;
    gravarVinculo(vinculo);
  }

  banco.entrarComoAluno(usuario.id);
  return usuario;
}

/** Dois alunos com o mesmo nome no mesmo aparelho: o segundo ganha um sufixo. */
function criarSemColidir(banco, ficha) {
  try {
    return banco.criarUsuario(ficha);
  } catch (erro) {
    if (!/Já existe um aluno/.test(String(erro && erro.message))) throw erro;
    for (let n = 2; n < 50; n++) {
      try {
        return banco.criarUsuario({ ...ficha, nome: `${ficha.nome} (${n})` });
      } catch {
        // tenta o próximo sufixo
      }
    }
    throw erro;
  }
}

/** Rotas que deixam de existir quando o app roda dentro da plataforma. */
const ROTAS_DA_PLATAFORMA = new Set(['entrar', 'cadastrar', 'instrutor', 'sair', 'ficha']);

export const rotaDesligada = (primeiraParte) => integrado() && ROTAS_DA_PLATAFORMA.has(primeiraParte);

/** Para onde o "Sair" aponta: quem manda na sessão é o servidor. */
export const enderecoDeSaida = () => (dadosDaPlataforma() || {}).sair || '/sair';

/** Endereço de volta para o resto da plataforma. */
export const enderecoDeVolta = () => (dadosDaPlataforma() || {}).voltar || '/aluno';

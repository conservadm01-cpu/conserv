// Perfis de acesso e autenticação.
//
// Duas separações importantes, e o motivo de cada uma:
//
//   Autenticação ≠ pedagogia. A ficha do aluno (nome, comum, instrumento,
//   encarregados) fica na entidade ALUNOS. O acesso (login, papel, resumo da
//   senha) fica em USUARIOS. Apagar um acesso não apaga a ficha, e mudar a
//   ficha não mexe em senha nenhuma.
//
//   A senha inicial NÃO é um campo. Antes havia um `senhaPadrao: true`
//   gravado junto do acesso. Um campo assim é um convite ao erro: basta
//   alguém, um dia, usá-lo como atalho para deixar entrar. Aqui a pergunta
//   "esta senha ainda é a de fábrica?" é respondida CONFERINDO o resumo — o
//   mesmo caminho de qualquer outra senha. Não há atalho para existir.
//
// O que este arquivo não é: segurança contra quem sabe abrir o código da
// página. O aplicativo roda inteiro no aparelho, sem servidor. Isto é uma
// portaria — separa o progresso de cada aluno e protege o painel do uso
// casual. Quando os dados forem para um servidor, a verificação passa a ser
// feita lá, e estas mesmas regras viram a referência do que cada perfil pode.

import { conferirSenha, criarHash } from '../senha.js';
import { PAPEIS } from './esquema.js';

export { PAPEIS };

export const LOGIN_INICIAL = 'RENATO';
export const SENHA_INICIAL = 'CCB123';

// ------------------------------------------------------------ o que cada um pode

export const PERMISSOES = {
  ADMIN: [
    'ver.painel',
    'aluno.cadastrar', 'aluno.editar', 'aluno.remover', 'aluno.ver.todos',
    'acesso.criar', 'acesso.editar', 'acesso.remover',
    'metodo.cadastrar', 'metodo.editar',
    'instrumento.cadastrar', 'instrumento.editar',
    'fase.cadastrar', 'fase.editar',
    'configuracao.editar',
    'dados.exportar', 'dados.importar', 'dados.apagar',
    'estudar',
  ],
  PROFESSOR: [
    'ver.painel',
    'aluno.cadastrar', 'aluno.editar', 'aluno.ver.todos',
    'acesso.criar', 'acesso.editar',
    'dados.exportar',
    'estudar',
  ],
  ALUNO: [
    'aluno.ver.proprio', 'aluno.editar.proprio',
    'estudar',
  ],
};

export function permissoesDoPapel(papel) {
  return PERMISSOES[papel] ? PERMISSOES[papel].slice() : [];
}

export function pode(papel, permissao) {
  return permissoesDoPapel(papel).includes(permissao);
}

// Quem cadastra quem. O aluno não cadastra ninguém; o professor cadastra
// alunos; só o administrador cria outro administrador ou professor.
export const PAPEIS_QUE_CONCEDE = {
  ADMIN: ['ALUNO', 'PROFESSOR', 'ADMIN'],
  PROFESSOR: ['ALUNO'],
  ALUNO: [],
};

export const papeisQuePodeConceder = (papel) => (PAPEIS_QUE_CONCEDE[papel] || []).slice();

export function motivoDaRecusa(papelDeQuemCadastra, papelPretendido) {
  if (!PAPEIS.includes(papelPretendido)) return `Perfil desconhecido: "${papelPretendido}".`;
  if (!papeisQuePodeConceder(papelDeQuemCadastra).includes(papelPretendido)) {
    return `Quem tem o perfil ${papelDeQuemCadastra.toLowerCase()} não pode cadastrar um ${papelPretendido.toLowerCase()}.`;
  }
  return null;
}

// ---------------------------------------------------------------- autenticação

// O login não diferencia maiúsculas nem espaços sobrando.
export const normalizarLogin = (texto) => String(texto || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Cria o par sal + resumo. A senha em texto morre aqui: não é devolvida,
// não é gravada, não sai desta função.
export function guardarSenha(senha, sal) {
  return { sal, senhaHash: criarHash(senha, sal) };
}

// Confere um acesso. Devolve o usuário quando a senha bate, null quando não.
export function autenticar(usuario, senha) {
  if (!usuario || usuario.ativo === false) return null;
  if (!usuario.exigeSenha) return usuario;
  return conferirSenha(senha, usuario.sal, usuario.senhaHash) ? usuario : null;
}

// "Esta conta ainda está com a senha de fábrica?" — respondida conferindo o
// resumo, como qualquer outra senha. Não existe campo dizendo que sim.
export function senhaEhInicial(usuario) {
  if (!usuario || !usuario.senhaHash) return false;
  return conferirSenha(SENHA_INICIAL, usuario.sal, usuario.senhaHash);
}

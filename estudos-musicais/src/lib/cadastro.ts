/**
 * Cadastro fechado.
 *
 * Não existe autocadastro nesta plataforma: toda conta é criada por alguém que
 * já tem acesso, e fica registrado quem foi. Este módulo é a regra dessa
 * criação — quem pode cadastrar quem, com qual papel e em qual território.
 *
 * É a primeira cerca. A segunda está nas políticas de RLS
 * (20260908200000_cadastro_fechado), que garantem o piso mesmo se um caminho
 * da aplicação escapar: quem não é administração só concede papel de campo,
 * com escopo de comum, e apenas em comum que já acompanha.
 */

import type { EscopoDoUsuario, Papel } from './autorizacao.ts';
import { SemPermissao } from './autorizacao.ts';

export type EscopoDeVinculo = 'GLOBAL' | 'REGIAO' | 'COMUM';

/**
 * Quais papéis cada papel pode conceder. Um papel nunca concede acima de si:
 * administrador só é criado por administração.
 */
export const PAPEIS_QUE_CONCEDE: Record<Papel, Papel[]> = {
  SUPERADMIN: ['SUPERADMIN', 'ADMIN_PEDAGOGICO', 'ENCARREGADO_REGIONAL', 'ENCARREGADO_LOCAL', 'ANCIAO', 'INSTRUTOR', 'ALUNO'],
  ADMIN_PEDAGOGICO: ['ADMIN_PEDAGOGICO', 'ENCARREGADO_REGIONAL', 'ENCARREGADO_LOCAL', 'ANCIAO', 'INSTRUTOR', 'ALUNO'],
  ENCARREGADO_REGIONAL: ['ENCARREGADO_LOCAL', 'ANCIAO', 'INSTRUTOR', 'ALUNO'],
  ENCARREGADO_LOCAL: ['INSTRUTOR', 'ALUNO'],
  ANCIAO: ['INSTRUTOR', 'ALUNO'],
  INSTRUTOR: ['ALUNO'],
  ALUNO: [],
};

/**
 * Do menor privilégio para o maior. É a ordem em que os papéis são oferecidos
 * na tela: o primeiro da lista é o padrão do seletor, e o padrão precisa ser o
 * mais modesto — ninguém deve conceder superadministrador por descuido.
 */
export const PAPEIS_EM_ORDEM: Papel[] = [
  'ALUNO', 'INSTRUTOR', 'ANCIAO', 'ENCARREGADO_LOCAL', 'ENCARREGADO_REGIONAL',
  'ADMIN_PEDAGOGICO', 'SUPERADMIN',
];

/** Só a administração concede vínculo fora de uma comum. */
const ESCOPOS_DE_ADMINISTRACAO: EscopoDeVinculo[] = ['GLOBAL', 'REGIAO', 'COMUM'];
const ESCOPOS_DE_CAMPO: EscopoDeVinculo[] = ['COMUM'];

/**
 * Os papéis que este usuário pode conceder, somando todos os seus vínculos,
 * do menor privilégio para o maior.
 */
export function papeisQuePodeConceder(escopo: EscopoDoUsuario): Papel[] {
  const reunidos = new Set<Papel>();
  for (const papel of escopo.papeis) {
    for (const concedivel of PAPEIS_QUE_CONCEDE[papel] ?? []) reunidos.add(concedivel);
  }
  return PAPEIS_EM_ORDEM.filter((papel) => reunidos.has(papel));
}

export const podeCadastrar = (escopo: EscopoDoUsuario) => papeisQuePodeConceder(escopo).length > 0;

export const escoposQuePodeUsar = (escopo: EscopoDoUsuario): EscopoDeVinculo[] =>
  (escopo.ehAdministracao ? ESCOPOS_DE_ADMINISTRACAO : ESCOPOS_DE_CAMPO);

export interface CadastroPretendido {
  papel: Papel;
  escopo: EscopoDeVinculo;
  comumId?: string | null;
  regiaoId?: string | null;
}

/**
 * Confere um cadastro pretendido contra o escopo de quem o pede. Devolve o
 * motivo da recusa, ou null quando pode. Motivo em português, para a tela
 * poder dizer o que houve em vez de só negar.
 */
export function motivoDaRecusa(quemCadastra: EscopoDoUsuario, pretendido: CadastroPretendido): string | null {
  if (!podeCadastrar(quemCadastra)) {
    return 'O seu perfil não cadastra outras pessoas.';
  }
  if (!papeisQuePodeConceder(quemCadastra).includes(pretendido.papel)) {
    return `O seu perfil não concede o papel de ${rotuloDoPapel(pretendido.papel)}.`;
  }
  if (!escoposQuePodeUsar(quemCadastra).includes(pretendido.escopo)) {
    return 'Você só cadastra pessoas dentro de uma comum.';
  }

  if (pretendido.escopo === 'COMUM') {
    if (!pretendido.comumId) return 'Escolha a comum do novo cadastro.';
    if (!quemCadastra.ehAdministracao && !quemCadastra.comunsVisiveis.includes(pretendido.comumId)) {
      return 'Esta comum não está sob a sua responsabilidade.';
    }
  }
  if (pretendido.escopo === 'REGIAO') {
    if (!pretendido.regiaoId) return 'Escolha a região do novo cadastro.';
    if (!quemCadastra.ehAdministracao && !quemCadastra.regioes.includes(pretendido.regiaoId)) {
      return 'Esta região não está sob a sua responsabilidade.';
    }
  }
  if (pretendido.escopo === 'GLOBAL' && !quemCadastra.ehAdministracao) {
    return 'Vínculo global é concedido apenas pela administração.';
  }
  return null;
}

export function exigirPoderCadastrar(quemCadastra: EscopoDoUsuario, pretendido: CadastroPretendido) {
  const motivo = motivoDaRecusa(quemCadastra, pretendido);
  if (motivo) throw new SemPermissao(motivo);
}

/**
 * Normaliza o nome de acesso: minúsculas e espaços colapsados. É a MESMA regra
 * de `app.normalizar_login` no banco — "RENATO MONTEIRO", "Renato Monteiro" e
 * "renato  monteiro" chegam ao mesmo cadastro.
 */
export function normalizarLogin(texto: string | null | undefined): string | null {
  const limpo = String(texto ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return limpo === '' ? null : limpo;
}

const ROTULOS: Record<Papel, string> = {
  SUPERADMIN: 'superadministrador',
  ADMIN_PEDAGOGICO: 'administração pedagógica',
  ENCARREGADO_REGIONAL: 'encarregado regional',
  ENCARREGADO_LOCAL: 'encarregado local',
  ANCIAO: 'ancião',
  INSTRUTOR: 'instrutor',
  ALUNO: 'aluno',
};

export const rotuloDoPapel = (papel: Papel) => ROTULOS[papel] ?? papel.toLowerCase();

/** Senha provisória legível, para quem cadastra entregar a quem foi cadastrado. */
export function senhaProvisoria(): string {
  const consoantes = 'bcdfgjkmnpqrstvxz';
  const vogais = 'aeiou';
  const sorteio = (alfabeto: string) => alfabeto[Math.floor(Math.random() * alfabeto.length)];
  const silaba = () => sorteio(consoantes) + sorteio(vogais);
  const numero = String(Math.floor(Math.random() * 9000) + 1000);
  return `${silaba()}${silaba()}-${silaba()}${silaba()}-${numero}`;
}

// ============================================================== edição
//
// Editar é o outro lado do cadastro, e segue a mesma hierarquia: quem concede
// um papel pode mexer em quem o tem, dentro do seu território. Duas travas
// específicas da edição, que o cadastro não precisa ter:
//
//   • ninguém abaixo da administração mexe em quem é administração;
//   • ninguém se tranca fora do sistema — o próprio usuário não se inativa
//     nem se rebaixa, e a última conta de superadministrador não some.

export type SituacaoDoUsuario = 'ATIVO' | 'PENDENTE' | 'INATIVO' | 'BLOQUEADO';

export interface UsuarioParaEdicao {
  id: string;
  papeis: Papel[];
  /** Comuns onde este usuário tem vínculo ativo. */
  comuns: (string | null)[];
  ehAdministracao: boolean;
}

/**
 * Pode mexer no cadastro desta pessoa? Devolve o motivo da recusa, ou null.
 *
 * A pessoa sem nenhum papel concedível — porque tem papel acima do de quem
 * edita — fica fora do alcance por inteiro: não se edita o nome de quem não se
 * poderia ter cadastrado.
 */
export function motivoDaRecusaDeEdicao(
  quemEdita: EscopoDoUsuario,
  alvo: UsuarioParaEdicao,
): string | null {
  if (alvo.id === quemEdita.usuarioId) return null; // os próprios dados, sempre

  if (!podeCadastrar(quemEdita)) return 'O seu perfil não administra outras pessoas.';

  if (alvo.ehAdministracao && !quemEdita.ehAdministracao) {
    return 'Cadastro da administração só é alterado pela administração.';
  }

  const concedeveis = papeisQuePodeConceder(quemEdita);
  const foraDoAlcance = alvo.papeis.filter((papel) => !concedeveis.includes(papel));
  if (foraDoAlcance.length) {
    return `O seu perfil não administra ${foraDoAlcance.map(rotuloDoPapel).join(' nem ')}.`;
  }

  if (!quemEdita.ehAdministracao) {
    const dentro = alvo.comuns.some((comum) => comum && quemEdita.comunsVisiveis.includes(comum));
    if (!dentro) return 'Esta pessoa não está sob a sua responsabilidade.';
  }
  return null;
}

export const podeEditarUsuario = (quemEdita: EscopoDoUsuario, alvo: UsuarioParaEdicao) =>
  motivoDaRecusaDeEdicao(quemEdita, alvo) === null;

export function exigirPoderEditar(quemEdita: EscopoDoUsuario, alvo: UsuarioParaEdicao) {
  const motivo = motivoDaRecusaDeEdicao(quemEdita, alvo);
  if (motivo) throw new SemPermissao(motivo);
}

/** Só a administração mexe em situação; e ninguém se inativa. */
export function motivoDaRecusaDeSituacao(
  quemEdita: EscopoDoUsuario,
  alvo: UsuarioParaEdicao,
  novaSituacao: SituacaoDoUsuario,
): string | null {
  if (alvo.id === quemEdita.usuarioId && novaSituacao !== 'ATIVO') {
    return 'Você não pode inativar nem bloquear o seu próprio acesso.';
  }
  return motivoDaRecusaDeEdicao(quemEdita, alvo);
}

/** Redefinir senha entrega uma provisória: quem redefine não escolhe a senha. */
export const motivoDaRecusaDeRedefinicao = motivoDaRecusaDeEdicao;

/**
 * Revogar um vínculo. Além das regras de edição, protege a última porta: o
 * sistema não pode ficar sem superadministrador ativo.
 */
export function motivoDaRecusaDeRevogacao(
  quemEdita: EscopoDoUsuario,
  alvo: UsuarioParaEdicao,
  papel: Papel,
  superadministradoresAtivos: number,
): string | null {
  if (alvo.id === quemEdita.usuarioId && papel === 'SUPERADMIN') {
    return 'Você não pode retirar o seu próprio vínculo de superadministrador.';
  }
  if (papel === 'SUPERADMIN' && superadministradoresAtivos <= 1) {
    return 'Este é o último superadministrador ativo: conceda o papel a outra pessoa antes de retirar.';
  }
  if (!papeisQuePodeConceder(quemEdita).includes(papel)) {
    return `O seu perfil não retira o papel de ${rotuloDoPapel(papel)}.`;
  }
  return motivoDaRecusaDeEdicao(quemEdita, alvo);
}

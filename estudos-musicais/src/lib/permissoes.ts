/**
 * Permissões de aplicação.
 *
 * Duas coisas diferentes, e vale separá-las antes de qualquer código:
 *
 *   O CATÁLOGO — quais permissões existem — fica aqui, em código. Cada chave
 *   corresponde a uma verificação escrita em algum lugar do programa.
 *   Permissão cadastrada no banco que nenhum código consulta seria teatro:
 *   daria a impressão de conceder algo que não muda nada.
 *
 *   A CONCESSÃO — quem tem cada permissão — vira dado. É isso que a
 *   especificação pede e é isso que resolve o problema real: hoje, dar a um
 *   encarregado local a permissão de importar método exige alterar o
 *   programa e publicar.
 *
 * E uma terceira coisa, que NÃO muda: as políticas de RLS continuam sendo o
 * piso. Conceder `metodo.importar` a um papel de campo faz a tela oferecer o
 * botão; o banco continuará recusando a gravação. Por isso as permissões
 * marcadas como `soAdministracao` não são concedíveis por aqui — oferecer o
 * que o banco recusa produz erro sem explicação, que é pior do que não
 * oferecer.
 */

import type { EscopoDoUsuario, Papel } from './autorizacao.ts';

export interface DefinicaoDePermissao {
  chave: string;
  grupo: string;
  nome: string;
  descricao: string;
  /** O banco só autoriza a administração; conceder a outro papel não adianta. */
  soAdministracao?: boolean;
}

/** O catálogo. Uma linha por verificação existente no programa. */
export const PERMISSOES: DefinicaoDePermissao[] = [
  { chave: 'painel.ver', grupo: 'Acompanhamento', nome: 'Abrir o painel',
    descricao: 'Ver a área de acompanhamento em vez da área de estudo.' },
  { chave: 'aluno.ver', grupo: 'Acompanhamento', nome: 'Ver fichas de aluno',
    descricao: 'Abrir a ficha dos alunos do seu escopo.' },
  { chave: 'relatorio.ver', grupo: 'Acompanhamento', nome: 'Ver relatórios',
    descricao: 'Abrir os relatórios, limitados ao seu escopo.' },

  { chave: 'pessoa.cadastrar', grupo: 'Pessoas', nome: 'Cadastrar pessoas',
    descricao: 'Criar contas novas. O papel concedido continua limitado pela regra de quem concede o quê.' },
  { chave: 'pessoa.editar', grupo: 'Pessoas', nome: 'Editar cadastro de pessoas',
    descricao: 'Alterar dados de quem está sob a sua responsabilidade.' },
  { chave: 'responsavel.gerir', grupo: 'Pessoas', nome: 'Cadastrar responsáveis',
    descricao: 'Registrar quem responde por um aluno.' },

  { chave: 'aula.registrar', grupo: 'Aulas', nome: 'Registrar aula e chamada',
    descricao: 'Lançar aula dada e a frequência dos alunos.' },
  { chave: 'matricula.gerir', grupo: 'Aulas', nome: 'Gerir matrículas',
    descricao: 'Abrir, trancar, concluir e cancelar matrícula.' },
  { chave: 'turma.gerir', grupo: 'Aulas', nome: 'Gerir turmas',
    descricao: 'Criar turmas e matricular alunos nelas.' },

  { chave: 'avaliacao.corrigir', grupo: 'Avaliação', nome: 'Corrigir avaliações',
    descricao: 'Avaliar envios e registrar resultado.' },
  { chave: 'certificado.emitir', grupo: 'Avaliação', nome: 'Emitir certificados',
    descricao: 'Emitir certificado de conclusão.' },

  { chave: 'metodo.ver', grupo: 'Métodos', nome: 'Ver a central de métodos',
    descricao: 'Consultar métodos, currículos e conferência de conteúdo.', soAdministracao: true },
  { chave: 'metodo.importar', grupo: 'Métodos', nome: 'Importar método',
    descricao: 'Enviar documento de método para análise.', soAdministracao: true },
  { chave: 'metodo.publicar', grupo: 'Métodos', nome: 'Publicar método',
    descricao: 'Confirmar a estrutura analisada e publicar o currículo.', soAdministracao: true },

  { chave: 'permissao.gerir', grupo: 'Administração', nome: 'Gerir permissões',
    descricao: 'Conceder e retirar permissões de cada perfil.', soAdministracao: true },
  { chave: 'auditoria.ver', grupo: 'Administração', nome: 'Ver a auditoria',
    descricao: 'Consultar o registro de ações com consequência.', soAdministracao: true },
];

export const permissaoPorChave = (chave: string): DefinicaoDePermissao | null =>
  PERMISSOES.find((p) => p.chave === chave) ?? null;

export const GRUPOS_DE_PERMISSAO = [...new Set(PERMISSOES.map((p) => p.grupo))];

/**
 * A concessão de fábrica.
 *
 * É a matriz que hoje está espalhada entre `cadastro.ts` e as telas, escrita
 * num lugar só. Vira semente da tabela: a partir daí, quem manda é o dado.
 */
export const PADRAO_POR_PAPEL: Record<Papel, string[]> = {
  SUPERADMIN: PERMISSOES.map((p) => p.chave),
  ADMIN_PEDAGOGICO: PERMISSOES.map((p) => p.chave),
  ENCARREGADO_REGIONAL: [
    'painel.ver', 'aluno.ver', 'relatorio.ver',
    'pessoa.cadastrar', 'pessoa.editar', 'responsavel.gerir',
    'aula.registrar', 'matricula.gerir', 'turma.gerir',
    'avaliacao.corrigir', 'certificado.emitir',
  ],
  ENCARREGADO_LOCAL: [
    'painel.ver', 'aluno.ver', 'relatorio.ver',
    'pessoa.cadastrar', 'pessoa.editar', 'responsavel.gerir',
    'aula.registrar', 'matricula.gerir', 'turma.gerir',
    'avaliacao.corrigir',
  ],
  ANCIAO: [
    'painel.ver', 'aluno.ver', 'relatorio.ver',
    'pessoa.cadastrar', 'pessoa.editar', 'responsavel.gerir',
  ],
  INSTRUTOR: [
    'painel.ver', 'aluno.ver', 'relatorio.ver',
    'pessoa.cadastrar', 'pessoa.editar', 'responsavel.gerir',
    'aula.registrar', 'matricula.gerir',
    'avaliacao.corrigir',
  ],
  // O aluno não acompanha ninguém. A lista vazia é a resposta certa, e não
  // um esquecimento.
  ALUNO: [],
};

/** As concessões como vêm do banco: papel → chaves concedidas. */
export type ConcessoesPorPapel = Partial<Record<Papel, string[]>>;

export const concessoesPadrao = (): ConcessoesPorPapel => ({ ...PADRAO_POR_PAPEL });

/**
 * Pode fazer?
 *
 * A pessoa pode quando QUALQUER um dos seus papéis concede — quem é instrutor
 * numa comum e encarregado em outra soma as duas listas.
 *
 * A administração passa por tudo. Não é atalho: é a definição do papel, e
 * escrevê-la aqui evita a alternativa pior, que seria manter a administração
 * numa lista que alguém pode esvaziar por engano e trancar todo mundo para
 * fora do sistema.
 */
export function podeFazer(
  escopo: Pick<EscopoDoUsuario, 'papeis' | 'ehAdministracao'>,
  chave: string,
  concessoes: ConcessoesPorPapel = PADRAO_POR_PAPEL,
): boolean {
  if (escopo.ehAdministracao) return true;
  return escopo.papeis.some((papel) => (concessoes[papel] ?? []).includes(chave));
}

/**
 * A verificação que as telas usam.
 *
 * Prefere o que o banco concedeu; cai na concessão de fábrica quando a tabela
 * ainda não foi semeada. Sem essa queda, um banco recém-migrado trancaria
 * todo mundo para fora por falta de linhas numa tabela.
 */
export function escopoPode(escopo: EscopoDoUsuario, chave: string): boolean {
  if (escopo.ehAdministracao) return true;
  if (escopo.permissoes) return escopo.permissoes.includes(chave);
  return podeFazer(escopo, chave);
}

/** Todas as permissões desta pessoa, reunidas dos seus papéis. */
export function permissoesDoEscopo(
  escopo: Pick<EscopoDoUsuario, 'papeis' | 'ehAdministracao'>,
  concessoes: ConcessoesPorPapel = PADRAO_POR_PAPEL,
): string[] {
  if (escopo.ehAdministracao) return PERMISSOES.map((p) => p.chave);
  const reunidas = new Set<string>();
  for (const papel of escopo.papeis) {
    for (const chave of concessoes[papel] ?? []) reunidas.add(chave);
  }
  return PERMISSOES.map((p) => p.chave).filter((c) => reunidas.has(c));
}

/**
 * O que impede conceder esta permissão a este papel.
 *
 * Duas recusas, as duas por honestidade com quem usa a tela:
 *
 *   Permissão que só a administração exerce não é oferecida a papel de campo.
 *   A tela mostraria o botão e o banco recusaria a gravação — erro sem
 *   explicação, que é pior do que não oferecer.
 *
 *   O aluno não recebe permissão de acompanhamento. Quem estuda não
 *   acompanha; se um dia acompanhar, recebe o papel correspondente.
 */
export function motivoDaRecusaDeConcessao(papel: Papel, chave: string): string | null {
  const permissao = permissaoPorChave(chave);
  if (!permissao) return `Permissão desconhecida: "${chave}".`;

  if (papel === 'ALUNO') {
    return 'O perfil de aluno não recebe permissões de acompanhamento. Para acompanhar alguém, é preciso ter o papel correspondente.';
  }
  if (permissao.soAdministracao && papel !== 'SUPERADMIN' && papel !== 'ADMIN_PEDAGOGICO') {
    return `"${permissao.nome}" só é exercida pela administração: o banco recusaria a gravação mesmo com o botão na tela.`;
  }
  if (papel === 'SUPERADMIN') {
    return 'O superadministrador tem todas as permissões por definição, e a lista dele não é editável — esvaziá-la trancaria todo mundo para fora do sistema.';
  }
  return null;
}

/** As permissões que podem ser concedidas a um papel, para montar a tela. */
export const permissoesConcediveis = (papel: Papel): DefinicaoDePermissao[] =>
  PERMISSOES.filter((p) => motivoDaRecusaDeConcessao(papel, p.chave) === null);

/** Os papéis cuja lista de permissões é editável. */
export const PAPEIS_EDITAVEIS: Papel[] = [
  'ADMIN_PEDAGOGICO', 'ENCARREGADO_REGIONAL', 'ENCARREGADO_LOCAL', 'ANCIAO', 'INSTRUTOR',
];

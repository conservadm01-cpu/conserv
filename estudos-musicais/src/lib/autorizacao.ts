/**
 * Autorização.
 *
 * Regra da casa: papel, comum e região NUNCA vêm do navegador. Chega apenas o
 * identificador da sessão; daqui para baixo tudo é resolvido no servidor, e o
 * banco ainda repete a checagem por RLS. São duas cercas independentes.
 */

import { comoUsuario, type TransacaoPrisma } from './banco.ts';

export type Papel =
  | 'SUPERADMIN' | 'ADMIN_PEDAGOGICO' | 'INSTRUTOR'
  | 'ENCARREGADO_LOCAL' | 'ENCARREGADO_REGIONAL' | 'ANCIAO' | 'ALUNO';

/**
 * Escopo resolvido no servidor. A consulta que o monta roda COM O CONTEXTO DO
 * PRÓPRIO USUÁRIO: as políticas de RLS valem também aqui, de modo que a
 * aplicação nunca enxerga mais do que o banco autoriza.
 */
export interface EscopoDoUsuario {
  usuarioId: string;
  papeis: Papel[];
  comunsDiretas: string[];
  regioes: string[];
  /** Comuns que este usuário ACOMPANHA: as diretas mais as das suas regiões. */
  comunsVisiveis: string[];
  ehAdministracao: boolean;
  comumDoAluno: string | null;
  /**
   * As permissões concedidas aos papéis desta pessoa, lidas do banco. Vem
   * vazia quando a tabela ainda não foi semeada — e nesse caso quem decide é
   * a concessão de fábrica, em src/lib/permissoes.ts.
   */
  permissoes?: string[];
}

const ADMINISTRACAO: Papel[] = ['SUPERADMIN', 'ADMIN_PEDAGOGICO'];

export async function escopoDoUsuario(usuarioId: string, tx?: TransacaoPrisma): Promise<EscopoDoUsuario> {
  const montar = async (banco: TransacaoPrisma): Promise<EscopoDoUsuario> => {
    const vinculos = await banco.vinculo.findMany({
      where: { usuarioId, ativo: true, revogadoEm: null },
      select: { papel: true, escopo: true, comumId: true, regiaoId: true },
    });
    const perfil = await banco.perfilAluno.findUnique({ where: { usuarioId }, select: { comumId: true } });

    const papeis = [...new Set(vinculos.map((v) => v.papel as Papel))];
    const comunsDiretas = [...new Set(
      vinculos.filter((v) => v.escopo === 'COMUM' && v.comumId).map((v) => v.comumId as string),
    )];
    const regioes = [...new Set(
      vinculos.filter((v) => v.escopo === 'REGIAO' && v.regiaoId).map((v) => v.regiaoId as string),
    )];

    const comunsDasRegioes = regioes.length
      ? (await banco.comum.findMany({ where: { regiaoId: { in: regioes } }, select: { id: true } })).map((c) => c.id)
      : [];

    // A comum do próprio aluno NÃO entra em comunsVisiveis: ela é o lugar
    // onde ele estuda, não um escopo de acompanhamento. Sem esta separação,
    // um aluno enxergaria os colegas da própria comum.
    const comunsVisiveis = [...new Set([...comunsDiretas, ...comunsDasRegioes])];

    // As permissões concedidas aos papéis desta pessoa. A tabela pode estar
    // vazia num banco ainda não semeado; nesse caso a lista sai indefinida e
    // quem decide é a concessão de fábrica, em src/lib/permissoes.ts. Vale a
    // pena esse cuidado: sem ele, um banco recém-migrado trancaria todo mundo
    // para fora por falta de linhas numa tabela.
    const concedidas = papeis.length
      ? await banco.permissaoDoPapel.findMany({
        where: { papel: { in: papeis }, concedida: true },
        select: { permissaoChave: true },
      })
      : [];

    return {
      usuarioId,
      papeis,
      comunsDiretas,
      regioes,
      comunsVisiveis,
      ehAdministracao: papeis.some((p) => ADMINISTRACAO.includes(p)),
      comumDoAluno: perfil?.comumId ?? null,
      permissoes: concedidas.length ? [...new Set(concedidas.map((c) => c.permissaoChave))] : undefined,
    };
  };

  return tx ? montar(tx) : comoUsuario(usuarioId, montar);
}

export const temPapel = (escopo: EscopoDoUsuario, ...papeis: Papel[]) =>
  escopo.papeis.some((p) => papeis.includes(p));

export const veComum = (escopo: EscopoDoUsuario, comumId: string | null | undefined) =>
  Boolean(comumId) && (escopo.ehAdministracao || escopo.comunsVisiveis.includes(comumId as string));

export const veRegiao = (escopo: EscopoDoUsuario, regiaoId: string | null | undefined) =>
  Boolean(regiaoId) && (escopo.ehAdministracao || escopo.regioes.includes(regiaoId as string));

/**
 * Quem pode acompanhar este aluno: ele mesmo, o instrutor designado e quem
 * tem vínculo na comum dele (ou na região da comum). Trocar o id na URL não
 * abre nada: a resposta depende do vínculo, não do parâmetro.
 */
export async function podeVerAluno(escopo: EscopoDoUsuario, alunoId: string, tx?: TransacaoPrisma): Promise<boolean> {
  if (alunoId === escopo.usuarioId || escopo.ehAdministracao) return true;
  const buscar = (banco: TransacaoPrisma) => banco.perfilAluno.findUnique({
    where: { usuarioId: alunoId },
    select: { comumId: true, instrutorId: true },
  });
  const perfil = tx ? await buscar(tx) : await comoUsuario(escopo.usuarioId, buscar);
  if (!perfil) return false;
  if (perfil.instrutorId === escopo.usuarioId) return true;
  return escopo.comunsVisiveis.includes(perfil.comumId);
}

/** Filtro de comuns para consultas de painel: nunca devolve "todas" sem escopo. */
export function filtroDeComuns(escopo: EscopoDoUsuario): { in: string[] } | undefined {
  if (escopo.ehAdministracao) return undefined;
  return { in: escopo.comunsVisiveis };
}

/**
 * Acompanha alguém? É quem tem qualquer papel além do de aluno.
 *
 * Separa as duas metades do sistema: a de quem estuda e a de quem acompanha.
 * As telas de painel pedem isto antes de qualquer consulta — a RLS já esconde
 * os dados de quem não deve vê-los, mas uma tela de acompanhamento aberta e
 * vazia não é resposta: é confusão.
 */
export const ehAcompanhante = (escopo: EscopoDoUsuario) =>
  escopo.papeis.some((papel) => papel !== 'ALUNO');

/**
 * Onde cada um cai depois de entrar: quem só estuda vai para as suas jornadas,
 * quem acompanha vai para o painel.
 *
 * Existe como função — e não como um `/` que redireciona de novo — porque uma
 * ação de servidor entrega UM redirecionamento ao navegador. Encadear
 * `/entrar` → `/` → `/painel` fazia o segundo salto se perder, e o usuário
 * voltava à tela de entrada mesmo já autenticado.
 */
export function destinoInicial(escopo: EscopoDoUsuario): string {
  return ehAcompanhante(escopo) ? '/painel' : '/aluno';
}

export class SemPermissao extends Error {
  constructor(mensagem = 'Você não tem permissão para esta ação.') {
    super(mensagem);
    this.name = 'SemPermissao';
  }
}

export function exigirPapel(escopo: EscopoDoUsuario, ...papeis: Papel[]) {
  if (!temPapel(escopo, ...papeis) && !escopo.ehAdministracao) {
    throw new SemPermissao('Esta área é restrita a ' + papeis.join(', ') + '.');
  }
}

export async function exigirVerAluno(escopo: EscopoDoUsuario, alunoId: string, tx?: TransacaoPrisma) {
  if (!(await podeVerAluno(escopo, alunoId, tx))) {
    throw new SemPermissao('Este aluno não está sob a sua responsabilidade.');
  }
}

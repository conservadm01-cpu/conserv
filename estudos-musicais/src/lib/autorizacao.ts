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

    return {
      usuarioId,
      papeis,
      comunsDiretas,
      regioes,
      comunsVisiveis,
      ehAdministracao: papeis.some((p) => ADMINISTRACAO.includes(p)),
      comumDoAluno: perfil?.comumId ?? null,
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

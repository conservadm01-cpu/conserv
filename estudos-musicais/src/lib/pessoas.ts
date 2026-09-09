/**
 * Pessoas em volta do aluno: responsáveis e instrutores.
 *
 * Uma escolha de nome que precisa estar escrita, porque o termo da
 * especificação não serve aqui. O que a especificação chama de "encarregado"
 * — pai, mãe, tutor, quem responde pelo aluno — neste domínio é RESPONSÁVEL.
 * "Encarregado local" e "encarregado regional" já existem e significam outra
 * coisa inteiramente: são cargos do ministério da música. Usar a mesma palavra
 * para as duas coisas produziria telas, relatórios e permissões ambíguas
 * justamente onde a clareza importa.
 *
 * As regras aqui são a primeira cerca; as políticas de RLS são a segunda.
 */

import type { EscopoDoUsuario } from './autorizacao.ts';
import { SemPermissao } from './autorizacao.ts';
import { motivoDaRecusaDeEdicao, type UsuarioParaEdicao } from './cadastro.ts';

// ------------------------------------------------------------ responsáveis

export interface ResponsavelParaGravar {
  nomeCompleto: string;
  documento?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  observacao?: string | null;
}

export interface VinculoDeResponsavel {
  parentesco?: string | null;
  pedagogico?: boolean;
  financeiro?: boolean;
  recebeAvisos?: boolean;
}

const limpo = (valor: unknown) => String(valor ?? '').trim();
const soDigitos = (valor: unknown) => limpo(valor).replace(/\D/g, '');

/**
 * O que impede gravar um responsável. Devolve a mensagem, não lança: quem
 * chama decide se é erro de formulário ou recusa de permissão.
 */
export function motivoDaRecusaDeResponsavel(dados: ResponsavelParaGravar): string | null {
  const nome = limpo(dados.nomeCompleto);
  if (!nome) return 'Informe o nome do responsável.';
  if (!nome.includes(' ')) return 'Informe o nome completo do responsável.';

  const email = limpo(dados.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'E-mail do responsável inválido.';

  const telefone = soDigitos(dados.telefone);
  if (telefone && (telefone.length < 10 || telefone.length > 11)) {
    return 'Telefone do responsável precisa ter DDD e 10 ou 11 dígitos.';
  }

  const documento = soDigitos(dados.documento);
  if (documento && documento.length !== 11 && documento.length !== 14) {
    return 'Documento do responsável precisa ser um CPF (11 dígitos) ou CNPJ (14).';
  }

  const uf = limpo(dados.estado);
  if (uf && uf.length !== 2) return 'Estado precisa ser a sigla de duas letras.';

  return null;
}

/**
 * Quem pode mexer nos responsáveis de um aluno: quem pode editar o aluno.
 * O critério é o mesmo de sempre — não se cria uma segunda régua para dizer a
 * mesma coisa, porque duas réguas divergem com o tempo.
 */
export function motivoDaRecusaDeVinculoDeResponsavel(
  quemEdita: EscopoDoUsuario,
  aluno: UsuarioParaEdicao,
): string | null {
  return motivoDaRecusaDeEdicao(quemEdita, aluno);
}

export function exigirPodeCuidarDosResponsaveis(quemEdita: EscopoDoUsuario, aluno: UsuarioParaEdicao): void {
  const motivo = motivoDaRecusaDeVinculoDeResponsavel(quemEdita, aluno);
  if (motivo) throw new SemPermissao(motivo);
}

/**
 * Um aluno menor de idade precisa de pelo menos um responsável pedagógico.
 * A regra existe para o caso real: quem autoriza a troca de instrumento de um
 * menino de onze anos não é ele.
 *
 * Devolve aviso, não impedimento. Cadastro incompleto fica pendente de
 * conferência; recusar o cadastro deixaria o aluno de fora do sistema, que é
 * pior do que registrá-lo com uma pendência visível.
 */
export function avisoDeResponsavelObrigatorio(
  nascimento: Date | null | undefined,
  vinculos: Array<{ pedagogico: boolean }>,
  hoje: Date = new Date(),
): string | null {
  if (!nascimento) return null;
  const anos = (hoje.getTime() - nascimento.getTime()) / (365.2425 * 24 * 3600 * 1000);
  if (anos >= 18) return null;
  if (vinculos.some((v) => v.pedagogico)) return null;
  return 'Aluno menor de idade sem responsável pedagógico cadastrado.';
}

/** O responsável que recebe os avisos deste aluno. Pode não haver nenhum. */
export const quemRecebeAvisos = <T extends { recebeAvisos: boolean }>(vinculos: T[]): T[] =>
  vinculos.filter((v) => v.recebeAvisos);

// -------------------------------------------------------------- instrutores

export interface AtuacaoParaGravar {
  instrumentoId?: string | null;
  metodoId?: string | null;
}

/**
 * Um instrutor atende um aluno quando trabalha com o instrumento dele — ou
 * quando não declarou instrumento nenhum, caso em que atende a todos.
 *
 * A atuação sem instrumento significa "todos", e não "nenhum". É a leitura que
 * corresponde ao uso: a ficha nasce vazia, e ninguém deve deixar de aparecer
 * como instrutor por ainda não ter preenchido um campo.
 */
export function atuaCom(
  atuacoes: AtuacaoParaGravar[],
  alvo: { instrumentoId?: string | null; metodoId?: string | null },
): boolean {
  if (!atuacoes.length) return true;
  return atuacoes.some((a) => {
    const instrumentoBate = !a.instrumentoId || !alvo.instrumentoId || a.instrumentoId === alvo.instrumentoId;
    const metodoBate = !a.metodoId || !alvo.metodoId || a.metodoId === alvo.metodoId;
    return instrumentoBate && metodoBate;
  });
}

/** Atuação repetida não é erro do usuário: é clique duplo. Some em silêncio. */
export function atuacoesSemRepetir(atuacoes: AtuacaoParaGravar[]): AtuacaoParaGravar[] {
  const vistas = new Set<string>();
  const resultado: AtuacaoParaGravar[] = [];
  for (const atuacao of atuacoes) {
    const chave = `${atuacao.instrumentoId ?? ''}#${atuacao.metodoId ?? ''}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    resultado.push(atuacao);
  }
  return resultado;
}

export function motivoDaRecusaDePerfilDeInstrutor(
  quemEdita: EscopoDoUsuario,
  alvo: UsuarioParaEdicao,
): string | null {
  if (alvo.id === quemEdita.usuarioId) return null;
  return motivoDaRecusaDeEdicao(quemEdita, alvo);
}

// --------------------------------------------------------------- localidades

export const TIPOS_DE_LOCALIDADE = [
  { id: 'COMUM', nome: 'Comum-congregação' },
  { id: 'ESCOLA_DE_MUSICA', nome: 'Escola de música' },
  { id: 'POLO', nome: 'Polo' },
  { id: 'SALA', nome: 'Sala' },
  { id: 'UNIDADE', nome: 'Unidade' },
  { id: 'OUTRO', nome: 'Outro' },
] as const;

export type TipoDeLocalidade = (typeof TIPOS_DE_LOCALIDADE)[number]['id'];

export const nomeDoTipoDeLocalidade = (tipo: string): string =>
  TIPOS_DE_LOCALIDADE.find((t) => t.id === tipo)?.nome ?? tipo;

export function motivoDaRecusaDeLocalidade(dados: {
  nome?: string; cidade?: string; estado?: string; cep?: string | null;
}): string | null {
  if (!limpo(dados.nome)) return 'Informe o nome da localidade.';
  if (!limpo(dados.cidade)) return 'Informe a cidade.';
  const uf = limpo(dados.estado);
  if (uf.length !== 2) return 'Informe o estado com a sigla de duas letras.';
  const cep = soDigitos(dados.cep);
  if (cep && cep.length !== 8) return 'CEP precisa ter 8 dígitos.';
  return null;
}

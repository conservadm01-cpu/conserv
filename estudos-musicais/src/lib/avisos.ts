/**
 * Avisos.
 *
 * O aviso nasce sempre como aviso INTERNO — aparece no painel de quem o
 * recebe — e a entrega por outro canal é uma linha à parte. É essa separação
 * que permite ligar e-mail ou WhatsApp depois sem tocar em quem cria o aviso:
 * quem avisa continua chamando a mesma função, e um processo separado lê o
 * que está pendente e entrega.
 *
 * Nenhum canal externo está ligado, de propósito. O que existe é a estrutura
 * pronta para eles.
 */

import type { TransacaoPrisma } from './banco.ts';

export type TipoDeAviso =
  | 'avaliacao.disponivel' | 'avaliacao.pendente' | 'fase.concluida'
  | 'avaliacao.aprovada' | 'avaliacao.reprovada' | 'atividade.nova'
  | 'aula.falta' | 'instrutor.recado' | 'certificado.emitido';

export interface AvisoParaCriar {
  usuarioId: string;
  tipo: TipoDeAviso;
  titulo: string;
  texto: string;
  destino?: string | null;
  entidade?: string | null;
  entidadeId?: string | null;
  canais?: Array<'EMAIL' | 'PUSH' | 'WHATSAPP'>;
}

/**
 * Avisa uma pessoa, sem repetir.
 *
 * A chave é (usuário, tipo, entidade, registro): avisar duas vezes da mesma
 * coisa é o caminho mais curto para a pessoa parar de ler os avisos. Devolve
 * nulo quando o aviso já existia — quem chama não precisa saber se é a
 * primeira vez.
 */
export async function avisar(banco: TransacaoPrisma, aviso: AvisoParaCriar) {
  if (aviso.entidade && aviso.entidadeId) {
    const jaAvisado = await banco.aviso.findFirst({
      where: {
        usuarioId: aviso.usuarioId, tipo: aviso.tipo,
        entidade: aviso.entidade, entidadeId: aviso.entidadeId,
      },
      select: { id: true },
    });
    if (jaAvisado) return null;
  }

  const criado = await banco.aviso.create({
    data: {
      usuarioId: aviso.usuarioId, tipo: aviso.tipo, titulo: aviso.titulo,
      texto: aviso.texto, destino: aviso.destino ?? null,
      entidade: aviso.entidade ?? null, entidadeId: aviso.entidadeId ?? null,
    },
  });

  // A entrega por canal externo fica PENDENTE. Nenhum canal está ligado: quem
  // ligar escreve o processo que lê isto e grava ENVIADO.
  for (const canal of aviso.canais ?? []) {
    await banco.entregaDeAviso.create({ data: { avisoId: criado.id, canal } });
  }
  return criado;
}

export const naoLidos = (banco: TransacaoPrisma, usuarioId: string) =>
  banco.aviso.count({ where: { usuarioId, lidoEm: null } });

export const marcarComoLido = (banco: TransacaoPrisma, usuarioId: string, avisoId: string) =>
  banco.aviso.updateMany({ where: { id: avisoId, usuarioId, lidoEm: null }, data: { lidoEm: new Date() } });

/** O texto de cada tipo, num lugar só, para o aviso não sair diferente a cada chamada. */
export const MOLDES: Record<TipoDeAviso, { titulo: string }> = {
  'avaliacao.disponivel': { titulo: 'Avaliação disponível' },
  'avaliacao.pendente': { titulo: 'Avaliação esperando você' },
  'fase.concluida': { titulo: 'Fase concluída' },
  'avaliacao.aprovada': { titulo: 'Você foi aprovado' },
  'avaliacao.reprovada': { titulo: 'Avaliação não atingiu a nota' },
  'atividade.nova': { titulo: 'Atividade nova' },
  'aula.falta': { titulo: 'Falta registrada' },
  'instrutor.recado': { titulo: 'Recado do instrutor' },
  'certificado.emitido': { titulo: 'Certificado emitido' },
};

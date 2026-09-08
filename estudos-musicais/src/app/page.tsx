import { redirect } from 'next/navigation';
import { usuarioDaRequisicao } from '@/lib/sessao.ts';
import { temPapel } from '@/lib/autorizacao.ts';

export const dynamic = 'force-dynamic';

/** Cada um cai no seu lugar: quem estuda, na trilha; quem acompanha, no painel. */
export default async function Raiz() {
  const usuario = await usuarioDaRequisicao();
  if (!usuario) redirect('/entrar');
  if (temPapel(usuario.escopo, 'ALUNO') && usuario.escopo.papeis.length === 1) redirect('/aluno');
  redirect('/painel');
}

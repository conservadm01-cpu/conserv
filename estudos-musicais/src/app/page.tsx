import { redirect } from 'next/navigation';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { destinoInicial } from '@/lib/autorizacao.ts';

export const dynamic = 'force-dynamic';

/** Cada um cai no seu lugar: quem estuda, na trilha; quem acompanha, no painel. */
export default async function Raiz() {
  const usuario = await usuarioDaTela();
  redirect(destinoInicial(usuario.escopo));
}

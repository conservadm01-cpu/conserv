import { redirect } from 'next/navigation';
import { encerrarSessao } from '@/lib/sessao.ts';

export const dynamic = 'force-dynamic';

export default async function Sair() {
  await encerrarSessao();
  redirect('/entrar');
}

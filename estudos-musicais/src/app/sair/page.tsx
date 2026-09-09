import { redirect } from 'next/navigation';
import { encerrarSessao } from '@/lib/sessao.ts';
import { Cabecalho } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Sair.
 *
 * A saída é um FORMULÁRIO, não um link que desloga ao ser renderizado.
 *
 * Havia dois problemas em encerrar a sessão durante o render. O primeiro é que
 * o Next 16 não deixa: apagar cookie fora de ação de servidor levanta erro, e
 * a página respondia 500 — o botão "Sair" estava quebrado. O segundo é mais
 * antigo e vale para qualquer versão: uma URL que desloga por GET desloga
 * também quando o navegador a pré-carrega, quando alguém abre o histórico ou
 * quando um antivírus visita os links da página.
 */
async function encerrar() {
  'use server';
  await encerrarSessao();
  redirect('/entrar');
}

export default async function Sair() {
  return (
    <main className="mx-auto max-w-sm p-6">
      <Cabecalho titulo="Sair" subtitulo="Encerrar a sessão neste aparelho" />
      <form action={encerrar}>
        <button type="submit" className="botao">Encerrar a sessão</button>
      </form>
      <a href="/painel" className="botao-secundario mt-3 inline-block">Continuar conectado</a>
    </main>
  );
}

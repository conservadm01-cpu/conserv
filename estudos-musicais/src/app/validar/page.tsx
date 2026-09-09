import { redirect } from 'next/navigation';
import { Cabecalho } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

async function conferir(dadosDoFormulario: FormData) {
  'use server';
  const codigo = String(dadosDoFormulario.get('codigo') ?? '').trim().toUpperCase();
  if (!codigo) redirect('/validar');
  redirect(`/validar/${encodeURIComponent(codigo)}`);
}

/** Entrada da conferência pública. Não exige conta — é o objetivo dela. */
export default function EntradaDaValidacao() {
  return (
    <main className="mx-auto max-w-md p-6">
      <Cabecalho titulo="Conferir certificado" subtitulo="Digite o código impresso no documento" />
      <form action={conferir} className="grid gap-3">
        <div>
          <label htmlFor="codigo" className="rotulo">Código de verificação</label>
          <input id="codigo" name="codigo" required className="campo" autoComplete="off"
            placeholder="ex.: MSA-01-3AW735" />
        </div>
        <button type="submit" className="botao">Conferir</button>
      </form>
      <p className="mt-6 text-xs text-tinta-fraca">
        Esta página não exige conta: um certificado existe para ser mostrado a terceiros, e quem confere é
        quem está de fora. Ela mostra apenas o que o próprio documento já mostra.
      </p>
    </main>
  );
}

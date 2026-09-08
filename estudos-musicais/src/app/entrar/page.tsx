import { redirect } from 'next/navigation';
import { conferirSenha } from '@/lib/senha.ts';
import { prisma } from '@/lib/banco.ts';
import { abrirSessao, usuarioDaRequisicao } from '@/lib/sessao.ts';
import { Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

async function entrar(dadosDoFormulario: FormData) {
  'use server';
  const email = String(dadosDoFormulario.get('email') ?? '').trim().toLowerCase();
  const senha = String(dadosDoFormulario.get('senha') ?? '');

  // Antes da sessão não há contexto de RLS: a leitura passa por uma função de
  // banco que devolve só id, resumo da senha e situação, por e-mail exato.
  const [usuario] = await prisma.$queryRaw<{ id: string; senha_hash: string; status: string }[]>`
    SELECT * FROM app.credenciais_para_login(${email})`;

  // Mesma resposta para e-mail inexistente e senha errada: não se confirma
  // a existência de cadastro a quem tenta adivinhar.
  const confere = usuario ? await conferirSenha(senha, usuario.senha_hash) : false;
  if (!usuario || !confere) redirect('/entrar?erro=credenciais');
  if (usuario.status !== 'ATIVO') redirect('/entrar?erro=pendente');

  await abrirSessao(usuario.id);
  redirect('/');
}

export default async function PaginaDeEntrada({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (await usuarioDaRequisicao()) redirect('/');
  const { erro } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <p className="text-5xl">🎼</p>
        <h1 className="mt-2 font-titulo text-3xl">Estudos Musicais</h1>
        <p className="text-sm text-tinta-fraca">Os seus métodos e o seu instrumento</p>
      </div>

      {erro === 'credenciais' && <Aviso tom="alerta">E-mail ou senha incorretos.</Aviso>}
      {erro === 'pendente' && (
        <Aviso tom="pendente">
          O seu cadastro ainda aguarda aprovação do responsável pela sua comum.
        </Aviso>
      )}

      <form action={entrar} className="cartao flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="rotulo">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="campo mt-1" />
        </div>
        <div>
          <label htmlFor="senha" className="rotulo">Senha</label>
          <input id="senha" name="senha" type="password" autoComplete="current-password" required className="campo mt-1" />
        </div>
        <button type="submit" className="botao">Entrar</button>
      </form>

      <p className="text-center text-xs text-tinta-fraca">
        O acesso é concedido pelo responsável da comum. Papel, comum e região são resolvidos no servidor.
      </p>
    </main>
  );
}

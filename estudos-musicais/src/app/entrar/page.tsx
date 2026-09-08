import { redirect } from 'next/navigation';
import { conferirSenha } from '@/lib/senha.ts';
import { prisma } from '@/lib/banco.ts';
import { abrirSessao, usuarioDaRequisicao } from '@/lib/sessao.ts';
import { destinoInicial, escopoDoUsuario } from '@/lib/autorizacao.ts';
import { Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

async function entrar(dadosDoFormulario: FormData) {
  'use server';
  const identificacao = String(dadosDoFormulario.get('identificacao') ?? '').trim();
  const senha = String(dadosDoFormulario.get('senha') ?? '');

  // Antes da sessão não há contexto de RLS: a leitura passa por uma função de
  // banco que devolve só id, resumo da senha e situação. Aceita e-mail ou nome
  // de acesso, com a mesma normalização dos dois lados.
  const [usuario] = await prisma.$queryRaw<{
    id: string; senha_hash: string; status: string; deve_trocar_senha: boolean;
  }[]>`SELECT * FROM app.credenciais_para_login(${identificacao})`;

  // Mesma resposta para cadastro inexistente e senha errada: não se confirma
  // a existência de conta a quem tenta adivinhar.
  const confere = usuario ? await conferirSenha(senha, usuario.senha_hash) : false;
  if (!usuario || !confere) redirect('/entrar?erro=credenciais');
  if (usuario.status !== 'ATIVO') redirect('/entrar?erro=pendente');

  await abrirSessao(usuario.id);
  // Senha provisória entregue por quem cadastrou: trocar é o primeiro ato.
  if (usuario.deve_trocar_senha) redirect('/trocar-senha');
  redirect(destinoInicial(await escopoDoUsuario(usuario.id)));
}

export default async function PaginaDeEntrada({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const jaEntrou = await usuarioDaRequisicao();
  if (jaEntrou) redirect(jaEntrou.deveTrocarSenha ? '/trocar-senha' : destinoInicial(jaEntrou.escopo));
  const { erro } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <p className="text-5xl">🎼</p>
        <h1 className="mt-2 font-titulo text-3xl">Estudos Musicais</h1>
        <p className="text-sm text-tinta-fraca">Os seus métodos e o seu instrumento</p>
      </div>

      {erro === 'credenciais' && <Aviso tom="alerta">Usuário, e-mail ou senha incorretos.</Aviso>}
      {erro === 'senha-trocada' && (
        <Aviso tom="neutro">Senha alterada. Entre com a senha nova.</Aviso>
      )}
      {erro === 'pendente' && (
        <Aviso tom="pendente">
          O seu cadastro ainda aguarda aprovação do responsável pela sua comum.
        </Aviso>
      )}

      <form action={entrar} className="cartao flex flex-col gap-4">
        <div>
          <label htmlFor="identificacao" className="rotulo">Usuário ou e-mail</label>
          <input id="identificacao" name="identificacao" type="text" autoComplete="username"
            required autoCapitalize="none" spellCheck={false} className="campo mt-1" />
        </div>
        <div>
          <label htmlFor="senha" className="rotulo">Senha</label>
          <input id="senha" name="senha" type="password" autoComplete="current-password" required className="campo mt-1" />
        </div>
        <button type="submit" className="botao">Entrar</button>
      </form>

      <p className="text-center text-xs text-tinta-fraca">
        Não há autocadastro. A conta é criada por quem já tem acesso, e o papel, a comum e a
        região são resolvidos no servidor.
      </p>
    </main>
  );
}

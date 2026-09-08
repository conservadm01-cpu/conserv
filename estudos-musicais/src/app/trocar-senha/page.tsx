import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaRequisicao } from '@/lib/sessao.ts';
import { conferirSenha, gerarHashDeSenha, validarSenha } from '@/lib/senha.ts';
import { Cabecalho, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Troca da senha provisória.
 *
 * Quem cadastra define uma senha de entrega; ela vale uma vez. Enquanto o dono
 * não trocar, `usuarioDaTela()` traz para cá qualquer outra rota — a conta
 * existe, mas não abre nada com uma senha que outra pessoa conhece.
 */
async function trocar(dadosDoFormulario: FormData) {
  'use server';
  const usuario = await usuarioDaRequisicao();
  if (!usuario) redirect('/entrar');

  const atual = String(dadosDoFormulario.get('atual') ?? '');
  const nova = String(dadosDoFormulario.get('nova') ?? '');
  const repetida = String(dadosDoFormulario.get('repetida') ?? '');

  const problema = validarSenha(nova);
  if (problema) redirect(`/trocar-senha?erro=${encodeURIComponent(problema)}`);
  if (nova !== repetida) redirect('/trocar-senha?erro=As%20senhas%20n%C3%A3o%20conferem.');

  const guardado = await comoUsuario(usuario.id, (banco) => banco.usuario.findUniqueOrThrow({
    where: { id: usuario.id }, select: { senhaHash: true },
  }));
  if (!(await conferirSenha(atual, guardado.senhaHash))) {
    redirect('/trocar-senha?erro=A%20senha%20atual%20est%C3%A1%20incorreta.');
  }
  if (await conferirSenha(nova, guardado.senhaHash)) {
    redirect('/trocar-senha?erro=A%20nova%20senha%20precisa%20ser%20diferente%20da%20atual.');
  }

  const senhaHash = await gerarHashDeSenha(nova);
  await comoUsuario(usuario.id, async (banco) => {
    await banco.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash, deveTrocarSenha: false },
    });
    // Trocar a senha derruba as outras sessões: se a provisória circulou, a
    // troca precisa valer também para quem já tivesse entrado com ela.
    await banco.sessao.updateMany({
      where: { usuarioId: usuario.id, encerradaEm: null },
      data: { encerradaEm: new Date() },
    });
    await banco.auditoria.create({
      data: { usuarioId: usuario.id, acao: 'TROCAR_SENHA', entidade: 'usuarios', entidadeId: usuario.id },
    });
  });

  redirect('/entrar?erro=senha-trocada');
}

export default async function PaginaDeTrocaDeSenha({
  searchParams,
}: { searchParams: Promise<{ erro?: string }> }) {
  const usuario = await usuarioDaRequisicao();
  if (!usuario) redirect('/entrar');
  const { erro } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <Cabecalho
        titulo={usuario.deveTrocarSenha ? 'Defina a sua senha' : 'Trocar a senha'}
        subtitulo={usuario.deveTrocarSenha
          ? `${usuario.nomeCompleto}, a senha atual foi definida por quem cadastrou você. Escolha uma que só você saiba.`
          : usuario.nomeCompleto}
      />

      {erro && <Aviso tom="alerta">{erro}</Aviso>}

      <form action={trocar} className="cartao flex flex-col gap-4">
        <div>
          <label htmlFor="atual" className="rotulo">Senha atual</label>
          <input id="atual" name="atual" type="password" autoComplete="current-password"
            required className="campo mt-1" />
        </div>
        <div>
          <label htmlFor="nova" className="rotulo">Nova senha</label>
          <input id="nova" name="nova" type="password" autoComplete="new-password"
            required minLength={8} className="campo mt-1" />
        </div>
        <div>
          <label htmlFor="repetida" className="rotulo">Repita a nova senha</label>
          <input id="repetida" name="repetida" type="password" autoComplete="new-password"
            required minLength={8} className="campo mt-1" />
        </div>
        <button type="submit" className="botao">Salvar e entrar de novo</button>
      </form>

      <p className="text-center text-xs text-tinta-fraca">
        Ao salvar, as sessões abertas são encerradas — inclusive esta. Entre outra vez com a
        senha nova.
      </p>
    </main>
  );
}

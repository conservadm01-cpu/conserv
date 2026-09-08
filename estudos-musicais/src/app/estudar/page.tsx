import Link from 'next/link';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Estudar — Estudos Musicais' };

/**
 * O app de estudo, dentro da plataforma.
 *
 * É o mesmo aplicativo que roda sozinho no celular — fases, exercícios lúdicos,
 * avaliação sem pergunta repetida e certificado. A diferença é a porta: aqui
 * ele não tem cadastro próprio nem tela de entrada. A identidade chega pronta
 * do servidor, já autenticada, e as rotas de acesso do app ficam desligadas
 * (ver `public/estudar/js/plataforma.js`).
 *
 * Assim existe UM cadastro só, e vale a regra da casa: ninguém entra sem ter
 * sido cadastrado por alguém com permissão.
 */
export default async function PaginaDeEstudo() {
  const usuario = await usuarioDaTela();

  const ficha = await comoUsuario(usuario.id, async (banco) => {
    const perfil = await banco.perfilAluno.findUnique({
      where: { usuarioId: usuario.id },
      include: {
        comum: { select: { nome: true, cidade: true } },
        instrumento: { select: { nome: true } },
      },
    });
    const contato = await banco.usuario.findUnique({
      where: { id: usuario.id }, select: { telefone: true },
    });
    return {
      comum: perfil?.comum ? [perfil.comum.nome, perfil.comum.cidade].filter(Boolean).join(' — ') : '',
      instrumento: perfil?.instrumento?.nome ?? '',
      encarregadoLocal: perfil?.encarregadoLocalNome ?? '',
      encarregadoRegional: perfil?.encarregadoRegionalNome ?? '',
      anciao: perfil?.anciaoNome ?? '',
      email: usuario.email,
      whatsapp: contato?.telefone ?? '',
    };
  });

  const identidade = { id: usuario.id, nome: usuario.nomeCompleto, ficha, sair: '/sair', voltar: '/aluno' };

  return (
    <>
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <Link href="/aluno" className="text-tinta-fraca hover:underline">‹ Plataforma</Link>
        <span className="text-tinta-fraca">{usuario.nomeCompleto}</span>
      </div>

      <link rel="stylesheet" href="/estudar/css/estilo.css" />

      {/* O app desenha dentro destes dois nós por conta própria. Entregamos o
          conteúdo inicial como HTML para o React não tentar reconciliar o que
          não é dele — sem isso, a hidratação briga com o primeiro desenho. */}
      <main
        id="tela"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: '<p class="aviso">Carregando…</p>' }}
      />
      <div
        id="area-impressao"
        aria-hidden="true"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: '' }}
      />

      {/* A identidade vai como DADO, não como código: nada aqui é executado. */}
      <script
        id="plataforma"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(identidade).replace(/</g, '\\u003c') }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: 'window.__PLATAFORMA__ = JSON.parse(document.getElementById("plataforma").textContent);',
        }}
      />
      <script type="module" src="/estudar/js/app.js" />
    </>
  );
}

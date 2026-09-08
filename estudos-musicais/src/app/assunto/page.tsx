import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaRequisicao } from '@/lib/sessao.ts';
import { Cabecalho, SeloDeConferencia, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

const NOME_DA_CLAVE: Record<string, string> = { SOL: 'Clave de Sol', DO: 'Clave de Dó', FA: 'Clave de Fá' };

/**
 * Navegação por assunto: escala → clave → compasso → exercícios de todas as
 * unidades. É complementar à ordem oficial do método, que continua intacta na
 * jornada do aluno.
 *
 * O recorte por método é filtro, não ramificação: a página não sabe quais
 * métodos existem, só mostra os que o usuário alcança.
 */
export default async function PaginaPorAssunto({
  searchParams,
}: { searchParams: Promise<{ escala?: string; clave?: string; compasso?: string; unidade?: string; metodo?: string }> }) {
  const usuario = await usuarioDaRequisicao();
  if (!usuario) redirect('/entrar');
  const filtros = await searchParams;

  const dados = await comoUsuario(usuario.id, async (banco) => {
    // Só o que está publicado, e só dentro do que o aluno alcança. A unidade
    // escolhida traz junto a sua subárvore, pelo caminho materializado.
    const unidade = filtros.unidade
      ? await banco.unidadeCurricular.findUnique({ where: { id: filtros.unidade } })
      : null;

    const versoes = await banco.versaoLicao.findMany({
      where: {
        ...(filtros.escala ? { escalaReferencia: filtros.escala } : {}),
        ...(filtros.clave ? { clave: filtros.clave as 'SOL' | 'DO' | 'FA' } : {}),
        ...(filtros.compasso ? { compassos: { has: filtros.compasso } } : {}),
        licao: {
          statusPublicacao: 'PUBLICADO',
          ...(filtros.metodo ? { metodo: { codigo: filtros.metodo } } : {}),
          ...(unidade
            ? {
              unidade: {
                curriculoId: unidade.curriculoId,
                OR: [{ id: unidade.id }, { caminho: { startsWith: `${unidade.caminho}/` } }],
              },
            }
            : {}),
        },
      },
      include: {
        licao: {
          include: {
            metodo: { select: { codigo: true, nome: true } },
            unidade: { select: { id: true, tipo: true, codigo: true, nome: true, ordem: true } },
          },
        },
      },
      orderBy: [{ escalaReferencia: 'asc' }, { clave: 'asc' }],
    });

    const escalas = await banco.agrupamento.findMany({ where: { tipo: 'ESCALA' }, orderBy: { valor: 'asc' } });
    const compassos = await banco.agrupamento.findMany({ where: { tipo: 'COMPASSO' }, orderBy: { valor: 'asc' } });
    // Os métodos que o usuário alcança — a RLS já limita o que volta daqui.
    const metodos = await banco.metodo.findMany({
      where: { curriculos: { some: { unidades: { some: { licoes: { some: { statusPublicacao: 'PUBLICADO' } } } } } } },
      select: { codigo: true, nome: true }, orderBy: { nome: 'asc' },
    });
    return { versoes, escalas, compassos, metodos, unidade };
  });

  // Agrupa como o índice pede: escala → clave → compasso → fase.
  const arvore = new Map<string, Map<string, Map<string, typeof dados.versoes>>>();
  for (const versao of dados.versoes) {
    const escala = versao.escalaReferencia ?? 'Sem escala definida';
    const clave = NOME_DA_CLAVE[versao.clave] ?? versao.clave;
    const listaDeCompassos = versao.compassos.length ? versao.compassos : ['sem fórmula indicada'];
    for (const compasso of listaDeCompassos) {
      if (!arvore.has(escala)) arvore.set(escala, new Map());
      const porClave = arvore.get(escala)!;
      if (!porClave.has(clave)) porClave.set(clave, new Map());
      const porCompasso = porClave.get(clave)!;
      if (!porCompasso.has(compasso)) porCompasso.set(compasso, []);
      porCompasso.get(compasso)!.push(versao);
    }
  }

  const link = (novos: Record<string, string | undefined>) => {
    const parametros = new URLSearchParams();
    for (const [chave, valor] of Object.entries({ ...filtros, ...novos })) if (valor) parametros.set(chave, valor);
    const consulta = parametros.toString();
    return `/assunto${consulta ? `?${consulta}` : ''}`;
  };

  return (
    <main className="mx-auto max-w-3xl p-6 pb-16">
      <Cabecalho titulo="Estudo por assunto" voltar="/aluno"
        subtitulo={dados.unidade
          ? `Dentro de ${dados.unidade.tipo.toLowerCase()} ${dados.unidade.codigo} — ${dados.unidade.nome}`
          : 'Escolha o método, a escala, a clave e o compasso.'} />

      <section className="cartao mb-4 space-y-3">
        <div>
          <p className="rotulo">Método</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href={link({ metodo: undefined, unidade: undefined })}
              className={`etiqueta border ${!filtros.metodo ? 'border-metodo bg-metodo-claro' : 'border-black/10'}`}>todos</Link>
            {dados.metodos.map((m) => (
              <Link key={m.codigo} href={link({ metodo: m.codigo, unidade: undefined })}
                className={`etiqueta border ${filtros.metodo === m.codigo ? 'border-metodo bg-metodo-claro' : 'border-black/10'}`}>
                {m.nome}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="rotulo">Escala de referência</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href={link({ escala: undefined })}
              className={`etiqueta border ${!filtros.escala ? 'border-metodo bg-metodo-claro' : 'border-black/10'}`}>todas</Link>
            {dados.escalas.map((e) => (
              <Link key={e.id} href={link({ escala: e.valor })}
                className={`etiqueta border ${filtros.escala === e.valor ? 'border-metodo bg-metodo-claro' : 'border-black/10'}`}>
                {e.rotulo}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="rotulo">Clave</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href={link({ clave: undefined })}
              className={`etiqueta border ${!filtros.clave ? 'border-metodo bg-metodo-claro' : 'border-black/10'}`}>todas</Link>
            {['SOL', 'DO', 'FA'].map((c) => (
              <Link key={c} href={link({ clave: c })}
                className={`etiqueta border ${filtros.clave === c ? 'border-metodo bg-metodo-claro' : 'border-black/10'}`}>
                {NOME_DA_CLAVE[c]}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="rotulo">Compasso</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href={link({ compasso: undefined })}
              className={`etiqueta border ${!filtros.compasso ? 'border-metodo bg-metodo-claro' : 'border-black/10'}`}>todos</Link>
            {dados.compassos.map((c) => (
              <Link key={c.id} href={link({ compasso: c.valor })}
                className={`etiqueta border ${filtros.compasso === c.valor ? 'border-metodo bg-metodo-claro' : 'border-black/10'}`}>
                {c.valor}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {!dados.versoes.length && (
        <Aviso tom="pendente">
          Nenhum exercício publicado para este recorte. O conteúdo importado só aparece depois da conferência e
          da publicação pelo administrador pedagógico.
        </Aviso>
      )}

      {[...arvore.entries()].map(([escala, porClave]) => (
        <section key={escala} className="mb-6">
          <h2 className="font-titulo text-xl">{escala}</h2>
          {[...porClave.entries()].map(([clave, porCompasso]) => (
            <div key={clave} className="mt-2 border-l-2 border-metodo/30 pl-3">
              <h3 className="font-semibold">{clave}</h3>
              {[...porCompasso.entries()].map(([compasso, versoes]) => (
                <div key={compasso} className="mt-1">
                  <p className="rotulo">Compasso {compasso}</p>
                  <ul className="mt-1 space-y-1">
                    {versoes
                      .sort((a, b) => a.licao.unidade.ordem - b.licao.unidade.ordem
                        || a.licao.ordemPedagogica - b.licao.ordemPedagogica)
                      .map((versao) => (
                        <li key={versao.id}>
                          <Link href={`/licao/${versao.licaoId}`} className="flex flex-wrap items-baseline gap-2 rounded p-1 hover:bg-black/5">
                            <span className="etiqueta bg-black/5">{versao.licao.metodo.codigo}</span>
                            <span className="font-semibold">
                              {versao.licao.unidade.tipo.charAt(0) + versao.licao.unidade.tipo.slice(1).toLowerCase()}{' '}
                              {versao.licao.unidade.codigo}
                            </span>
                            <span>· {versao.licao.numeroOriginal}</span>
                            {versao.paginaImpressaInicio && (
                              <span className="text-sm text-tinta-fraca">
                                · pág. {versao.paginaImpressaInicio}
                                {versao.paginaImpressaFim && versao.paginaImpressaFim !== versao.paginaImpressaInicio
                                  ? `–${versao.paginaImpressaFim}` : ''}
                              </span>
                            )}
                            <SeloDeConferencia situacao={versao.statusConferencia} />
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}

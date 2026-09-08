import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaRequisicao } from '@/lib/sessao.ts';
import { filtroDeComuns } from '@/lib/autorizacao.ts';
import { configuracoesDoMetodo } from '@/lib/metodos/isolamento.ts';
import { criteriosDoMetodo } from '@/lib/regras.ts';
import { Cabecalho, Indicador, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Central do instrutor: instrumento → método → turma → unidade.
 *
 * A navegação é montada a partir dos dados, não de uma lista de métodos
 * escrita no código. Um instrumento novo, um método novo ou uma turma nova
 * aparecem aqui sem que uma linha mude.
 */
export default async function CentralDoInstrutor({
  searchParams,
}: { searchParams: Promise<{ instrumento?: string; metodo?: string }> }) {
  const usuario = await usuarioDaRequisicao();
  if (!usuario) redirect('/entrar');
  const filtros = await searchParams;

  const dados = await comoUsuario(usuario.id, async (banco) => {
    const comuns = filtroDeComuns(usuario.escopo);
    const escopoDeComuns = comuns ? { comumId: comuns } : {};

    const turmas = await banco.turma.findMany({
      where: {
        ...escopoDeComuns,
        status: 'ATIVO',
        ...(filtros.instrumento ? { instrumentoId: filtros.instrumento } : {}),
        ...(filtros.metodo ? { metodo: { codigo: filtros.metodo } } : {}),
      },
      orderBy: [{ comum: { nome: 'asc' } }, { nome: 'asc' }],
      include: {
        comum: { select: { nome: true, regiao: { select: { nome: true } } } },
        instrumento: { select: { id: true, nome: true } },
        metodo: { select: { id: true, codigo: true, nome: true, escopo: true } },
        unidade: { select: { tipo: true, codigo: true, nome: true } },
        instrutor: { select: { nomeCompleto: true } },
        _count: { select: { matriculas: true } },
      },
    });

    // As colunas da navegação saem das próprias turmas visíveis.
    const todas = await banco.turma.findMany({
      where: { ...escopoDeComuns, status: 'ATIVO' },
      select: {
        instrumento: { select: { id: true, nome: true } },
        metodo: { select: { codigo: true, nome: true } },
      },
    });

    const criteriosPorMetodo = await Promise.all(
      [...new Map(turmas.map((t) => [t.metodo.id, t.metodo])).values()].map(async (metodo) => ({
        codigo: metodo.codigo,
        nome: metodo.nome,
        criterios: criteriosDoMetodo(await configuracoesDoMetodo(banco, metodo.id)),
        competencias: await banco.competencia.count({ where: { metodoId: metodo.id, status: 'ATIVO' } }),
      })),
    );

    const aCorrigir = await banco.envio.count({ where: { estado: { in: ['ENVIADA', 'EM_AVALIACAO'] } } });
    return { turmas, todas, criteriosPorMetodo, aCorrigir };
  });

  const instrumentos = [...new Map(
    dados.todas.filter((t) => t.instrumento).map((t) => [t.instrumento!.id, t.instrumento!]),
  ).values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const metodos = [...new Map(dados.todas.map((t) => [t.metodo.codigo, t.metodo])).values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const link = (novos: Record<string, string | undefined>) => {
    const parametros = new URLSearchParams();
    for (const [chave, valor] of Object.entries({ ...filtros, ...novos })) if (valor) parametros.set(chave, valor);
    const consulta = parametros.toString();
    return `/painel/turmas${consulta ? `?${consulta}` : ''}`;
  };

  return (
    <main className="mx-auto max-w-4xl p-6 pb-16">
      <Cabecalho titulo="Turmas" voltar="/painel"
        subtitulo="Instrumento → método → turma → unidade. Cada turma segue os critérios do seu próprio método." />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Turmas no seu escopo" valor={dados.turmas.length} />
        <Indicador rotulo="Instrumentos" valor={instrumentos.length} />
        <Indicador rotulo="Métodos" valor={metodos.length} />
        <Indicador rotulo="Atividades a corrigir" valor={dados.aCorrigir} />
      </section>

      <section className="cartao mt-4 space-y-3">
        <div>
          <p className="rotulo">Instrumento</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href={link({ instrumento: undefined })}
              className={`etiqueta border ${!filtros.instrumento ? 'border-metodo bg-metodo-claro' : 'border-black/10'}`}>todos</Link>
            {instrumentos.map((instrumento) => (
              <Link key={instrumento.id} href={link({ instrumento: instrumento.id })}
                className={`etiqueta border ${filtros.instrumento === instrumento.id ? 'border-metodo bg-metodo-claro' : 'border-black/10'}`}>
                {instrumento.nome}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="rotulo">Método</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href={link({ metodo: undefined })}
              className={`etiqueta border ${!filtros.metodo ? 'border-metodo bg-metodo-claro' : 'border-black/10'}`}>todos</Link>
            {metodos.map((metodo) => (
              <Link key={metodo.codigo} href={link({ metodo: metodo.codigo })}
                className={`etiqueta border ${filtros.metodo === metodo.codigo ? 'border-metodo bg-metodo-claro' : 'border-black/10'}`}>
                {metodo.nome}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {!dados.turmas.length && (
        <Aviso tom="pendente">
          Nenhuma turma neste recorte. As turmas são criadas pela administração, ligadas a uma comum, a um método
          e — quando o método for de instrumento — ao instrumento.
        </Aviso>
      )}

      <section className="mt-6 grid gap-2">
        {dados.turmas.map((turma) => (
          <div key={turma.id} className="cartao">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">{turma.nome}</p>
              <span className="etiqueta bg-black/5">{turma.metodo.codigo}</span>
            </div>
            <p className="text-xs text-tinta-fraca">
              {turma.comum.nome} · {turma.comum.regiao.nome}
              {' · '}{turma.instrumento?.nome ?? 'sem instrumento (método transversal)'}
              {turma.unidade ? ` · ${turma.unidade.tipo.toLowerCase()} ${turma.unidade.codigo} — ${turma.unidade.nome}` : ''}
            </p>
            <p className="mt-1 text-sm">
              {turma._count.matriculas} aluno(s)
              {turma.instrutor ? ` · instrutor ${turma.instrutor.nomeCompleto}` : ' · sem instrutor definido'}
            </p>
          </div>
        ))}
      </section>

      {dados.criteriosPorMetodo.length > 0 && (
        <section className="mt-6">
          <h2 className="rotulo">Critérios de cada método</h2>
          <p className="mt-1 text-xs text-tinta-fraca">
            Os critérios são do método, não da plataforma nem de outro método. O que um método não declara cai no
            padrão da plataforma, sinalizado abaixo.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left">
                  <th className="py-2">Método</th><th className="text-right">Aproveitamento</th>
                  <th className="text-right">Nota mínima</th><th className="text-right">Questões</th>
                  <th className="text-right">Instrutor</th><th className="text-right">Competências</th>
                </tr>
              </thead>
              <tbody>
                {dados.criteriosPorMetodo.map((metodo) => (
                  <tr key={metodo.codigo} className="border-b border-black/5">
                    <td className="py-2">{metodo.nome}</td>
                    <td className="text-right tabular-nums">
                      {metodo.criterios.percentualDeAproveitamento}%
                      {metodo.criterios.origem.percentualDeAproveitamento === 'padrao' && <sup title="padrão da plataforma"> p</sup>}
                    </td>
                    <td className="text-right tabular-nums">
                      {metodo.criterios.notaMinima}%
                      {metodo.criterios.origem.notaMinima === 'padrao' && <sup title="padrão da plataforma"> p</sup>}
                    </td>
                    <td className="text-right tabular-nums">{metodo.criterios.questoesPorAvaliacao}</td>
                    <td className="text-right">{metodo.criterios.exigeAprovacaoDoInstrutor ? 'exigido' : 'não'}</td>
                    <td className="text-right tabular-nums">{metodo.competencias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <nav className="mt-6 flex gap-3">
        <Link href="/painel" className="botao-secundario">Alunos</Link>
        <Link href="/assunto" className="botao-secundario">Índice por assunto</Link>
      </nav>
    </main>
  );
}

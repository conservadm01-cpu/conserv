import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { Cabecalho, Indicador, Aviso, formatarTempo } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * A casa do aluno é a lista das suas JORNADAS.
 *
 * Um aluno pode estar na unidade 4 de um método de teoria, na 2 do método do
 * seu instrumento e recém-matriculado num terceiro. Cada jornada tem currículo,
 * progresso e critérios próprios — e nenhuma delas é "a principal".
 */
export default async function PaginaDoAluno() {
  const usuario = await usuarioDaTela();

  const dados = await comoUsuario(usuario.id, async (banco) => {
    const perfil = await banco.perfilAluno.findUnique({
      where: { usuarioId: usuario.id },
      include: { comum: { include: { regiao: true } }, instrumento: true, instrutor: { select: { nomeCompleto: true } } },
    });

    const jornadas = await banco.jornadaDoAluno.findMany({
      where: { alunoId: usuario.id },
      orderBy: [{ status: 'asc' }, { inicioEm: 'asc' }],
      include: {
        metodo: { select: { id: true, nome: true, codigo: true, escopo: true, descricao: true } },
        instrumento: { select: { nome: true } },
        curriculo: { select: { id: true, rotulo: true, versao: true, status: true } },
        unidadeAtual: { select: { id: true, tipo: true, codigo: true, nome: true } },
      },
    });

    // Progresso por jornada, contado sobre as lições do currículo dela.
    const progressoPorJornada = await banco.progressoLicao.groupBy({
      by: ['jornadaId', 'estado'],
      where: { alunoId: usuario.id },
      _count: { _all: true },
    });

    const licoesPorCurriculo = await Promise.all(jornadas.map(async (jornada) => ({
      jornadaId: jornada.id,
      total: await banco.licao.count({
        where: { unidade: { curriculoId: jornada.curriculoId }, statusPublicacao: 'PUBLICADO' },
      }),
    })));

    const matriculas = await banco.matriculaEmTurma.findMany({
      where: { alunoId: usuario.id, saidaEm: null },
      include: {
        turma: {
          select: {
            id: true, nome: true,
            metodo: { select: { codigo: true } },
            instrutor: { select: { nomeCompleto: true } },
          },
        },
      },
    });

    const tempos = await banco.tempoDiario.findMany({
      where: { usuarioId: usuario.id }, orderBy: { dia: 'desc' }, take: 30,
    });

    return { perfil, jornadas, progressoPorJornada, licoesPorCurriculo, matriculas, tempos };
  });

  if (!dados.perfil) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Cabecalho titulo="Estudos Musicais" />
        <Aviso tom="pendente">
          O seu cadastro de aluno ainda não foi vinculado a uma comum. Procure o responsável pela sua comum.
        </Aviso>
      </main>
    );
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const tempoHoje = dados.tempos.find((t) => t.dia.toISOString().slice(0, 10) === hoje)?.segundosDedicacao ?? 0;
  const tempoTotal = dados.tempos.reduce((soma, t) => soma + t.segundosDedicacao, 0);

  const aprovadasDe = (jornadaId: string) => dados.progressoPorJornada
    .filter((p) => p.jornadaId === jornadaId && p.estado === 'APROVADO')
    .reduce((soma, p) => soma + p._count._all, 0);
  const totalDe = (jornadaId: string) => dados.licoesPorCurriculo.find((l) => l.jornadaId === jornadaId)?.total ?? 0;

  return (
    <main className="mx-auto max-w-3xl p-6 pb-16">
      <Cabecalho
        titulo={`Bom estudo, ${usuario.nomeCompleto.split(' ')[0]}`}
        subtitulo={`${dados.perfil.instrumento?.nome ?? 'instrumento a definir'} · ${dados.perfil.comum.nome} · ${dados.perfil.comum.regiao.nome}`}
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Dedicação hoje" valor={formatarTempo(tempoHoje)} />
        <Indicador rotulo="Últimos 30 dias" valor={formatarTempo(tempoTotal)} />
        <Indicador rotulo="Jornadas ativas" valor={dados.jornadas.filter((j) => j.status === 'ATIVA').length} />
        <Indicador rotulo="Instrutor" valor={dados.perfil.instrutor?.nomeCompleto.split(' ')[0] ?? '—'} />
      </section>

      <section className="mt-6">
        <h2 className="rotulo">Suas jornadas</h2>
        {!dados.jornadas.length && (
          <div className="mt-2">
            <Aviso tom="pendente">
              Você ainda não foi matriculado em nenhum método. Quem faz a matrícula é o instrutor ou o
              responsável pela sua comum.
            </Aviso>
          </div>
        )}
        <div className="mt-2 grid gap-2">
          {dados.jornadas.map((jornada) => {
            const aprovadas = aprovadasDe(jornada.id);
            const total = totalDe(jornada.id);
            const percentual = total ? Math.round((aprovadas / total) * 100) : 0;
            return (
              <Link key={jornada.id} href={`/jornada/${jornada.id}`} className="cartao block">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-metodo-claro text-xs font-semibold text-metodo-escuro">
                    {jornada.metodo.codigo.slice(0, 4)}
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{jornada.metodo.nome}</span>
                    <span className="block text-xs text-tinta-fraca">
                      {jornada.instrumento?.nome ?? (jornada.metodo.escopo === 'TRANSVERSAL' ? 'comum a todos os instrumentos' : 'sem instrumento')}
                      {' · '}{jornada.curriculo.rotulo} (v{jornada.curriculo.versao})
                    </span>
                    {jornada.unidadeAtual && (
                      <span className="block text-xs text-tinta-fraca">
                        Em {jornada.unidadeAtual.tipo.toLowerCase()} {jornada.unidadeAtual.codigo} — {jornada.unidadeAtual.nome}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-tinta-fraca">{jornada.status.toLowerCase()}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10">
                  <div className="h-full bg-metodo" style={{ width: `${percentual}%` }} />
                </div>
                <p className="mt-1 text-xs text-tinta-fraca">
                  {total
                    ? `${aprovadas} de ${total} lições publicadas aprovadas (${percentual}%)`
                    : 'este currículo ainda não tem lição publicada'}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {dados.matriculas.length > 0 && (
        <section className="mt-6">
          <h2 className="rotulo">Suas turmas</h2>
          <div className="mt-2 grid gap-2">
            {dados.matriculas.map((matricula) => (
              <div key={matricula.id} className="cartao">
                <p className="font-semibold">{matricula.turma.nome}</p>
                <p className="text-xs text-tinta-fraca">
                  Método {matricula.turma.metodo.codigo}
                  {matricula.turma.instrutor ? ` · instrutor ${matricula.turma.instrutor.nomeCompleto}` : ''}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <nav className="mt-6 flex flex-wrap gap-3">
        <Link href="/estudar" className="botao">Abrir o app de estudo</Link>
        <Link href="/assunto" className="botao-secundario">Estudar por assunto</Link>
        <Link href="/sair" className="botao-secundario">Sair</Link>
      </nav>
    </main>
  );
}

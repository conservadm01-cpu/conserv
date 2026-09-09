import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { ehAcompanhante } from '@/lib/autorizacao.ts';
import { alertaDeFrequencia, nomeDaPresenca, resumoDeFrequencia } from '@/lib/aulas.ts';
import { Cabecalho, Indicador, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Aulas dadas e frequência apurada.
 *
 * A frequência não é um campo guardado: é a contagem das presenças que os
 * instrutores registraram. Não há número a manter em dia, e por isso não há
 * como o número discordar da chamada.
 */
export default async function Aulas({
  searchParams,
}: { searchParams: Promise<{ ok?: string; aluno?: string }> }) {
  const usuario = await usuarioDaTela();
  if (!ehAcompanhante(usuario.escopo)) redirect('/aluno');
  const { ok, aluno: filtroDeAluno } = await searchParams;

  const dados = await comoUsuario(usuario.id, async (banco) => {
    const aulas = await banco.aula.findMany({
      orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
      take: 40,
      include: {
        instrutor: { select: { nomeCompleto: true } },
        turma: { select: { nome: true } },
        jornada: { include: { aluno: { select: { id: true, nomeCompleto: true } }, metodo: { select: { nome: true } } } },
        presencas: { include: { aluno: { select: { id: true, nomeCompleto: true } } } },
      },
    });
    // A RLS já limita as presenças ao que este usuário acompanha, então a
    // frequência daqui nunca soma aluno que ele não deveria enxergar.
    const presencas = await banco.presenca.findMany({
      include: {
        aula: { select: { data: true, situacao: true } },
        aluno: { select: { id: true, nomeCompleto: true } },
      },
    });
    return { aulas, presencas };
  });

  const porAluno = new Map<string, { nome: string; presencas: typeof dados.presencas }>();
  for (const presenca of dados.presencas) {
    const atual = porAluno.get(presenca.alunoId) ?? { nome: presenca.aluno.nomeCompleto, presencas: [] };
    atual.presencas.push(presenca);
    porAluno.set(presenca.alunoId, atual);
  }

  const frequencias = [...porAluno.entries()]
    .map(([alunoId, { nome, presencas }]) => {
      const resumo = resumoDeFrequencia(presencas.map((p) => ({
        tipo: p.tipo, aula: p.aula ? { data: p.aula.data, situacao: p.aula.situacao } : null,
      })));
      return { alunoId, nome, resumo, alerta: alertaDeFrequencia(resumo, nome.split(' ')[0]) };
    })
    .sort((a, b) => (a.resumo.percentual ?? 101) - (b.resumo.percentual ?? 101));

  const comAlerta = frequencias.filter((f) => f.alerta);
  const aulasVisiveis = filtroDeAluno
    ? dados.aulas.filter((a) => a.presencas.some((p) => p.alunoId === filtroDeAluno))
    : dados.aulas;

  const totalDeAulas = dados.aulas.filter((a) => a.situacao === 'REALIZADA').length;

  return (
    <main className="mx-auto max-w-3xl p-6 pb-16">
      <Cabecalho titulo="Aulas e frequência" subtitulo="O que foi dado e quem esteve" voltar="/painel" />
      {ok && <div className="mb-4"><Aviso>Aula registrada.</Aviso></div>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Indicador rotulo="Aulas realizadas" valor={totalDeAulas} detalhe="nas últimas 40 registradas" />
        <Indicador rotulo="Alunos com aula" valor={frequencias.length} />
        <Indicador rotulo="Precisam de atenção" valor={comAlerta.length} />
      </section>

      <Link href="/painel/aulas/nova" className="botao mt-4 inline-block">+ Registrar aula</Link>

      {comAlerta.length > 0 && (
        <section className="mt-6">
          <h2 className="rotulo">O que precisa de você</h2>
          <ul className="mt-2 grid gap-2">
            {comAlerta.map((f) => (
              <li key={f.alunoId} className="cartao border-l-4 border-alerta">
                <Link href={`/painel/aluno/${f.alunoId}`} className="font-semibold underline">{f.nome}</Link>
                <p className="text-sm">{f.alerta}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="rotulo">Frequência por aluno</h2>
        {frequencias.length ? (
          <div className="mt-2 grid gap-2">
            {frequencias.map((f) => (
              <div key={f.alunoId} className="cartao">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/painel/aluno/${f.alunoId}`} className="font-semibold underline">{f.nome}</Link>
                  <span className="tabular-nums text-sm">
                    {/* Sem aula, o percentual é nulo: dizer 0% a quem nunca
                        teve aula seria uma acusação falsa. */}
                    {f.resumo.percentual === null ? 'sem aulas' : `${f.resumo.percentual}% de presença`}
                  </span>
                </div>
                <p className="text-xs text-tinta-fraca">
                  {f.resumo.aulas} aula(s) · {f.resumo.presencas} presença(s) · {f.resumo.faltas} falta(s)
                  {f.resumo.faltasJustificadas ? ` · ${f.resumo.faltasJustificadas} justificada(s)` : ''}
                  {f.resumo.atrasos ? ` · ${f.resumo.atrasos} atraso(s)` : ''}
                </p>
                <Link href={`/painel/aulas?aluno=${f.alunoId}`} className="text-xs underline">Ver as aulas dele</Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-tinta-fraca">
            Nenhuma presença registrada ainda. A frequência aparece assim que a primeira chamada for feita.
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="rotulo">
          Aulas registradas{filtroDeAluno ? ' (filtrado)' : ''}
        </h2>
        {filtroDeAluno && (
          <Link href="/painel/aulas" className="text-xs underline">Mostrar todas</Link>
        )}
        {aulasVisiveis.length ? (
          <ul className="mt-2 grid gap-2">
            {aulasVisiveis.map((aula) => (
              <li key={aula.id} className="cartao">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">
                    {aula.turma?.nome ?? aula.jornada?.aluno.nomeCompleto ?? 'Aula'}
                  </p>
                  <span className="etiqueta bg-black/5">
                    {aula.data.toLocaleDateString('pt-BR')}
                    {aula.situacao !== 'REALIZADA' ? ` · ${aula.situacao.toLowerCase()}` : ''}
                  </span>
                </div>
                <p className="text-xs text-tinta-fraca">
                  {aula.jornada?.metodo.nome ?? ''}
                  {aula.horaInicio ? ` · ${aula.horaInicio}${aula.horaFim ? `–${aula.horaFim}` : ''}` : ''}
                  {' · '}{aula.instrutor.nomeCompleto}
                </p>
                {aula.conteudo && <p className="mt-1 text-sm">{aula.conteudo}</p>}
                {aula.proximaAtividade && (
                  <p className="mt-1 text-sm"><b>Para a próxima:</b> {aula.proximaAtividade}</p>
                )}
                {aula.presencas.length > 0 && (
                  <p className="mt-1 text-xs text-tinta-fraca">
                    {aula.presencas.map((p) => `${p.aluno.nomeCompleto.split(' ')[0]}: ${nomeDaPresenca(p.tipo).toLowerCase()}`).join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-tinta-fraca">Nenhuma aula registrada ainda.</p>
        )}
      </section>
    </main>
  );
}

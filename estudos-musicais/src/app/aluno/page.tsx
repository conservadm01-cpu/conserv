import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaRequisicao } from '@/lib/sessao.ts';
import { calcularAproveitamento, preRequisitoDeFases, type EstadoProgresso } from '@/lib/regras.ts';
import { Cabecalho, Indicador, Aviso, formatarTempo } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

export default async function PaginaDoAluno() {
  const usuario = await usuarioDaRequisicao();
  if (!usuario) redirect('/entrar');

  const dados = await comoUsuario(usuario.id, async (banco) => {
    const perfil = await banco.perfilAluno.findUnique({
      where: { usuarioId: usuario.id },
      include: { comum: { include: { regiao: true } }, instrumento: true, instrutor: { select: { nomeCompleto: true } } },
    });

    const fases = await banco.fase.findMany({
      where: { edicao: { material: { tipo: 'MSA' } } },
      orderBy: { numero: 'asc' },
      include: {
        topicos: { include: { _count: { select: { licoes: true } } } },
        progresso: { where: { alunoId: usuario.id } },
      },
    });

    const progressoLicoes = await banco.progressoLicao.findMany({
      where: { alunoId: usuario.id },
      select: { licaoId: true, estado: true, peso: true },
    });

    const tempos = await banco.tempoDiario.findMany({
      where: { usuarioId: usuario.id }, orderBy: { dia: 'desc' }, take: 30,
    });

    const regraHinario = await banco.regraProgressao.findFirst({
      where: { codigo: 'B-APROVEITAMENTO-HINARIO', ativo: true }, orderBy: { versao: 'desc' },
    });
    const regraMetodos = await banco.regraProgressao.findFirst({
      where: { codigo: 'A-PRE-REQUISITO-MSA', ativo: true }, orderBy: { versao: 'desc' },
    });

    return { perfil, fases, progressoLicoes, tempos, regraHinario, regraMetodos };
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

  const unidades = dados.progressoLicoes.map((p) => ({
    licaoId: p.licaoId, peso: p.peso, estado: p.estado as EstadoProgresso,
  }));
  const percentualExigido = Number((dados.regraHinario?.parametros as { percentual?: number })?.percentual ?? 40);
  const aproveitamento = calcularAproveitamento(unidades, percentualExigido);

  const fasesExigidas = ((dados.regraMetodos?.parametros as { fases?: number[] })?.fases ?? [1, 2, 3, 4, 5]);
  const preRequisito = preRequisitoDeFases(
    dados.fases.map((f) => ({ numero: f.numero, estado: (f.progresso[0]?.estado ?? 'NAO_INICIADO') as EstadoProgresso })),
    fasesExigidas,
  );

  return (
    <main className="mx-auto max-w-3xl p-6 pb-16">
      <Cabecalho
        titulo={`Bom estudo, ${usuario.nomeCompleto.split(' ')[0]}`}
        subtitulo={`${dados.perfil.instrumento?.nome ?? 'instrumento a definir'} · ${dados.perfil.comum.nome} · ${dados.perfil.comum.regiao.nome}`}
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Dedicação hoje" valor={formatarTempo(tempoHoje)} />
        <Indicador rotulo="Últimos 30 dias" valor={formatarTempo(tempoTotal)} />
        <Indicador rotulo="Aproveitamento" valor={`${aproveitamento.percentual}%`}
          detalhe={`${aproveitamento.unidadesAprovadas} de ${aproveitamento.unidadesElegiveis} unidades aprovadas`} />
        <Indicador rotulo="Instrutor" valor={dados.perfil.instrutor?.nomeCompleto.split(' ')[0] ?? '—'} />
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="rotulo">Liberações</h2>
        <div className="cartao">
          <p className="font-semibold">Métodos do instrumento</p>
          <p className="text-sm text-tinta-fraca">{dados.regraMetodos?.descricao}</p>
          {preRequisito.liberado
            ? <p className="mt-2 text-sm text-metodo-escuro">Liberado: as fases exigidas estão aprovadas.</p>
            : <p className="mt-2 text-sm">Faltam as fases <b>{preRequisito.faltando.join(', ')}</b> aprovadas pelo instrutor.</p>}
        </div>
        <div className="cartao">
          <p className="font-semibold">Exercícios de Hinário</p>
          <p className="text-sm text-tinta-fraca">{dados.regraHinario?.descricao}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10">
            <div className="h-full bg-metodo" style={{ width: `${Math.min(100, (aproveitamento.percentual / percentualExigido) * 100)}%` }} />
          </div>
          <p className="mt-1 text-sm">
            {aproveitamento.percentual}% de {percentualExigido}% —{' '}
            {aproveitamento.percentual >= percentualExigido
              ? 'liberado.'
              : `faltam ${aproveitamento.faltamUnidades} unidade(s) aprovada(s).`}
          </p>
          <p className="mt-1 text-xs text-tinta-fraca">
            Conta apenas unidade aprovada pelo instrutor. Página aberta e tempo de tela não entram no cálculo.
          </p>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="rotulo">Fases do MSA</h2>
        <div className="mt-2 grid gap-2">
          {dados.fases.map((fase) => {
            const estado = fase.progresso[0]?.estado ?? 'NAO_INICIADO';
            const licoes = fase.topicos.reduce((soma, t) => soma + t._count.licoes, 0);
            return (
              <Link key={fase.id} href={`/assunto?fase=${fase.numero}`} className="cartao flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-metodo-claro font-semibold text-metodo-escuro">
                  {fase.numero}
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{fase.nome}</span>
                  <span className="block text-xs text-tinta-fraca">
                    {fase.topicos.length} tópicos · {licoes} lições no índice
                  </span>
                </span>
                <span className="text-xs text-tinta-fraca">{estado.toLowerCase().replace('_', ' ')}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <nav className="mt-6 flex gap-3">
        <Link href="/assunto" className="botao">Estudar por assunto</Link>
        <Link href="/sair" className="botao-secundario">Sair</Link>
      </nav>
    </main>
  );
}

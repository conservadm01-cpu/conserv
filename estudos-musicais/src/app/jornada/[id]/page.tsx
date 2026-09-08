import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaRequisicao } from '@/lib/sessao.ts';
import { configuracoesDoMetodo } from '@/lib/metodos/isolamento.ts';
import {
  calcularAproveitamento, criteriosDoMetodo, liberaRepertorio, preRequisitoDeUnidades,
  type EstadoProgresso,
} from '@/lib/regras.ts';
import { Cabecalho, Indicador, Aviso, SeloDeConferencia } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Uma jornada: o currículo do método, na profundidade que ELE tem, com os
 * critérios que ELE declara. Nada aqui é escrito para um método específico —
 * a árvore vem da tabela de unidades e o percentual, da configuração do método.
 */
export default async function PaginaDaJornada({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await usuarioDaRequisicao();
  if (!usuario) redirect('/entrar');

  const dados = await comoUsuario(usuario.id, async (banco) => {
    const jornada = await banco.jornadaDoAluno.findUnique({
      where: { id },
      include: {
        metodo: true,
        instrumento: { select: { nome: true } },
        curriculo: true,
        aluno: { select: { id: true, nomeCompleto: true } },
      },
    });
    if (!jornada) return null;

    const unidades = await banco.unidadeCurricular.findMany({
      where: { curriculoId: jornada.curriculoId },
      orderBy: [{ profundidade: 'asc' }, { ordem: 'asc' }],
      include: { _count: { select: { licoes: true } } },
    });

    const progressoLicoes = await banco.progressoLicao.findMany({
      where: { alunoId: jornada.alunoId, licao: { unidade: { curriculoId: jornada.curriculoId } } },
      select: { licaoId: true, estado: true, peso: true, licao: { select: { unidadeId: true } } },
    });

    const progressoUnidades = await banco.progressoUnidade.findMany({
      where: { alunoId: jornada.alunoId, unidade: { curriculoId: jornada.curriculoId } },
      select: { unidadeId: true, estado: true },
    });

    const configuracoes = await configuracoesDoMetodo(banco, jornada.metodoId);
    const competencias = await banco.competencia.findMany({
      where: { metodoId: jornada.metodoId, status: 'ATIVO' }, orderBy: { ordem: 'asc' },
    });
    const regraPreRequisito = await banco.regraProgressao.findFirst({
      where: { tipo: 'PRE_REQUISITO_FASES', ativo: true }, orderBy: { versao: 'desc' },
    });
    const regraRepertorio = await banco.regraProgressao.findFirst({
      where: { tipo: 'PERCENTUAL_APROVEITAMENTO', ativo: true }, orderBy: { versao: 'desc' },
    });

    return {
      jornada, unidades, progressoLicoes, progressoUnidades, configuracoes, competencias,
      regraPreRequisito, regraRepertorio,
    };
  });

  if (!dados) notFound();
  const { jornada } = dados;
  const ehDono = jornada.alunoId === usuario.id;

  const criterios = criteriosDoMetodo(dados.configuracoes);
  const elegiveis = dados.progressoLicoes.map((p) => ({
    licaoId: p.licaoId, peso: p.peso, estado: p.estado as EstadoProgresso,
  }));
  const aproveitamento = calcularAproveitamento(elegiveis, criterios.percentualDeAproveitamento);
  const repertorio = liberaRepertorio(elegiveis, criterios.percentualDeAproveitamento);

  const estadoDaUnidade = new Map(dados.progressoUnidades.map((p) => [p.unidadeId, p.estado as EstadoProgresso]));
  const raizes = dados.unidades.filter((u) => !u.paiId);

  // As unidades exigidas vêm dos parâmetros da regra, não do código. Quando a
  // regra aponta para outro método, o pré-requisito é conferido lá, não aqui.
  const parametros = (dados.regraPreRequisito?.parametros ?? {}) as { metodo?: string; unidades?: string[] };
  const exigidasNesteMetodo = parametros.metodo === jornada.metodo.codigo ? (parametros.unidades ?? []) : [];
  const preRequisito = preRequisitoDeUnidades(
    raizes.map((u) => ({ codigo: u.codigo, estado: estadoDaUnidade.get(u.id) ?? 'NAO_INICIADO' })),
    exigidasNesteMetodo,
  );

  const filhasDe = (paiId: string) => dados.unidades.filter((u) => u.paiId === paiId);
  const licoesNaSubarvore = (unidadeId: string): number => {
    const propria = dados.unidades.find((u) => u.id === unidadeId)?._count.licoes ?? 0;
    return propria + filhasDe(unidadeId).reduce((soma, f) => soma + licoesNaSubarvore(f.id), 0);
  };

  return (
    <main className="mx-auto max-w-3xl p-6 pb-16">
      <Cabecalho
        voltar={ehDono ? '/aluno' : `/painel/aluno/${jornada.alunoId}`}
        titulo={jornada.metodo.nome}
        subtitulo={[
          jornada.instrumento?.nome ?? (jornada.metodo.escopo === 'TRANSVERSAL' ? 'método comum a todos os instrumentos' : null),
          `${jornada.curriculo.rotulo} (v${jornada.curriculo.versao})`,
          ehDono ? null : jornada.aluno.nomeCompleto,
        ].filter(Boolean).join(' · ')}
      />

      {jornada.metodo.descricao && <Aviso>{jornada.metodo.descricao}</Aviso>}

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Aproveitamento" valor={`${aproveitamento.percentual}%`}
          detalhe={`${aproveitamento.unidadesAprovadas} de ${aproveitamento.unidadesElegiveis} lições aprovadas`} />
        <Indicador rotulo="Exigido neste método" valor={`${criterios.percentualDeAproveitamento}%`}
          detalhe={criterios.origem.percentualDeAproveitamento === 'metodo' ? 'critério do método' : 'padrão da plataforma'} />
        <Indicador rotulo="Nota mínima" valor={`${criterios.notaMinima}%`}
          detalhe={`${criterios.questoesPorAvaliacao} questões por avaliação`} />
        <Indicador rotulo="Aprovação do instrutor" valor={criterios.exigeAprovacaoDoInstrutor ? 'exigida' : 'não exigida'} />
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="rotulo">Liberações desta jornada</h2>
        {exigidasNesteMetodo.length > 0 && (
          <div className="cartao">
            <p className="font-semibold">Pré-requisito</p>
            <p className="text-sm text-tinta-fraca">{dados.regraPreRequisito?.descricao}</p>
            {preRequisito.liberado
              ? <p className="mt-2 text-sm text-metodo-escuro">Liberado: as unidades exigidas estão aprovadas.</p>
              : <p className="mt-2 text-sm">Faltam aprovadas as unidades <b>{preRequisito.faltando.join(', ')}</b>.</p>}
          </div>
        )}
        <div className="cartao">
          <p className="font-semibold">Repertório da etapa</p>
          <p className="text-sm text-tinta-fraca">{dados.regraRepertorio?.descricao}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10">
            <div className="h-full bg-metodo"
              style={{ width: `${Math.min(100, (aproveitamento.percentual / Math.max(1, criterios.percentualDeAproveitamento)) * 100)}%` }} />
          </div>
          <p className="mt-1 text-sm">
            {aproveitamento.percentual}% de {criterios.percentualDeAproveitamento}% —{' '}
            {repertorio.liberado ? 'liberado.' : `faltam ${aproveitamento.faltamUnidades} lição(ões) aprovada(s).`}
          </p>
          <p className="mt-1 text-xs text-tinta-fraca">
            O percentual é o deste método. Conta apenas lição aprovada pelo instrutor: página aberta e tempo de
            tela não entram no cálculo.
          </p>
        </div>
      </section>

      {dados.competencias.length > 0 && (
        <section className="mt-6">
          <h2 className="rotulo">Competências avaliadas neste método</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {dados.competencias.map((competencia) => (
              <li key={competencia.id} className="etiqueta bg-black/5">
                {competencia.nome} <span className="text-tinta-fraca">· peso {competencia.peso}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="rotulo">Estrutura do método</h2>
        {!raizes.length && (
          <div className="mt-2">
            <Aviso tom="pendente">
              Este método ainda não tem estrutura confirmada. A proposta de estrutura precisa passar por revisão
              humana antes de virar currículo.
            </Aviso>
          </div>
        )}
        <div className="mt-2 grid gap-2">
          {raizes.map((raiz) => (
            <div key={raiz.id} className="cartao">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-metodo-claro text-xs font-semibold text-metodo-escuro">
                  {raiz.codigo}
                </span>
                <div className="flex-1">
                  <p className="font-semibold">
                    <span className="text-xs font-normal uppercase text-tinta-fraca">{raiz.tipo.toLowerCase()} </span>
                    {raiz.nome}
                  </p>
                  {/* Para o aluno, a RLS já esconde o que não foi publicado:
                      a contagem é do que ele pode abrir, não do índice inteiro. */}
                  <p className="text-xs text-tinta-fraca">
                    {licoesNaSubarvore(raiz.id)} lição(ões) disponível(is)
                    {raiz.paginaOrigemInicio ? ` · páginas ${raiz.paginaOrigemInicio}–${raiz.paginaOrigemFim ?? raiz.paginaOrigemInicio}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <SeloDeConferencia situacao={raiz.statusConferencia} />
                  <span className="text-xs text-tinta-fraca">
                    {(estadoDaUnidade.get(raiz.id) ?? 'NAO_INICIADO').toLowerCase().replace('_', ' ')}
                  </span>
                </div>
              </div>
              {filhasDe(raiz.id).length > 0 && (
                <ul className="mt-3 grid gap-1 border-t border-black/5 pt-3 text-sm">
                  {filhasDe(raiz.id).map((filha) => (
                    <li key={filha.id} className="flex items-center gap-2">
                      <Link href={`/assunto?unidade=${filha.id}`} className="flex-1 hover:underline">
                        <span className="text-tinta-fraca">{filha.codigo}</span> {filha.nome}
                      </Link>
                      <span className="text-xs text-tinta-fraca">{licoesNaSubarvore(filha.id)} disponível(is)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <nav className="mt-6 flex gap-3">
        <Link href="/assunto" className="botao-secundario">Estudar por assunto</Link>
        <Link href={ehDono ? '/aluno' : '/painel'} className="botao-secundario">Voltar</Link>
      </nav>
    </main>
  );
}

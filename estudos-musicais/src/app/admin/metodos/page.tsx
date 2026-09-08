import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { Cabecalho, Indicador, Aviso, SeloDeConferencia } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

const SITUACAO_DA_ANALISE: Record<string, string> = {
  SUGERIDA: 'aguardando revisão',
  EM_REVISAO: 'em revisão',
  CONFIRMADA: 'confirmada',
  EDITADA: 'confirmada com edição',
  REJEITADA: 'rejeitada',
};

/**
 * Central administrativa de métodos.
 *
 * Mostra o que existe (métodos, instrumentos autorizados, currículos) e o que
 * espera decisão humana (análises sugeridas). Nada vira currículo sem que
 * alguém confirme, edite ou rejeite a estrutura proposta.
 */
export default async function CentralDeMetodos() {
  const usuario = await usuarioDaTela();
  if (!usuario.escopo.ehAdministracao) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Cabecalho titulo="Central de métodos" voltar="/painel" />
        <Aviso tom="alerta">
          Esta central é da administração pedagógica. O seu vínculo não dá acesso a ela.
        </Aviso>
      </main>
    );
  }

  const dados = await comoUsuario(usuario.id, async (banco) => {
    const metodos = await banco.metodo.findMany({
      orderBy: [{ escopo: 'asc' }, { nome: 'asc' }],
      include: {
        instrumento: { select: { nome: true } },
        curriculos: { orderBy: { versao: 'desc' }, select: { id: true, rotulo: true, versao: true, status: true } },
        _count: { select: { competencias: true, autorizacoes: true, documentos: true, jornadas: true, turmas: true } },
      },
    });

    const analises = await banco.analiseDeMetodo.findMany({
      orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
      take: 40,
      include: {
        metodo: { select: { codigo: true, nome: true } },
        documento: { select: { nomeArquivo: true } },
        revisadoPor: { select: { nomeCompleto: true } },
      },
    });

    const licoesPorMetodo = await banco.licao.groupBy({
      by: ['metodoId', 'statusConferencia'],
      _count: { _all: true },
    });

    return { metodos, analises, licoesPorMetodo };
  });

  const aguardando = dados.analises.filter((a) => a.status === 'SUGERIDA' || a.status === 'EM_REVISAO');
  const contarLicoes = (metodoId: string, situacao?: string) => dados.licoesPorMetodo
    .filter((l) => l.metodoId === metodoId && (!situacao || l.statusConferencia === situacao))
    .reduce((soma, l) => soma + l._count._all, 0);

  return (
    <main className="mx-auto max-w-4xl p-6 pb-16">
      <Cabecalho titulo="Central de métodos" voltar="/painel"
        subtitulo="Métodos cadastrados, currículos e a fila de estruturas propostas que esperam decisão." />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Métodos" valor={dados.metodos.length} />
        <Indicador rotulo="Com currículo" valor={dados.metodos.filter((m) => m.curriculos.length).length} />
        <Indicador rotulo="Análises aguardando" valor={aguardando.length} />
        <Indicador rotulo="Lições pendentes de conferência"
          valor={dados.licoesPorMetodo.filter((l) => l.statusConferencia !== 'CONFERIDO')
            .reduce((soma, l) => soma + l._count._all, 0)} />
      </section>

      {aguardando.length > 0 && (
        <div className="mt-4">
          <Aviso tom="pendente">
            {aguardando.length} estrutura(s) proposta(s) esperando revisão humana. Enquanto ninguém confirmar,
            editar ou rejeitar, nada delas vira currículo nem chega ao aluno.
          </Aviso>
        </div>
      )}

      <section className="mt-6">
        <h2 className="rotulo">Métodos</h2>
        <div className="mt-2 grid gap-2">
          {dados.metodos.map((metodo) => {
            const publicado = metodo.curriculos.find((c) => c.status === 'PUBLICADO');
            return (
              <div key={metodo.id} className="cartao">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{metodo.nome}</p>
                  <span className="flex gap-2">
                    <span className="etiqueta bg-black/5">{metodo.codigo}</span>
                    <span className="etiqueta bg-black/5">{metodo.escopo.toLowerCase()}</span>
                    <span className="etiqueta bg-black/5">{metodo.status.toLowerCase()}</span>
                  </span>
                </div>
                <p className="text-xs text-tinta-fraca">
                  {metodo.instrumento?.nome ?? 'sem instrumento próprio'}
                  {' · '}{metodo._count.autorizacoes} instrumento(s) autorizado(s)
                  {' · '}{metodo._count.competencias} competência(s)
                  {' · '}{metodo._count.documentos} documento(s)
                  {metodo.conteudoCompartilhado ? ' · conteúdo compartilhável' : ''}
                </p>
                <p className="mt-1 text-sm">
                  {metodo.curriculos.length
                    ? <>
                      {metodo.curriculos.length} currículo(s); vigente:{' '}
                      {publicado ? `${publicado.rotulo} (v${publicado.versao})` : 'nenhum publicado'}
                      {' · '}{contarLicoes(metodo.id)} lições, {contarLicoes(metodo.id, 'CONFERIDO')} conferidas
                    </>
                    : 'sem currículo: a estrutura ainda não foi analisada e confirmada.'}
                </p>
                <p className="mt-1 text-xs text-tinta-fraca">
                  {metodo._count.jornadas} jornada(s) · {metodo._count.turmas} turma(s)
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="rotulo">Análises de método</h2>
        <p className="mt-1 text-xs text-tinta-fraca">
          Analisar é propor. Confirmar, editar ou rejeitar é ato de gente, e fica registrado com nome, data e parecer.
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left">
                <th className="py-2">Método</th><th>Documento</th><th>Analisador</th>
                <th>Situação</th><th>Revisão</th>
              </tr>
            </thead>
            <tbody>
              {dados.analises.map((analise) => {
                const resumo = (analise.resumo ?? {}) as { itens?: number; unidadesPorTipo?: Record<string, number> };
                const unidades = Object.entries(resumo.unidadesPorTipo ?? {})
                  .map(([tipo, quantidade]) => `${quantidade} ${tipo.toLowerCase()}`).join(', ');
                return (
                  <tr key={analise.id} className="border-b border-black/5 align-top">
                    <td className="py-2">
                      <span className="font-semibold">{analise.metodo.codigo}</span>
                      <span className="block text-xs text-tinta-fraca">{unidades || 'estrutura vazia'}
                        {resumo.itens ? ` · ${resumo.itens} itens` : ''}</span>
                    </td>
                    <td>{analise.documento?.nomeArquivo ?? '—'}</td>
                    <td className="text-xs">{analise.origem}</td>
                    <td>
                      <span className="etiqueta bg-black/5">{SITUACAO_DA_ANALISE[analise.status] ?? analise.status}</span>
                    </td>
                    <td className="text-xs">
                      {analise.revisadoPor
                        ? <>
                          {analise.revisadoPor.nomeCompleto}
                          <span className="block text-tinta-fraca">
                            {analise.revisadoEm?.toLocaleDateString('pt-BR')}
                          </span>
                          {analise.parecer && <span className="block text-tinta-fraca">{analise.parecer}</span>}
                        </>
                        : <span className="text-tinta-fraca">aguardando</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="rotulo">Conferência do conteúdo</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {['CONFERIDO', 'PENDENTE_CONFERENCIA', 'DIVERGENTE'].map((situacao) => (
            <span key={situacao} className="cartao flex items-center gap-2">
              <SeloDeConferencia situacao={situacao} />
              <b className="tabular-nums">
                {dados.licoesPorMetodo.filter((l) => l.statusConferencia === situacao)
                  .reduce((soma, l) => soma + l._count._all, 0)}
              </b>
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-tinta-fraca">
          Registro ausente, divergente ou incompleto fica como pendente de conferência e não é publicado.
        </p>
      </section>

      <nav className="mt-6 flex gap-3">
        <Link href="/painel/turmas" className="botao-secundario">Turmas</Link>
        <Link href="/painel" className="botao-secundario">Painel</Link>
      </nav>
    </main>
  );
}

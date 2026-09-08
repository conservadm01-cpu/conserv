import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { filtroDeComuns } from '@/lib/autorizacao.ts';
import { podeCadastrar } from '@/lib/cadastro.ts';
import { Cabecalho, Indicador, Aviso, formatarTempo } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Painel de quem acompanha. A consulta usa o filtro do escopo resolvido no
 * servidor e, ainda assim, o banco aplica RLS por cima: se o filtro faltasse,
 * a lista continuaria limitada às comuns do vínculo.
 */
export default async function PaginaDoPainel() {
  const usuario = await usuarioDaTela();
  const escopo = usuario.escopo;

  const dados = await comoUsuario(usuario.id, async (banco) => {
    const comuns = filtroDeComuns(escopo);
    const alunos = await banco.perfilAluno.findMany({
      where: comuns ? { comumId: comuns } : {},
      include: {
        usuario: { select: { id: true, nomeCompleto: true, email: true, ultimoAcessoEm: true } },
        comum: { include: { regiao: true } },
        instrumento: { select: { nome: true } },
        instrutor: { select: { nomeCompleto: true } },
      },
      orderBy: { usuario: { nomeCompleto: 'asc' } },
    });

    const ids = alunos.map((a) => a.usuarioId);
    const tempos = ids.length
      ? await banco.tempoDiario.groupBy({
        by: ['usuarioId'], where: { usuarioId: { in: ids } },
        _sum: { segundosDedicacao: true, licoesConcluidas: true },
      })
      : [];
    const aprovacoes = ids.length
      ? await banco.progressoLicao.groupBy({
        by: ['alunoId'], where: { alunoId: { in: ids }, estado: 'APROVADO' }, _count: { _all: true },
      })
      : [];
    const pendentes = await banco.envio.count({
      where: { estado: { in: ['ENVIADA', 'EM_AVALIACAO'] }, ...(ids.length ? { alunoId: { in: ids } } : {}) },
    });
    return { alunos, tempos, aprovacoes, pendentes };
  });

  const tempoDe = (id: string) => dados.tempos.find((t) => t.usuarioId === id)?._sum.segundosDedicacao ?? 0;
  const aprovadasDe = (id: string) => dados.aprovacoes.find((a) => a.alunoId === id)?._count._all ?? 0;

  const papeis = escopo.papeis.map((p) => p.toLowerCase().replace(/_/g, ' ')).join(', ');

  return (
    <main className="mx-auto max-w-4xl p-6 pb-16">
      <Cabecalho titulo={`Painel de ${usuario.nomeCompleto.split(' ')[0]}`} subtitulo={`Perfil: ${papeis}`} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Alunos no seu escopo" valor={dados.alunos.length} />
        <Indicador rotulo="Comuns" valor={escopo.ehAdministracao ? 'todas' : escopo.comunsVisiveis.length} />
        <Indicador rotulo="Regiões" valor={escopo.ehAdministracao ? 'todas' : escopo.regioes.length || '—'} />
        <Indicador rotulo="Atividades a corrigir" valor={dados.pendentes} />
      </section>

      {!dados.alunos.length && (
        <Aviso tom="pendente">
          Nenhum aluno vinculado ao seu escopo. Os vínculos de comum e região são concedidos pela administração.
        </Aviso>
      )}

      <section className="mt-6">
        <h2 className="rotulo">Alunos</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left">
                <th className="py-2">Aluno</th><th>Comum</th><th>Instrumento</th><th>Instrutor</th>
                <th className="text-right">Aprovadas</th><th className="text-right">Dedicação</th>
              </tr>
            </thead>
            <tbody>
              {dados.alunos.map((aluno) => (
                <tr key={aluno.id} className="border-b border-black/5">
                  <td className="py-2">
                    <Link className="font-semibold hover:underline" href={`/painel/aluno/${aluno.usuarioId}`}>
                      {aluno.usuario.nomeCompleto}
                    </Link>
                    <span className="block text-xs text-tinta-fraca">{aluno.usuario.email}</span>
                  </td>
                  <td>{aluno.comum.nome}<span className="block text-xs text-tinta-fraca">{aluno.comum.regiao.nome}</span></td>
                  <td>{aluno.instrumento?.nome ?? '—'}</td>
                  <td>{aluno.instrutor?.nomeCompleto ?? '—'}</td>
                  <td className="text-right tabular-nums">{aprovadasDe(aluno.usuarioId)}</td>
                  <td className="text-right tabular-nums">{formatarTempo(tempoDe(aluno.usuarioId))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-6 text-xs text-tinta-fraca">
        Os indicadores de dedicação servem ao acompanhamento pedagógico. Tempo de estudo não aprova nem reprova
        ninguém — quem avalia é o instrutor.
      </p>

      <nav className="mt-6 flex flex-wrap gap-3">
        {podeCadastrar(escopo) && <Link href="/painel/cadastrar" className="botao">Cadastrar pessoa</Link>}
        <Link href="/painel/turmas" className="botao-secundario">Turmas</Link>
        {escopo.ehAdministracao && <Link href="/admin/metodos" className="botao-secundario">Central de métodos</Link>}
        <Link href="/assunto" className="botao-secundario">Índice por assunto</Link>
        <Link href="/sair" className="botao-secundario">Sair</Link>
      </nav>
    </main>
  );
}

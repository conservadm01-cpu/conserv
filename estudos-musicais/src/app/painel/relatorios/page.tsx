import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { filtroDeComuns, ehAcompanhante } from '@/lib/autorizacao.ts';
import { resumoDeFrequencia } from '@/lib/aulas.ts';
import {
  distribuicaoPor, distribuicaoPorFase, panorama, situacaoDoAluno,
  taxaDeAprovacao, type LinhaDoAluno,
} from '@/lib/painel.ts';
import { matriculaPrincipal } from '@/lib/matriculas.ts';
import { Cabecalho, Indicador, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Relatórios da coordenação.
 *
 * Números de gestão, todos contados a partir de registro real — nenhum é
 * estimado. E todos limitados pelo escopo de quem olha: um encarregado local
 * vê a comum dele, o regional vê a região, a administração vê tudo. A RLS
 * garante isso por baixo, então o relatório nunca soma aluno que a pessoa não
 * poderia enxergar.
 *
 * A barra desenhada é um <div> com largura proporcional, e o número está
 * escrito ao lado. Gráfico que só existe como cor não é lido por quem usa
 * leitor de tela — e este relatório vai para reunião.
 */

function Barra({ valor, total, rotulo }: { valor: number; total: number; rotulo: string }) {
  const percentual = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{rotulo}</span>
        <span className="tabular-nums text-tinta-fraca">{valor} ({percentual}%)</span>
      </div>
      <div className="h-2 w-full rounded-full bg-black/10" role="img"
        aria-label={`${rotulo}: ${valor} de ${total}, ${percentual} por cento`}>
        <div className="h-2 rounded-full bg-metodo" style={{ width: `${percentual}%` }} />
      </div>
    </div>
  );
}

export default async function Relatorios() {
  const usuario = await usuarioDaTela();
  if (!ehAcompanhante(usuario.escopo)) redirect('/aluno');
  const escopo = usuario.escopo;

  const dados = await comoUsuario(usuario.id, async (banco) => {
    const comuns = filtroDeComuns(escopo);
    const alunos = await banco.perfilAluno.findMany({
      where: comuns ? { comumId: comuns } : {},
      include: {
        usuario: { select: { id: true, nomeCompleto: true, ultimoAcessoEm: true } },
        comum: { select: { nome: true, tipo: true } },
        instrumento: { select: { nome: true } },
      },
    });
    const ids = alunos.map((a) => a.usuarioId);

    const jornadas = ids.length
      ? await banco.jornadaDoAluno.findMany({
        where: { alunoId: { in: ids } },
        include: {
          metodo: { select: { id: true, nome: true } },
          unidadeAtual: { select: { tipo: true, codigo: true } },
        },
      })
      : [];
    const presencas = ids.length
      ? await banco.presenca.findMany({
        where: { alunoId: { in: ids } },
        include: { aula: { select: { data: true, situacao: true } } },
      })
      : [];
    const tentativas = ids.length
      ? await banco.tentativaAvaliacao.findMany({
        where: { alunoId: { in: ids } },
        select: { aprovado: true },
      })
      : [];
    const certificados = ids.length
      ? await banco.certificado.count({ where: { alunoId: { in: ids } } })
      : 0;
    const instrutores = await banco.perfilInstrutor.count({ where: { ativo: true } });
    const localidades = await banco.comum.count({ where: { ativo: true } });
    const metodos = await banco.metodo.count();
    const aulas = await banco.aula.count({ where: { situacao: 'REALIZADA' } });

    return { alunos, jornadas, presencas, tentativas, certificados, instrutores, localidades, metodos, aulas };
  });

  const linhas: LinhaDoAluno[] = dados.alunos.map((perfil) => {
    const id = perfil.usuarioId;
    const minhas = dados.presencas.filter((p) => p.alunoId === id);
    const frequencia = resumoDeFrequencia(minhas.map((p) => ({
      tipo: p.tipo, aula: p.aula ? { data: p.aula.data, situacao: p.aula.situacao } : null,
    })));
    const jornada = matriculaPrincipal(dados.jornadas.filter((j) => j.alunoId === id));
    const ultimaAula = minhas.map((p) => p.aula?.data).filter(Boolean)
      .sort((a, b) => new Date(b as Date).getTime() - new Date(a as Date).getTime())[0] ?? null;
    return {
      alunoId: id,
      nome: perfil.usuario.nomeCompleto,
      instrumento: perfil.instrumento?.nome ?? null,
      metodo: jornada?.metodo.nome ?? null,
      unidadeAtual: jornada?.unidadeAtual ? `${jornada.unidadeAtual.tipo.toLowerCase()} ${jornada.unidadeAtual.codigo}` : null,
      percentual: jornada ? jornada.progresso : null,
      ultimoAcesso: perfil.usuario.ultimoAcessoEm,
      ultimaAula: (ultimaAula as Date | null) ?? null,
      frequencia: frequencia.percentual,
      aulas: frequencia.aulas,
      enviosPendentes: 0,
    };
  });

  const resumo = panorama(linhas);
  const aprovacao = taxaDeAprovacao(dados.tentativas);
  const porInstrumento = distribuicaoPor(linhas, 'instrumento');
  const porMetodo = distribuicaoPor(linhas, 'metodo');
  const porFase = distribuicaoPorFase(linhas);
  const porSituacao = ['atencao', 'acompanhar', 'em_dia', 'nao_comecou'].map((chave) => ({
    chave,
    alunos: linhas.filter((l) => situacaoDoAluno(l).chave === chave).length,
  }));
  const NOME_DA_SITUACAO: Record<string, string> = {
    atencao: 'Precisam de atenção', acompanhar: 'Acompanhar',
    em_dia: 'Em dia', nao_comecou: 'Não começaram',
  };

  return (
    <main className="mx-auto max-w-4xl p-6 pb-16">
      <Cabecalho
        titulo="Relatórios"
        subtitulo={escopo.ehAdministracao ? 'Todo o sistema' : 'Limitado ao seu escopo'}
        voltar="/painel"
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Alunos" valor={resumo.alunos} detalhe={`${resumo.alunosAtivos} ativos`} />
        <Indicador rotulo="Instrutores" valor={dados.instrutores} />
        <Indicador rotulo="Localidades" valor={dados.localidades} />
        <Indicador rotulo="Métodos" valor={dados.metodos} />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Aulas realizadas" valor={dados.aulas} />
        <Indicador rotulo="Certificados" valor={dados.certificados} />
        <Indicador rotulo="Progresso médio"
          valor={resumo.progressoMedio === null ? '—' : `${resumo.progressoMedio}%`} />
        <Indicador rotulo="Frequência média"
          valor={resumo.frequenciaMedia === null ? '—' : `${resumo.frequenciaMedia}%`} />
      </section>

      <section className="mt-6">
        <h2 className="rotulo">Taxa de aprovação</h2>
        <div className="cartao mt-2">
          {aprovacao.taxa === null ? (
            <p className="text-sm text-tinta-fraca">Nenhuma avaliação corrigida ainda.</p>
          ) : (
            <>
              <p className="font-titulo text-2xl tabular-nums">{aprovacao.taxa}%</p>
              <p className="text-sm text-tinta-fraca">
                em {aprovacao.total} avaliação(ões) corrigida(s)
              </p>
              {!aprovacao.conclusiva && (
                <div className="mt-2">
                  {/* Um número calculado sobre poucas avaliações ao lado de
                      outro calculado sobre muitas convida a comparar coisas
                      que não se comparam. Dizer isso é parte do número. */}
                  <Aviso tom="pendente">
                    Poucas avaliações para uma conclusão: este percentual ainda varia muito a cada nova correção.
                  </Aviso>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="rotulo">Situação dos alunos</h2>
        <div className="cartao mt-2 grid gap-3">
          {porSituacao.map((s) => (
            <Barra key={s.chave} rotulo={NOME_DA_SITUACAO[s.chave]} valor={s.alunos} total={resumo.alunos} />
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="rotulo">Alunos por instrumento</h2>
          <div className="cartao mt-2 grid gap-3">
            {porInstrumento.length
              ? porInstrumento.map((d) => (
                <Barra key={d.nome} rotulo={d.nome} valor={d.alunos} total={resumo.alunos} />
              ))
              : <p className="text-sm text-tinta-fraca">Sem alunos no escopo.</p>}
          </div>
        </div>
        <div>
          <h2 className="rotulo">Alunos por método</h2>
          <div className="cartao mt-2 grid gap-3">
            {porMetodo.length
              ? porMetodo.map((d) => (
                <Barra key={d.nome} rotulo={d.nome} valor={d.alunos} total={resumo.alunos} />
              ))
              : <p className="text-sm text-tinta-fraca">Sem alunos no escopo.</p>}
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="rotulo">Onde os alunos estão</h2>
        <div className="cartao mt-2 grid gap-3">
          {porFase.map((d) => (
            <Barra key={d.fase} rotulo={d.fase} valor={d.alunos} total={resumo.alunos} />
          ))}
        </div>
      </section>

      <p className="mt-6 text-xs text-tinta-fraca">
        Todos os números vêm de registro real — nenhum é estimado — e estão limitados ao que o seu vínculo
        alcança. Onde falta dado aparece um traço, não um zero: aluno sem aula não tem 0% de frequência.
      </p>

      <Link href="/painel" className="botao-secundario mt-8">Voltar ao painel</Link>
    </main>
  );
}

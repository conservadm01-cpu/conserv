import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { filtroDeComuns, ehAcompanhante } from '@/lib/autorizacao.ts';
import { podeCadastrar } from '@/lib/cadastro.ts';
import { buscar, panorama, situacaoDoAluno, type Achado, type LinhaDoAluno } from '@/lib/painel.ts';
import { matriculaPrincipal } from '@/lib/matriculas.ts';
import { resumoDeFrequencia } from '@/lib/aulas.ts';
import { Cabecalho, Indicador, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Painel de quem acompanha. A consulta usa o filtro do escopo resolvido no
 * servidor e, ainda assim, o banco aplica RLS por cima: se o filtro faltasse,
 * a lista continuaria limitada às comuns do vínculo.
 */
export default async function PaginaDoPainel({
  searchParams,
}: { searchParams: Promise<{ busca?: string; situacao?: string }> }) {
  const { busca: termoDaBusca = '', situacao: filtroDeSituacao = '' } = await searchParams;
  const usuario = await usuarioDaTela();
  // Área de acompanhamento: quem só estuda volta para o estudo.
  if (!ehAcompanhante(usuario.escopo)) redirect('/aluno');
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
    // A dedicação em minutos continua na ficha de cada aluno; o painel passou a
    // mostrar progresso, frequência e situação, que é o que leva a uma decisão.
    // Consultar aqui o que ninguém lê custa duas varreduras por carregamento.
    const pendentes = await banco.envio.count({
      where: { estado: { in: ['ENVIADA', 'EM_AVALIACAO'] }, ...(ids.length ? { alunoId: { in: ids } } : {}) },
    });
    const pendentesPorAluno = ids.length
      ? await banco.envio.groupBy({
        by: ['alunoId'],
        where: { estado: { in: ['ENVIADA', 'EM_AVALIACAO'] }, alunoId: { in: ids } },
        _count: { _all: true },
      })
      : [];
    // Todas as matrículas: qual delas representa o aluno numa linha só é
    // decidido por matriculaPrincipal(), a mesma regra que o relatório usa.
    const jornadas = ids.length
      ? await banco.jornadaDoAluno.findMany({
        where: { alunoId: { in: ids } },
        orderBy: { inicioEm: 'desc' },
        include: {
          metodo: { select: { nome: true } },
          unidadeAtual: { select: { tipo: true, codigo: true, nome: true } },
        },
      })
      : [];
    const presencas = ids.length
      ? await banco.presenca.findMany({
        where: { alunoId: { in: ids } },
        include: { aula: { select: { data: true, situacao: true } } },
      })
      : [];
    const instrutores = await banco.perfilInstrutor.findMany({
      include: { usuario: { select: { id: true, nomeCompleto: true } }, comum: { select: { nome: true } } },
    });
    const turmas = await banco.turma.findMany({
      where: { status: 'ATIVO' },
      include: { comum: { select: { nome: true } }, metodo: { select: { nome: true } } },
    });
    return { alunos, pendentes, pendentesPorAluno, jornadas, presencas, instrutores, turmas };
  });

  const papeis = escopo.papeis.map((p) => p.toLowerCase().replace(/_/g, ' ')).join(', ');

  // ---- os números do painel, calculados fora da tela (src/lib/painel.ts) ----
  const presencasDe = (id: string) => dados.presencas.filter((p) => p.alunoId === id);
  const jornadaDe = (id: string) => matriculaPrincipal(dados.jornadas.filter((j) => j.alunoId === id));

  const linhas: LinhaDoAluno[] = dados.alunos.map((perfil) => {
    const id = perfil.usuarioId;
    const minhasPresencas = presencasDe(id);
    const frequencia = resumoDeFrequencia(minhasPresencas.map((p) => ({
      tipo: p.tipo, aula: p.aula ? { data: p.aula.data, situacao: p.aula.situacao } : null,
    })));
    const jornada = jornadaDe(id);
    const ultimaAula = minhasPresencas
      .map((p) => p.aula?.data)
      .filter(Boolean)
      .sort((a, b) => new Date(b as Date).getTime() - new Date(a as Date).getTime())[0] ?? null;

    return {
      alunoId: id,
      nome: perfil.usuario.nomeCompleto,
      instrumento: perfil.instrumento?.nome ?? null,
      metodo: jornada?.metodo.nome ?? null,
      unidadeAtual: jornada?.unidadeAtual
        ? `${jornada.unidadeAtual.tipo.charAt(0)}${jornada.unidadeAtual.tipo.slice(1).toLowerCase()} ${jornada.unidadeAtual.codigo}`
        : null,
      percentual: jornada ? jornada.progresso : null,
      ultimoAcesso: perfil.usuario.ultimoAcessoEm,
      ultimaAula: (ultimaAula as Date | null) ?? null,
      frequencia: frequencia.percentual,
      aulas: frequencia.aulas,
      enviosPendentes: dados.pendentesPorAluno.find((e) => e.alunoId === id)?._count._all ?? 0,
    };
  });

  const situacoes = new Map(linhas.map((l) => [l.alunoId, situacaoDoAluno(l)]));
  const resumo = panorama(linhas);
  const alertas = linhas
    .flatMap((l) => (situacoes.get(l.alunoId)?.motivos ?? []).map((motivo) => ({ alunoId: l.alunoId, motivo, chave: situacoes.get(l.alunoId)!.chave })))
    .sort((a, b) => (a.chave === 'atencao' ? 0 : 1) - (b.chave === 'atencao' ? 0 : 1));

  // ---- busca global: só sobre o que a RLS já entregou ----
  const universo: Achado[] = [
    ...linhas.map((l) => ({
      tipo: 'aluno' as const, id: l.alunoId, titulo: l.nome,
      detalhe: [l.instrumento, l.metodo, dados.alunos.find((a) => a.usuarioId === l.alunoId)?.comum.nome]
        .filter(Boolean).join(' · '),
      destino: `/painel/aluno/${l.alunoId}`,
    })),
    ...dados.instrutores.map((i) => ({
      tipo: 'instrutor' as const, id: i.usuarioId, titulo: i.usuario.nomeCompleto,
      detalhe: [i.comum?.nome, i.formacao].filter(Boolean).join(' · ') || 'instrutor',
      destino: `/painel/pessoas/${i.usuarioId}`,
    })),
    ...dados.turmas.map((t) => ({
      tipo: 'turma' as const, id: t.id, titulo: t.nome,
      detalhe: [t.comum.nome, t.metodo.nome].filter(Boolean).join(' · '),
      destino: '/painel/turmas',
    })),
  ];
  const achados = termoDaBusca ? buscar(termoDaBusca, universo) : [];

  const visiveis = linhas.filter((l) =>
    !filtroDeSituacao || situacoes.get(l.alunoId)?.chave === filtroDeSituacao);

  return (
    <main className="mx-auto max-w-4xl p-6 pb-16">
      <Cabecalho titulo={`Painel de ${usuario.nomeCompleto.split(' ')[0]}`} subtitulo={`Perfil: ${papeis}`} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Alunos no seu escopo" valor={resumo.alunos} />
        <Indicador rotulo="Precisam de atenção" valor={resumo.precisamDeAtencao}
          detalhe={resumo.emAtraso ? `${resumo.emAtraso} em atraso` : undefined} />
        <Indicador rotulo="Progresso médio"
          valor={resumo.progressoMedio === null ? '—' : `${resumo.progressoMedio}%`}
          detalhe={resumo.progressoMedio === null ? 'ainda sem dados' : undefined} />
        <Indicador rotulo="Frequência média"
          valor={resumo.frequenciaMedia === null ? '—' : `${resumo.frequenciaMedia}%`}
          detalhe={resumo.frequenciaMedia === null ? 'nenhuma aula registrada' : undefined} />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Atividades a corrigir" valor={dados.pendentes} />
        <Indicador rotulo="Sem atividade" valor={resumo.alunosSemAtividade} />
        <Indicador rotulo="Comuns" valor={escopo.ehAdministracao ? 'todas' : escopo.comunsVisiveis.length} />
        <Indicador rotulo="Regiões" valor={escopo.ehAdministracao ? 'todas' : escopo.regioes.length || '—'} />
      </section>

      {!dados.alunos.length && (
        <div className="mt-4">
          <Aviso tom="pendente">
            Nenhum aluno vinculado ao seu escopo. Os vínculos de comum e região são concedidos pela administração.
          </Aviso>
        </div>
      )}

      {/* O que precisa de você vem antes da lista: um painel serve para
          decidir a quem dar atenção, não para percorrer nomes. */}
      {alertas.length > 0 && (
        <section className="mt-6">
          <h2 className="rotulo">O que precisa de você</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {alertas.slice(0, 8).map((alerta, i) => (
              <li key={`${alerta.alunoId}-${i}`}
                className={`cartao border-l-4 ${alerta.chave === 'atencao' ? 'border-alerta' : 'border-pendente'}`}>
                <Link href={`/painel/aluno/${alerta.alunoId}`} className="text-sm hover:underline">
                  {alerta.motivo}
                </Link>
              </li>
            ))}
          </ul>
          {alertas.length > 8 && (
            <p className="mt-1 text-xs text-tinta-fraca">e mais {alertas.length - 8}.</p>
          )}
        </section>
      )}

      {/* Busca e filtro em formulário GET: funciona sem JavaScript, e o
          endereço resultante pode ser guardado ou mandado a outra pessoa. */}
      <form method="get" className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <label htmlFor="busca" className="sr-only">Buscar aluno, instrutor ou turma</label>
          <input id="busca" name="busca" type="search" defaultValue={termoDaBusca} className="campo"
            placeholder="Buscar aluno, instrutor, turma…" />
        </div>
        <div>
          <label htmlFor="situacao" className="sr-only">Situação</label>
          <select id="situacao" name="situacao" defaultValue={filtroDeSituacao} className="campo">
            <option value="">Todas as situações</option>
            <option value="atencao">Precisa de atenção</option>
            <option value="acompanhar">Acompanhar</option>
            <option value="em_dia">Em dia</option>
            <option value="nao_comecou">Não começou</option>
          </select>
        </div>
        <button type="submit" className="botao-secundario">Filtrar</button>
      </form>

      {termoDaBusca && (
        <section className="mt-4">
          <h2 className="rotulo">Resultados para “{termoDaBusca}”</h2>
          {achados.length ? (
            <ul className="mt-2 grid gap-2">
              {achados.map((achado) => (
                <li key={`${achado.tipo}-${achado.id}`} className="cartao">
                  <Link href={achado.destino} className="font-semibold hover:underline">{achado.titulo}</Link>
                  <span className="etiqueta ml-2 bg-black/5">{achado.tipo}</span>
                  <p className="text-xs text-tinta-fraca">{achado.detalhe}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-tinta-fraca">Nada encontrado no seu escopo.</p>
          )}
        </section>
      )}

      <section className="mt-6">
        <h2 className="rotulo">
          Alunos{filtroDeSituacao ? ` — ${visiveis.length} de ${linhas.length}` : ''}
        </h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left">
                <th className="py-2">Aluno</th><th>Instrumento</th><th>Método</th><th>Fase</th>
                <th className="text-right">Progresso</th><th className="text-right">Frequência</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((linha) => {
                const situacao = situacoes.get(linha.alunoId)!;
                return (
                  <tr key={linha.alunoId} className="border-b border-black/5">
                    <td className="py-2">
                      <Link className="font-semibold hover:underline" href={`/painel/aluno/${linha.alunoId}`}>
                        {linha.nome}
                      </Link>
                      <span className="block text-xs text-tinta-fraca">
                        {dados.alunos.find((a) => a.usuarioId === linha.alunoId)?.comum.nome}
                      </span>
                    </td>
                    <td>{linha.instrumento ?? '—'}</td>
                    <td>{linha.metodo ?? '—'}</td>
                    <td>{linha.unidadeAtual ?? '—'}</td>
                    <td className="text-right tabular-nums">
                      {linha.percentual === null ? '—' : `${linha.percentual}%`}
                    </td>
                    <td className="text-right tabular-nums">
                      {/* Sem aula, traço — não zero. */}
                      {linha.frequencia === null ? '—' : `${linha.frequencia}%`}
                    </td>
                    <td>
                      {/* Ícone E palavra: cor sozinha não informa quem não a distingue. */}
                      <span aria-hidden="true">{situacao.icone}</span>{' '}
                      <span className="text-xs">{situacao.texto}</span>
                    </td>
                  </tr>
                );
              })}
              {!visiveis.length && (
                <tr><td colSpan={7} className="py-3 text-tinta-fraca">Nenhum aluno com esse filtro.</td></tr>
              )}
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
        {podeCadastrar(escopo) && <Link href="/painel/pessoas" className="botao-secundario">Pessoas</Link>}
        <Link href="/painel/aulas" className="botao-secundario">Aulas e frequência</Link>
        <Link href="/painel/relatorios" className="botao-secundario">Relatórios</Link>
        <Link href="/painel/turmas" className="botao-secundario">Turmas</Link>
        {escopo.ehAdministracao && <Link href="/admin/metodos" className="botao-secundario">Central de métodos</Link>}
        {escopo.ehAdministracao && <Link href="/admin/permissoes" className="botao-secundario">Permissões</Link>}
        <Link href="/assunto" className="botao-secundario">Índice por assunto</Link>
        <Link href="/sair" className="botao-secundario">Sair</Link>
      </nav>
    </main>
  );
}

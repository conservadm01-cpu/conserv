import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { podeVerAluno, ehAcompanhante } from '@/lib/autorizacao.ts';
import { calcularAproveitamento, type EstadoProgresso } from '@/lib/regras.ts';
import { alertaDeFrequencia, frequenciaPorExtenso, resumoDeFrequencia } from '@/lib/aulas.ts';
import { avisoDeResponsavelObrigatorio } from '@/lib/pessoas.ts';
import { Cabecalho, Indicador, Aviso, formatarTempo } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Ficha do aluno para quem acompanha.
 *
 * Trocar o id na URL não abre nada: a permissão é conferida aqui pelo vínculo
 * e, ainda assim, o banco devolveria vazio pela RLS. A resposta é a mesma para
 * "não existe" e "não é seu", para a URL não servir de sonda.
 */
export default async function FichaDoAluno({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaTela();
  // Área de acompanhamento: quem só estuda volta para o estudo.
  if (!ehAcompanhante(usuario.escopo)) redirect('/aluno');
  const { id } = await params;

  if (!(await podeVerAluno(usuario.escopo, id))) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Cabecalho titulo="Aluno não encontrado" voltar="/painel" />
        <Aviso tom="alerta">
          Este aluno não está sob a sua responsabilidade, ou não existe. A consulta foi registrada.
        </Aviso>
      </main>
    );
  }

  const dados = await comoUsuario(usuario.id, async (banco) => {
    const perfil = await banco.perfilAluno.findUnique({
      where: { usuarioId: id },
      include: {
        usuario: { select: { nomeCompleto: true, email: true, telefone: true, ultimoAcessoEm: true, nascimento: true } },
        comum: { include: { regiao: true } }, instrumento: true, instrutor: { select: { nomeCompleto: true } },
      },
    });
    const progresso = await banco.progressoLicao.findMany({
      where: { alunoId: id },
      select: { licaoId: true, jornadaId: true, estado: true, peso: true },
    });
    // Uma linha por jornada: o aluno pode estar em vários métodos ao mesmo tempo.
    const jornadas = await banco.jornadaDoAluno.findMany({
      where: { alunoId: id },
      orderBy: [{ status: 'asc' }, { inicioEm: 'asc' }],
      include: {
        metodo: { select: { nome: true, codigo: true } },
        instrumento: { select: { nome: true } },
        curriculo: { select: { rotulo: true, versao: true } },
        unidadeAtual: { select: { tipo: true, codigo: true, nome: true } },
      },
    });
    const turmas = await banco.matriculaEmTurma.findMany({
      where: { alunoId: id, saidaEm: null },
      include: { turma: { select: { nome: true, metodo: { select: { codigo: true } } } } },
    });
    const tempos = await banco.tempoDiario.findMany({ where: { usuarioId: id }, orderBy: { dia: 'desc' }, take: 30 });
    const responsaveis = await banco.responsavelDoAluno.findMany({
      where: { alunoId: id },
      orderBy: [{ pedagogico: 'desc' }, { criadoEm: 'asc' }],
      include: { responsavel: true },
    });
    const presencas = await banco.presenca.findMany({
      where: { alunoId: id },
      include: { aula: { select: { data: true, situacao: true } } },
    });
    const ultimaAula = await banco.aula.findFirst({
      where: { presencas: { some: { alunoId: id } }, situacao: 'REALIZADA' },
      orderBy: { data: 'desc' },
      select: { data: true, conteudo: true, proximaAtividade: true },
    });
    const envios = await banco.envio.findMany({
      where: { alunoId: id }, orderBy: { atualizadoEm: 'desc' }, take: 10,
      include: { atividade: { select: { titulo: true } } },
    });
    return { perfil, progresso, jornadas, turmas, tempos, envios, responsaveis, presencas, ultimaAula };
  });

  if (!dados.perfil) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Cabecalho titulo="Aluno não encontrado" voltar="/painel" />
        <Aviso tom="alerta">Este aluno não está sob a sua responsabilidade, ou não existe.</Aviso>
      </main>
    );
  }

  // O aproveitamento é POR JORNADA: somar métodos diferentes num número só
  // misturaria critérios que não se comparam.
  const aproveitamentoDe = (jornadaId: string) => calcularAproveitamento(
    dados.progresso
      .filter((p) => p.jornadaId === jornadaId)
      .map((p) => ({ licaoId: p.licaoId, peso: p.peso, estado: p.estado as EstadoProgresso })),
    100,
  );
  const aprovadasNoTotal = dados.progresso.filter((p) => p.estado === 'APROVADO').length;
  const tempoTotal = dados.tempos.reduce((soma, t) => soma + t.segundosDedicacao, 0);

  const frequencia = resumoDeFrequencia(dados.presencas.map((p) => ({
    tipo: p.tipo, aula: p.aula ? { data: p.aula.data, situacao: p.aula.situacao } : null,
  })));
  const primeiroNome = dados.perfil.usuario.nomeCompleto.split(' ')[0];
  const alertaDeFrequenciaDoAluno = alertaDeFrequencia(frequencia, primeiroNome);
  const avisoDeMenor = avisoDeResponsavelObrigatorio(
    dados.perfil.usuario.nascimento, dados.responsaveis,
  );

  return (
    <main className="mx-auto max-w-3xl p-6 pb-16">
      <Cabecalho
        titulo={dados.perfil.usuario.nomeCompleto}
        subtitulo={`${dados.perfil.instrumento?.nome ?? 'instrumento a definir'} · ${dados.perfil.comum.nome} · ${dados.perfil.comum.regiao.nome}`}
        voltar="/painel"
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Jornadas" valor={dados.jornadas.length}
          detalhe={`${aprovadasNoTotal} lição(ões) aprovada(s) no total`} />
        <Indicador rotulo="Dedicação (30 dias)" valor={formatarTempo(tempoTotal)} />
        <Indicador rotulo="Instrutor" valor={dados.perfil.instrutor?.nomeCompleto.split(' ')[0] ?? '—'} />
        <Indicador rotulo="Último acesso"
          valor={dados.perfil.usuario.ultimoAcessoEm?.toLocaleDateString('pt-BR') ?? '—'} />
      </section>

      <section className="mt-6">
        <h2 className="rotulo">Jornadas</h2>
        {dados.jornadas.length ? (
          <div className="mt-2 grid gap-2">
            {dados.jornadas.map((jornada) => {
              const aproveitamento = aproveitamentoDe(jornada.id);
              return (
                <Link key={jornada.id} href={`/jornada/${jornada.id}`} className="cartao block">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold">{jornada.metodo.nome}</p>
                    <span className="etiqueta bg-black/5">{jornada.status.toLowerCase()}</span>
                  </div>
                  <p className="text-xs text-tinta-fraca">
                    {jornada.instrumento?.nome ?? 'sem instrumento'} · {jornada.curriculo.rotulo} (v{jornada.curriculo.versao})
                    {jornada.unidadeAtual
                      ? ` · em ${jornada.unidadeAtual.tipo.toLowerCase()} ${jornada.unidadeAtual.codigo}`
                      : ''}
                  </p>
                  <p className="mt-1 text-sm">
                    {aproveitamento.unidadesAprovadas} de {aproveitamento.unidadesElegiveis} lições registradas aprovadas
                    {' '}({aproveitamento.percentual}%)
                  </p>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-tinta-fraca">Este aluno ainda não foi matriculado em nenhum método.</p>
        )}
      </section>

      {dados.turmas.length > 0 && (
        <section className="mt-6">
          <h2 className="rotulo">Turmas</h2>
          <ul className="mt-2 grid gap-2">
            {dados.turmas.map((matricula) => (
              <li key={matricula.id} className="cartao flex items-center justify-between gap-3">
                <span>{matricula.turma.nome}</span>
                <span className="etiqueta bg-black/5">{matricula.turma.metodo.codigo}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="rotulo">Responsáveis</h2>
        {dados.responsaveis.length ? (
          <ul className="mt-2 grid gap-2">
            {dados.responsaveis.map((vinculo) => (
              <li key={vinculo.id} className="cartao">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{vinculo.responsavel.nomeCompleto}</span>
                  {vinculo.parentesco && <span className="etiqueta bg-black/5">{vinculo.parentesco}</span>}
                </div>
                <p className="text-xs text-tinta-fraca">
                  {[vinculo.responsavel.telefone, vinculo.responsavel.email].filter(Boolean).join(' · ') || 'sem contato registrado'}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-tinta-fraca">Nenhum responsável cadastrado.</p>
        )}
        {avisoDeMenor && <div className="mt-2"><Aviso tom="pendente">{avisoDeMenor}</Aviso></div>}
        <Link href={`/painel/aluno/${id}/responsaveis`} className="botao-secundario mt-2 inline-block">
          Cadastrar ou remover responsável
        </Link>
      </section>

      <section className="mt-6">
        <h2 className="rotulo">Frequência</h2>
        <div className="cartao mt-2">
          <p className="text-sm">{frequenciaPorExtenso(frequencia)}</p>
          {alertaDeFrequenciaDoAluno && <p className="mt-1 text-sm text-alerta">{alertaDeFrequenciaDoAluno}</p>}
          {dados.ultimaAula?.proximaAtividade && (
            <p className="mt-1 text-sm"><b>Combinado na última aula:</b> {dados.ultimaAula.proximaAtividade}</p>
          )}
        </div>
        <Link href={`/painel/aulas?aluno=${id}`} className="botao-secundario mt-2 inline-block">Ver as aulas</Link>
      </section>

      <section className="mt-6">
        <h2 className="rotulo">Situação do cadastro</h2>
        <div className="cartao mt-2 grid gap-1 text-sm">
          <p><b>Situação:</b> {dados.perfil.situacao.toLowerCase().replace(/_/g, ' ')}</p>
          <p><b>Encarregado local:</b> {dados.perfil.encarregadoLocalNome ?? '—'}</p>
          <p><b>Encarregado regional:</b> {dados.perfil.encarregadoRegionalNome ?? '—'}</p>
          <p><b>Ancião:</b> {dados.perfil.anciaoNome ?? '—'}</p>
          <p><b>Contato:</b> {dados.perfil.usuario.email}{dados.perfil.usuario.telefone ? ` · ${dados.perfil.usuario.telefone}` : ''}</p>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="rotulo">Últimos envios</h2>
        {dados.envios.length ? (
          <ul className="mt-2 grid gap-2">
            {dados.envios.map((envio) => (
              <li key={envio.id} className="cartao flex items-center justify-between gap-3">
                <span>{envio.atividade.titulo}</span>
                <span className="etiqueta bg-black/5">{envio.estado.toLowerCase().replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-tinta-fraca">Nenhuma atividade prática enviada até agora.</p>
        )}
      </section>

      <Link href="/painel" className="botao-secundario mt-8">Voltar ao painel</Link>
    </main>
  );
}

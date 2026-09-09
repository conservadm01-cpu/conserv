import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { ehAcompanhante } from '@/lib/autorizacao.ts';
import { motivoDaRecusaDeAula, motivoDaRecusaDePresenca, TIPOS_DE_PRESENCA, type TipoDePresenca } from '@/lib/aulas.ts';
import { Cabecalho, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Registro de aula com chamada.
 *
 * É a tela que o instrutor abre toda semana, então ela é curta de propósito:
 * data, o que se viu, o que fica para a próxima, e a chamada já marcada com
 * todos presentes — marcar quem faltou é mais rápido do que marcar quem veio,
 * e a aula sem falta é a mais comum.
 */

async function registrar(dadosDoFormulario: FormData) {
  'use server';
  const quem = await usuarioDaTela();
  const turmaId = String(dadosDoFormulario.get('turmaId') ?? '') || null;
  const jornadaId = String(dadosDoFormulario.get('jornadaId') ?? '') || null;
  const alvo = String(dadosDoFormulario.get('alvo') ?? '');

  // O erro volta para a MESMA chamada, com a turma ainda escolhida. Sem isto o
  // instrutor que erra um campo perde a lista de presença inteira que acabou
  // de preencher — e da segunda vez ele preenche com menos cuidado.
  const falhar = (mensagem: string) => redirect(
    `/painel/aulas/nova?alvo=${encodeURIComponent(alvo)}&erro=${encodeURIComponent(mensagem)}`,
  );

  // O seletor manda "turma:id" ou "matricula:id": um campo só, uma escolha só.
  const [tipoDoAlvo, idDoAlvo] = alvo.split(':');
  const turma = tipoDoAlvo === 'turma' ? idDoAlvo : turmaId;
  const jornada = tipoDoAlvo === 'matricula' ? idDoAlvo : jornadaId;

  const dataTexto = String(dadosDoFormulario.get('data') ?? '');
  const aula = {
    turmaId: turma || null,
    jornadaId: jornada || null,
    data: dataTexto ? new Date(`${dataTexto}T12:00:00`) : null,
    horaInicio: String(dadosDoFormulario.get('horaInicio') ?? '').trim() || null,
    horaFim: String(dadosDoFormulario.get('horaFim') ?? '').trim() || null,
    situacao: String(dadosDoFormulario.get('situacao') ?? 'REALIZADA') as 'PLANEJADA' | 'REALIZADA' | 'CANCELADA',
    conteudo: String(dadosDoFormulario.get('conteudo') ?? '').trim() || null,
  };

  const recusa = motivoDaRecusaDeAula(aula);
  if (recusa) falhar(recusa);

  // A chamada vem como um campo por aluno: presenca:<alunoId> = tipo.
  const chamada: Array<{ alunoId: string; tipo: TipoDePresenca; justificativa: string | null }> = [];
  for (const [chave, valor] of dadosDoFormulario.entries()) {
    if (!chave.startsWith('presenca:')) continue;
    const alunoId = chave.slice('presenca:'.length);
    const tipo = String(valor) as TipoDePresenca;
    const justificativa = String(dadosDoFormulario.get(`justificativa:${alunoId}`) ?? '').trim() || null;
    const erro = motivoDaRecusaDePresenca({ tipo, justificativa });
    if (erro) falhar(erro);
    chamada.push({ alunoId, tipo, justificativa });
  }

  try {
    await comoUsuario(quem.id, async (banco) => {
      const criada = await banco.aula.create({
        data: {
          turmaId: aula.turmaId,
          jornadaId: aula.jornadaId,
          instrutorId: quem.id,
          registradoPorId: quem.id,
          data: aula.data!,
          horaInicio: aula.horaInicio,
          horaFim: aula.horaFim,
          situacao: aula.situacao,
          conteudo: aula.conteudo,
          observacao: String(dadosDoFormulario.get('observacao') ?? '').trim() || null,
          proximaAtividade: String(dadosDoFormulario.get('proximaAtividade') ?? '').trim() || null,
        },
      });
      for (const presenca of chamada) {
        await banco.presenca.create({
          data: {
            aulaId: criada.id, alunoId: presenca.alunoId, jornadaId: aula.jornadaId,
            tipo: presenca.tipo, justificativa: presenca.justificativa, registradoPorId: quem.id,
          },
        });
      }
      await banco.auditoria.create({
        data: {
          usuarioId: quem.id, acao: 'aula.registrar', entidade: 'aulas', entidadeId: criada.id,
          depois: { data: dataTexto, turmaId: aula.turmaId, jornadaId: aula.jornadaId, presentes: chamada.length },
        },
      });
    });
  } catch {
    falhar('Não foi possível registrar a aula. Confira se você acompanha esta turma ou este aluno.');
  }
  redirect('/painel/aulas?ok=1');
}

export default async function NovaAula({
  searchParams,
}: { searchParams: Promise<{ erro?: string; alvo?: string }> }) {
  const usuario = await usuarioDaTela();
  if (!ehAcompanhante(usuario.escopo)) redirect('/aluno');
  const { erro, alvo } = await searchParams;

  const dados = await comoUsuario(usuario.id, async (banco) => {
    // Só o que este instrutor pode mesmo registrar: a RLS já filtra, e a tela
    // não oferece o que o banco recusaria depois.
    const turmas = await banco.turma.findMany({
      where: { status: 'ATIVO' },
      orderBy: { nome: 'asc' },
      include: {
        metodo: { select: { codigo: true } },
        matriculas: {
          where: { saidaEm: null },
          include: { aluno: { select: { id: true, nomeCompleto: true } } },
        },
      },
    });
    const matriculas = await banco.jornadaDoAluno.findMany({
      where: { status: { in: ['ATIVA', 'AGUARDANDO_LIBERACAO'] } },
      orderBy: { inicioEm: 'asc' },
      include: {
        aluno: { select: { id: true, nomeCompleto: true } },
        metodo: { select: { nome: true } },
        instrumento: { select: { nome: true } },
      },
    });
    return { turmas, matriculas };
  });

  const escolhido = alvo ?? '';
  const [tipoDoAlvo, idDoAlvo] = escolhido.split(':');
  const turmaEscolhida = tipoDoAlvo === 'turma' ? dados.turmas.find((t) => t.id === idDoAlvo) : null;
  const matriculaEscolhida = tipoDoAlvo === 'matricula' ? dados.matriculas.find((m) => m.id === idDoAlvo) : null;

  const presentes = turmaEscolhida
    ? turmaEscolhida.matriculas.map((m) => m.aluno)
    : matriculaEscolhida
      ? [matriculaEscolhida.aluno]
      : [];

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-2xl p-6 pb-16">
      <Cabecalho titulo="Registrar aula" subtitulo="O que aconteceu no encontro" voltar="/painel/aulas" />
      {erro && <div className="mb-4"><Aviso tom="alerta">{erro}</Aviso></div>}

      {/* Primeiro passo: escolher de quem é a aula. A lista de presença só
          aparece depois, porque ela depende dessa escolha. */}
      <form method="get" className="mb-6">
        <label htmlFor="alvo" className="rotulo">Turma ou aluno</label>
        <select id="alvo" name="alvo" defaultValue={escolhido} className="campo">
          <option value="">— escolha —</option>
          {dados.turmas.length > 0 && (
            <optgroup label="Turmas">
              {dados.turmas.map((turma) => (
                <option key={turma.id} value={`turma:${turma.id}`}>
                  {turma.nome} ({turma.metodo.codigo}) · {turma.matriculas.length} aluno(s)
                </option>
              ))}
            </optgroup>
          )}
          {dados.matriculas.length > 0 && (
            <optgroup label="Aulas individuais">
              {dados.matriculas.map((m) => (
                <option key={m.id} value={`matricula:${m.id}`}>
                  {m.aluno.nomeCompleto} — {m.metodo.nome}{m.instrumento ? ` · ${m.instrumento.nome}` : ''}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button type="submit" className="botao-secundario mt-2">Continuar</button>
      </form>

      {presentes.length === 0 ? (
        <Aviso>
          Escolha a turma ou o aluno acima para abrir a chamada. A aula pertence a uma turma ou a uma
          matrícula — nunca às duas, para que a frequência de cada aluno saia num relatório só.
        </Aviso>
      ) : (
        <form action={registrar} className="grid gap-4">
          <input type="hidden" name="alvo" value={escolhido} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="data" className="rotulo">Data</label>
              <input id="data" name="data" type="date" required defaultValue={hoje} className="campo" />
            </div>
            <div>
              <label htmlFor="horaInicio" className="rotulo">Início</label>
              <input id="horaInicio" name="horaInicio" type="time" className="campo" />
            </div>
            <div>
              <label htmlFor="horaFim" className="rotulo">Término</label>
              <input id="horaFim" name="horaFim" type="time" className="campo" />
            </div>
          </div>

          <div>
            <label htmlFor="situacao" className="rotulo">Situação</label>
            <select id="situacao" name="situacao" defaultValue="REALIZADA" className="campo">
              <option value="REALIZADA">Realizada</option>
              <option value="PLANEJADA">Planejada</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>

          <div>
            <label htmlFor="conteudo" className="rotulo">O que foi trabalhado</label>
            <textarea id="conteudo" name="conteudo" rows={3} className="campo"
              placeholder="Escala de Sol maior, duas oitavas; leitura da lição 3." />
          </div>

          <div>
            <label htmlFor="proximaAtividade" className="rotulo">O que fica para a próxima</label>
            <textarea id="proximaAtividade" name="proximaAtividade" rows={2} className="campo"
              placeholder="Estudar a lição 4 e trazer o método." />
            <p className="text-xs text-tinta-fraca">Isto aparece para o aluno no painel dele.</p>
          </div>

          <fieldset className="grid gap-2">
            <legend className="rotulo">Chamada ({presentes.length} aluno(s))</legend>
            {presentes.map((aluno) => (
              <div key={aluno.id} className="cartao grid gap-2">
                <p className="font-semibold">{aluno.nomeCompleto}</p>
                <div className="flex flex-wrap gap-3">
                  {TIPOS_DE_PRESENCA.map((tipo) => (
                    <label key={tipo.id} className="flex items-center gap-1 text-sm">
                      <input type="radio" name={`presenca:${aluno.id}`} value={tipo.id}
                        defaultChecked={tipo.id === 'PRESENTE'} required />
                      {tipo.nome}
                    </label>
                  ))}
                </div>
                <input name={`justificativa:${aluno.id}`} className="campo"
                  placeholder="Justificativa (obrigatória para falta justificada)" />
              </div>
            ))}
          </fieldset>

          <div>
            <label htmlFor="observacao" className="rotulo">Observação (opcional)</label>
            <textarea id="observacao" name="observacao" rows={2} className="campo" />
          </div>

          <button type="submit" className="botao">Registrar aula</button>
        </form>
      )}

      <Link href="/painel/aulas" className="botao-secundario mt-8">Ver aulas registradas</Link>
    </main>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { ehAcompanhante, podeVerAluno } from '@/lib/autorizacao.ts';
import {
  avisoDeResponsavelObrigatorio, motivoDaRecusaDeResponsavel,
  motivoDaRecusaDeVinculoDeResponsavel,
} from '@/lib/pessoas.ts';
import { Cabecalho, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Responsáveis de um aluno.
 *
 * "Responsável", e não "encarregado": encarregado local e regional são cargos
 * do ministério e já existem no sistema. Quem responde pelo aluno — pai, mãe,
 * cônjuge, tutor — é o responsável.
 */

async function vincular(dadosDoFormulario: FormData) {
  'use server';
  const quem = await usuarioDaTela();
  const alunoId = String(dadosDoFormulario.get('alunoId') ?? '');
  const voltar = `/painel/aluno/${alunoId}/responsaveis`;
  const falhar = (mensagem: string) => redirect(`${voltar}?erro=${encodeURIComponent(mensagem)}`);

  const dados = {
    nomeCompleto: String(dadosDoFormulario.get('nomeCompleto') ?? '').trim(),
    documento: String(dadosDoFormulario.get('documento') ?? '').trim() || null,
    telefone: String(dadosDoFormulario.get('telefone') ?? '').trim() || null,
    email: String(dadosDoFormulario.get('email') ?? '').trim().toLowerCase() || null,
  };
  const parentesco = String(dadosDoFormulario.get('parentesco') ?? '').trim() || null;
  const pedagogico = dadosDoFormulario.get('pedagogico') === 'on';
  const financeiro = dadosDoFormulario.get('financeiro') === 'on';
  const recebeAvisos = dadosDoFormulario.get('recebeAvisos') === 'on';

  const erroDosDados = motivoDaRecusaDeResponsavel(dados);
  if (erroDosDados) falhar(erroDosDados);

  // A permissão é conferida aqui e o banco a confere de novo pela RLS.
  const alvo = await comoUsuario(quem.id, (banco) => banco.usuario.findUnique({
    where: { id: alunoId },
    select: { id: true, vinculos: { where: { ativo: true }, select: { papel: true, comumId: true } } },
  }));
  if (!alvo) falhar('Aluno não encontrado.');

  const recusa = motivoDaRecusaDeVinculoDeResponsavel(quem.escopo, {
    id: alvo!.id,
    ehAdministracao: alvo!.vinculos.some((v) => v.papel === 'SUPERADMIN' || v.papel === 'ADMIN_PEDAGOGICO'),
    papeis: alvo!.vinculos.map((v) => v.papel),
    comuns: alvo!.vinculos.map((v) => v.comumId),
  });
  if (recusa) falhar(recusa);

  try {
    await comoUsuario(quem.id, async (banco) => {
      const responsavel = await banco.responsavel.create({
        data: { ...dados, criadoPorId: quem.id },
      });
      await banco.responsavelDoAluno.create({
        data: { alunoId, responsavelId: responsavel.id, parentesco, pedagogico, financeiro, recebeAvisos },
      });
      await banco.auditoria.create({
        data: {
          usuarioId: quem.id, acao: 'responsavel.vincular', entidade: 'responsaveis_do_aluno',
          entidadeId: responsavel.id,
          depois: { alunoId, nomeCompleto: dados.nomeCompleto, parentesco, pedagogico, financeiro },
        },
      });
    });
  } catch {
    falhar('Não foi possível gravar o responsável. Confira se você acompanha este aluno.');
  }
  redirect(`${voltar}?ok=1`);
}

async function desvincular(dadosDoFormulario: FormData) {
  'use server';
  const quem = await usuarioDaTela();
  const alunoId = String(dadosDoFormulario.get('alunoId') ?? '');
  const vinculoId = String(dadosDoFormulario.get('vinculoId') ?? '');
  try {
    await comoUsuario(quem.id, async (banco) => {
      const antes = await banco.responsavelDoAluno.findUnique({ where: { id: vinculoId } });
      await banco.responsavelDoAluno.delete({ where: { id: vinculoId } });
      await banco.auditoria.create({
        data: {
          usuarioId: quem.id, acao: 'responsavel.desvincular', entidade: 'responsaveis_do_aluno',
          entidadeId: vinculoId, antes: antes ? { ...antes } : undefined,
        },
      });
    });
  } catch {
    redirect(`/painel/aluno/${alunoId}/responsaveis?erro=${encodeURIComponent('Não foi possível remover o vínculo.')}`);
  }
  redirect(`/painel/aluno/${alunoId}/responsaveis?ok=1`);
}

export default async function ResponsaveisDoAluno({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const usuario = await usuarioDaTela();
  if (!ehAcompanhante(usuario.escopo)) redirect('/aluno');
  const { id } = await params;
  const { erro, ok } = await searchParams;

  if (!(await podeVerAluno(usuario.escopo, id))) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Cabecalho titulo="Aluno não encontrado" voltar="/painel" />
        <Aviso tom="alerta">Este aluno não está sob a sua responsabilidade, ou não existe.</Aviso>
      </main>
    );
  }

  const dados = await comoUsuario(usuario.id, async (banco) => {
    const aluno = await banco.usuario.findUnique({
      where: { id },
      select: { nomeCompleto: true, nascimento: true },
    });
    const vinculos = await banco.responsavelDoAluno.findMany({
      where: { alunoId: id },
      orderBy: [{ pedagogico: 'desc' }, { criadoEm: 'asc' }],
      include: { responsavel: true },
    });
    return { aluno, vinculos };
  });

  if (!dados.aluno) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Cabecalho titulo="Aluno não encontrado" voltar="/painel" />
        <Aviso tom="alerta">Este aluno não está sob a sua responsabilidade, ou não existe.</Aviso>
      </main>
    );
  }

  const avisoDeMenor = avisoDeResponsavelObrigatorio(dados.aluno.nascimento, dados.vinculos);

  return (
    <main className="mx-auto max-w-2xl p-6 pb-16">
      <Cabecalho
        titulo="Responsáveis"
        subtitulo={dados.aluno.nomeCompleto}
        voltar={`/painel/aluno/${id}`}
      />

      {erro && <div className="mb-4"><Aviso tom="alerta">{erro}</Aviso></div>}
      {ok && <div className="mb-4"><Aviso>Cadastro atualizado.</Aviso></div>}
      {avisoDeMenor && <div className="mb-4"><Aviso tom="pendente">{avisoDeMenor}</Aviso></div>}

      <section>
        <h2 className="rotulo">Quem responde por este aluno</h2>
        {dados.vinculos.length ? (
          <ul className="mt-2 grid gap-2">
            {dados.vinculos.map((vinculo) => (
              <li key={vinculo.id} className="cartao">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">{vinculo.responsavel.nomeCompleto}</p>
                  {vinculo.parentesco && <span className="etiqueta bg-black/5">{vinculo.parentesco}</span>}
                </div>
                <p className="text-xs text-tinta-fraca">
                  {[vinculo.responsavel.telefone, vinculo.responsavel.email].filter(Boolean).join(' · ') || 'sem contato registrado'}
                </p>
                <p className="mt-1 text-xs">
                  {[
                    vinculo.pedagogico ? 'responde pelo estudo' : null,
                    vinculo.financeiro ? 'responde pelo financeiro' : null,
                    vinculo.recebeAvisos ? 'recebe avisos' : 'não recebe avisos',
                  ].filter(Boolean).join(' · ')}
                </p>
                <form action={desvincular} className="mt-2">
                  <input type="hidden" name="alunoId" value={id} />
                  <input type="hidden" name="vinculoId" value={vinculo.id} />
                  <button type="submit" className="text-sm text-alerta underline">Remover vínculo</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-tinta-fraca">Nenhum responsável cadastrado.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="rotulo">Cadastrar responsável</h2>
        <form action={vincular} className="mt-2 grid gap-3">
          <input type="hidden" name="alunoId" value={id} />

          <div>
            <label htmlFor="nomeCompleto" className="rotulo">Nome completo</label>
            <input id="nomeCompleto" name="nomeCompleto" required className="campo" autoComplete="off" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="parentesco" className="rotulo">Parentesco</label>
              <input id="parentesco" name="parentesco" className="campo" placeholder="mãe, pai, tutor…" />
            </div>
            <div>
              <label htmlFor="documento" className="rotulo">CPF (opcional)</label>
              <input id="documento" name="documento" className="campo" inputMode="numeric" />
            </div>
            <div>
              <label htmlFor="telefone" className="rotulo">Telefone</label>
              <input id="telefone" name="telefone" className="campo" inputMode="tel" placeholder="(11) 91234-5678" />
            </div>
            <div>
              <label htmlFor="email" className="rotulo">E-mail</label>
              <input id="email" name="email" type="email" className="campo" />
            </div>
          </div>

          <fieldset className="grid gap-2">
            <legend className="rotulo">Do que este responsável responde</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pedagogico" defaultChecked /> Decisões de estudo (trocar instrumento, avançar de fase)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="financeiro" /> Financeiro
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="recebeAvisos" defaultChecked /> Recebe avisos sobre o aluno
            </label>
          </fieldset>

          <button type="submit" className="botao">Cadastrar responsável</button>
        </form>
      </section>

      <Link href={`/painel/aluno/${id}`} className="botao-secundario mt-8">Voltar à ficha</Link>
    </main>
  );
}

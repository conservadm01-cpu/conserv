import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaRequisicao } from '@/lib/sessao.ts';
import { podeVerAluno } from '@/lib/autorizacao.ts';
import { calcularAproveitamento, type EstadoProgresso } from '@/lib/regras.ts';
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
  const usuario = await usuarioDaRequisicao();
  if (!usuario) redirect('/entrar');
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
        usuario: { select: { nomeCompleto: true, email: true, telefone: true, ultimoAcessoEm: true } },
        comum: { include: { regiao: true } }, instrumento: true, instrutor: { select: { nomeCompleto: true } },
      },
    });
    const progresso = await banco.progressoLicao.findMany({
      where: { alunoId: id },
      select: { licaoId: true, estado: true, peso: true },
    });
    const tempos = await banco.tempoDiario.findMany({ where: { usuarioId: id }, orderBy: { dia: 'desc' }, take: 30 });
    const envios = await banco.envio.findMany({
      where: { alunoId: id }, orderBy: { atualizadoEm: 'desc' }, take: 10,
      include: { atividade: { select: { titulo: true } } },
    });
    return { perfil, progresso, tempos, envios };
  });

  if (!dados.perfil) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Cabecalho titulo="Aluno não encontrado" voltar="/painel" />
        <Aviso tom="alerta">Este aluno não está sob a sua responsabilidade, ou não existe.</Aviso>
      </main>
    );
  }

  const aproveitamento = calcularAproveitamento(
    dados.progresso.map((p) => ({ licaoId: p.licaoId, peso: p.peso, estado: p.estado as EstadoProgresso })), 40,
  );
  const tempoTotal = dados.tempos.reduce((soma, t) => soma + t.segundosDedicacao, 0);

  return (
    <main className="mx-auto max-w-3xl p-6 pb-16">
      <Cabecalho
        titulo={dados.perfil.usuario.nomeCompleto}
        subtitulo={`${dados.perfil.instrumento?.nome ?? 'instrumento a definir'} · ${dados.perfil.comum.nome} · ${dados.perfil.comum.regiao.nome}`}
        voltar="/painel"
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Aproveitamento" valor={`${aproveitamento.percentual}%`}
          detalhe={`${aproveitamento.unidadesAprovadas} de ${aproveitamento.unidadesElegiveis} aprovadas`} />
        <Indicador rotulo="Dedicação (30 dias)" valor={formatarTempo(tempoTotal)} />
        <Indicador rotulo="Instrutor" valor={dados.perfil.instrutor?.nomeCompleto.split(' ')[0] ?? '—'} />
        <Indicador rotulo="Último acesso"
          valor={dados.perfil.usuario.ultimoAcessoEm?.toLocaleDateString('pt-BR') ?? '—'} />
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

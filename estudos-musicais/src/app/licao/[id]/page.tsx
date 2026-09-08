import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaRequisicao } from '@/lib/sessao.ts';
import { Cabecalho, SeloDeConferencia, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

const NOME_DA_CLAVE: Record<string, string> = { SOL: 'Clave de Sol', DO: 'Clave de Dó', FA: 'Clave de Fá' };

export default async function PaginaDaLicao({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaRequisicao();
  if (!usuario) redirect('/entrar');
  const { id } = await params;

  const licao = await comoUsuario(usuario.id, (banco) => banco.licao.findUnique({
    where: { id },
    include: {
      versoes: { orderBy: { clave: 'asc' } },
      topico: { include: { fase: { include: { edicao: { include: { material: true } } } } } },
      conteudos: { where: { publicado: true }, orderBy: { ordem: 'asc' } },
      atividades: { where: { ativo: true } },
    },
  }));

  if (!licao) notFound();

  const material = licao.topico.fase.edicao.material;

  return (
    <main className="mx-auto max-w-3xl p-6 pb-16">
      <Cabecalho
        titulo={licao.titulo}
        subtitulo={`${material.nome} · ${licao.topico.fase.nome} · ${licao.topico.codigo} ${licao.topico.nome}`}
        voltar="/assunto"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SeloDeConferencia situacao={licao.statusConferencia} />
        <span className="etiqueta bg-black/5">{licao.tipo.toLowerCase().replace(/_/g, ' ')}</span>
        <span className="etiqueta bg-black/5">exercício {licao.numeroOriginal} no método</span>
      </div>

      {licao.statusConferencia !== 'CONFERIDO' && (
        <Aviso tom={licao.statusConferencia === 'DIVERGENTE' ? 'alerta' : 'pendente'}>
          {licao.statusConferencia === 'DIVERGENTE'
            ? 'Este registro diverge das fontes informadas e aguarda conferência humana. '
            : 'Este registro veio do índice auxiliar e ainda não foi conferido no método impresso. '}
          {licao.observacoes}
        </Aviso>
      )}

      <section className="mt-4">
        <h2 className="rotulo">Versões por clave</h2>
        <div className="mt-2 grid gap-2">
          {licao.versoes.map((versao) => (
            <div key={versao.id} className="cartao">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{NOME_DA_CLAVE[versao.clave]}</p>
                <SeloDeConferencia situacao={versao.statusConferencia} />
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                <div><dt className="rotulo">Página impressa</dt>
                  <dd className="tabular-nums">{versao.paginaImpressaInicio ?? '—'}
                    {versao.paginaImpressaFim && versao.paginaImpressaFim !== versao.paginaImpressaInicio ? `–${versao.paginaImpressaFim}` : ''}</dd></div>
                <div><dt className="rotulo">Página no arquivo</dt>
                  <dd className="tabular-nums">{versao.paginaArquivoInicio ?? '—'}
                    {versao.paginaArquivoFim && versao.paginaArquivoFim !== versao.paginaArquivoInicio ? `–${versao.paginaArquivoFim}` : ''}</dd></div>
                <div><dt className="rotulo">Compasso</dt>
                  <dd>{versao.compassos.length ? versao.compassos.join(' e ') : 'não indicado na fonte'}</dd></div>
                <div><dt className="rotulo">Armadura</dt><dd>{versao.armadura ?? '—'}</dd></div>
                <div><dt className="rotulo">Escala de referência</dt>
                  <dd>{versao.escalaReferencia ?? 'não atribuída'}</dd></div>
                <div><dt className="rotulo">Critério de clave</dt><dd>{versao.criterioClave ?? '—'}</dd></div>
              </dl>
              {versao.observacoes && <p className="mt-2 text-sm text-tinta-fraca">{versao.observacoes}</p>}
              {versao.fonte && <p className="mt-1 text-xs text-tinta-fraca">Fonte: {versao.fonte}</p>}
            </div>
          ))}
        </div>
      </section>

      {licao.conteudos.length > 0 && (
        <section className="mt-6">
          <h2 className="rotulo">Conteúdo</h2>
          {licao.conteudos.map((conteudo) => (
            <article key={conteudo.id} className="cartao mt-2">
              <h3 className="font-semibold">{conteudo.titulo}</h3>
              {conteudo.corpo && <p className="mt-1 whitespace-pre-line text-sm">{conteudo.corpo}</p>}
            </article>
          ))}
        </section>
      )}

      <section className="mt-6">
        <h2 className="rotulo">Atividades</h2>
        {licao.atividades.length ? (
          <ul className="mt-2 grid gap-2">
            {licao.atividades.map((atividade) => (
              <li key={atividade.id} className="cartao">
                <p className="font-semibold">{atividade.titulo}</p>
                <p className="text-sm text-tinta-fraca">{atividade.instrucoes}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-tinta-fraca">
            Nenhuma atividade cadastrada para esta lição. O envio de foto, áudio e vídeo entra com o módulo de
            atividades práticas.
          </p>
        )}
      </section>

      <p className="mt-8 text-xs text-tinta-fraca">
        A plataforma registra a referência de página do método impresso; o arquivo do método não é distribuído aqui.
      </p>
      <Link href="/assunto" className="botao-secundario mt-4">Voltar ao índice por assunto</Link>
    </main>
  );
}

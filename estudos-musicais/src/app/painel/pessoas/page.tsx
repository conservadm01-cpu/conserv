import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { filtroDeComuns, ehAcompanhante } from '@/lib/autorizacao.ts';
import type { Papel } from '@/lib/autorizacao.ts';
import { podeCadastrar, podeEditarUsuario, rotuloDoPapel } from '@/lib/cadastro.ts';
import { Cabecalho, Indicador, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

const SITUACOES: Record<string, { texto: string; cor: string }> = {
  ATIVO: { texto: 'ativo', cor: 'bg-metodo-claro text-metodo-escuro' },
  PENDENTE: { texto: 'pendente', cor: 'bg-pendente-claro text-pendente' },
  INATIVO: { texto: 'inativo', cor: 'bg-black/5 text-tinta-fraca' },
  BLOQUEADO: { texto: 'bloqueado', cor: 'bg-alerta-claro text-alerta' },
};

/**
 * As pessoas do sistema.
 *
 * A lista já vem recortada pelo vínculo de quem olha — e, ainda assim, o banco
 * recorta de novo por RLS. Quem aparece aqui com link é quem este usuário pode
 * administrar; os demais aparecem sem link, para a lista não mentir sobre o
 * tamanho da comum.
 */
export default async function PaginaDePessoas({
  searchParams,
}: { searchParams: Promise<{ busca?: string; situacao?: string }> }) {
  const usuario = await usuarioDaTela();
  // Área de acompanhamento: quem só estuda volta para o estudo.
  if (!ehAcompanhante(usuario.escopo)) redirect('/aluno');
  const filtros = await searchParams;
  const busca = (filtros.busca ?? '').trim();

  const dados = await comoUsuario(usuario.id, async (banco) => {
    const comuns = filtroDeComuns(usuario.escopo);
    const pessoas = await banco.usuario.findMany({
      where: {
        ...(busca
          ? {
            OR: [
              { nomeCompleto: { contains: busca, mode: 'insensitive' } },
              { email: { contains: busca, mode: 'insensitive' } },
              { login: { contains: busca.toLowerCase() } },
            ],
          }
          : {}),
        ...(filtros.situacao ? { status: filtros.situacao as 'ATIVO' } : {}),
        ...(comuns
          ? { OR: [{ id: usuario.id }, { vinculos: { some: { ativo: true, comumId: comuns } } }] }
          : {}),
      },
      orderBy: { nomeCompleto: 'asc' },
      take: 200,
      include: {
        vinculos: {
          where: { ativo: true, revogadoEm: null },
          include: { comum: { select: { nome: true } }, regiao: { select: { nome: true } } },
        },
        criadoPor: { select: { nomeCompleto: true } },
      },
    });

    const porSituacao = await banco.usuario.groupBy({ by: ['status'], _count: { _all: true } });
    return { pessoas, porSituacao };
  });

  const contar = (situacao: string) =>
    dados.porSituacao.find((s) => s.status === situacao)?._count._all ?? 0;

  const paraEdicao = (pessoa: (typeof dados.pessoas)[number]) => ({
    id: pessoa.id,
    papeis: pessoa.vinculos.map((v) => v.papel as Papel),
    comuns: pessoa.vinculos.map((v) => v.comumId),
    ehAdministracao: pessoa.vinculos.some(
      (v) => v.papel === 'SUPERADMIN' || v.papel === 'ADMIN_PEDAGOGICO',
    ),
  });

  const ligacao = (novos: Record<string, string | undefined>) => {
    const parametros = new URLSearchParams();
    for (const [chave, valor] of Object.entries({ ...filtros, ...novos })) if (valor) parametros.set(chave, valor);
    const consulta = parametros.toString();
    return `/painel/pessoas${consulta ? `?${consulta}` : ''}`;
  };

  return (
    <main className="mx-auto max-w-3xl p-6 pb-16">
      <Cabecalho
        titulo="Pessoas"
        voltar="/painel"
        subtitulo="Quem tem acesso, com que perfil e em qual comum."
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="No seu escopo" valor={dados.pessoas.length} />
        <Indicador rotulo="Ativas" valor={contar('ATIVO')} />
        <Indicador rotulo="Inativas" valor={contar('INATIVO') + contar('BLOQUEADO')} />
        <Indicador rotulo="Senha provisória"
          valor={dados.pessoas.filter((p) => p.deveTrocarSenha).length} />
      </section>

      <form className="cartao mt-4 flex flex-wrap items-end gap-3" action="/painel/pessoas">
        <div className="min-w-48 flex-1">
          <label htmlFor="busca" className="rotulo">Procurar</label>
          <input id="busca" name="busca" defaultValue={busca} placeholder="nome, e-mail ou usuário"
            className="campo mt-1" />
        </div>
        <div>
          <label htmlFor="situacao" className="rotulo">Situação</label>
          <select id="situacao" name="situacao" defaultValue={filtros.situacao ?? ''} className="campo mt-1">
            <option value="">todas</option>
            {Object.entries(SITUACOES).map(([chave, { texto }]) => (
              <option key={chave} value={chave}>{texto}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="botao-secundario">Filtrar</button>
      </form>

      {!dados.pessoas.length && (
        <div className="mt-4">
          <Aviso tom="pendente">
            {busca
              ? `Nenhuma pessoa encontrada para “${busca}” dentro do seu escopo.`
              : 'Nenhuma pessoa no seu escopo além de você.'}
          </Aviso>
        </div>
      )}

      <section className="mt-4 grid gap-2">
        {dados.pessoas.map((pessoa) => {
          const editavel = podeEditarUsuario(usuario.escopo, paraEdicao(pessoa));
          const situacao = SITUACOES[pessoa.status] ?? SITUACOES.PENDENTE;
          const onde = pessoa.vinculos.map((v) =>
            v.comum?.nome ?? v.regiao?.nome ?? 'todo o sistema').join(' · ');

          const corpo = (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  {pessoa.nomeCompleto}
                  {pessoa.id === usuario.id && <span className="etiqueta ml-2 bg-black/5">você</span>}
                </p>
                <span className={`etiqueta ${situacao.cor}`}>{situacao.texto}</span>
              </div>
              <p className="text-xs text-tinta-fraca">
                entra como <b>{pessoa.login ?? pessoa.email}</b>
                {onde ? ` · ${onde}` : ' · sem vínculo'}
              </p>
              <p className="mt-1 flex flex-wrap gap-1">
                {pessoa.vinculos.map((v) => (
                  <span key={v.id} className="etiqueta bg-black/5">{rotuloDoPapel(v.papel as Papel)}</span>
                ))}
                {pessoa.deveTrocarSenha && (
                  <span className="etiqueta bg-pendente-claro text-pendente">senha provisória</span>
                )}
              </p>
              <p className="mt-1 text-xs text-tinta-fraca">
                {pessoa.criadoPor
                  ? `cadastrada por ${pessoa.criadoPor.nomeCompleto}`
                  : 'primeiro administrador do sistema'}
                {pessoa.ultimoAcessoEm
                  ? ` · último acesso ${pessoa.ultimoAcessoEm.toLocaleDateString('pt-BR')}`
                  : ' · nunca entrou'}
              </p>
            </>
          );

          return editavel ? (
            <Link key={pessoa.id} href={`/painel/pessoas/${pessoa.id}`} className="cartao block hover:border-metodo/40">
              {corpo}
            </Link>
          ) : (
            <div key={pessoa.id} className="cartao opacity-70">{corpo}</div>
          );
        })}
      </section>

      <p className="mt-4 text-xs text-tinta-fraca">
        Sem link significa fora do seu alcance: cadastro da administração, ou de outro
        território. O banco recusaria a alteração de qualquer forma.
      </p>

      <nav className="mt-6 flex flex-wrap gap-3">
        {podeCadastrar(usuario.escopo) && (
          <Link href="/painel/cadastrar" className="botao">Cadastrar pessoa</Link>
        )}
        <Link href="/painel" className="botao-secundario">Voltar ao painel</Link>
      </nav>
    </main>
  );
}

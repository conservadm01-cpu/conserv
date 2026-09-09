import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import type { Papel } from '@/lib/autorizacao.ts';
import { rotuloDoPapel } from '@/lib/cadastro.ts';
import {
  GRUPOS_DE_PERMISSAO, PAPEIS_EDITAVEIS, PERMISSOES,
  motivoDaRecusaDeConcessao, permissaoPorChave,
} from '@/lib/permissoes.ts';
import { Cabecalho, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Quem pode o quê.
 *
 * A tela existe para que conceder uma permissão deixe de exigir alteração de
 * código e publicação. O que ela NÃO faz é prometer o impossível: permissão
 * que a RLS só autoriza à administração não aparece como concedível a papel
 * de campo, porque o botão existiria e a gravação falharia.
 */

async function alternar(dadosDoFormulario: FormData) {
  'use server';
  const quem = await usuarioDaTela();
  if (!quem.escopo.ehAdministracao) redirect('/painel');

  const papel = String(dadosDoFormulario.get('papel') ?? '') as Papel;
  const chave = String(dadosDoFormulario.get('chave') ?? '');
  const conceder = dadosDoFormulario.get('conceder') === '1';
  const falhar = (mensagem: string) =>
    redirect(`/admin/permissoes?erro=${encodeURIComponent(mensagem)}`);

  const recusa = motivoDaRecusaDeConcessao(papel, chave);
  if (recusa) falhar(recusa);

  await comoUsuario(quem.id, async (banco) => {
    const antes = await banco.permissaoDoPapel.findUnique({
      where: { papel_permissaoChave: { papel, permissaoChave: chave } },
    });
    await banco.permissaoDoPapel.upsert({
      where: { papel_permissaoChave: { papel, permissaoChave: chave } },
      create: { papel, permissaoChave: chave, concedida: conceder, concedidoPorId: quem.id },
      update: { concedida: conceder, concedidoPorId: quem.id },
    });
    // Mexer em permissão é ação com consequência para todo mundo daquele
    // perfil: fica registrado quem mudou, o quê e como estava antes.
    await banco.auditoria.create({
      data: {
        usuarioId: quem.id,
        acao: conceder ? 'permissao.conceder' : 'permissao.retirar',
        entidade: 'permissoes_do_papel',
        entidadeId: `${papel}:${chave}`,
        antes: antes ? { concedida: antes.concedida } : undefined,
        depois: { papel, permissao: chave, concedida: conceder },
      },
    });
  });

  redirect('/admin/permissoes?ok=1');
}

export default async function Permissoes({
  searchParams,
}: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const usuario = await usuarioDaTela();
  if (!usuario.escopo.ehAdministracao) redirect('/painel');
  const { erro, ok } = await searchParams;

  const dados = await comoUsuario(usuario.id, async (banco) => {
    const concessoes = await banco.permissaoDoPapel.findMany({
      include: { concedidoPor: { select: { nomeCompleto: true } } },
    });
    const catalogo = await banco.permissao.findMany();
    return { concessoes, catalogo };
  });

  const concedida = (papel: Papel, chave: string) =>
    dados.concessoes.find((c) => c.papel === papel && c.permissaoChave === chave)?.concedida ?? false;

  // Permissão no banco que nenhum código verifica: prometeria algo que não
  // acontece. Aparece como pendência, e não é escondida.
  const orfas = dados.catalogo.filter((c) => !permissaoPorChave(c.chave));
  const semSemear = PERMISSOES.filter((p) => !dados.catalogo.some((c) => c.chave === p.chave));

  return (
    <main className="mx-auto max-w-4xl p-6 pb-16">
      <Cabecalho
        titulo="Permissões"
        subtitulo="O que cada perfil pode fazer, sem alterar o programa"
        voltar="/painel"
      />

      {erro && <div className="mb-4"><Aviso tom="alerta">{erro}</Aviso></div>}
      {ok && <div className="mb-4"><Aviso>Permissão atualizada.</Aviso></div>}

      <div className="mb-4">
        <Aviso>
          Conceder aqui muda o que a <b>tela oferece</b>. As políticas do banco continuam sendo o piso:
          nenhuma concessão desta página faz alguém gravar o que a segurança do banco recusa. Por isso as
          permissões de administração não aparecem como concedíveis a perfis de campo — o botão existiria
          e a gravação falharia.
        </Aviso>
      </div>

      {orfas.length > 0 && (
        <div className="mb-4">
          <Aviso tom="pendente">
            {orfas.length} permissão(ões) gravada(s) sem verificação correspondente no programa
            ({orfas.map((o) => o.chave).join(', ')}). Conceder essas não muda nada.
          </Aviso>
        </div>
      )}
      {semSemear.length > 0 && (
        <div className="mb-4">
          <Aviso tom="pendente">
            {semSemear.length} permissão(ões) do programa ainda não semeada(s) no banco. Rode a semente
            de permissões para que elas apareçam aqui.
          </Aviso>
        </div>
      )}

      {GRUPOS_DE_PERMISSAO.map((grupo) => (
        <section key={grupo} className="mt-6">
          <h2 className="rotulo">{grupo}</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left">
                  <th className="py-2">Permissão</th>
                  {PAPEIS_EDITAVEIS.map((papel) => (
                    <th key={papel} className="px-2 text-center text-xs font-normal">
                      {rotuloDoPapel(papel)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSOES.filter((p) => p.grupo === grupo).map((permissao) => (
                  <tr key={permissao.chave} className="border-b border-black/5 align-top">
                    <td className="py-2">
                      <span className="font-semibold">{permissao.nome}</span>
                      <span className="block text-xs text-tinta-fraca">{permissao.descricao}</span>
                      {permissao.soAdministracao && (
                        <span className="etiqueta mt-1 inline-block bg-black/5">só administração</span>
                      )}
                    </td>
                    {PAPEIS_EDITAVEIS.map((papel) => {
                      const bloqueio = motivoDaRecusaDeConcessao(papel, permissao.chave);
                      const tem = concedida(papel, permissao.chave);
                      if (bloqueio) {
                        return (
                          <td key={papel} className="px-2 py-2 text-center text-tinta-fraca" title={bloqueio}>
                            <span aria-label={bloqueio}>—</span>
                          </td>
                        );
                      }
                      return (
                        <td key={papel} className="px-2 py-2 text-center">
                          <form action={alternar}>
                            <input type="hidden" name="papel" value={papel} />
                            <input type="hidden" name="chave" value={permissao.chave} />
                            <input type="hidden" name="conceder" value={tem ? '0' : '1'} />
                            <button type="submit"
                              className={`rounded px-2 py-1 text-xs ${tem ? 'bg-metodo-claro text-metodo-escuro' : 'bg-black/5 text-tinta-fraca'}`}
                              aria-label={`${tem ? 'Retirar' : 'Conceder'} “${permissao.nome}” de ${rotuloDoPapel(papel)}`}>
                              {/* Estado em palavra, não só em cor. */}
                              {tem ? 'sim' : 'não'}
                            </button>
                          </form>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="mt-6 text-xs text-tinta-fraca">
        O superadministrador e a administração pedagógica têm todas as permissões por definição, e por isso
        não aparecem como colunas editáveis: esvaziar a lista deles trancaria todo mundo para fora do sistema.
        Toda mudança feita aqui fica registrada na auditoria.
      </p>

      <Link href="/painel" className="botao-secundario mt-8">Voltar ao painel</Link>
    </main>
  );
}

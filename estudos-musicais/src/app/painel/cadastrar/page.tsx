import Link from 'next/link';
import { redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { gerarHashDeSenha } from '@/lib/senha.ts';
import type { Papel } from '@/lib/autorizacao.ts';
import { ehAcompanhante } from '@/lib/autorizacao.ts';
import {
  escoposQuePodeUsar, motivoDaRecusa, normalizarLogin, papeisQuePodeConceder,
  podeCadastrar, rotuloDoPapel, senhaProvisoria, type EscopoDeVinculo,
} from '@/lib/cadastro.ts';
import { Cabecalho, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

/**
 * Cadastro de pessoas.
 *
 * Não existe autocadastro: esta é a única porta de entrada de uma conta nova, e
 * ela só abre para quem já tem acesso. O que cada perfil pode conceder está em
 * `src/lib/cadastro.ts`; as políticas de RLS repetem o piso no banco.
 */
async function cadastrar(dadosDoFormulario: FormData) {
  'use server';
  const quemCadastra = await usuarioDaTela();

  const nomeCompleto = String(dadosDoFormulario.get('nomeCompleto') ?? '').trim();
  const email = String(dadosDoFormulario.get('email') ?? '').trim().toLowerCase();
  const login = normalizarLogin(String(dadosDoFormulario.get('login') ?? ''));
  const telefone = String(dadosDoFormulario.get('telefone') ?? '').trim() || null;
  const papel = String(dadosDoFormulario.get('papel') ?? '') as Papel;
  const escopo = String(dadosDoFormulario.get('escopo') ?? 'COMUM') as EscopoDeVinculo;
  const comumId = String(dadosDoFormulario.get('comumId') ?? '') || null;
  const regiaoId = String(dadosDoFormulario.get('regiaoId') ?? '') || null;

  const falhar = (mensagem: string) => redirect(`/painel/cadastrar?erro=${encodeURIComponent(mensagem)}`);

  if (!nomeCompleto) falhar('Informe o nome completo.');
  if (!email) falhar('Informe o e-mail.');

  const recusa = motivoDaRecusa(quemCadastra.escopo, { papel, escopo, comumId, regiaoId });
  if (recusa) falhar(recusa);

  const senha = senhaProvisoria();
  const senhaHash = await gerarHashDeSenha(senha);

  let criadoId = '';
  try {
    criadoId = await comoUsuario(quemCadastra.id, async (banco) => {
      const novo = await banco.usuario.create({
        data: {
          nomeCompleto, email, login, telefone, senhaHash,
          // A senha sai daqui conhecida por quem cadastrou; o dono troca na
          // primeira entrada e, até lá, nenhuma outra tela abre.
          deveTrocarSenha: true,
          status: 'ATIVO',
          criadoPorId: quemCadastra.id,
        },
      });
      await banco.vinculo.create({
        data: {
          usuarioId: novo.id, papel, escopo,
          comumId: escopo === 'COMUM' ? comumId : null,
          regiaoId: escopo === 'REGIAO' ? regiaoId : null,
          ativo: true, concedidoPorId: quemCadastra.id,
        },
      });
      // O aluno ganha o perfil junto: é ele que liga a pessoa à comum onde estuda.
      if (papel === 'ALUNO' && comumId) {
        await banco.perfilAluno.create({
          data: { usuarioId: novo.id, comumId, situacao: 'APROVADO' },
        });
      }
      await banco.auditoria.create({
        data: {
          usuarioId: quemCadastra.id, acao: 'CADASTRAR_USUARIO', entidade: 'usuarios',
          entidadeId: novo.id,
          depois: { nomeCompleto, email, login, papel, escopo, comumId, regiaoId },
        },
      });
      return novo.id;
    });
  } catch (erro) {
    const texto = String((erro as { message?: string })?.message ?? erro);
    if (/Unique constraint|usuarios_email_key|usuarios_login_key/i.test(texto)) {
      falhar('Já existe cadastro com este e-mail ou nome de usuário.');
    }
    if (/row-level security/i.test(texto)) {
      falhar('O banco recusou este cadastro: fora do seu escopo territorial.');
    }
    throw erro;
  }

  // A senha provisória é mostrada uma vez, para quem cadastrou entregar em mãos.
  redirect(`/painel/cadastrar?criado=${criadoId}&senha=${encodeURIComponent(senha)}`);
}

export default async function PaginaDeCadastro({
  searchParams,
}: { searchParams: Promise<{ erro?: string; criado?: string; senha?: string }> }) {
  const usuario = await usuarioDaTela();
  // Área de acompanhamento: quem só estuda volta para o estudo.
  if (!ehAcompanhante(usuario.escopo)) redirect('/aluno');
  const { erro, criado, senha } = await searchParams;

  if (!podeCadastrar(usuario.escopo)) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Cabecalho titulo="Cadastrar pessoa" voltar="/painel" />
        <Aviso tom="alerta">
          O seu perfil não cadastra outras pessoas. Procure o responsável pela sua comum.
        </Aviso>
      </main>
    );
  }

  const papeis = papeisQuePodeConceder(usuario.escopo);
  const escopos = escoposQuePodeUsar(usuario.escopo);

  const dados = await comoUsuario(usuario.id, async (banco) => ({
    comuns: await banco.comum.findMany({
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, regiao: { select: { nome: true } } },
    }),
    regioes: await banco.regiao.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    recente: criado
      ? await banco.usuario.findUnique({ where: { id: criado }, select: { nomeCompleto: true, email: true, login: true } })
      : null,
  }));

  return (
    <main className="mx-auto max-w-2xl p-6 pb-16">
      <Cabecalho
        titulo="Cadastrar pessoa"
        voltar="/painel"
        subtitulo="A conta nasce com senha provisória e fica ligada a você como responsável."
      />

      {erro && <Aviso tom="alerta">{erro}</Aviso>}

      {dados.recente && senha && (
        <div className="cartao mb-4 border-metodo/30 bg-metodo-claro">
          <p className="font-semibold">Cadastro criado: {dados.recente.nomeCompleto}</p>
          <p className="mt-1 text-sm">
            Entra com <b>{dados.recente.login ?? dados.recente.email}</b> e a senha provisória
            abaixo. Ela vale uma vez: na primeira entrada o sistema exige que a pessoa escolha
            a própria senha.
          </p>
          <p className="mt-2 select-all rounded border border-black/10 bg-white/70 px-3 py-2 font-mono text-lg tracking-wide">
            {senha}
          </p>
          <p className="mt-2 text-xs text-tinta-fraca">
            Anote agora e entregue em mãos: esta senha não é mostrada de novo.
          </p>
        </div>
      )}

      <form action={cadastrar} className="cartao flex flex-col gap-4">
        <div>
          <label htmlFor="nomeCompleto" className="rotulo">Nome completo</label>
          <input id="nomeCompleto" name="nomeCompleto" required className="campo mt-1" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className="rotulo">E-mail</label>
            <input id="email" name="email" type="email" required autoCapitalize="none" className="campo mt-1" />
          </div>
          <div>
            <label htmlFor="login" className="rotulo">Nome de acesso (opcional)</label>
            <input id="login" name="login" autoCapitalize="none" spellCheck={false} className="campo mt-1" />
            <p className="mt-1 text-xs text-tinta-fraca">Serve para entrar sem digitar o e-mail.</p>
          </div>
        </div>

        <div>
          <label htmlFor="telefone" className="rotulo">WhatsApp (opcional)</label>
          <input id="telefone" name="telefone" inputMode="tel" className="campo mt-1" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="papel" className="rotulo">Perfil</label>
            <select id="papel" name="papel" required className="campo mt-1">
              {papeis.map((papel) => (
                <option key={papel} value={papel}>{rotuloDoPapel(papel)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="escopo" className="rotulo">Abrangência</label>
            <select id="escopo" name="escopo" required className="campo mt-1" defaultValue="COMUM">
              {escopos.map((escopo) => (
                <option key={escopo} value={escopo}>
                  {escopo === 'COMUM' ? 'uma comum' : escopo === 'REGIAO' ? 'uma região' : 'todo o sistema'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="comumId" className="rotulo">Comum</label>
            <select id="comumId" name="comumId" className="campo mt-1" defaultValue="">
              <option value="">—</option>
              {dados.comuns.map((comum) => (
                <option key={comum.id} value={comum.id}>{comum.nome} · {comum.regiao.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="regiaoId" className="rotulo">Região</label>
            <select id="regiaoId" name="regiaoId" className="campo mt-1" defaultValue=""
              disabled={!escopos.includes('REGIAO')}>
              <option value="">—</option>
              {dados.regioes.map((regiao) => (
                <option key={regiao.id} value={regiao.id}>{regiao.nome}</option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" className="botao">Cadastrar e gerar senha provisória</button>
      </form>

      <p className="mt-4 text-xs text-tinta-fraca">
        Você concede: {papeis.map(rotuloDoPapel).join(', ')}. Um perfil nunca concede acima de
        si, e o banco recusa cadastro fora do seu território mesmo que a tela deixe passar.
      </p>

      <nav className="mt-6 flex flex-wrap gap-3">
        <Link href="/painel/pessoas" className="botao-secundario">Ver todas as pessoas</Link>
        <Link href="/painel" className="botao-secundario">Voltar ao painel</Link>
      </nav>
    </main>
  );
}

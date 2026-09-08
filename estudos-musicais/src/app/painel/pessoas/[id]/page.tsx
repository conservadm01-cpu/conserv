import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { comoUsuario } from '@/lib/banco.ts';
import { usuarioDaTela } from '@/lib/sessao.ts';
import { gerarHashDeSenha } from '@/lib/senha.ts';
import type { EscopoDoUsuario, Papel } from '@/lib/autorizacao.ts';
import { ehAcompanhante } from '@/lib/autorizacao.ts';
import {
  escoposQuePodeUsar, motivoDaRecusa, motivoDaRecusaDeEdicao, motivoDaRecusaDeRevogacao,
  motivoDaRecusaDeSituacao, normalizarLogin, papeisQuePodeConceder, rotuloDoPapel,
  senhaProvisoria, type EscopoDeVinculo, type SituacaoDoUsuario, type UsuarioParaEdicao,
} from '@/lib/cadastro.ts';
import { Cabecalho, Aviso } from '@/componentes/basicos.tsx';

export const dynamic = 'force-dynamic';

const SITUACOES: SituacaoDoUsuario[] = ['ATIVO', 'PENDENTE', 'INATIVO', 'BLOQUEADO'];
const NOME_DA_SITUACAO: Record<SituacaoDoUsuario, string> = {
  ATIVO: 'ativo — entra normalmente',
  PENDENTE: 'pendente — aguarda liberação',
  INATIVO: 'inativo — não entra mais',
  BLOQUEADO: 'bloqueado — acesso suspenso',
};

/** O alvo, no formato que a regra de edição espera. */
function paraEdicao(pessoa: {
  id: string;
  vinculos: { papel: string; comumId: string | null }[];
}): UsuarioParaEdicao {
  return {
    id: pessoa.id,
    papeis: pessoa.vinculos.map((v) => v.papel as Papel),
    comuns: pessoa.vinculos.map((v) => v.comumId),
    ehAdministracao: pessoa.vinculos.some(
      (v) => v.papel === 'SUPERADMIN' || v.papel === 'ADMIN_PEDAGOGICO',
    ),
  };
}

/** Carrega a pessoa e confere, de uma vez, se quem pede pode mexer nela. */
async function carregar(quemEdita: { id: string; escopo: EscopoDoUsuario }, alvoId: string) {
  return comoUsuario(quemEdita.id, async (banco) => {
    const pessoa = await banco.usuario.findUnique({
      where: { id: alvoId },
      include: {
        vinculos: {
          where: { revogadoEm: null },
          include: { comum: { select: { nome: true } }, regiao: { select: { nome: true } } },
          orderBy: { concedidoEm: 'asc' },
        },
        criadoPor: { select: { nomeCompleto: true } },
        cadastrados: { select: { id: true, nomeCompleto: true }, orderBy: { nomeCompleto: 'asc' } },
        perfilAluno: { include: { comum: { select: { nome: true } }, instrumento: { select: { nome: true } } } },
      },
    });
    if (!pessoa) return null;

    const comuns = await banco.comum.findMany({
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, regiao: { select: { nome: true } } },
    });
    const regioes = await banco.regiao.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } });
    const superadministradores = await banco.vinculo.count({
      where: { papel: 'SUPERADMIN', ativo: true, revogadoEm: null },
    });
    return { pessoa, comuns, regioes, superadministradores };
  });
}

const voltarCom = (id: string, chave: string, valor: string) =>
  redirect(`/painel/pessoas/${id}?${chave}=${encodeURIComponent(valor)}`);

// ------------------------------------------------------------------ ações

async function salvarDados(dadosDoFormulario: FormData) {
  'use server';
  const quemEdita = await usuarioDaTela();
  const id = String(dadosDoFormulario.get('id') ?? '');
  const carregado = await carregar(quemEdita, id);
  if (!carregado) notFound();

  const recusa = motivoDaRecusaDeEdicao(quemEdita.escopo, paraEdicao(carregado.pessoa));
  if (recusa) voltarCom(id, 'erro', recusa);

  const nomeCompleto = String(dadosDoFormulario.get('nomeCompleto') ?? '').trim();
  const email = String(dadosDoFormulario.get('email') ?? '').trim().toLowerCase();
  const login = normalizarLogin(String(dadosDoFormulario.get('login') ?? ''));
  const telefone = String(dadosDoFormulario.get('telefone') ?? '').trim() || null;
  if (!nomeCompleto) voltarCom(id, 'erro', 'Informe o nome completo.');
  if (!email) voltarCom(id, 'erro', 'Informe o e-mail.');

  try {
    await comoUsuario(quemEdita.id, async (banco) => {
      const antes = carregado.pessoa;
      await banco.usuario.update({
        where: { id }, data: { nomeCompleto, email, login, telefone },
      });
      await banco.auditoria.create({
        data: {
          usuarioId: quemEdita.id, acao: 'EDITAR_USUARIO', entidade: 'usuarios', entidadeId: id,
          antes: { nomeCompleto: antes.nomeCompleto, email: antes.email, login: antes.login, telefone: antes.telefone },
          depois: { nomeCompleto, email, login, telefone },
        },
      });
    });
  } catch (erro) {
    const texto = String((erro as { message?: string })?.message ?? erro);
    if (/Unique constraint|usuarios_email_key|usuarios_login_key/i.test(texto)) {
      voltarCom(id, 'erro', 'Já existe cadastro com este e-mail ou nome de usuário.');
    }
    if (/row-level security/i.test(texto)) voltarCom(id, 'erro', 'O banco recusou: fora do seu escopo.');
    throw erro;
  }
  voltarCom(id, 'ok', 'Dados atualizados.');
}

async function mudarSituacao(dadosDoFormulario: FormData) {
  'use server';
  const quemEdita = await usuarioDaTela();
  const id = String(dadosDoFormulario.get('id') ?? '');
  const situacao = String(dadosDoFormulario.get('status') ?? '') as SituacaoDoUsuario;
  const carregado = await carregar(quemEdita, id);
  if (!carregado) notFound();

  const recusa = motivoDaRecusaDeSituacao(quemEdita.escopo, paraEdicao(carregado.pessoa), situacao);
  if (recusa) voltarCom(id, 'erro', recusa);

  await comoUsuario(quemEdita.id, async (banco) => {
    await banco.usuario.update({ where: { id }, data: { status: situacao } });
    // Quem deixa de estar ativo perde as sessões abertas na hora.
    if (situacao !== 'ATIVO') {
      await banco.sessao.updateMany({
        where: { usuarioId: id, encerradaEm: null }, data: { encerradaEm: new Date() },
      });
    }
    await banco.auditoria.create({
      data: {
        usuarioId: quemEdita.id, acao: 'MUDAR_SITUACAO', entidade: 'usuarios', entidadeId: id,
        antes: { status: carregado.pessoa.status }, depois: { status: situacao },
      },
    });
  });
  voltarCom(id, 'ok', `Situação alterada para ${situacao.toLowerCase()}.`);
}

async function redefinirSenha(dadosDoFormulario: FormData) {
  'use server';
  const quemEdita = await usuarioDaTela();
  const id = String(dadosDoFormulario.get('id') ?? '');
  const carregado = await carregar(quemEdita, id);
  if (!carregado) notFound();

  const recusa = motivoDaRecusaDeEdicao(quemEdita.escopo, paraEdicao(carregado.pessoa));
  if (recusa) voltarCom(id, 'erro', recusa);
  // A própria senha se troca em /trocar-senha, que confere a atual. Redefinir
  // aqui pularia essa conferência para quem já está com a sessão aberta.
  if (id === quemEdita.id) {
    voltarCom(id, 'erro', 'Para trocar a sua própria senha, use a tela de troca de senha.');
  }

  const senha = senhaProvisoria();
  const senhaHash = await gerarHashDeSenha(senha);
  await comoUsuario(quemEdita.id, async (banco) => {
    await banco.usuario.update({ where: { id }, data: { senhaHash, deveTrocarSenha: true } });
    await banco.sessao.updateMany({
      where: { usuarioId: id, encerradaEm: null }, data: { encerradaEm: new Date() },
    });
    await banco.auditoria.create({
      data: {
        usuarioId: quemEdita.id, acao: 'REDEFINIR_SENHA', entidade: 'usuarios', entidadeId: id,
        depois: { motivo: 'senha provisória entregue por quem administra' },
      },
    });
  });
  redirect(`/painel/pessoas/${id}?senha=${encodeURIComponent(senha)}`);
}

async function concederVinculo(dadosDoFormulario: FormData) {
  'use server';
  const quemEdita = await usuarioDaTela();
  const id = String(dadosDoFormulario.get('id') ?? '');
  const papel = String(dadosDoFormulario.get('papel') ?? '') as Papel;
  const escopo = String(dadosDoFormulario.get('escopo') ?? 'COMUM') as EscopoDeVinculo;
  const comumId = String(dadosDoFormulario.get('comumId') ?? '') || null;
  const regiaoId = String(dadosDoFormulario.get('regiaoId') ?? '') || null;

  const carregado = await carregar(quemEdita, id);
  if (!carregado) notFound();

  const recusaDeEdicao = motivoDaRecusaDeEdicao(quemEdita.escopo, paraEdicao(carregado.pessoa));
  if (recusaDeEdicao) voltarCom(id, 'erro', recusaDeEdicao);
  const recusa = motivoDaRecusa(quemEdita.escopo, { papel, escopo, comumId, regiaoId });
  if (recusa) voltarCom(id, 'erro', recusa);

  try {
    await comoUsuario(quemEdita.id, async (banco) => {
      const existente = await banco.vinculo.findFirst({
        where: {
          usuarioId: id, papel, escopo,
          comumId: escopo === 'COMUM' ? comumId : null,
          regiaoId: escopo === 'REGIAO' ? regiaoId : null,
        },
      });
      if (existente) {
        await banco.vinculo.update({
          where: { id: existente.id },
          data: { ativo: true, revogadoEm: null, concedidoPorId: quemEdita.id, concedidoEm: new Date() },
        });
      } else {
        await banco.vinculo.create({
          data: {
            usuarioId: id, papel, escopo,
            comumId: escopo === 'COMUM' ? comumId : null,
            regiaoId: escopo === 'REGIAO' ? regiaoId : null,
            ativo: true, concedidoPorId: quemEdita.id,
          },
        });
      }
      await banco.auditoria.create({
        data: {
          usuarioId: quemEdita.id, acao: 'CONCEDER_VINCULO', entidade: 'vinculos', entidadeId: id,
          depois: { papel, escopo, comumId, regiaoId },
        },
      });
    });
  } catch (erro) {
    if (/row-level security/i.test(String((erro as { message?: string })?.message ?? erro))) {
      voltarCom(id, 'erro', 'O banco recusou este vínculo: fora do seu escopo.');
    }
    throw erro;
  }
  voltarCom(id, 'ok', `Perfil de ${rotuloDoPapel(papel)} concedido.`);
}

async function revogarVinculo(dadosDoFormulario: FormData) {
  'use server';
  const quemEdita = await usuarioDaTela();
  const id = String(dadosDoFormulario.get('id') ?? '');
  const vinculoId = String(dadosDoFormulario.get('vinculoId') ?? '');
  const carregado = await carregar(quemEdita, id);
  if (!carregado) notFound();

  const vinculo = carregado.pessoa.vinculos.find((v) => v.id === vinculoId);
  if (!vinculo) voltarCom(id, 'erro', 'Vínculo não encontrado.');

  const recusa = motivoDaRecusaDeRevogacao(
    quemEdita.escopo, paraEdicao(carregado.pessoa),
    vinculo!.papel as Papel, carregado.superadministradores,
  );
  if (recusa) voltarCom(id, 'erro', recusa);

  await comoUsuario(quemEdita.id, async (banco) => {
    await banco.vinculo.update({
      where: { id: vinculoId }, data: { ativo: false, revogadoEm: new Date() },
    });
    await banco.auditoria.create({
      data: {
        usuarioId: quemEdita.id, acao: 'REVOGAR_VINCULO', entidade: 'vinculos', entidadeId: vinculoId,
        antes: { papel: vinculo!.papel, escopo: vinculo!.escopo, comumId: vinculo!.comumId },
      },
    });
  });
  voltarCom(id, 'ok', `Perfil de ${rotuloDoPapel(vinculo!.papel as Papel)} retirado.`);
}

// ------------------------------------------------------------------- tela

export default async function PaginaDaPessoa({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; ok?: string; senha?: string }>;
}) {
  const { id } = await params;
  const usuario = await usuarioDaTela();
  // Área de acompanhamento: quem só estuda volta para o estudo.
  if (!ehAcompanhante(usuario.escopo)) redirect('/aluno');
  const { erro, ok, senha } = await searchParams;

  const carregado = await carregar(usuario, id);
  if (!carregado) notFound();
  const { pessoa, comuns, regioes } = carregado;

  const recusa = motivoDaRecusaDeEdicao(usuario.escopo, paraEdicao(pessoa));
  if (recusa) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Cabecalho titulo={pessoa.nomeCompleto} voltar="/painel/pessoas" />
        <Aviso tom="alerta">{recusa}</Aviso>
      </main>
    );
  }

  const ativos = pessoa.vinculos.filter((v) => v.ativo && !v.revogadoEm);
  const concede = papeisQuePodeConceder(usuario.escopo);
  const escopos = escoposQuePodeUsar(usuario.escopo);
  const comunsOferecidas = usuario.escopo.ehAdministracao
    ? comuns
    : comuns.filter((c) => usuario.escopo.comunsVisiveis.includes(c.id));
  const ehVoce = pessoa.id === usuario.id;

  return (
    <main className="mx-auto max-w-2xl p-6 pb-16">
      <Cabecalho
        titulo={pessoa.nomeCompleto}
        voltar="/painel/pessoas"
        subtitulo={`${pessoa.status.toLowerCase()} · entra como ${pessoa.login ?? pessoa.email}`}
      />

      {erro && <Aviso tom="alerta">{erro}</Aviso>}
      {ok && <Aviso>{ok}</Aviso>}

      {senha && (
        <div className="cartao mb-4 border-metodo/30 bg-metodo-claro">
          <p className="font-semibold">Senha redefinida</p>
          <p className="mt-1 text-sm">
            Entregue em mãos. Vale uma vez: na próxima entrada o sistema exige que
            {' '}{pessoa.nomeCompleto.split(' ')[0]} escolha a própria senha. As sessões abertas
            foram encerradas.
          </p>
          <p className="mt-2 select-all rounded border border-black/10 bg-white/70 px-3 py-2 font-mono text-lg tracking-wide">
            {senha}
          </p>
        </div>
      )}

      {pessoa.deveTrocarSenha && !senha && (
        <Aviso tom="pendente">
          Esta pessoa ainda usa a senha provisória: ela troca na primeira entrada, e até lá
          nenhuma tela abre para ela.
        </Aviso>
      )}

      {/* ------------------------------------------------------------ dados */}
      <section className="mt-4">
        <h2 className="rotulo">Dados de acesso</h2>
        <form action={salvarDados} className="cartao mt-2 flex flex-col gap-4">
          <input type="hidden" name="id" value={pessoa.id} />
          <div>
            <label htmlFor="nomeCompleto" className="rotulo">Nome completo</label>
            <input id="nomeCompleto" name="nomeCompleto" defaultValue={pessoa.nomeCompleto}
              required className="campo mt-1" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className="rotulo">E-mail</label>
              <input id="email" name="email" type="email" defaultValue={pessoa.email}
                required autoCapitalize="none" className="campo mt-1" />
            </div>
            <div>
              <label htmlFor="login" className="rotulo">Nome de acesso</label>
              <input id="login" name="login" defaultValue={pessoa.login ?? ''}
                autoCapitalize="none" spellCheck={false} className="campo mt-1" />
            </div>
          </div>
          <div>
            <label htmlFor="telefone" className="rotulo">WhatsApp</label>
            <input id="telefone" name="telefone" defaultValue={pessoa.telefone ?? ''}
              inputMode="tel" className="campo mt-1" />
          </div>
          <button type="submit" className="botao">Salvar dados</button>
        </form>
      </section>

      {/* ----------------------------------------------------------- perfis */}
      <section className="mt-6">
        <h2 className="rotulo">Perfis e território</h2>
        <div className="cartao mt-2">
          {ativos.length ? (
            <ul className="grid gap-2">
              {ativos.map((vinculo) => (
                <li key={vinculo.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 pb-2 last:border-0 last:pb-0">
                  <span>
                    <b>{rotuloDoPapel(vinculo.papel as Papel)}</b>
                    <span className="block text-xs text-tinta-fraca">
                      {vinculo.comum?.nome ?? vinculo.regiao?.nome ?? 'todo o sistema'}
                    </span>
                  </span>
                  <form action={revogarVinculo}>
                    <input type="hidden" name="id" value={pessoa.id} />
                    <input type="hidden" name="vinculoId" value={vinculo.id} />
                    <button type="submit" className="etiqueta bg-alerta-claro text-alerta">retirar</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-tinta-fraca">
              Sem perfil ativo: a conta existe e não abre nada. Conceda um perfil abaixo.
            </p>
          )}
        </div>

        {ehVoce ? (
          <p className="mt-2 text-xs text-tinta-fraca">
            Você não concede perfil a si mesmo — quem amplia o seu acesso é outra pessoa da
            administração.
          </p>
        ) : concede.length === 0 ? (
          <p className="mt-2 text-xs text-tinta-fraca">
            O seu perfil não concede perfis.
          </p>
        ) : (
        <form action={concederVinculo} className="cartao mt-2 flex flex-col gap-4">
          <input type="hidden" name="id" value={pessoa.id} />
          <p className="rotulo">Conceder outro perfil</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="papel" className="rotulo">Perfil</label>
              <select id="papel" name="papel" required className="campo mt-1">
                {concede.map((papel) => (
                  <option key={papel} value={papel}>{rotuloDoPapel(papel)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="escopo" className="rotulo">Abrangência</label>
              <select id="escopo" name="escopo" required defaultValue="COMUM" className="campo mt-1">
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
              <select id="comumId" name="comumId" defaultValue="" className="campo mt-1">
                <option value="">—</option>
                {comunsOferecidas.map((comum) => (
                  <option key={comum.id} value={comum.id}>{comum.nome} · {comum.regiao.nome}</option>
                ))}
              </select>
            </div>
            {escopos.includes('REGIAO') && (
              <div>
                <label htmlFor="regiaoId" className="rotulo">Região</label>
                <select id="regiaoId" name="regiaoId" defaultValue="" className="campo mt-1">
                  <option value="">—</option>
                  {regioes.map((regiao) => (
                    <option key={regiao.id} value={regiao.id}>{regiao.nome}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button type="submit" className="botao-secundario">Conceder perfil</button>
        </form>
        )}
      </section>

      {/* ---------------------------------------------------------- acesso */}
      <section className="mt-6">
        <h2 className="rotulo">Acesso</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <form action={mudarSituacao} className="cartao mt-2 flex flex-col gap-3">
            <input type="hidden" name="id" value={pessoa.id} />
            <label htmlFor="status" className="rotulo">Situação</label>
            <select id="status" name="status" defaultValue={pessoa.status} className="campo">
              {SITUACOES.map((situacao) => (
                <option key={situacao} value={situacao}>{NOME_DA_SITUACAO[situacao]}</option>
              ))}
            </select>
            <button type="submit" className="botao-secundario" disabled={ehVoce}>
              {ehVoce ? 'você não altera a sua situação' : 'Alterar situação'}
            </button>
          </form>

          {ehVoce ? (
            <div className="cartao mt-2 flex flex-col gap-3">
              <p className="rotulo">Senha</p>
              <p className="text-sm text-tinta-fraca">
                A sua própria senha se troca informando a atual — não se redefine por aqui.
              </p>
              <Link href="/trocar-senha" className="botao-secundario">Trocar a minha senha</Link>
            </div>
          ) : (
            <form action={redefinirSenha} className="cartao mt-2 flex flex-col gap-3">
              <input type="hidden" name="id" value={pessoa.id} />
              <p className="rotulo">Senha</p>
              <p className="text-sm text-tinta-fraca">
                Gera uma provisória para entregar em mãos, encerra as sessões abertas e obriga
                a troca na entrada seguinte. Você não escolhe a senha de ninguém.
              </p>
              <button type="submit" className="botao-secundario">Redefinir senha</button>
            </form>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------- histórico */}
      <section className="mt-6">
        <h2 className="rotulo">No sistema</h2>
        <div className="cartao mt-2 grid gap-1 text-sm">
          <p>
            <b>Cadastrada por:</b>{' '}
            {pessoa.criadoPor?.nomeCompleto ?? 'ninguém — é o primeiro administrador do sistema'}
          </p>
          <p><b>Desde:</b> {pessoa.criadoEm.toLocaleDateString('pt-BR')}</p>
          <p>
            <b>Último acesso:</b>{' '}
            {pessoa.ultimoAcessoEm?.toLocaleString('pt-BR') ?? 'nunca entrou'}
          </p>
          {pessoa.perfilAluno && (
            <p>
              <b>Como aluno:</b> {pessoa.perfilAluno.comum.nome}
              {pessoa.perfilAluno.instrumento ? ` · ${pessoa.perfilAluno.instrumento.nome}` : ''}
            </p>
          )}
          {pessoa.cadastrados.length > 0 && (
            <p>
              <b>Cadastrou:</b>{' '}
              {pessoa.cadastrados.map((c) => c.nomeCompleto).join(', ')}
            </p>
          )}
        </div>
        {pessoa.cadastrados.length > 0 && (
          <p className="mt-2 text-xs text-tinta-fraca">
            Inativar esta conta não desfaz os cadastros que ela criou — a corrente fica
            registrada.
          </p>
        )}
      </section>

      <nav className="mt-6 flex flex-wrap gap-3">
        <Link href="/painel/pessoas" className="botao-secundario">Voltar às pessoas</Link>
        {pessoa.perfilAluno && (
          <Link href={`/painel/aluno/${pessoa.id}`} className="botao-secundario">Ficha de aluno</Link>
        )}
      </nav>
    </main>
  );
}

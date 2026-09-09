// Casca do aplicativo: entrada, painel do instrutor, trilhas do aluno,
// lições, jogos, avaliação e certificado.

import * as banco from './armazenamento.js';
import { INSTRUMENTOS_POR_FAMILIA, instrumentoPorId } from './conteudo/instrumentos.js';
import { faseporId, trilhasDoAluno } from './conteudo/trilhas.js';
import { totalDeVariantes } from './conteudo/geradores.js';
import { NOTA_MINIMA, QUESTOES_POR_PROVA, corrigir, montarProva, perguntasIneditas } from './quiz.js';
import { iniciarJogo, pararJogo } from './jogos.js';
import { baixarCertificado, dataPorExtenso, imprimirCertificado, montarCertificado, svgDoCertificado } from './certificado.js';
import { salvarArquivo } from './download.js';
import { validarSenha } from './senha.js';
import { CAMPOS_DA_FICHA, CAMPOS_DO_MINISTERIO, camposFaltando, fichaCompleta, formatarWhatsapp, primeiroErro, validarFicha } from './ficha.js';
import { efeito } from './audio.js';
import * as plataforma from './plataforma.js';
import * as progressoServico from './servicos/progresso.js';
import * as gamificacao from './servicos/gamificacao.js';
import * as desempenho from './servicos/desempenho.js';
import * as recomendacao from './servicos/recomendacao.js';
import * as eventosServico from './servicos/eventos.js';
import * as alertas from './servicos/alertas.js';
import * as relatorios from './servicos/relatorios.js';
import * as importacao from './servicos/importacao.js';
import * as certificadosServico from './servicos/certificados.js';
import * as avaliacoesServico from './servicos/avaliacoes.js';

const tela = () => document.getElementById('tela');
const escapar = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const data = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

let provaEmCurso = null;
let recado = null;

// Muda de tela. Quando a rota já é a atual, o hashchange não dispara — por
// isso desenhamos na mão; caso contrário, deixamos o evento desenhar uma vez
// só (senão o recado da tela seria consumido no primeiro desenho e sumiria).
function ir(rota) {
  if (window.location.hash === rota) desenhar();
  else window.location.hash = rota;
}

function avisar(texto, tipo = 'ok') {
  recado = { texto, tipo };
}

function cabecalho(titulo, voltarPara = '#/') {
  return `<header class="topo">
    ${voltarPara ? `<a class="voltar" href="${voltarPara}" aria-label="Voltar">‹</a>` : '<span class="espaco"></span>'}
    <h1>${escapar(titulo)}</h1><span class="espaco"></span></header>`;
}

// Barra de progresso com o número dito por extenso ao lado: quem usa leitor
// de tela ou não distingue a cor não fica sem a informação.
function barra(percentual, rotulo = 'progresso') {
  const valor = Math.max(0, Math.min(100, Math.round(percentual)));
  return `<div class="barra" role="progressbar" aria-valuenow="${valor}" aria-valuemin="0"
    aria-valuemax="100" aria-label="${escapar(rotulo)}: ${valor}%"><span style="width:${valor}%"></span></div>`;
}

const dataCurta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');

function mostrarRecado() {
  if (!recado) return '';
  const html = `<p class="recado ${recado.tipo}">${recado.texto}</p>`;
  recado = null;
  return html;
}

const trilhas = () => {
  const aluno = banco.alunoAtual();
  return trilhasDoAluno(aluno ? aluno.instrumento : '');
};

const contextoDaFase = (fase) => (fase ? fase.contexto : null);

function seletorDeInstrumento(selecionado = '', id = 'campo-instrumento') {
  return `<select id="${id}" class="campo">
    <option value="">— ainda não definido —</option>
    ${INSTRUMENTOS_POR_FAMILIA.map((g) => `<optgroup label="${escapar(g.nome)}">
      ${g.lista.map((i) => `<option value="${i.id}" ${i.id === selecionado ? 'selected' : ''}>${escapar(i.nome)}</option>`).join('')}
    </optgroup>`).join('')}
  </select>`;
}

// A mesma ficha aparece no primeiro acesso, na complementação, nos ajustes do
// aluno e no cadastro feito pelo instrutor — por isso é montada num lugar só.
const GRUPOS_DA_FICHA = [
  { titulo: 'Dados do aluno', campos: ['nome', 'comum', 'instrumento'] },
  { titulo: 'Ministério local', campos: CAMPOS_DO_MINISTERIO, ministerio: true },
  { titulo: 'Contato', campos: ['email', 'whatsapp'] },
];

function campoDaFicha(campo, valores, erros) {
  const valor = valores[campo.id] || '';
  const erro = erros[campo.id];
  const corpo = campo.tipo === 'instrumento'
    ? seletorDeInstrumento(valor)
    : `<input id="campo-${campo.id}" type="${campo.tipo}" class="campo${erro ? ' com-erro' : ''}"
        value="${escapar(valor)}" maxlength="${campo.maximo || 80}"
        ${campo.autocomplete ? `autocomplete="${campo.autocomplete}"` : ''}
        ${campo.tipo === 'tel' ? 'inputmode="tel" data-mascara="whatsapp" placeholder="(11) 91234-5678"' : ''}>`;
  return `<label for="campo-${campo.id}">${escapar(campo.rotulo)}</label>
    ${corpo}
    ${erro ? `<p class="erro-campo">${escapar(erro)}</p>`
      : campo.dica ? `<p class="mini">${escapar(campo.dica)}</p>` : ''}`;
}

function camposDaFicha(valores = {}, erros = {}, { ministerioPendente = false } = {}) {
  return GRUPOS_DA_FICHA.map((grupo) => `<h3 class="titulo-grupo">${grupo.titulo}</h3>
    ${grupo.ministerio ? `<label class="opcao"><input type="checkbox" id="ministerio-pendente"
        ${ministerioPendente ? 'checked' : ''}> Ainda não sei estes nomes — informo depois</label>` : ''}
    <div ${grupo.ministerio ? 'id="area-ministerio"' : ''} ${grupo.ministerio && ministerioPendente ? 'hidden' : ''}>
      ${grupo.campos.map((id) => campoDaFicha(CAMPOS_DA_FICHA.find((c) => c.id === id), valores, erros)).join('')}
    </div>`).join('');
}

function camposDeSenha({ obrigatoria = true, jaTem = false, comConfirmacao = true } = {}) {
  return `<h3 class="titulo-grupo">Acesso</h3>
    ${obrigatoria ? '' : `<label class="opcao"><input type="checkbox" id="exige-senha" ${jaTem ? 'checked' : ''}>
      Exigir senha para entrar</label>`}
    <div id="area-senha" ${obrigatoria || jaTem ? '' : 'hidden'}>
      <label for="senha">${jaTem ? 'Nova senha (em branco mantém a atual)' : 'Senha de acesso (mínimo 4 caracteres)'}</label>
      <input id="senha" type="password" class="campo" autocomplete="new-password">
      ${comConfirmacao ? `<label for="senha2">Repita a senha</label>
        <input id="senha2" type="password" class="campo" autocomplete="new-password">` : ''}
    </div>`;
}

const valoresDaFicha = () => {
  const dados = {};
  for (const campo of CAMPOS_DA_FICHA) dados[campo.id] = valor(`campo-${campo.id}`);
  return dados;
};

let rascunho = null; // o que o aluno digitou, para não se perder quando dá erro

// ================================================================= entrada
function telaEntrada() {
  const alunos = banco.usuarios();
  return `<section class="entrada">
    <div class="marca">🎼</div>
    <h1>Estudo Musical<br><span>fase a fase</span></h1>
    <p class="sub">Teoria do <b>MSA</b> e método do <b>seu instrumento</b>, com avaliação que nunca repete
    pergunta e certificado a cada fase.</p>
    ${mostrarRecado()}
    ${alunos.length ? `<h2 class="titulo-secao">Quem vai estudar?</h2>
      <div class="lista-alunos">${alunos.map((u) => {
        const instrumento = instrumentoPorId(u.instrumento);
        return `<a class="cartao-aluno" href="#/entrar/${u.id}">
          <span class="inicial">${escapar(u.nome.trim().charAt(0).toUpperCase())}</span>
          <span class="dados"><strong>${escapar(u.nome)}</strong>
          <small>${instrumento ? escapar(instrumento.nome) : 'instrumento não definido'}</small></span>
          <span class="cadeado">${u.exigeSenha ? '🔒' : '›'}</span></a>`;
      }).join('')}</div>`
      : '<p class="aviso">Ainda não há alunos cadastrados neste aparelho.</p>'}
    <div class="acoes">
      ${banco.permiteAutocadastro() ? '<a class="botao grande" href="#/cadastrar">Criar o meu cadastro</a>' : ''}
      <a class="botao secundario" href="#/instrutor">Entrar como instrutor</a>
    </div>
    <p class="mini centro">Tudo fica guardado só neste aparelho, sem servidor e sem internet.</p>
  </section>`;
}

function telaLoginAluno(id) {
  const usuario = banco.usuarioPorId(id);
  if (!usuario) return telaEntrada();
  if (!usuario.exigeSenha) {
    banco.entrarComoAluno(id);
    ir('#/');
    return '';
  }
  const instrumento = instrumentoPorId(usuario.instrumento);
  return `${cabecalho('Entrar', '#/sair')}
    <section class="login">
      <div class="inicial grande">${escapar(usuario.nome.trim().charAt(0).toUpperCase())}</div>
      <h2>${escapar(usuario.nome)}</h2>
      <p class="mini centro">${instrumento ? escapar(instrumento.nome) : 'instrumento não definido'}</p>
      ${mostrarRecado()}
      <label for="senha">Senha</label>
      <input id="senha" type="password" inputmode="text" autocomplete="current-password" placeholder="sua senha">
      <button class="botao grande" data-acao="entrar-aluno" data-id="${usuario.id}">Entrar</button>
      <a class="botao secundario" href="#/sair">Escolher outro aluno</a>
    </section>`;
}

function telaLoginInstrutor() {
  return `${cabecalho('Instrutor', '#/sair')}
    <section class="login">
      <div class="inicial grande">🎓</div>
      <h2>Painel do instrutor</h2>
      ${mostrarRecado()}
      <label for="usuario">Usuário</label>
      <input id="usuario" type="text" autocomplete="username" placeholder="usuário" value="">
      <label for="senha">Senha</label>
      <input id="senha" type="password" autocomplete="current-password" placeholder="senha">
      <button class="botao grande" data-acao="entrar-admin">Entrar</button>
      <a class="botao secundario" href="#/sair">Voltar</a>
    </section>`;
}

function telaCadastro() {
  if (!banco.permiteAutocadastro()) {
    return `${cabecalho('Cadastro', '#/sair')}<p class="aviso">O instrutor desligou o autocadastro neste aparelho.
      Peça a ele para criar o seu acesso.</p>`;
  }
  const dados = rascunho || {};
  const erros = dados.erros || {};
  return `${cabecalho('Primeiro acesso', '#/sair')}
    <section class="formulario">
      ${mostrarRecado()}
      <p>Preencha a sua ficha para começar. Estes dados ficam <b>só neste aparelho</b> e servem para o
      instrutor organizar a turma.</p>
      ${camposDaFicha(dados, erros, { ministerioPendente: dados.ministerioPendente })}
      ${camposDeSenha({ obrigatoria: true })}
      <button class="botao grande" data-acao="criar-aluno">Criar cadastro e começar</button>
      <a class="botao secundario" href="#/sair">Cancelar</a>
    </section>`;
}

// Quem entrou antes de a ficha existir (ou cadastrado pelo instrutor sem todos
// os campos) completa aqui antes de estudar.
function telaFicha() {
  const aluno = banco.alunoAtual();
  if (!aluno) return telaEntrada();
  const dados = rascunho || { ...aluno };
  const erros = dados.erros || {};
  const faltando = camposFaltando(aluno);
  return `${cabecalho('Complete a sua ficha', '#/sair')}
    <section class="formulario">
      ${mostrarRecado()}
      <p>Antes de começar a estudar, precisamos de ${faltando.length === 1 ? 'mais um dado' : `mais ${faltando.length} dados`}.
      Fica tudo <b>só neste aparelho</b>.</p>
      ${camposDaFicha(dados, erros, { ministerioPendente: dados.ministerioPendente })}
      <button class="botao grande" data-acao="salvar-ficha" data-id="${aluno.id}">Salvar e começar</button>
      <a class="botao secundario" href="#/sair">Sair</a>
    </section>`;
}

// ================================================================== painel
// Conferência do cadastro: o que está incompleto e de onde vieram os dados.
// Nada aqui trava o uso do app — é a lista do que ainda falta conferir, mais o
// registro da atualização (de onde os dados vieram e onde ficou a cópia).
function blocoDeConferencia() {
  const pendencias = banco.pendenciasDoCadastro();
  const migracao = banco.informacoesDaMigracao();

  const nomeDoRegistro = (p) => {
    if (p.entidade === 'alunos') {
      const aluno = banco.usuarioPorId(p.id);
      return aluno ? aluno.nome : p.id;
    }
    return p.id || '—';
  };

  const lista = pendencias.length
    ? `<ul class="lista-chave">${pendencias.slice(0, 20).map((p) => `<li><b>${escapar(nomeDoRegistro(p))}</b> — ${escapar(p.mensagem)}</li>`).join('')}
       ${pendencias.length > 20 ? `<li class="mini">e mais ${pendencias.length - 20}.</li>` : ''}</ul>`
    : '<p class="mini">Nada pendente de conferência.</p>';

  const origem = migracao && migracao.origem
    ? `<p class="mini">Os dados deste aparelho vieram da versão anterior do aplicativo
       (${escapar(migracao.origem)}), em ${data(migracao.migradoEm)}, com ${migracao.registros} registros.
       ${migracao.backup ? `A cópia de segurança de antes da atualização ficou guardada como
       <code>${escapar(migracao.backup)}</code>, e os dados antigos continuam no aparelho, intactos.` : ''}</p>`
    : '<p class="mini">Cadastro criado nesta versão do aplicativo.</p>';

  return `<h2 class="titulo-secao">Conferência</h2>
    <section class="sobre">
      <h3>Pendente de conferência${pendencias.length ? ` (${pendencias.length})` : ''}</h3>
      ${lista}
      <h3>De onde vêm estes dados</h3>
      ${origem}
    </section>`;
}

// O filtro da lista de alunos vive fora do desenho para sobreviver ao
// redesenho da tela — quem digitou uma busca não a perde ao clicar num filtro.
let filtroDeAlunos = { texto: '', situacao: '', instrumento: '' };

function linhaDeAluno(linha, situacao) {
  const u = linha.aluno;
  const incompleta = camposFaltando(banco.usuarioPorId(u.id) || u).length;
  return `<a class="cartao-aluno painel" href="#/instrutor/aluno/${u.id}">
    <span class="inicial" aria-hidden="true">${escapar(u.nome.trim().charAt(0).toUpperCase())}</span>
    <span class="dados">
      <strong>${escapar(u.nome)}</strong>
      <small>${escapar(linha.instrumento || 'sem instrumento')}${linha.tituloDaFase
        ? ` · Fase ${linha.fase} — ${escapar(linha.tituloDaFase)}` : ''}</small>
      ${barra(linha.percentual, `Progresso de ${u.nome}`)}
      <small>${linha.percentual}% · ${linha.concluidas} de ${linha.total} fases · última atividade ${data(linha.ultimaAtividade)}</small>
      ${incompleta ? '<small class="pendente">ficha incompleta</small>' : ''}
    </span>
    <span class="situacao ${situacao.chave}">
      <span aria-hidden="true">${situacao.icone}</span>
      <small>${escapar(situacao.texto)}</small>
    </span>
  </a>`;
}

function blocoDeAlertas() {
  const lista = alertas.doInstrutor({ limite: 12 });
  if (!lista.length) return '';
  const rotulo = { atencao: 'Atenção', aviso: 'Acompanhar', boa: 'Boa notícia' };
  return `<h2 class="titulo-secao">O que precisa de você</h2>
    <div class="lista-alertas">
      ${lista.map((a) => `<a class="cartao-alerta ${a.gravidade}" href="#/instrutor/aluno/${a.alunoId}">
        <span class="etiqueta">${rotulo[a.gravidade]}</span>
        <span>${escapar(a.texto)}</span>
      </a>`).join('')}
    </div>`;
}

function telaAdmin() {
  const quadro = relatorios.quadroDeAlunos();
  const panorama = relatorios.panorama();
  const instrumentos = [...new Set(quadro.map((l) => l.instrumento).filter(Boolean))].sort();

  const busca = filtroDeAlunos.texto.trim().toLowerCase();
  const visiveis = quadro
    .map((linha) => ({ linha, situacao: alertas.situacaoDoAluno(linha.aluno.id) }))
    .filter(({ linha, situacao }) => {
      if (busca && !`${linha.aluno.nome} ${linha.aluno.comum || ''} ${linha.instrumento}`.toLowerCase().includes(busca)) return false;
      if (filtroDeAlunos.situacao && situacao.chave !== filtroDeAlunos.situacao) return false;
      if (filtroDeAlunos.instrumento && linha.instrumento !== filtroDeAlunos.instrumento) return false;
      return true;
    })
    .sort((a, b) => a.linha.aluno.nome.localeCompare(b.linha.aluno.nome, 'pt-BR'));

  return `<header class="topo topo-inicial">
      <div><span class="ola">Painel do instrutor</span><h1>${escapar(banco.usuarioDoAdmin())}</h1></div>
      <a class="avatar" href="#/sair" aria-label="Sair">⎋</a>
    </header>
    ${mostrarRecado()}
    ${banco.senhaDoAdminEhPadrao() ? `<p class="recado alerta">Você ainda está com a senha de fábrica.
      <a href="#/instrutor/senha">Troque a senha agora</a>.</p>` : ''}

    <section class="resumo-topo">
      <div><strong>${panorama.alunos}</strong><span>alunos</span></div>
      <div><strong>${panorama.alunosAtivos}</strong><span>ativos (${panorama.janelaDeAtividade} dias)</span></div>
      <div><strong>${panorama.fasesConcluidas}</strong><span>fases vencidas</span></div>
      <div><strong>${panorama.certificados}</strong><span>certificados</span></div>
    </section>

    ${blocoDeAlertas()}

    <h2 class="titulo-secao">Meus alunos</h2>
    <div class="filtros">
      <label class="oculto-visual" for="busca-aluno">Buscar aluno</label>
      <input id="busca-aluno" type="search" class="campo" placeholder="Buscar por nome, comum ou instrumento…"
        value="${escapar(filtroDeAlunos.texto)}" data-filtro="texto" autocomplete="off">
      <div class="fileira-filtros">
        <label class="oculto-visual" for="filtro-situacao">Situação</label>
        <select id="filtro-situacao" class="campo" data-filtro="situacao">
          <option value="">Todas as situações</option>
          <option value="atencao" ${filtroDeAlunos.situacao === 'atencao' ? 'selected' : ''}>Precisa de atenção</option>
          <option value="aviso" ${filtroDeAlunos.situacao === 'aviso' ? 'selected' : ''}>Acompanhar</option>
          <option value="em-dia" ${filtroDeAlunos.situacao === 'em-dia' ? 'selected' : ''}>Em dia</option>
        </select>
        <label class="oculto-visual" for="filtro-instrumento">Instrumento</label>
        <select id="filtro-instrumento" class="campo" data-filtro="instrumento">
          <option value="">Todos os instrumentos</option>
          ${instrumentos.map((i) => `<option value="${escapar(i)}" ${filtroDeAlunos.instrumento === i ? 'selected' : ''}>${escapar(i)}</option>`).join('')}
        </select>
      </div>
      ${busca || filtroDeAlunos.situacao || filtroDeAlunos.instrumento
        ? `<p class="mini">Mostrando ${visiveis.length} de ${quadro.length} alunos.
           <button class="como-link" data-acao="limpar-filtros">Limpar filtros</button></p>` : ''}
    </div>

    <div class="lista-alunos">
      ${visiveis.length
        ? visiveis.map(({ linha, situacao }) => linhaDeAluno(linha, situacao)).join('')
        : quadro.length
          ? '<p class="aviso">Nenhum aluno com esses filtros.</p>'
          : '<p class="aviso">Nenhum aluno cadastrado ainda.</p>'}
    </div>

    <div class="acoes">
      <a class="botao grande" href="#/instrutor/novo">+ Cadastrar aluno</a>
      <a class="botao secundario" href="#/instrutor/relatorios">📊 Relatórios</a>
      <a class="botao secundario" href="#/instrutor/metodos">📚 Métodos</a>
      <a class="botao secundario" href="#/instrutor/senha">Trocar a minha senha</a>
    </div>

    ${blocoDeConferencia()}

    <h2 class="titulo-secao">Aparelho</h2>
    <section class="sobre">
      <label class="opcao"><input type="checkbox" id="autocadastro" data-acao="autocadastro"
        ${banco.permiteAutocadastro() ? 'checked' : ''}> Permitir que o próprio aluno crie o seu cadastro</label>
      <p class="mini">Desligado, só o instrutor cadastra alunos neste aparelho.</p>
      <div class="acoes">
        <button class="botao secundario" data-acao="exportar-fichas">Exportar a lista de alunos (planilha)</button>
        <button class="botao secundario" data-acao="exportar-progresso">Exportar o progresso (planilha)</button>
        <button class="botao secundario" data-acao="exportar">Exportar tudo (cópia de segurança)</button>
        <button class="botao secundario" data-acao="importar">Importar cópia</button>
        <button class="botao perigo" data-acao="apagar">Apagar tudo deste aparelho</button>
      </div>
      <input type="file" id="arquivo-progresso" accept="application/json" hidden>
      <input type="file" id="arquivo-metodo" accept="application/json" hidden>
    </section>
    <p class="rodape">Aviso: o app roda inteiro no aparelho, sem servidor. As fichas dos alunos — inclusive
    e-mail e WhatsApp — ficam guardadas apenas aqui, e as senhas em resumo (hash). Esta é uma portaria de
    organização, não uma proteção contra quem sabe abrir o código da página; a cópia de segurança exportada
    contém dados pessoais e deve ser guardada com o mesmo cuidado de uma lista de presença.</p>`;
}

// -------------------------------------------------------- relatórios

function telaRelatorios() {
  const panorama = relatorios.panorama();
  const porMetodo = relatorios.porMetodo();
  const porInstrumento = relatorios.porInstrumento();

  return `${cabecalho('Relatórios', '#/instrutor')}
    <section class="resumo-topo largo">
      <div><strong>${panorama.alunos}</strong><span>alunos</span></div>
      <div><strong>${panorama.alunosAtivos}</strong><span>ativos</span></div>
      <div><strong>${panorama.alunosSemAtividade}</strong><span>sem atividade</span></div>
      <div><strong>${panorama.matriculasEmCurso}</strong><span>matrículas em curso</span></div>
      <div><strong>${panorama.avaliacoes}</strong><span>avaliações feitas</span></div>
      <div><strong>${panorama.taxaDeAprovacao}%</strong><span>taxa de aprovação</span></div>
      <div><strong>${panorama.certificados}</strong><span>certificados</span></div>
      <div><strong>${panorama.mediaDasNotas}%</strong><span>nota média</span></div>
    </section>

    <h3 class="titulo-secao">Por método</h3>
    ${porMetodo.map((m) => `<section class="cartao-relatorio">
      <strong>${escapar(m.metodo.nome)}</strong>
      <small>${m.totalDeFases} fases · versão ${escapar(m.versaoVigente ? m.versaoVigente.rotulo : '—')}
        · ${m.matriculas} ${m.matriculas === 1 ? 'matrícula' : 'matrículas'} (${m.concluidas} ${m.concluidas === 1 ? 'concluída' : 'concluídas'})</small>
      ${m.taxaDeAprovacao !== null ? `${barra(m.taxaDeAprovacao, `Aprovação em ${m.metodo.nome}`)}
        <small>${m.taxaDeAprovacao}% de aprovação nas avaliações</small>`
        : '<small class="mini">Ainda sem avaliações feitas neste método.</small>'}
      ${m.gargalo ? `<p class="mini alerta-texto">Fase que mais trava: <b>${m.gargalo.ordem} — ${escapar(m.gargalo.titulo)}</b>,
        com ${m.gargalo.taxa}% de aprovação em ${m.gargalo.tentativas} tentativas.</p>` : ''}
      ${m.porFase.some((f) => f.alunosNaFase) ? `<div class="mapa-fases">
        ${m.porFase.map((f) => `<span class="celula ${f.alunosNaFase ? 'com-alunos' : ''}"
          title="Fase ${f.ordem} — ${escapar(f.titulo)}: ${f.alunosNaFase} ${f.alunosNaFase === 1 ? 'aluno' : 'alunos'}">
          <b>${f.ordem}</b><small>${f.alunosNaFase || ''}</small></span>`).join('')}
      </div><small class="mini">Onde os alunos estão agora, fase a fase.</small>` : ''}
    </section>`).join('')}

    <h3 class="titulo-secao">Por instrumento</h3>
    <div class="lista-assuntos">
      ${porInstrumento.map((i) => `<div class="linha-assunto">
        <div class="rotulo"><strong>${escapar(i.nome)}</strong></div>
        ${barra(panorama.alunos ? (i.alunos / panorama.alunos) * 100 : 0, i.nome)}
        <span class="numero">${i.alunos} <small>${i.alunos === 1 ? 'aluno' : 'alunos'}</small></span>
      </div>`).join('')}
    </div>`;
}

// ------------------------------------------------------- métodos e importação

// A prévia da importação vive fora do desenho: ela é o resultado de um passo
// (analisar) que precisa sobreviver até o passo seguinte (confirmar).
let previaDeImportacao = null;

function telaMetodos() {
  const metodos = banco.dados.metodos.listar();
  return `${cabecalho('Métodos', '#/instrutor')}
    ${mostrarRecado()}
    ${previaDeImportacao ? blocoDePrevia(previaDeImportacao) : ''}
    <h3 class="titulo-secao">Métodos cadastrados</h3>
    ${metodos.map((m) => {
      const versoes = banco.dados.versoesDoMetodo(m.id);
      const fases = banco.dados.fasesDoMetodo(m.id);
      return `<section class="cartao-relatorio">
        <strong>${escapar(m.nome)}</strong>
        <small>${fases.length} fases · ${versoes.map((v) => `versão ${escapar(v.rotulo)} (${escapar(v.situacao)})`).join(', ') || 'sem versão'}</small>
        ${m.descricao ? `<p class="mini">${escapar(m.descricao)}</p>` : ''}
        <small class="mini">${m.universal ? 'Serve a todos os instrumentos.'
          : `Serve a ${m.instrumentoIds.length} ${m.instrumentoIds.length === 1 ? 'instrumento' : 'instrumentos'}.`}</small>
        ${m.fonte ? `<p class="mini"><i>${escapar(m.fonte)}</i></p>` : ''}
      </section>`;
    }).join('')}
    <h3 class="titulo-secao">Importar um método</h3>
    <section class="sobre">
      <p>Um método de ensino pode ser cadastrado a partir de um arquivo JSON com as fases, lições,
      jogos e avaliações. O arquivo é <b>conferido antes</b>: você vê o que ele vai criar e só então
      confirma. Nada é gravado enquanto você não confirmar.</p>
      <div class="acoes">
        <button class="botao" data-acao="escolher-metodo">Escolher arquivo do método</button>
        <button class="botao secundario" data-acao="modelo-metodo">Baixar um modelo de arquivo</button>
      </div>
    </section>
    <input type="file" id="arquivo-metodo" accept="application/json" hidden>`;
}

function blocoDePrevia(analise) {
  const { previa, problemas, valido } = analise;
  const porGravidade = (g) => problemas.filter((p) => p.gravidade === g);
  return `<section class="previa ${valido ? 'ok' : 'com-erro'}">
    <h3>${valido ? 'Confira antes de confirmar' : 'O arquivo não pode ser importado'}</h3>
    <p><strong>${escapar(previa.metodo.nome || '(sem nome)')}</strong> — versão ${escapar(previa.versao)}</p>
    <div class="indicadores">
      <div><strong>${previa.fases}</strong><span>fases</span></div>
      <div><strong>${previa.licoes}</strong><span>lições</span></div>
      <div><strong>${previa.jogos}</strong><span>jogos</span></div>
      <div><strong>${previa.questoes}</strong><span>questões</span></div>
    </div>
    ${previa.listaDeFases.length ? `<details><summary>Ver as fases</summary>
      <ul class="lista-chave">${previa.listaDeFases.map((f) => `<li><b>Fase ${f.ordem} — ${escapar(f.titulo)}</b>
        — ${f.licoes} ${f.licoes === 1 ? 'lição' : 'lições'}, ${f.jogos} ${f.jogos === 1 ? 'jogo' : 'jogos'},
        ${f.questoes} ${f.questoes === 1 ? 'questão' : 'questões'}</li>`).join('')}</ul></details>` : ''}
    ${porGravidade('impede').length ? `<h4>Erros que impedem a importação</h4>
      <ul class="lista-chave erros">${porGravidade('impede').map((p) =>
        `<li><b>${escapar(p.onde)}</b> — ${escapar(p.mensagem)}</li>`).join('')}</ul>` : ''}
    ${porGravidade('aviso').length ? `<h4>Avisos</h4>
      <ul class="lista-chave">${porGravidade('aviso').map((p) =>
        `<li><b>${escapar(p.onde)}</b> — ${escapar(p.mensagem)}</li>`).join('')}</ul>` : ''}
    <div class="acoes">
      ${valido ? '<button class="botao grande" data-acao="confirmar-metodo">Confirmar e criar o método</button>' : ''}
      <button class="botao secundario" data-acao="cancelar-metodo">Cancelar</button>
    </div>
  </section>`;
}

function telaAdminAluno(id) {
  const usuario = banco.usuarioPorId(id);
  if (!usuario) return telaAdmin();
  const dados = rascunho && rascunho.id === id ? rascunho : { ...usuario };
  const erros = dados.erros || {};
  const r = banco.resumoDoAluno(id);
  const certificados = banco.certificados(id);
  const faltando = camposFaltando(usuario);
  const zap = (usuario.whatsapp || '').replace(/\D/g, '');
  return `${cabecalho(usuario.nome, '#/instrutor')}
    ${mostrarRecado()}
    ${faltando.length ? `<p class="recado alerta">Ficha incompleta: falta ${faltando.length === 1 ? 'informar' : 'informar'}
      ${faltando.map((c) => CAMPOS_DA_FICHA.find((x) => x.id === c).rotulo.toLowerCase()).join(', ')}.</p>` : ''}
    ${usuario.email || zap ? `<div class="contatos">
      ${usuario.email ? `<a class="contato" href="mailto:${escapar(usuario.email)}">✉️ ${escapar(usuario.email)}</a>` : ''}
      ${zap ? `<a class="contato" href="https://wa.me/55${zap}" target="_blank" rel="noopener">💬 ${escapar(usuario.whatsapp)}</a>` : ''}
    </div>` : ''}
    <section class="formulario">
      ${camposDaFicha(dados, erros, { ministerioPendente: dados.ministerioPendente })}
      ${camposDeSenha({ obrigatoria: false, jaTem: usuario.exigeSenha, comConfirmacao: false })}
      <button class="botao grande" data-acao="salvar-aluno" data-id="${id}">Salvar ficha</button>
    </section>
    <h3 class="titulo-secao">Progresso</h3>
    <section class="resumo-topo">
      <div><strong>${r.aprovadas}</strong><span>fases vencidas</span></div>
      <div><strong>${r.licoes}</strong><span>lições lidas</span></div>
      <div><strong>${r.tentativas}</strong><span>avaliações feitas</span></div>
    </section>
    ${certificados.length ? `<div class="historico"><h3>Certificados</h3>${certificados.map((c) => `
      <div class="linha-historico"><span>${escapar(c.nomeTrilha || 'MSA')} · fase ${c.fase}</span>
      <span class="ok">${c.nota}% · ${data(c.data)}</span></div>`).join('')}</div>` : ''}
    <div class="acoes">
      <button class="botao secundario" data-acao="entrar-como" data-id="${id}">Abrir o app como este aluno</button>
      <button class="botao perigo" data-acao="remover-aluno" data-id="${id}">Remover aluno e o seu progresso</button>
    </div>`;
}

function telaAdminNovo() {
  const dados = rascunho || {};
  const erros = dados.erros || {};
  return `${cabecalho('Cadastrar aluno', '#/instrutor')}
    <section class="formulario">
      ${mostrarRecado()}
      ${camposDaFicha(dados, erros, { ministerioPendente: dados.ministerioPendente })}
      ${camposDeSenha({ obrigatoria: false, comConfirmacao: false })}
      <button class="botao grande" data-acao="criar-aluno-admin">Cadastrar</button>
    </section>`;
}

function telaTrocarSenha() {
  return `${cabecalho('Trocar a senha', '#/instrutor')}
    <section class="formulario">
      ${mostrarRecado()}
      <p>Usuário do instrutor: <b>${escapar(banco.usuarioDoAdmin())}</b>.</p>
      <label for="senha-atual">Senha atual</label>
      <input id="senha-atual" type="password" class="campo" autocomplete="current-password">
      <label for="senha">Nova senha</label>
      <input id="senha" type="password" class="campo" autocomplete="new-password">
      <label for="senha2">Repita a nova senha</label>
      <input id="senha2" type="password" class="campo" autocomplete="new-password">
      <button class="botao grande" data-acao="trocar-senha-admin">Salvar nova senha</button>
    </section>`;
}

// ================================================================== aluno
function cartaoDeFase(fase) {
  const liberada = banco.faseLiberada(fase);
  const dados = banco.faseDoAluno(fase.id);
  const aprovada = Boolean(dados.aprovadoEm);
  return `<a class="cartao-fase ${liberada ? '' : 'trancada'} ${aprovada ? 'aprovada' : ''}"
    href="${liberada ? `#/fase/${fase.id}` : '#/'}" style="--cor:${fase.cor}">
    <div class="icone-fase">${liberada ? fase.icone : '🔒'}</div>
    <div class="corpo-fase">
      <span class="numero-fase">Fase ${fase.numero}${aprovada ? ' · concluída' : ''}</span>
      <strong>${escapar(fase.titulo)}</strong>
      <span class="sub-fase">${escapar(fase.subtitulo)}</span>
      <div class="barra"><span style="width:${Math.round((dados.licoesLidas.length / fase.licoes.length) * 100)}%"></span></div>
      <span class="mini">${dados.licoesLidas.length} de ${fase.licoes.length} lições${fase.paginas ? ` · páginas ${fase.paginas}` : ''}</span>
    </div>
    ${aprovada ? `<span class="selo">${dados.melhorNota}%</span>` : ''}
  </a>`;
}

// O cartão que abre a tela do aluno: onde ele está, quanto andou e qual é o
// próximo passo. Antes ele precisava adivinhar isso olhando a lista de fases.
function cartaoDeSituacao(aluno) {
  const situacao = progressoServico.situacaoDoAluno(aluno.id);
  const jogo = gamificacao.resumo(aluno.id);
  const seguinte = progressoServico.proximaAtividade(aluno.id);
  const principal = situacao.matriculas.find((m) => m.faseAtual) || situacao.matriculas[0] || null;
  const instrumento = aluno.instrumentoId ? instrumentoPorId(aluno.instrumentoId) : null;

  const linhas = [
    instrumento ? `🎻 ${escapar(instrumento.nome)}` : null,
    principal && principal.metodo ? `📚 ${escapar(principal.metodo.nome)}` : null,
    principal && principal.faseAtual ? `📖 Fase ${principal.faseAtual.numero} — ${escapar(principal.faseAtual.titulo)}` : null,
  ].filter(Boolean);

  return `<section class="painel-aluno">
    <div class="onde-estou">${linhas.map((l) => `<span>${l}</span>`).join('')}</div>
    ${barra(situacao.percentual, 'Progresso geral')}
    <p class="mini">${situacao.percentual}% do seu percurso · ${situacao.concluidas} de ${situacao.total} fases concluídas</p>

    ${seguinte.tipo !== 'nada' ? `<a class="proxima-atividade" href="${seguinte.destino}">
      <span class="etiqueta">Próxima atividade</span>
      <strong>${escapar(seguinte.titulo)}</strong>
      <span class="mini">${escapar(seguinte.motivo)}</span>
      <span class="seta" aria-hidden="true">›</span>
    </a>` : `<p class="recado ok">${escapar(seguinte.motivo)}</p>`}

    <div class="indicadores">
      <div><strong>${jogo.xp}</strong><span>pontos · nível ${jogo.nivel}</span></div>
      <div><strong>${jogo.sequencia.dias}</strong><span>${jogo.sequencia.dias === 1 ? 'dia seguido' : 'dias seguidos'}</span></div>
      <div><strong>${jogo.conquistas}</strong><span>de ${jogo.totalDeConquistas} conquistas</span></div>
    </div>
    <p class="mini">Faltam ${jogo.faltamParaOProximo} pontos para o nível ${jogo.nivel + 1}.</p>
  </section>`;
}

function telaInicial() {
  const aluno = banco.alunoAtual();
  if (!aluno) return telaEntrada();
  const t = trilhas();
  const aprovadas = t.todas.filter((f) => banco.faseAprovada(f.id)).length;
  const instrumento = t.dadosDoInstrumento;

  return `<header class="topo topo-inicial">
      <div><span class="ola">Bom estudo,</span><h1>${escapar(aluno.nome.split(' ')[0])}</h1></div>
      <a class="avatar" href="#/sobre" aria-label="Minha ficha e ajustes">⚙</a>
    </header>
    ${mostrarRecado()}
    ${cartaoDeSituacao(aluno)}
    ${banco.emModoTeste() ? `<p class="faixa-teste">Modo de demonstração: todas as fases já estão abertas,
      é só entrar e experimentar.</p>` : ''}
    ${banco.fichaDoAlunoFaltando().length ? `<p class="recado alerta">A sua ficha está incompleta —
      falta informar ${banco.fichaDoAlunoFaltando().map((c) => CAMPOS_DA_FICHA.find((x) => x.id === c).rotulo.toLowerCase()).join(', ')}.
      ${plataforma.integrado()
        ? 'Esses dados vêm do seu cadastro na plataforma: peça a quem cadastrou você para completá-los.'
        : '<a href="#/ficha">Completar agora</a>.'}</p>` : ''}
    <nav class="atalhos" aria-label="Minha área">
      <a href="#/desempenho" class="atalho">📊 Meu desempenho</a>
      <a href="#/conquistas" class="atalho">🏆 Conquistas</a>
      <a href="#/historico" class="atalho">🕘 Histórico</a>
      <a href="#/certificados" class="atalho">🏅 Certificados</a>
      <a href="#/sobre" class="atalho">ℹ️ Ajustes</a>
      <a href="#/sair" class="atalho">⎋ Sair</a>
    </nav>

    ${t.trilhas.map((trilha) => `
      <h2 class="titulo-secao">${escapar(trilha.metodo.porInstrumento && instrumento
        ? `Método do instrumento — ${instrumento.nome}` : trilha.metodo.nome)}</h2>
      ${trilha.metodo.porInstrumento && instrumento
        ? `<p class="mini">Trilha montada para <b>${escapar(instrumento.nome)}</b> — ${escapar(instrumento.familiaNome)},
           ${escapar(instrumento.claves.length > 1 ? 'claves' : 'clave')} de ${instrumento.claves.map((c) => c === 'sol' ? 'Sol' : c === 'fa' ? 'Fá' : 'Dó').join(' e ')},
           em ${escapar(instrumento.afinacao)}.</p>`
        : trilha.metodo.descricao ? `<p class="mini">${escapar(trilha.metodo.descricao)}</p>` : ''}
      <div class="lista-fases">${trilha.fases.map(cartaoDeFase).join('')}</div>`).join('')}
    ${instrumento ? '' : `<div class="caixa-prova"><p>Escolha o seu instrumento para abrir a trilha do
       método que você toca — com lições, avaliação e certificado próprios.</p>
       <a class="botao grande" href="#/sobre">Escolher instrumento</a></div>`}

    <p class="rodape">Teoria baseada no <b>Método Simplificado de Aprendizagem Musical</b> — Congregação Cristã no
    Brasil, 1ª edição (dez/2022). A trilha do instrumento segue a técnica padrão do instrumento e não substitui
    o método impresso nem o instrutor.</p>`;
}

function telaFase(id) {
  const fase = faseporId(id, (banco.alunoAtual() || {}).instrumento);
  if (!fase) return telaInicial();
  if (!banco.faseLiberada(fase)) {
    return `${cabecalho(`Fase ${fase.numero}`)}<p class="aviso">Conclua a fase anterior desta trilha para abrir esta.</p>`;
  }
  const dados = banco.faseDoAluno(fase.id);
  // Quantidade de questões, nota mínima e repertório vêm da avaliação DESTA
  // fase — um método importado pode ter três questões e exigir 60%.
  const prova = avaliacoesServico.combinacaoDaFase(fase, banco.usadasDaFase(fase.id));

  const licoes = fase.licoes.map((licao, i) => `<a class="item-licao ${dados.licoesLidas.includes(i) ? 'lida' : ''}"
      href="#/fase/${fase.id}/licao/${i}">
      <span class="marca-lida">${dados.licoesLidas.includes(i) ? '✓' : i + 1}</span>
      <span><strong>${escapar(licao.titulo)}</strong>${licao.pagina ? `<small>pág. ${licao.pagina}</small>` : ''}</span>
      <span class="seta">›</span></a>`).join('');

  const jogos = fase.jogos.map((jogo, i) => {
    const recorde = dados.jogos[jogo.titulo] || 0;
    return `<a class="item-jogo" href="#/fase/${fase.id}/jogo/${i}" style="--cor:${fase.cor}">
      <strong>${escapar(jogo.titulo)}</strong><small>${escapar(jogo.descricao)}</small>
      ${recorde ? `<span class="recorde">recorde ${recorde}</span>` : '<span class="recorde novo">novo</span>'}</a>`;
  }).join('');

  const historico = dados.tentativas.length
    ? `<div class="historico"><h3>Suas avaliações</h3>${dados.tentativas.slice().reverse().slice(0, 5).map((t) => `
        <div class="linha-historico"><span>${data(t.data)}</span>
        <span class="${t.aprovado ? 'ok' : 'nao'}">${t.nota}% — ${t.aprovado ? 'aprovado' : 'não atingiu a nota'}</span></div>`).join('')}</div>`
    : '';

  return `${cabecalho(`Fase ${fase.numero} · ${escapar(fase.nomeTrilha)}`)}
    <section class="capa-fase" style="--cor:${fase.cor}">
      <div class="icone-grande">${fase.icone}</div>
      <span class="etiqueta-trilha">${escapar(fase.nomeTrilha)}</span>
      <h2>${escapar(fase.titulo)}</h2>
      <p class="sub">${escapar(fase.subtitulo)}${fase.paginas ? ` · páginas ${fase.paginas} do método` : ''}</p>
      <p>${escapar(fase.resumo)}</p>
    </section>
    <h3 class="titulo-secao">Lições</h3>
    <div class="lista-licoes">${licoes}</div>
    <h3 class="titulo-secao">Exercícios lúdicos</h3>
    <div class="lista-jogos">${jogos}</div>
    <h3 class="titulo-secao">Avaliação da fase</h3>
    <div class="caixa-prova">
      <p>${prova.quantidade} ${prova.quantidade === 1 ? 'questão' : 'questões'} de múltipla escolha.
      Aprovação a partir de <b>${prova.notaMinima}%</b>.</p>
      <p class="mini">${prova.origem === 'geradores'
        ? `Ainda restam <b>${prova.ineditas}</b> perguntas inéditas nesta fase (de ${prova.total} possíveis).
           Nenhuma pergunta que você já recebeu volta a cair.`
        : `Esta fase tem um banco de ${prova.total} ${prova.total === 1 ? 'questão' : 'questões'};
           ${prova.ineditas} ${prova.ineditas === 1 ? 'ainda não caiu' : 'ainda não caíram'} para você.`}</p>
      <button class="botao grande" data-acao="iniciar-prova" data-fase="${fase.id}">
        ${dados.aprovadoEm ? 'Fazer uma nova avaliação' : 'Iniciar avaliação'}</button>
      ${dados.aprovadoEm ? `<a class="botao secundario" href="#/certificado/${fase.id}">Ver certificado</a>` : ''}
    </div>
    ${historico}`;
}

function telaLicao(faseId, indice) {
  const fase = faseporId(faseId, (banco.alunoAtual() || {}).instrumento);
  if (!fase) return telaInicial();
  const licao = fase.licoes[indice];
  if (!licao) return telaFase(faseId);
  banco.marcarLicaoLida(fase.id, indice);
  const proxima = indice + 1 < fase.licoes.length ? indice + 1 : null;
  return `${cabecalho(`Lição ${indice + 1} de ${fase.licoes.length}`, `#/fase/${fase.id}`)}
    <article class="licao" style="--cor:${fase.cor}">
      <span class="etiqueta">${escapar(fase.nomeTrilha)} · Fase ${fase.numero}${licao.pagina ? ` · pág. ${licao.pagina}` : ''}</span>
      <h2>${escapar(licao.titulo)}</h2>
      ${licao.corpo(contextoDaFase(fase))}
    </article>
    <div class="acoes">
      ${proxima !== null
        ? `<a class="botao grande" href="#/fase/${fase.id}/licao/${proxima}">Próxima lição ›</a>`
        : `<button class="botao grande" data-acao="iniciar-prova" data-fase="${fase.id}">Ir para a avaliação</button>`}
      <a class="botao secundario" href="#/fase/${fase.id}">Voltar para a fase</a>
    </div>`;
}

function telaJogo(faseId, indice) {
  const fase = faseporId(faseId, (banco.alunoAtual() || {}).instrumento);
  if (!fase || !fase.jogos[indice]) return telaFase(faseId);
  return `${cabecalho(fase.jogos[indice].titulo, `#/fase/${fase.id}`)}
    <section class="jogo" style="--cor:${fase.cor}">
      <div id="palco-jogo"></div><div id="fim-jogo"></div>
    </section>`;
}

function montarJogo(faseId, indice) {
  const fase = faseporId(faseId, (banco.alunoAtual() || {}).instrumento);
  if (!fase) return;
  const jogo = fase.jogos[indice];
  const palco = document.getElementById('palco-jogo');
  const fim = document.getElementById('fim-jogo');
  const contexto = contextoDaFase(fase);
  const configuracao = { ...jogo, fase: fase.id };
  // Na trilha do instrumento, a leitura acontece na clave que o aluno lê.
  if (contexto && jogo.tipo === 'pentagrama' && !jogo.claves) configuracao.claves = contexto.claves;
  iniciarJogo(configuracao, palco, (pontos, detalhe) => {
    banco.registrarJogo(fase.id, jogo.titulo, pontos);
    fim.innerHTML = `<div class="resultado-jogo">
      <strong>${pontos} pontos</strong><p>${escapar(detalhe || '')}</p>
      <div class="acoes">
        <button class="botao" data-acao="repetir-jogo">Jogar de novo</button>
        <a class="botao secundario" href="#/fase/${fase.id}">Voltar para a fase</a>
      </div></div>`;
  });
}

// ---------------------------------------------------------------- avaliação
function iniciarProva(faseId) {
  const fase = faseporId(faseId, (banco.alunoAtual() || {}).instrumento);
  if (!fase) return;
  // Pelo serviço: a prova sai dos geradores quando a fase tem geradores, e do
  // banco de questões quando é um método cadastrado por arquivo.
  const prova = avaliacoesServico.montar(fase, banco.usadasDaFase(fase.id));
  provaEmCurso = { ...prova, respostas: [], atual: 0, comecouEm: Date.now() };
  ir(`#/fase/${fase.id}/prova`);
}

function telaProva(faseId) {
  const fase = faseporId(faseId, (banco.alunoAtual() || {}).instrumento);
  if (!fase) return telaInicial();
  if (!provaEmCurso || provaEmCurso.faseId !== fase.id) { iniciarProva(fase.id); return '<p class="aviso">Preparando a avaliação…</p>'; }
  const prova = provaEmCurso;
  if (prova.atual >= prova.questoes.length) return telaResultado(fase);

  const q = prova.questoes[prova.atual];
  return `${cabecalho(`Avaliação — Fase ${fase.numero}`, `#/fase/${fase.id}`)}
    <div class="progresso-prova"><span style="width:${(prova.atual / prova.questoes.length) * 100}%"></span></div>
    <p class="contador">Questão ${prova.atual + 1} de ${prova.questoes.length} · ${escapar(fase.nomeTrilha)}</p>
    ${prova.reciclou && prova.atual === 0 ? '<p class="aviso leve">Você já respondeu todas as perguntas inéditas desta fase. A partir de agora o app volta a usar as mais antigas.</p>' : ''}
    <article class="questao" style="--cor:${fase.cor}">
      <h2>${q.enunciado}</h2>
      ${q.html ? `<div class="ilustracao">${q.html}</div>` : ''}
      <div class="alternativas">
        ${q.alternativas.map((a, i) => `<button class="alternativa" data-alternativa="${escapar(a)}">
          <span class="letra">${'ABCDE'[i]}</span><span>${a}</span></button>`).join('')}
      </div>
      <div class="retorno" hidden></div>
    </article>`;
}

function responder(texto, botao) {
  const prova = provaEmCurso;
  const q = prova.questoes[prova.atual];
  if (prova.respostas[prova.atual] !== undefined) return;
  prova.respostas[prova.atual] = texto;
  const certa = texto === q.correta;
  document.querySelectorAll('.alternativa').forEach((b) => {
    b.disabled = true;
    if (b.dataset.alternativa === q.correta) b.classList.add('certa');
  });
  if (!certa) botao.classList.add('errada');
  efeito(certa ? 'acerto' : 'erro');
  const retorno = document.querySelector('.retorno');
  retorno.hidden = false;
  retorno.innerHTML = `<p class="${certa ? 'ok' : 'nao'}">${certa ? 'Isso mesmo!' : `Resposta certa: <b>${q.correta}</b>`}</p>
    <p>${q.explicacao}</p><p class="mini">${escapar(q.referencia)}</p>
    <button class="botao" data-acao="proxima">${prova.atual + 1 < prova.questoes.length ? 'Próxima questão' : 'Ver resultado'}</button>`;
  retorno.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// "Você errou 3 de 10" não ensina nada. Isto diz em que assunto os erros se
// concentraram — usando a fase de origem de cada questão, que é um dado real,
// e não uma classificação inventada na hora.
function blocoDeOndeErrou(resultado) {
  const contagem = new Map();
  for (const d of resultado.detalhes) {
    if (d.certa) continue;
    const chave = d.questao.geradorId || 'geral';
    const numeroDaFase = String(chave).match(/^f(\d+)\./);
    const fase = numeroDaFase ? banco.dados.fases.buscar(numeroDaFase[1]) : null;
    const assunto = fase ? fase.titulo : 'Conteúdo desta fase';
    contagem.set(assunto, (contagem.get(assunto) || 0) + 1);
  }
  const ordenado = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  if (!ordenado.length) return '';
  return `<section class="onde-errou">
    <h3>Os erros se concentraram em</h3>
    <ul class="lista-chave">${ordenado.map(([assunto, quantas]) =>
      `<li><b>${escapar(assunto)}</b> — ${quantas} ${quantas === 1 ? 'questão' : 'questões'}</li>`).join('')}</ul>
  </section>`;
}

function telaResultado(fase) {
  const prova = provaEmCurso;
  const resultado = avaliacoesServico.corrigir(prova, prova.respostas, fase);

  if (!prova.registrada) {
    prova.registrada = true;
    const aluno = banco.alunoAtual();
    // Um lugar só grava tudo: resultado com o detalhe de cada questão,
    // histórico de perguntas usadas, progresso da fase, evento e matrícula.
    avaliacoesServico.registrarTentativa({
      alunoId: aluno.id, fase, prova, resultado,
      duracaoSegundos: prova.comecouEm ? Math.round((Date.now() - prova.comecouEm) / 1000) : 0,
    });
    if (resultado.aprovado) {
      certificadosServico.emitir({
        alunoId: aluno.id, fase, nota: resultado.nota,
        acertos: resultado.acertos, total: resultado.total,
      });
      efeito('vitoria');
    }
    prova.conquistas = gamificacao.conferir(aluno.id);
  }

  const daMesmaTrilha = trilhas().trilhas.find((t) => t.metodo.id === fase.metodoId);
  const lista = daMesmaTrilha ? daMesmaTrilha.fases : [];
  const proxima = lista.find((f) => f.anteriorId === fase.id);
  const erradas = resultado.detalhes.filter((d) => !d.certa);

  return `${cabecalho('Resultado', `#/fase/${fase.id}`)}
    <section class="resultado ${resultado.aprovado ? 'aprovado' : 'reprovado'}" style="--cor:${fase.cor}">
      <div class="nota">${resultado.nota}%</div>
      <strong>${resultado.aprovado ? 'Fase concluída!' : 'Ainda não desta vez'}</strong>
      <p>${resultado.acertos} de ${resultado.total} questões certas. A aprovação é a partir de ${NOTA_MINIMA}%.</p>
      ${resultado.aprovado
        ? `<a class="botao grande" href="#/certificado/${fase.id}">🏅 Ver o certificado</a>
           ${proxima ? `<a class="botao secundario" href="#/fase/${proxima.id}">Ir para a fase ${proxima.numero}</a>`
             : `<p>Você concluiu a trilha <b>${escapar(fase.nomeTrilha)}</b>. Parabéns!</p>`}`
        : `<button class="botao grande" data-acao="iniciar-prova" data-fase="${fase.id}">Tentar de novo (perguntas novas)</button>
           <a class="botao secundario" href="#/fase/${fase.id}">Rever as lições</a>`}
    </section>
    ${(prova.conquistas || []).length ? `<section class="conquistas-novas">
      <h3>${prova.conquistas.length === 1 ? 'Nova conquista' : 'Novas conquistas'}</h3>
      ${prova.conquistas.map((c) => `<div class="cartao-conquista ganha">
        <span class="icone" aria-hidden="true">${c.icone}</span>
        <div><strong>${escapar(c.titulo)}</strong><small>${escapar(c.descricao)}</small></div>
      </div>`).join('')}
    </section>` : ''}
    ${erradas.length ? blocoDeOndeErrou(resultado) : ''}
    ${erradas.length ? `<h3 class="titulo-secao">O que revisar</h3>
      <div class="revisao">${erradas.map((d) => `<div class="item-revisao">
        <p class="pergunta">${d.questao.enunciado}</p>
        <p class="sua">Sua resposta: <b>${escapar(d.resposta ?? '—')}</b></p>
        <p class="certa">Certa: <b>${escapar(d.questao.correta)}</b></p>
        <p class="mini">${d.questao.explicacao} <i>${escapar(d.questao.referencia)}</i></p>
      </div>`).join('')}</div>` : ''}`;
}

// ------------------------------------------------------------- certificados
// ------------------------------------------------- desempenho do aluno

function telaDesempenho() {
  const aluno = banco.alunoAtual();
  if (!aluno) return telaEntrada();
  const pontos = desempenho.pontos(aluno.id);
  const resumo = desempenho.resumo(aluno.id);
  const tendencia = desempenho.tendencia(aluno.id);
  const porFase = desempenho.porFase(aluno.id);
  const conselho = recomendacao.recomendar(aluno.id);

  if (!porFase.length) {
    return `${cabecalho('Meu desempenho')}
      <p class="aviso">Faça a sua primeira avaliação para ver aqui onde você vai bem e onde precisa
      reforçar. Nada é dito por suposição: tudo vem das suas respostas.</p>`;
  }

  const linhaDeAssunto = (f) => `<div class="linha-assunto">
    <div class="rotulo"><strong>${escapar(f.assunto)}</strong>
      <small>${escapar(f.metodo)}${f.detalhe ? ` · ${escapar(f.detalhe)}` : ''}</small></div>
    ${barra(f.acerto, f.assunto)}
    <span class="numero">${f.acerto}% <small>de ${f.total} questões</small></span>
  </div>`;

  return `${cabecalho('Meu desempenho')}
    <section class="resumo-topo">
      <div><strong>${resumo.tentativas}</strong><span>avaliações</span></div>
      <div><strong>${resumo.mediaDasNotas}%</strong><span>nota média</span></div>
      <div><strong>${resumo.diasDeEstudo}</strong><span>dias de estudo</span></div>
    </section>

    ${conselho.prioridade === 'reforco' ? `<section class="recomendacao">
      <span class="etiqueta">Recomendação</span>
      <strong>${escapar(conselho.titulo)}</strong>
      <p>${escapar(conselho.motivo)}</p>
      <a class="botao" href="${conselho.destino}">${escapar(conselho.acao)}</a>
    </section>` : ''}

    ${tendencia.conclusiva ? `<p class="recado ${tendencia.variacao >= 0 ? 'ok' : 'alerta'}">
      As suas notas estão <b>${tendencia.sentido}</b>: a média das três primeiras avaliações foi
      ${tendencia.inicio}% e a das três últimas, ${tendencia.fim}%.</p>`
      : '<p class="mini">Com menos de quatro avaliações ainda não dá para falar em tendência.</p>'}

    ${pontos.fracos.length ? `<h3 class="titulo-secao">Onde reforçar</h3>
      <div class="lista-assuntos">${pontos.fracos.map(linhaDeAssunto).join('')}</div>` : ''}

    ${pontos.fortes.length ? `<h3 class="titulo-secao">Onde você vai bem</h3>
      <div class="lista-assuntos">${pontos.fortes.map(linhaDeAssunto).join('')}</div>` : ''}

    <h3 class="titulo-secao">Todas as fases avaliadas</h3>
    <div class="lista-assuntos">${porFase.map(linhaDeAssunto).join('')}</div>

    ${pontos.semEvidencia ? `<p class="mini">${pontos.semEvidencia} ${pontos.semEvidencia === 1
      ? 'fase ainda tem poucas questões respondidas para uma conclusão'
      : 'fases ainda têm poucas questões respondidas para uma conclusão'} — o app prefere não afirmar
      nada com menos de ${desempenho.MINIMO_DE_QUESTOES} questões.</p>` : ''}`;
}

// -------------------------------------------------------- conquistas

function telaConquistas() {
  const aluno = banco.alunoAtual();
  if (!aluno) return telaEntrada();
  const painel = gamificacao.painel(aluno.id);
  const resumo = gamificacao.resumo(aluno.id);
  const ganhas = painel.filter((c) => c.ganha);
  const faltam = painel.filter((c) => !c.ganha);

  const cartao = (c) => `<div class="cartao-conquista ${c.ganha ? 'ganha' : 'pendente'}">
    <span class="icone" aria-hidden="true">${c.ganha ? c.icone : '🔒'}</span>
    <div><strong>${escapar(c.titulo)}</strong><small>${escapar(c.descricao)}</small>
    ${c.ganha ? `<small class="ok">conquistada em ${data(c.conquistadaEm)}</small>`
      : '<small class="mini">ainda não conquistada</small>'}</div>
  </div>`;

  return `${cabecalho('Minhas conquistas')}
    <section class="painel-aluno">
      <div class="indicadores">
        <div><strong>${resumo.nivel}</strong><span>nível</span></div>
        <div><strong>${resumo.xp}</strong><span>pontos</span></div>
        <div><strong>${resumo.sequencia.dias}</strong><span>${resumo.sequencia.dias === 1 ? 'dia seguido' : 'dias seguidos'}</span></div>
      </div>
      ${barra(resumo.percentualNoNivel, `Progresso no nível ${resumo.nivel}`)}
      <p class="mini">Faltam ${resumo.faltamParaOProximo} pontos para o nível ${resumo.nivel + 1}.</p>
    </section>
    <h3 class="titulo-secao">Conquistadas (${ganhas.length} de ${painel.length})</h3>
    ${ganhas.length ? `<div class="lista-conquistas">${ganhas.map(cartao).join('')}</div>`
      : '<p class="aviso">Nenhuma ainda. Ler a primeira lição já vale uma.</p>'}
    <h3 class="titulo-secao">A conquistar</h3>
    <div class="lista-conquistas">${faltam.map(cartao).join('')}</div>
    <p class="rodape">As conquistas premiam constância e superação — voltar, insistir e concluir.
    Não há disputa entre alunos e nenhuma delas premia quem vai mais rápido.</p>`;
}

// ---------------------------------------------------------- histórico

const ICONE_DO_EVENTO = {
  licao_lida: '📖', jogo: '🎲', avaliacao: '📝', aprovacao: '🏆',
  certificado: '🏅', conquista: '⭐', matricula: '📋', fase_liberada: '🔓',
};

function telaHistorico() {
  const aluno = banco.alunoAtual();
  if (!aluno) return telaEntrada();
  const dias = eventosServico.linhaDoTempo(aluno.id, { limite: 60 });

  if (!dias.length) {
    return `${cabecalho('Meu histórico')}<p class="aviso">O seu histórico começa quando você abrir a
      primeira lição. Cada coisa que você fizer aparece aqui, com a data.</p>`;
  }

  return `${cabecalho('Meu histórico')}
    <div class="linha-do-tempo">
      ${dias.map(({ dia, eventos: doDia }) => `<section class="dia">
        <h3>${new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</h3>
        ${doDia.map((e) => `<div class="evento">
          <span class="icone" aria-hidden="true">${ICONE_DO_EVENTO[e.tipo] || '•'}</span>
          <div><strong>${escapar(e.titulo)}</strong>
          ${e.detalhe ? `<small>${escapar(e.detalhe)}</small>` : ''}</div>
        </div>`).join('')}
      </section>`).join('')}
    </div>
    <p class="mini centro">Mostrando os últimos 60 registros.</p>`;
}

function telaCertificados() {
  const lista = banco.certificados().slice().sort((a, b) => String(a.faseId).localeCompare(String(b.faseId), 'pt-BR', { numeric: true }));
  if (!lista.length) {
    return `${cabecalho('Meus certificados')}<p class="aviso">Você ainda não tem certificados.
      Conclua a avaliação de uma fase com ${NOTA_MINIMA}% ou mais.</p>`;
  }
  return `${cabecalho('Meus certificados')}
    <div class="lista-certificados">${lista.map((c) => `<a class="cartao-certificado" href="#/certificado/${c.faseId}" style="--cor:${c.cor}">
      <strong>Fase ${c.fase} — ${escapar(c.titulo)}</strong>
      <span>${escapar(c.nomeTrilha || 'Teoria — MSA')}</span>
      <span>${c.nota}% · ${dataPorExtenso(c.data)}</span>
      <span class="codigo">${escapar(c.codigo)}</span></a>`).join('')}</div>`;
}

function telaCertificado(faseId) {
  const c = banco.certificados().find((x) => String(x.faseId) === String(faseId));
  if (!c) return telaCertificados();
  return `${cabecalho(`Certificado — Fase ${c.fase}`, `#/fase/${c.faseId}`)}
    <div class="moldura-certificado">${svgDoCertificado(c)}</div>
    <div class="acoes">
      <button class="botao grande" data-acao="imprimir" data-fase="${c.faseId}">🖨️ Imprimir / salvar em PDF</button>
      <button class="botao secundario" data-acao="baixar" data-fase="${c.faseId}">⬇️ Baixar como imagem</button>
    </div>
    <p class="mini centro">Código de verificação: ${escapar(c.codigo)}</p>`;
}

// -------------------------------------------------------------------- sobre
function telaSobre() {
  const aluno = banco.alunoAtual();
  if (!aluno) return telaEntrada();
  const dados = rascunho && rascunho.id === aluno.id ? rascunho : { ...aluno };
  const erros = dados.erros || {};
  const t = trilhas();
  const total = t.todas.reduce((soma, f) => soma + totalDeVariantes(f.id, f.contexto), 0);
  return `${cabecalho('Minha ficha e ajustes')}
    ${mostrarRecado()}
    <section class="formulario">
      ${camposDaFicha(dados, erros, { ministerioPendente: dados.ministerioPendente })}
      ${camposDeSenha({ obrigatoria: false, jaTem: aluno.exigeSenha, comConfirmacao: false })}
      <button class="botao grande" data-acao="salvar-perfil" data-id="${aluno.id}">Salvar</button>
    </section>
    <section class="sobre">
      <h3>O conteúdo</h3>
      <p>A trilha de <b>teoria</b> segue os assuntos do <b>Método Simplificado de Aprendizagem Musical</b>
      (Congregação Cristã no Brasil, 1ª edição, dez/2022), com a página do livro em cada lição.
      A trilha do <b>instrumento</b> traz a técnica padrão do instrumento escolhido — família, clave,
      afinação, transposição, cuidados e rotina de estudo. Nenhuma das duas substitui o método impresso
      nem a aula com o instrutor.</p>
      <h3>Como a avaliação nunca repete</h3>
      <p>As perguntas são montadas na hora, a partir de ${total} combinações possíveis nas suas trilhas.
      Cada pergunta recebe uma assinatura; as que você já respondeu ficam guardadas neste aparelho e saem
      do sorteio seguinte.</p>
      <h3>Seus dados</h3>
      <p>A sua ficha, o progresso e os certificados ficam apenas neste aparelho. Não há servidor nem cadastro
      na internet. A senha é guardada em resumo (hash), mas o app roda todo no navegador: serve para organizar
      o acesso, não para proteger dados sigilosos.</p>
      <div class="acoes">
        <button class="botao secundario" data-acao="exportar">Exportar cópia de segurança</button>
        <a class="botao secundario" href="#/sair">Sair desta conta</a>
      </div>
      <p class="mini">Aplicativo instalável: no navegador do celular, use "Adicionar à tela de início".</p>
    </section>`;
}

// Planilha do progresso: uma linha por aluno e fase. É o que o instrutor leva
// para a reunião, e o que o encarregado pede quando quer ver a turma inteira.
function exportarProgresso() {
  const celula = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cabecalhos = ['Aluno', 'Comum', 'Instrumento', 'Método', 'Versão', 'Fase', 'Título da fase',
    'Situação', 'Percentual', 'Melhor nota', 'Tentativas', 'Aprovado em'];
  const linhas = [];

  for (const aluno of banco.dados.alunos.listar()) {
    const situacao = progressoServico.situacaoDoAluno(aluno.id);
    for (const matricula of situacao.matriculas) {
      for (const fase of matricula.fases) {
        linhas.push([
          aluno.nome, aluno.comum, (instrumentoPorId(aluno.instrumentoId) || {}).nome || '',
          matricula.metodo ? matricula.metodo.nome : '', matricula.versao ? matricula.versao.rotulo : '',
          fase.fase.numero, fase.fase.titulo, fase.situacao.replace('_', ' '),
          `${fase.percentual}%`, fase.melhorNota, fase.tentativas, data(fase.aprovadoEm),
        ].map(celula).join(';'));
      }
    }
  }
  const csv = `\ufeff${cabecalhos.map(celula).join(';')}\n${linhas.join('\n')}\n`;
  salvarArquivo('progresso-estudo-musical.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

// Modelo do arquivo de importação: o formato explicado por exemplo, que é
// como alguém consegue escrever o próprio método sem ler documentação.
const MODELO_DE_METODO = {
  metodo: {
    id: 'meu-metodo', nome: 'Nome do método', descricao: 'Para que serve.',
    instrumentoIds: ['flauta'], fonte: 'De onde veio o conteúdo.',
  },
  versao: { rotulo: '1.0', notas: 'Primeira edição.' },
  fases: [
    { id: 'mm1', ordem: 1, titulo: 'Primeira fase', subtitulo: 'do que trata',
      resumo: 'O que o aluno aprende aqui.', icone: '🎵', cor: '#2f9e6b', notaMinima: 70 },
  ],
  licoes: [
    { faseId: 'mm1', ordem: 1, titulo: 'Primeira lição',
      corpo: 'Um parágrafo.\n\nOutro parágrafo — separe com linha em branco.' },
  ],
  jogos: [
    { faseId: 'mm1', tipo: 'pulso', titulo: 'Nome do jogo', descricao: 'O que o aluno faz.' },
  ],
  avaliacoes: [
    { faseId: 'mm1', quantidadeDeQuestoes: 10, questoes: [
      { enunciado: 'Pergunta?', alternativas: ['Certa', 'Errada'], correta: 'Certa',
        explicacao: 'Por que a certa é certa.', origem: 'Página do método.' },
    ] },
  ],
};

// ------------------------------------------------------------------ roteador
function desenhar() {
  const palcoAntigo = document.getElementById('palco-jogo');
  if (palcoAntigo) pararJogo(palcoAntigo);

  const rota = window.location.hash.replace(/^#/, '') || '/';
  const partes = rota.split('/').filter(Boolean);
  const logado = banco.sessao();
  let html = '';
  let depois = null;

  if (partes[0] === 'teste') { banco.ativarModoTeste(); ir('#/'); return; }

  // Dentro da plataforma, quem cuida de entrar, cadastrar e sair é o servidor:
  // estas rotas deixam de existir para não abrirem um segundo caminho de acesso.
  if (plataforma.rotaDesligada(partes[0])) {
    if (partes[0] === 'sair') { window.location.href = plataforma.enderecoDeSaida(); return; }
    ir('#/');
    return;
  }

  if (partes[0] === 'sair') { banco.sair(); provaEmCurso = null; ir('#/'); return; }

  if (partes[0] === 'entrar') html = telaLoginAluno(partes[1]);
  else if (partes[0] === 'cadastrar') html = telaCadastro();
  else if (partes[0] === 'instrutor' && !banco.ehAdmin()) html = telaLoginInstrutor();
  else if (partes[0] === 'instrutor') {
    if (partes[1] === 'novo') html = telaAdminNovo();
    else if (partes[1] === 'senha') html = telaTrocarSenha();
    else if (partes[1] === 'aluno') html = telaAdminAluno(partes[2]);
    else if (partes[1] === 'relatorios') html = telaRelatorios();
    else if (partes[1] === 'metodos') html = telaMetodos();
    else html = telaAdmin();
  } else if (!logado) html = telaEntrada();
  else if (banco.ehAdmin()) { ir('#/instrutor'); return; }
  else if (!plataforma.integrado() && !banco.fichaDoAlunoLiberada() && partes[0] !== 'ficha') { ir('#/ficha'); return; }
  else if (partes[0] === 'ficha') html = telaFicha();
  else if (!partes.length) html = telaInicial();
  else if (partes[0] === 'sobre') html = telaSobre();
  else if (partes[0] === 'desempenho') html = telaDesempenho();
  else if (partes[0] === 'conquistas') html = telaConquistas();
  else if (partes[0] === 'historico') html = telaHistorico();
  else if (partes[0] === 'certificados') html = telaCertificados();
  else if (partes[0] === 'certificado') html = telaCertificado(partes[1]);
  else if (partes[0] === 'fase') {
    const id = partes[1];
    if (partes[2] === 'licao') html = telaLicao(id, Number(partes[3]));
    else if (partes[2] === 'jogo') { html = telaJogo(id, Number(partes[3])); depois = () => montarJogo(id, Number(partes[3])); }
    else if (partes[2] === 'prova') html = telaProva(id);
    else html = telaFase(id);
  } else html = telaInicial();

  if (html) {
    tela().innerHTML = html;
    tela().scrollTop = 0;
    window.scrollTo(0, 0);
    rascunho = null;
  }
  if (depois) depois();
}

// -------------------------------------------------------------------- ações
const valor = (id) => (document.getElementById(id) || {}).value || '';
const marcado = (id) => Boolean((document.getElementById(id) || {}).checked);

function acoes(evento) {
  const alternativa = evento.target.closest('.alternativa');
  if (alternativa && !alternativa.disabled) { responder(alternativa.dataset.alternativa, alternativa); return; }

  const botao = evento.target.closest('[data-acao]');
  if (!botao) return;
  const acao = botao.dataset.acao;
  const id = botao.dataset.id;

  try {
    if (acao === 'entrar-aluno') {
      if (banco.entrarComoAluno(id, valor('senha'))) { provaEmCurso = null; ir('#/'); }
      else { avisar('Senha incorreta.', 'erro'); desenhar(); }
    } else if (acao === 'entrar-admin') {
      if (banco.entrarComoAdmin(valor('usuario'), valor('senha'))) { ir('#/instrutor'); }
      else { avisar('Usuário ou senha incorretos.', 'erro'); desenhar(); }
    } else if (acao === 'criar-aluno' || acao === 'criar-aluno-admin') {
      const peloAluno = acao === 'criar-aluno';
      const ficha = valoresDaFicha();
      const ministerioPendente = marcado('ministerio-pendente');
      const exige = peloAluno ? true : marcado('exige-senha');
      const senha = valor('senha');
      const erros = validarFicha(ficha, { ministerioPendente });
      if (peloAluno) {
        const erroSenha = validarSenha(senha);
        if (erroSenha) erros.senha = erroSenha;
        else if (senha !== valor('senha2')) erros.senha = 'As duas senhas não conferem.';
      } else if (exige) {
        const erroSenha = validarSenha(senha);
        if (erroSenha) erros.senha = erroSenha;
      }
      if (Object.keys(erros).length) {
        rascunho = { ...ficha, ministerioPendente, erros };
        avisar(primeiroErro(erros), 'erro');
        desenhar();
        return;
      }
      const criado = banco.criarUsuario({ ...ficha, exigeSenha: exige, senha });
      rascunho = null;
      if (peloAluno) {
        banco.entrarComoAluno(criado.id, senha);
        avisar(`Bem-vindo, ${escapar(criado.nome.split(' ')[0])}! Comece pela Fase 1.`);
        ir('#/');
      } else {
        avisar(`Aluno ${escapar(criado.nome)} cadastrado.`);
        ir('#/instrutor');
      }
    } else if (acao === 'salvar-aluno' || acao === 'salvar-perfil' || acao === 'salvar-ficha') {
      const ficha = valoresDaFicha();
      const ministerioPendente = marcado('ministerio-pendente');
      const usuario = banco.usuarioPorId(id);
      const senha = valor('senha');
      const exige = acao === 'salvar-ficha' ? usuario.exigeSenha : marcado('exige-senha');
      const erros = validarFicha(ficha, { ministerioPendente });
      if (exige && !senha && !usuario.senhaHash) erros.senha = 'Defina uma senha para exigir senha na entrada.';
      if (senha) {
        const erroSenha = validarSenha(senha);
        if (erroSenha) erros.senha = erroSenha;
      }
      if (Object.keys(erros).length) {
        rascunho = { ...ficha, id, ministerioPendente, erros };
        avisar(primeiroErro(erros), 'erro');
        desenhar();
        return;
      }
      banco.atualizarUsuario(id, { ...ficha, exigeSenha: exige, senha });
      rascunho = null;
      avisar('Ficha salva.');
      if (acao === 'salvar-ficha') ir('#/');
      else desenhar();
    } else if (acao === 'remover-aluno') {
      const usuario = banco.usuarioPorId(id);
      if (window.confirm(`Remover ${usuario.nome} e todo o progresso dele? Isto não tem volta.`)) {
        banco.removerUsuario(id);
        avisar('Aluno removido.');
        ir('#/instrutor');
      }
    } else if (acao === 'entrar-como') {
      banco.entrarComoAluno(id);
      provaEmCurso = null;
      ir('#/');
    } else if (acao === 'trocar-senha-admin') {
      if (!banco.entrarComoAdmin(banco.usuarioDoAdmin(), valor('senha-atual'))) { avisar('Senha atual incorreta.', 'erro'); desenhar(); return; }
      const erro = validarSenha(valor('senha'));
      if (erro) { avisar(erro, 'erro'); desenhar(); return; }
      if (valor('senha') !== valor('senha2')) { avisar('As duas senhas novas não conferem.', 'erro'); desenhar(); return; }
      banco.trocarSenhaAdmin(valor('senha'));
      avisar('Senha do instrutor alterada.');
      ir('#/instrutor');
    } else if (acao === 'limpar-filtros') {
      filtroDeAlunos = { texto: '', situacao: '', instrumento: '' };
      desenhar();
    } else if (acao === 'escolher-metodo') {
      document.getElementById('arquivo-metodo').click();
    } else if (acao === 'cancelar-metodo') {
      previaDeImportacao = null;
      desenhar();
    } else if (acao === 'confirmar-metodo') {
      const resultado = importacao.importar(previaDeImportacao.dados);
      previaDeImportacao = null;
      avisar(`Método "${escapar(resultado.metodo.nome)}" criado com ${resultado.criados.fases} fases.`);
      ir('#/instrutor/metodos');
    } else if (acao === 'modelo-metodo') {
      salvarArquivo('modelo-de-metodo.json',
        new Blob([JSON.stringify(MODELO_DE_METODO, null, 2)], { type: 'application/json' }));
    } else if (acao === 'exportar-progresso') {
      exportarProgresso();
    } else if (acao === 'autocadastro') {
      banco.definirAutocadastro(botao.checked);
    } else if (acao === 'iniciar-prova') {
      iniciarProva(botao.dataset.fase);
    } else if (acao === 'proxima') {
      provaEmCurso.atual++;
      desenhar();
    } else if (acao === 'repetir-jogo') {
      const partes = window.location.hash.split('/');
      document.getElementById('fim-jogo').innerHTML = '';
      montarJogo(partes[2], Number(partes[4]));
    } else if (acao === 'imprimir') {
      imprimirCertificado(banco.certificados().find((c) => String(c.faseId) === botao.dataset.fase));
    } else if (acao === 'baixar') {
      baixarCertificado(banco.certificados().find((c) => String(c.faseId) === botao.dataset.fase));
    } else if (acao === 'exportar-fichas') {
      const cabecalhos = ['Nome', 'Comum-congregação', 'Instrumento', 'Encarregado local', 'Encarregado regional',
        'Ancião', 'E-mail', 'WhatsApp', 'Fases vencidas', 'Certificados', 'Última atividade'];
      const celula = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const linhas = banco.usuarios().map((u) => {
        const r = banco.resumoDoAluno(u.id);
        const instrumento = instrumentoPorId(u.instrumento);
        return [u.nome, u.comum, instrumento ? instrumento.nome : '', u.encarregadoLocal, u.encarregadoRegional,
          u.anciao, u.email, u.whatsapp, r.aprovadas, r.certificados, data(r.ultimaAtividade)].map(celula).join(';');
      });
      const csv = `\ufeff${cabecalhos.map(celula).join(';')}\n${linhas.join('\n')}\n`;
      salvarArquivo('alunos-estudo-musical.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    } else if (acao === 'exportar') {
      salvarArquivo('backup-estudo-musical.json', new Blob([banco.exportar()], { type: 'application/json' }));
    } else if (acao === 'importar') {
      document.getElementById('arquivo-progresso').click();
    } else if (acao === 'apagar') {
      if (window.confirm('Isto apaga alunos, progresso, certificados e histórico de perguntas deste aparelho. Continuar?')) {
        banco.apagarTudo();
        ir('#/');
      }
    }
  } catch (erro) {
    avisar(erro.message, 'erro');
    desenhar();
  }
}

// Redesenhar a lista a cada tecla e devolver o foco ao campo: é o que faz a
// busca parecer instantânea sem tirar o cursor de onde a pessoa está digitando.
function aplicarFiltro(campo, valor) {
  filtroDeAlunos = { ...filtroDeAlunos, [campo]: valor };
  desenhar();
  const busca = document.getElementById('busca-aluno');
  if (busca && campo === 'texto') {
    busca.focus();
    busca.setSelectionRange(busca.value.length, busca.value.length);
  }
}

function mudancas(evento) {
  if (evento.target.dataset && evento.target.dataset.filtro) {
    aplicarFiltro(evento.target.dataset.filtro, evento.target.value);
    return;
  }
  if (evento.target.id === 'ministerio-pendente') {
    const area = document.getElementById('area-ministerio');
    if (area) area.hidden = evento.target.checked;
    return;
  }
  if (evento.target.id === 'exige-senha') {
    const area = document.getElementById('area-senha');
    if (area) area.hidden = !evento.target.checked;
    return;
  }
  if (evento.target.id === 'arquivo-metodo') {
    const escolhido = evento.target.files[0];
    if (!escolhido) return;
    const leitorDoMetodo = new FileReader();
    leitorDoMetodo.onload = () => {
      // Analisar não grava nada: o que aparece é uma prévia para conferência.
      previaDeImportacao = importacao.analisar(String(leitorDoMetodo.result));
      if (!previaDeImportacao.valido) {
        avisar(`O arquivo tem ${previaDeImportacao.impedimentos} ${previaDeImportacao.impedimentos === 1
          ? 'erro que impede' : 'erros que impedem'} a importação.`, 'erro');
      }
      ir('#/instrutor/metodos');
      desenhar();
    };
    leitorDoMetodo.readAsText(escolhido);
    evento.target.value = '';
    return;
  }
  if (evento.target.id !== 'arquivo-progresso') return;
  const arquivo = evento.target.files[0];
  if (!arquivo) return;
  const leitor = new FileReader();
  leitor.onload = () => {
    try {
      banco.importar(String(leitor.result));
      avisar('Cópia importada. Entre novamente.');
      ir('#/');
    } catch (erro) {
      avisar(erro.message, 'erro');
      desenhar();
    }
  };
  leitor.readAsText(arquivo);
}

function teclas(evento) {
  if (evento.key !== 'Enter') return;
  const dentro = evento.target.closest('section');
  if (!dentro) return;
  const principal = dentro.querySelector('[data-acao]');
  if (principal) { evento.preventDefault(); principal.click(); }
}

// Vai formatando o WhatsApp enquanto o aluno digita.
document.addEventListener('input', (evento) => {
  if (evento.target.id === 'busca-aluno') {
    aplicarFiltro('texto', evento.target.value);
    return;
  }
  if (evento.target.dataset && evento.target.dataset.mascara === 'whatsapp') {
    const posicaoNoFim = evento.target.selectionStart === evento.target.value.length;
    evento.target.value = formatarWhatsapp(evento.target.value);
    if (posicaoNoFim) evento.target.setSelectionRange(evento.target.value.length, evento.target.value.length);
  }
});

// A identidade é adotada antes do primeiro desenho: quando a página é servida
// pela plataforma, o aluno já entra logado, sem passar por tela de acesso.
plataforma.adotar(banco);

document.addEventListener('click', acoes);
document.addEventListener('change', mudancas);
document.addEventListener('keydown', teclas);
window.addEventListener('hashchange', desenhar);
window.addEventListener('DOMContentLoaded', desenhar);
if (document.readyState !== 'loading') desenhar();

if (window.MSA_MODO_TESTE) banco.ativarModoTeste();

// [inicio-service-worker] — este trecho sai da versão de arquivo único.
// Dentro da plataforma não se registra service worker: as telas dependem de
// sessão no servidor, e uma cópia offline delas enganaria quem a abrisse.
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !plataforma.integrado()) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
// [fim-service-worker]

// Casca do aplicativo: entrada, painel do instrutor, trilhas do aluno,
// lições, jogos, avaliação e certificado.

import * as banco from './armazenamento.js';
import { INSTRUMENTOS_POR_FAMILIA, instrumentoPorId } from './conteudo/instrumentos.js';
import { TOTAL_DE_FASES_INSTRUMENTO, TOTAL_DE_FASES_MSA, faseporId, trilhasDoAluno } from './conteudo/trilhas.js';
import { totalDeVariantes } from './conteudo/geradores.js';
import { NOTA_MINIMA, QUESTOES_POR_PROVA, corrigir, montarProva, perguntasIneditas } from './quiz.js';
import { iniciarJogo, pararJogo } from './jogos.js';
import { baixarCertificado, dataPorExtenso, imprimirCertificado, montarCertificado, svgDoCertificado } from './certificado.js';
import { salvarArquivo } from './download.js';
import { validarSenha } from './senha.js';
import { efeito } from './audio.js';

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

function seletorDeInstrumento(selecionado = '') {
  return `<select id="instrumento" class="campo">
    <option value="">— ainda não definido —</option>
    ${INSTRUMENTOS_POR_FAMILIA.map((g) => `<optgroup label="${escapar(g.nome)}">
      ${g.lista.map((i) => `<option value="${i.id}" ${i.id === selecionado ? 'selected' : ''}>${escapar(i.nome)}</option>`).join('')}
    </optgroup>`).join('')}
  </select>`;
}

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
  return `${cabecalho('Novo aluno', '#/sair')}
    <section class="formulario">
      ${mostrarRecado()}
      <label for="nome">Seu nome completo</label>
      <input id="nome" type="text" class="campo" autocomplete="name" maxlength="60" placeholder="como deve sair no certificado">
      <label for="instrumento">Instrumento que você toca</label>
      ${seletorDeInstrumento()}
      <label class="opcao"><input type="checkbox" id="exige-senha"> Proteger o meu acesso com senha</label>
      <div id="area-senha" hidden>
        <label for="senha">Senha (mínimo 4 caracteres)</label>
        <input id="senha" type="password" class="campo" autocomplete="new-password">
      </div>
      <button class="botao grande" data-acao="criar-aluno">Criar cadastro e começar</button>
      <a class="botao secundario" href="#/sair">Cancelar</a>
    </section>`;
}

// ================================================================== painel
function telaAdmin() {
  const alunos = banco.usuarios();
  return `<header class="topo topo-inicial">
      <div><span class="ola">Painel do instrutor</span><h1>${escapar(banco.usuarioDoAdmin())}</h1></div>
      <a class="avatar" href="#/sair" aria-label="Sair">⎋</a>
    </header>
    ${mostrarRecado()}
    ${banco.senhaDoAdminEhPadrao() ? `<p class="recado alerta">Você ainda está com a senha de fábrica.
      <a href="#/instrutor/senha">Troque a senha agora</a>.</p>` : ''}
    <section class="resumo-topo">
      <div><strong>${alunos.length}</strong><span>alunos</span></div>
      <div><strong>${alunos.reduce((s, u) => s + banco.resumoDoAluno(u.id).aprovadas, 0)}</strong><span>fases vencidas</span></div>
      <div><strong>${alunos.reduce((s, u) => s + banco.resumoDoAluno(u.id).certificados, 0)}</strong><span>certificados</span></div>
    </section>
    <h2 class="titulo-secao">Alunos</h2>
    <div class="lista-alunos">
      ${alunos.length ? alunos.map((u) => {
        const r = banco.resumoDoAluno(u.id);
        const instrumento = instrumentoPorId(u.instrumento);
        return `<a class="cartao-aluno painel" href="#/instrutor/aluno/${u.id}">
          <span class="inicial">${escapar(u.nome.trim().charAt(0).toUpperCase())}</span>
          <span class="dados">
            <strong>${escapar(u.nome)}</strong>
            <small>${instrumento ? escapar(instrumento.nome) : 'sem instrumento'} · ${u.exigeSenha ? 'com senha' : 'sem senha'}</small>
            <small>${r.aprovadas} fases · ${r.certificados} certificados · última atividade ${data(r.ultimaAtividade)}</small>
          </span>
          <span class="cadeado">›</span></a>`;
      }).join('') : '<p class="aviso">Nenhum aluno cadastrado ainda.</p>'}
    </div>
    <div class="acoes">
      <a class="botao grande" href="#/instrutor/novo">+ Cadastrar aluno</a>
      <a class="botao secundario" href="#/instrutor/senha">Trocar a minha senha</a>
    </div>
    <h2 class="titulo-secao">Aparelho</h2>
    <section class="sobre">
      <label class="opcao"><input type="checkbox" id="autocadastro" data-acao="autocadastro"
        ${banco.permiteAutocadastro() ? 'checked' : ''}> Permitir que o próprio aluno crie o seu cadastro</label>
      <p class="mini">Desligado, só o instrutor cadastra alunos neste aparelho.</p>
      <div class="acoes">
        <button class="botao secundario" data-acao="exportar">Exportar tudo (cópia de segurança)</button>
        <button class="botao secundario" data-acao="importar">Importar cópia</button>
        <button class="botao perigo" data-acao="apagar">Apagar tudo deste aparelho</button>
      </div>
      <input type="file" id="arquivo-progresso" accept="application/json" hidden>
    </section>
    <p class="rodape">Aviso: o app roda inteiro no aparelho, sem servidor. As senhas ficam guardadas em resumo
    (hash), mas esta é uma portaria de organização, não uma proteção contra quem sabe abrir o código da página.</p>`;
}

function telaAdminAluno(id) {
  const usuario = banco.usuarioPorId(id);
  if (!usuario) return telaAdmin();
  const r = banco.resumoDoAluno(id);
  const certificados = banco.certificados(id);
  return `${cabecalho(usuario.nome, '#/instrutor')}
    ${mostrarRecado()}
    <section class="formulario">
      <label for="nome">Nome</label>
      <input id="nome" type="text" class="campo" value="${escapar(usuario.nome)}" maxlength="60">
      <label for="instrumento">Instrumento</label>
      ${seletorDeInstrumento(usuario.instrumento)}
      <label class="opcao"><input type="checkbox" id="exige-senha" ${usuario.exigeSenha ? 'checked' : ''}>
        Exigir senha para este aluno entrar</label>
      <div id="area-senha" ${usuario.exigeSenha ? '' : 'hidden'}>
        <label for="senha">${usuario.exigeSenha ? 'Nova senha (deixe em branco para manter a atual)' : 'Senha (mínimo 4 caracteres)'}</label>
        <input id="senha" type="password" class="campo" autocomplete="new-password">
      </div>
      <button class="botao grande" data-acao="salvar-aluno" data-id="${id}">Salvar</button>
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
  return `${cabecalho('Cadastrar aluno', '#/instrutor')}
    <section class="formulario">
      ${mostrarRecado()}
      <label for="nome">Nome completo</label>
      <input id="nome" type="text" class="campo" maxlength="60" placeholder="como deve sair no certificado">
      <label for="instrumento">Instrumento</label>
      ${seletorDeInstrumento()}
      <label class="opcao"><input type="checkbox" id="exige-senha"> Exigir senha para este aluno entrar</label>
      <div id="area-senha" hidden>
        <label for="senha">Senha (mínimo 4 caracteres)</label>
        <input id="senha" type="password" class="campo" autocomplete="new-password">
      </div>
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

function telaInicial() {
  const aluno = banco.alunoAtual();
  if (!aluno) return telaEntrada();
  const t = trilhas();
  const aprovadas = t.todas.filter((f) => banco.faseAprovada(f.id)).length;
  const instrumento = t.dadosDoInstrumento;

  return `<header class="topo topo-inicial">
      <div><span class="ola">Bom estudo,</span><h1>${escapar(aluno.nome.split(' ')[0])}</h1></div>
      <a class="avatar" href="#/sobre" aria-label="Ajustes">⚙</a>
    </header>
    ${mostrarRecado()}
    <section class="resumo-topo">
      <div><strong>${aprovadas}</strong><span>de ${t.todas.length} fases</span></div>
      <div><strong>${banco.progresso().xp}</strong><span>pontos</span></div>
      <div><strong>${banco.certificados().length}</strong><span>certificados</span></div>
    </section>
    ${banco.emModoTeste() ? `<p class="faixa-teste">Modo de demonstração: todas as fases já estão abertas,
      é só entrar e experimentar.</p>` : ''}
    <nav class="atalhos">
      <a href="#/certificados" class="atalho">🏅 Certificados</a>
      <a href="#/sobre" class="atalho">ℹ️ Ajustes</a>
      <a href="#/sair" class="atalho">⎋ Sair</a>
    </nav>

    <h2 class="titulo-secao">Teoria — Método Simplificado (MSA)</h2>
    <div class="lista-fases">${t.msa.map(cartaoDeFase).join('')}</div>

    <h2 class="titulo-secao">Método do instrumento</h2>
    ${instrumento
      ? `<p class="mini">Trilha montada para <b>${escapar(instrumento.nome)}</b> — ${escapar(instrumento.familiaNome)},
         ${escapar(instrumento.claves.length > 1 ? 'claves' : 'clave')} de ${instrumento.claves.map((c) => c === 'sol' ? 'Sol' : c === 'fa' ? 'Fá' : 'Dó').join(' e ')},
         em ${escapar(instrumento.afinacao)}.</p>
         <div class="lista-fases">${t.instrumento.map(cartaoDeFase).join('')}</div>`
      : `<div class="caixa-prova"><p>Escolha o seu instrumento para abrir esta trilha: são
         ${TOTAL_DE_FASES_INSTRUMENTO} fases sobre o instrumento que você toca, com avaliação e certificado próprios.</p>
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
  const contexto = contextoDaFase(fase);
  const ineditas = perguntasIneditas(fase.id, banco.usadasDaFase(fase.id), contexto);
  const total = totalDeVariantes(fase.id, contexto);

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

  return `${cabecalho(`Fase ${fase.numero} · ${fase.trilha === 'msa' ? 'MSA' : 'instrumento'}`)}
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
      <p>${QUESTOES_POR_PROVA} questões de múltipla escolha. Aprovação a partir de <b>${NOTA_MINIMA}%</b>.</p>
      <p class="mini">Ainda restam <b>${ineditas}</b> perguntas inéditas nesta fase (de ${total} possíveis).
      Nenhuma pergunta que você já recebeu volta a cair.</p>
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
  const prova = montarProva(fase.id, banco.usadasDaFase(fase.id), { contexto: contextoDaFase(fase) });
  provaEmCurso = { ...prova, respostas: [], atual: 0 };
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

function telaResultado(fase) {
  const prova = provaEmCurso;
  const resultado = corrigir(prova, prova.respostas);

  if (!prova.registrada) {
    prova.registrada = true;
    banco.registrarUsadas(fase.id, prova.questoes.map((q) => q.assinatura));
    banco.registrarTentativa(fase.id, {
      data: new Date().toISOString(), acertos: resultado.acertos, total: resultado.total,
      nota: resultado.nota, aprovado: resultado.aprovado, semente: prova.semente,
    });
    if (resultado.aprovado) {
      banco.guardarCertificado(montarCertificado({
        nome: banco.alunoAtual().nome, fase, nota: resultado.nota, acertos: resultado.acertos, total: resultado.total,
      }));
      efeito('vitoria');
    }
  }

  const trilha = trilhas();
  const lista = fase.trilha === 'msa' ? trilha.msa : trilha.instrumento;
  const proxima = lista.find((f) => f.numero === fase.numero + 1);
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
    ${erradas.length ? `<h3 class="titulo-secao">O que revisar</h3>
      <div class="revisao">${erradas.map((d) => `<div class="item-revisao">
        <p class="pergunta">${d.questao.enunciado}</p>
        <p class="sua">Sua resposta: <b>${escapar(d.resposta ?? '—')}</b></p>
        <p class="certa">Certa: <b>${escapar(d.questao.correta)}</b></p>
        <p class="mini">${d.questao.explicacao} <i>${escapar(d.questao.referencia)}</i></p>
      </div>`).join('')}</div>` : ''}`;
}

// ------------------------------------------------------------- certificados
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
  const t = trilhas();
  const total = t.todas.reduce((soma, f) => soma + totalDeVariantes(f.id, f.contexto), 0);
  return `${cabecalho('Ajustes')}
    ${mostrarRecado()}
    <section class="formulario">
      <label for="nome">Nome no certificado</label>
      <input id="nome" type="text" class="campo" value="${escapar(aluno.nome)}" maxlength="60">
      <label for="instrumento">Meu instrumento</label>
      ${seletorDeInstrumento(aluno.instrumento)}
      <label class="opcao"><input type="checkbox" id="exige-senha" ${aluno.exigeSenha ? 'checked' : ''}>
        Pedir senha para entrar no meu cadastro</label>
      <div id="area-senha" ${aluno.exigeSenha ? '' : 'hidden'}>
        <label for="senha">${aluno.exigeSenha ? 'Nova senha (em branco mantém a atual)' : 'Senha (mínimo 4 caracteres)'}</label>
        <input id="senha" type="password" class="campo" autocomplete="new-password">
      </div>
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
      <p>Nome, progresso e certificados ficam apenas neste aparelho. Não há servidor nem cadastro na internet.
      A senha é guardada em resumo (hash), mas o app roda todo no navegador: serve para organizar o acesso,
      não para proteger dados sigilosos.</p>
      <div class="acoes">
        <button class="botao secundario" data-acao="exportar">Exportar cópia de segurança</button>
        <a class="botao secundario" href="#/sair">Sair desta conta</a>
      </div>
      <p class="mini">Aplicativo instalável: no navegador do celular, use "Adicionar à tela de início".</p>
    </section>`;
}

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
  if (partes[0] === 'sair') { banco.sair(); provaEmCurso = null; ir('#/'); return; }

  if (partes[0] === 'entrar') html = telaLoginAluno(partes[1]);
  else if (partes[0] === 'cadastrar') html = telaCadastro();
  else if (partes[0] === 'instrutor' && !banco.ehAdmin()) html = telaLoginInstrutor();
  else if (partes[0] === 'instrutor') {
    if (partes[1] === 'novo') html = telaAdminNovo();
    else if (partes[1] === 'senha') html = telaTrocarSenha();
    else if (partes[1] === 'aluno') html = telaAdminAluno(partes[2]);
    else html = telaAdmin();
  } else if (!logado) html = telaEntrada();
  else if (banco.ehAdmin()) { ir('#/instrutor'); return; }
  else if (!partes.length) html = telaInicial();
  else if (partes[0] === 'sobre') html = telaSobre();
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
      const exige = marcado('exige-senha');
      const senha = valor('senha');
      if (exige) {
        const erro = validarSenha(senha);
        if (erro) { avisar(erro, 'erro'); desenhar(); return; }
      }
      const novo = banco.criarUsuario({ nome: valor('nome'), instrumento: valor('instrumento'), exigeSenha: exige, senha });
      if (acao === 'criar-aluno') {
        banco.entrarComoAluno(novo.id, senha);
        avisar(`Bem-vindo, ${escapar(novo.nome.split(' ')[0])}! Comece pela Fase 1.`);
        ir('#/');
      } else {
        avisar(`Aluno ${escapar(novo.nome)} cadastrado.`);
        ir('#/instrutor');
      }
    } else if (acao === 'salvar-aluno' || acao === 'salvar-perfil') {
      const exige = marcado('exige-senha');
      const senha = valor('senha');
      const usuario = banco.usuarioPorId(id);
      if (exige && !senha && !usuario.senhaHash) { avisar('Defina uma senha para exigir senha na entrada.', 'erro'); desenhar(); return; }
      if (senha) {
        const erro = validarSenha(senha);
        if (erro) { avisar(erro, 'erro'); desenhar(); return; }
      }
      banco.atualizarUsuario(id, { nome: valor('nome'), instrumento: valor('instrumento'), exigeSenha: exige, senha });
      avisar('Cadastro salvo.');
      desenhar();
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

function mudancas(evento) {
  if (evento.target.id === 'exige-senha') {
    const area = document.getElementById('area-senha');
    if (area) area.hidden = !evento.target.checked;
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

document.addEventListener('click', acoes);
document.addEventListener('change', mudancas);
document.addEventListener('keydown', teclas);
window.addEventListener('hashchange', desenhar);
window.addEventListener('DOMContentLoaded', desenhar);
if (document.readyState !== 'loading') desenhar();

if (window.MSA_MODO_TESTE) banco.ativarModoTeste();

// [inicio-service-worker] — este trecho sai da versão de arquivo único.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
// [fim-service-worker]

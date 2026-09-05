// Casca do aplicativo: navegação, telas e ligação entre conteúdo, jogos,
// avaliação e certificado.

import { FASES, TOTAL_DE_FASES, faseNumero } from './conteudo/fases.js';
import * as banco from './armazenamento.js';
import { NOTA_MINIMA, QUESTOES_POR_PROVA, corrigir, perguntasIneditas, montarProva } from './quiz.js';
import { iniciarJogo, pararJogo } from './jogos.js';
import { baixarCertificado, dataPorExtenso, imprimirCertificado, montarCertificado, svgDoCertificado } from './certificado.js';
import { totalDeVariantes } from './conteudo/geradores.js';
import { efeito } from './audio.js';
import { salvarArquivo } from './download.js';

const tela = () => document.getElementById('tela');
const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let provaEmCurso = null;

function ir(rota) {
  window.location.hash = rota;
}

function cabecalho(titulo, voltarPara = '#/') {
  return `<header class="topo">
    ${voltarPara ? `<a class="voltar" href="${voltarPara}" aria-label="Voltar">‹</a>` : '<span></span>'}
    <h1>${titulo}</h1><span class="espaco"></span></header>`;
}

// ------------------------------------------------------------------- início
function telaInicial() {
  const p = banco.progresso();
  if (!p.aluno.nome) return telaBoasVindas();

  const aprovadas = FASES.filter((f) => banco.faseAprovada(f.numero)).length;
  const cartoes = FASES.map((f) => {
    const liberada = banco.faseLiberada(f.numero);
    const dados = banco.faseDoAluno(f.numero);
    const aprovada = Boolean(dados.aprovadoEm);
    const lidas = dados.licoesLidas.length;
    return `<a class="cartao-fase ${liberada ? '' : 'trancada'} ${aprovada ? 'aprovada' : ''}"
      href="${liberada ? `#/fase/${f.numero}` : '#/'}" style="--cor:${f.cor}">
      <div class="icone-fase">${liberada ? f.icone : '🔒'}</div>
      <div class="corpo-fase">
        <span class="numero-fase">Fase ${f.numero}${aprovada ? ' · concluída' : ''}</span>
        <strong>${f.titulo}</strong>
        <span class="sub-fase">${f.subtitulo}</span>
        <div class="barra"><span style="width:${Math.round((lidas / f.licoes.length) * 100)}%"></span></div>
        <span class="mini">${lidas} de ${f.licoes.length} lições · páginas ${f.paginas}</span>
      </div>
      ${aprovada ? `<span class="selo">${dados.melhorNota}%</span>` : ''}
    </a>`;
  }).join('');

  return `<header class="topo topo-inicial">
      <div><span class="ola">Bom estudo,</span><h1>${escapar(p.aluno.nome.split(' ')[0])}</h1></div>
      <a class="avatar" href="#/sobre" aria-label="Ajustes">⚙</a>
    </header>
    <section class="resumo-topo">
      <div><strong>${aprovadas}</strong><span>de ${TOTAL_DE_FASES} fases</span></div>
      <div><strong>${p.xp}</strong><span>pontos</span></div>
      <div><strong>${banco.certificados().length}</strong><span>certificados</span></div>
    </section>
    ${banco.emModoTeste() ? `<p class="faixa-teste">Modo de demonstração: as 10 fases já estão abertas, é só entrar e experimentar.
      O progresso continua sendo guardado só neste aparelho — para zerar, use <a href="#/sobre">Ajustes → Apagar tudo</a>.</p>` : ''}
    <nav class="atalhos">
      <a href="#/certificados" class="atalho">🏅 Meus certificados</a>
      <a href="#/sobre" class="atalho">ℹ️ Sobre o método</a>
    </nav>
    <h2 class="titulo-secao">Trilha de estudo</h2>
    <div class="lista-fases">${cartoes}</div>
    <p class="rodape">Conteúdo baseado no <b>Método Simplificado de Aprendizagem Musical</b> — Congregação Cristã no Brasil, 1ª edição (dez/2022). Estude com o livro ao lado: cada lição indica a página.</p>`;
}

function telaBoasVindas() {
  return `<section class="boas-vindas">
    <div class="marca">🎼</div>
    <h1>Estudo Musical<br><span>fase a fase</span></h1>
    <p>Dez fases sobre o <b>Método Simplificado de Aprendizagem Musical</b>: lições curtas, exercícios lúdicos,
    uma avaliação ao fim de cada fase — que <b>nunca repete a mesma pergunta</b> — e certificado a cada etapa vencida.</p>
    <label for="nome">Como você quer ser chamado no certificado?</label>
    <input id="nome" type="text" placeholder="Nome completo" autocomplete="name" maxlength="60">
    <button class="botao grande" id="comecar">Começar a estudar</button>
    <p class="mini centro">O progresso fica guardado só neste aparelho.</p>
  </section>`;
}

// -------------------------------------------------------------------- fase
function telaFase(numero) {
  const f = faseNumero(numero);
  if (!f) return telaInicial();
  if (!banco.faseLiberada(numero)) return `${cabecalho(`Fase ${numero}`)}<p class="aviso">Conclua a fase ${numero - 1} para abrir esta.</p>`;
  const dados = banco.faseDoAluno(numero);
  const ineditas = perguntasIneditas(numero, banco.usadasDaFase(numero));
  const todasLidas = dados.licoesLidas.length >= f.licoes.length;

  const licoes = f.licoes.map((licao, i) => `<a class="item-licao ${dados.licoesLidas.includes(i) ? 'lida' : ''}" href="#/fase/${numero}/licao/${i}">
      <span class="marca-lida">${dados.licoesLidas.includes(i) ? '✓' : i + 1}</span>
      <span><strong>${licao.titulo}</strong><small>pág. ${licao.pagina}</small></span><span class="seta">›</span></a>`).join('');

  const jogos = f.jogos.map((jogo, i) => {
    const recorde = dados.jogos[jogo.titulo] || 0;
    return `<a class="item-jogo" href="#/fase/${numero}/jogo/${i}" style="--cor:${f.cor}">
      <strong>${jogo.titulo}</strong><small>${jogo.descricao}</small>
      ${recorde ? `<span class="recorde">recorde ${recorde}</span>` : '<span class="recorde novo">novo</span>'}</a>`;
  }).join('');

  const historico = dados.tentativas.length
    ? `<div class="historico"><h3>Suas avaliações</h3>${dados.tentativas.slice().reverse().slice(0, 5).map((t) => `<div class="linha-historico">
        <span>${new Date(t.data).toLocaleDateString('pt-BR')}</span>
        <span class="${t.aprovado ? 'ok' : 'nao'}">${t.nota}% — ${t.aprovado ? 'aprovado' : 'não atingiu a nota'}</span></div>`).join('')}</div>`
    : '';

  return `${cabecalho(`Fase ${numero}`)}
    <section class="capa-fase" style="--cor:${f.cor}">
      <div class="icone-grande">${f.icone}</div>
      <h2>${f.titulo}</h2>
      <p class="sub">${f.subtitulo} · páginas ${f.paginas} do método</p>
      <p>${f.resumo}</p>
    </section>
    <h3 class="titulo-secao">Lições</h3>
    <div class="lista-licoes">${licoes}</div>
    <h3 class="titulo-secao">Exercícios lúdicos</h3>
    <div class="lista-jogos">${jogos}</div>
    <h3 class="titulo-secao">Avaliação da fase</h3>
    <div class="caixa-prova">
      <p>${QUESTOES_POR_PROVA} questões de múltipla escolha. Aprovação a partir de <b>${NOTA_MINIMA}%</b>.</p>
      <p class="mini">Ainda restam <b>${ineditas}</b> perguntas inéditas nesta fase (de ${totalDeVariantes(numero)} possíveis).
      Nenhuma pergunta que você já recebeu volta a cair.</p>
      ${todasLidas ? '' : '<p class="mini alerta">Dica: leia as lições antes — mas você pode tentar quando quiser.</p>'}
      <button class="botao grande" data-acao="iniciar-prova" data-fase="${numero}">
        ${dados.aprovadoEm ? 'Fazer uma nova avaliação' : 'Iniciar avaliação'}</button>
      ${dados.aprovadoEm ? `<a class="botao secundario" href="#/certificado/${numero}">Ver certificado</a>` : ''}
    </div>
    ${historico}`;
}

function telaLicao(numeroFase, indice) {
  const f = faseNumero(numeroFase);
  const licao = f.licoes[indice];
  if (!licao) return telaFase(numeroFase);
  banco.marcarLicaoLida(numeroFase, indice);
  const proxima = indice + 1 < f.licoes.length ? indice + 1 : null;
  return `${cabecalho(`Lição ${indice + 1} de ${f.licoes.length}`, `#/fase/${numeroFase}`)}
    <article class="licao" style="--cor:${f.cor}">
      <span class="etiqueta">Fase ${numeroFase} · pág. ${licao.pagina} do método</span>
      <h2>${licao.titulo}</h2>
      ${licao.corpo()}
    </article>
    <div class="acoes">
      ${proxima !== null
        ? `<a class="botao grande" href="#/fase/${numeroFase}/licao/${proxima}">Próxima lição ›</a>`
        : `<button class="botao grande" data-acao="iniciar-prova" data-fase="${numeroFase}">Ir para a avaliação</button>`}
      <a class="botao secundario" href="#/fase/${numeroFase}">Voltar para a fase</a>
    </div>`;
}

function telaJogo(numeroFase, indice) {
  const f = faseNumero(numeroFase);
  const jogo = f.jogos[indice];
  if (!jogo) return telaFase(numeroFase);
  return `${cabecalho(jogo.titulo, `#/fase/${numeroFase}`)}
    <section class="jogo" style="--cor:${f.cor}">
      <div id="palco-jogo"></div>
      <div id="fim-jogo"></div>
    </section>`;
}

function montarJogo(numeroFase, indice) {
  const f = faseNumero(numeroFase);
  const jogo = f.jogos[indice];
  const palco = document.getElementById('palco-jogo');
  const fim = document.getElementById('fim-jogo');
  iniciarJogo({ ...jogo, fase: numeroFase }, palco, (pontos, detalhe) => {
    banco.registrarJogo(numeroFase, jogo.titulo, pontos);
    fim.innerHTML = `<div class="resultado-jogo">
      <strong>${pontos} pontos</strong>
      <p>${detalhe || ''}</p>
      <div class="acoes">
        <button class="botao" data-acao="repetir-jogo">Jogar de novo</button>
        <a class="botao secundario" href="#/fase/${numeroFase}">Voltar para a fase</a>
      </div></div>`;
  });
}

// ---------------------------------------------------------------- avaliação
function iniciarProva(numeroFase) {
  const usadas = banco.usadasDaFase(numeroFase);
  provaEmCurso = { ...montarProva(numeroFase, usadas), respostas: [], atual: 0 };
  ir(`#/fase/${numeroFase}/prova`);
}

function telaProva(numeroFase) {
  if (!provaEmCurso || provaEmCurso.fase !== numeroFase) { iniciarProva(numeroFase); return '<p class="aviso">Preparando a avaliação…</p>'; }
  const prova = provaEmCurso;
  if (prova.atual >= prova.questoes.length) return telaResultado(numeroFase);

  const q = prova.questoes[prova.atual];
  const f = faseNumero(numeroFase);
  return `${cabecalho(`Avaliação — Fase ${numeroFase}`, `#/fase/${numeroFase}`)}
    <div class="progresso-prova"><span style="width:${(prova.atual / prova.questoes.length) * 100}%"></span></div>
    <p class="contador">Questão ${prova.atual + 1} de ${prova.questoes.length}</p>
    ${prova.reciclou && prova.atual === 0 ? '<p class="aviso leve">Você já respondeu todas as perguntas inéditas desta fase. A partir de agora o app volta a usar as mais antigas.</p>' : ''}
    <article class="questao" style="--cor:${f.cor}">
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
    <p>${q.explicacao}</p><p class="mini">${q.referencia}</p>
    <button class="botao" data-acao="proxima">${prova.atual + 1 < prova.questoes.length ? 'Próxima questão' : 'Ver resultado'}</button>`;
  retorno.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function telaResultado(numeroFase) {
  const prova = provaEmCurso;
  const resultado = corrigir(prova, prova.respostas);
  const f = faseNumero(numeroFase);

  if (!prova.registrada) {
    prova.registrada = true;
    banco.registrarUsadas(numeroFase, prova.questoes.map((q) => q.assinatura));
    banco.registrarTentativa(numeroFase, {
      data: new Date().toISOString(), acertos: resultado.acertos, total: resultado.total,
      nota: resultado.nota, aprovado: resultado.aprovado, semente: prova.semente,
    });
    if (resultado.aprovado) {
      const certificado = montarCertificado({
        nome: banco.progresso().aluno.nome, fase: numeroFase, nota: resultado.nota,
        acertos: resultado.acertos, total: resultado.total,
      });
      banco.guardarCertificado(certificado);
      efeito('vitoria');
    }
  }

  const erradas = resultado.detalhes.filter((d) => !d.certa);
  return `${cabecalho('Resultado', `#/fase/${numeroFase}`)}
    <section class="resultado ${resultado.aprovado ? 'aprovado' : 'reprovado'}" style="--cor:${f.cor}">
      <div class="nota">${resultado.nota}%</div>
      <strong>${resultado.aprovado ? 'Fase concluída!' : 'Ainda não desta vez'}</strong>
      <p>${resultado.acertos} de ${resultado.total} questões certas. A aprovação é a partir de ${NOTA_MINIMA}%.</p>
      ${resultado.aprovado
        ? `<a class="botao grande" href="#/certificado/${numeroFase}">🏅 Ver o certificado</a>
           ${numeroFase < TOTAL_DE_FASES ? `<a class="botao secundario" href="#/fase/${numeroFase + 1}">Ir para a fase ${numeroFase + 1}</a>` : '<p>Você concluiu todas as fases do método. Parabéns!</p>'}`
        : `<button class="botao grande" data-acao="iniciar-prova" data-fase="${numeroFase}">Tentar de novo (perguntas novas)</button>
           <a class="botao secundario" href="#/fase/${numeroFase}">Rever as lições</a>`}
    </section>
    ${erradas.length ? `<h3 class="titulo-secao">O que revisar</h3>
      <div class="revisao">${erradas.map((d) => `<div class="item-revisao">
        <p class="pergunta">${d.questao.enunciado}</p>
        <p class="sua">Sua resposta: <b>${d.resposta ?? '—'}</b></p>
        <p class="certa">Certa: <b>${d.questao.correta}</b></p>
        <p class="mini">${d.questao.explicacao} <i>${d.questao.referencia}</i></p>
      </div>`).join('')}</div>` : ''}`;
}

// ------------------------------------------------------------- certificados
function telaCertificados() {
  const lista = banco.certificados().sort((a, b) => a.fase - b.fase);
  if (!lista.length) {
    return `${cabecalho('Meus certificados')}<p class="aviso">Você ainda não tem certificados. Conclua a avaliação de uma fase com ${NOTA_MINIMA}% ou mais.</p>`;
  }
  return `${cabecalho('Meus certificados')}
    <div class="lista-certificados">${lista.map((c) => `<a class="cartao-certificado" href="#/certificado/${c.fase}" style="--cor:${c.cor}">
      <strong>Fase ${c.fase} — ${c.titulo}</strong>
      <span>${c.nota}% · ${dataPorExtenso(c.data)}</span>
      <span class="codigo">${c.codigo}</span></a>`).join('')}</div>`;
}

function telaCertificado(numeroFase) {
  const c = banco.certificados().find((x) => x.fase === numeroFase);
  if (!c) return telaCertificados();
  return `${cabecalho(`Certificado — Fase ${numeroFase}`, `#/fase/${numeroFase}`)}
    <div class="moldura-certificado">${svgDoCertificado(c)}</div>
    <div class="acoes">
      <button class="botao grande" data-acao="imprimir" data-fase="${numeroFase}">🖨️ Imprimir / salvar em PDF</button>
      <button class="botao secundario" data-acao="baixar" data-fase="${numeroFase}">⬇️ Baixar como imagem</button>
    </div>
    <p class="mini centro">Código de verificação: ${c.codigo}</p>`;
}

// -------------------------------------------------------------------- sobre
function telaSobre() {
  const p = banco.progresso();
  const total = FASES.reduce((soma, f) => soma + totalDeVariantes(f.numero), 0);
  return `${cabecalho('Sobre e ajustes')}
    <section class="sobre">
      <h3>O conteúdo</h3>
      <p>As dez fases seguem a ordem dos assuntos do <b>Método Simplificado de Aprendizagem Musical</b>
      (Congregação Cristã no Brasil, 1ª edição, dezembro/2022). Cada lição traz a página do livro impresso,
      para estudar os dois lado a lado. Este app é material de apoio ao estudo, não substitui o método nem a aula.</p>
      <h3>Como a avaliação nunca repete</h3>
      <p>As perguntas não vêm de uma lista pronta: são montadas na hora a partir de ${total} combinações possíveis
      de assunto, exemplo e enunciado. Cada pergunta recebe uma assinatura, e as que você já respondeu ficam
      guardadas neste aparelho e são descontadas do sorteio seguinte. Só quando o repertório inédito de uma fase
      acaba é que o app avisa e volta a usar as mais antigas.</p>
      <h3>Seus dados</h3>
      <p>Nome, progresso e certificados ficam apenas neste aparelho, no armazenamento do navegador.
      Não há servidor nem cadastro.</p>
      <label for="nome-ajuste">Nome no certificado</label>
      <input id="nome-ajuste" type="text" value="${escapar(p.aluno.nome)}" maxlength="60">
      <div class="acoes">
        <button class="botao" data-acao="salvar-nome">Salvar nome</button>
        <button class="botao secundario" data-acao="exportar">Exportar progresso</button>
        <button class="botao secundario" data-acao="importar">Importar progresso</button>
        <button class="botao perigo" data-acao="apagar">Apagar tudo</button>
      </div>
      <input type="file" id="arquivo-progresso" accept="application/json" hidden>
      <p class="mini">Aplicativo instalável: no navegador do celular, use "Adicionar à tela de início".</p>
    </section>`;
}

// ------------------------------------------------------------------ roteador
function desenhar() {
  const alvoAntigo = document.getElementById('palco-jogo');
  if (alvoAntigo) pararJogo(alvoAntigo);

  const rota = window.location.hash.replace(/^#/, '') || '/';
  const partes = rota.split('/').filter(Boolean);
  let html = '';
  let depois = null;

  if (partes[0] === 'teste') { banco.ativarModoTeste(); ir('#/'); return; }
  if (!partes.length) html = telaInicial();
  else if (partes[0] === 'sobre') html = telaSobre();
  else if (partes[0] === 'certificados') html = telaCertificados();
  else if (partes[0] === 'certificado') html = telaCertificado(Number(partes[1]));
  else if (partes[0] === 'fase') {
    const numero = Number(partes[1]);
    if (partes[2] === 'licao') html = telaLicao(numero, Number(partes[3]));
    else if (partes[2] === 'jogo') { html = telaJogo(numero, Number(partes[3])); depois = () => montarJogo(numero, Number(partes[3])); }
    else if (partes[2] === 'prova') html = telaProva(numero);
    else html = telaFase(numero);
  } else html = telaInicial();

  tela().innerHTML = html;
  tela().scrollTop = 0;
  window.scrollTo(0, 0);
  if (depois) depois();
}

function cliques(evento) {
  const alternativa = evento.target.closest('.alternativa');
  if (alternativa && !alternativa.disabled) { responder(alternativa.dataset.alternativa, alternativa); return; }

  const botao = evento.target.closest('[data-acao]');
  if (!botao) return;
  const acao = botao.dataset.acao;
  const fase = Number(botao.dataset.fase);

  if (acao === 'iniciar-prova') iniciarProva(fase);
  else if (acao === 'proxima') { provaEmCurso.atual++; desenhar(); }
  else if (acao === 'repetir-jogo') {
    const partes = window.location.hash.split('/');
    document.getElementById('fim-jogo').innerHTML = '';
    montarJogo(Number(partes[2]), Number(partes[4]));
  } else if (acao === 'imprimir') imprimirCertificado(banco.certificados().find((c) => c.fase === fase));
  else if (acao === 'baixar') baixarCertificado(banco.certificados().find((c) => c.fase === fase));
  else if (acao === 'salvar-nome') {
    const nome = document.getElementById('nome-ajuste').value.trim();
    if (nome) { banco.definirAluno(nome); botao.textContent = 'Nome salvo ✓'; setTimeout(() => { botao.textContent = 'Salvar nome'; }, 1500); }
  } else if (acao === 'exportar') {
    salvarArquivo('progresso-msa.json', new Blob([banco.exportar()], { type: 'application/json' }));
  } else if (acao === 'importar') document.getElementById('arquivo-progresso').click();
  else if (acao === 'apagar') {
    if (window.confirm('Isto apaga nome, progresso, certificados e o histórico de perguntas já respondidas. Continuar?')) {
      banco.apagarTudo();
      ir('#/');
      desenhar();
    }
  }
}

function teclado(evento) {
  if (evento.target.id === 'nome' && evento.key === 'Enter') document.getElementById('comecar')?.click();
}

function mudancas(evento) {
  if (evento.target.id !== 'arquivo-progresso') return;
  const arquivo = evento.target.files[0];
  if (!arquivo) return;
  const leitor = new FileReader();
  leitor.onload = () => {
    try { banco.importar(String(leitor.result)); desenhar(); window.alert('Progresso importado.'); } catch (erro) { window.alert(erro.message); }
  };
  leitor.readAsText(arquivo);
}

document.addEventListener('click', (evento) => {
  const comecar = evento.target.closest('#comecar');
  if (comecar) {
    const nome = document.getElementById('nome').value.trim();
    if (!nome) { document.getElementById('nome').focus(); return; }
    banco.definirAluno(nome);
    desenhar();
    return;
  }
  cliques(evento);
});
document.addEventListener('keydown', teclado);
document.addEventListener('change', mudancas);
if (window.MSA_MODO_TESTE) banco.ativarModoTeste();
window.addEventListener('hashchange', desenhar);
window.addEventListener('DOMContentLoaded', desenhar);
if (document.readyState !== 'loading') desenhar();

// [inicio-service-worker] — este trecho sai da versão de arquivo único.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
// [fim-service-worker]

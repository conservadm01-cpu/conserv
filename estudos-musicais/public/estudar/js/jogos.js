// Exercícios lúdicos. Cada jogo recebe um elemento, se vira lá dentro e
// devolve a pontuação pelo callback aoTerminar.

import { criarAleatorio, embaralhar, inteiro, novaSemente, sortear } from './aleatorio.js';
import * as T from './musica.js';
import { pentagrama, figuraSolta, teclado } from './notacao.js';
import { Metronomo, efeito, frequencia, tocarFrequencia, tocarNota, tocarSequencia } from './audio.js';

const criar = (html) => {
  const molde = document.createElement('div');
  molde.innerHTML = html.trim();
  return molde.firstElementChild;
};

const BARALHOS = {
  propriedades: {
    titulo: 'Propriedades do som',
    pares: T.PROPRIEDADES_DO_SOM.map((p) => [p.nome, p.definicao.replace(/^é /, '').replace(/:.*/, '')]),
  },
  figuras: {
    titulo: 'Figuras e valores',
    pares: T.FIGURAS.slice(0, 5).map((f) => [figuraSolta(f.id, { tamanho: 52 }), `${f.nome} — ${T.fracaoBonita(f.duracao)} tempo(s)`]),
  },
  acidentes: {
    titulo: 'Acidentes',
    pares: [['♯ sustenido', 'sobe um semitom'], ['♭ bemol', 'desce um semitom'], ['♮ bequadro', 'cancela o acidente'],
      ['𝄪 dobrado sustenido', 'sobe um tom'], ['𝄫 dobrado bemol', 'desce um tom']],
  },
  iniciais: {
    titulo: 'Ritmos iniciais',
    pares: [['tético', 'começa no 1º tempo, compasso completo'], ['anacrústico', 'começa antes do 1º tempo forte'],
      ['acéfalo', 'começa com pausa no 1º tempo'], ['síncopa', 'som que invade o tempo forte'],
      ['contratempo', 'som no fraco, forte em silêncio']],
  },
  andamentos: {
    titulo: 'Andamentos',
    pares: T.ANDAMENTOS.map((a) => [a.termo, a.faixa]),
  },
};

// ------------------------------------------------------------- jogo: memória
function jogoMemoria(config, alvo, aoTerminar) {
  const baralho = BARALHOS[config.baralho] || BARALHOS.figuras;
  const rnd = criarAleatorio(novaSemente());
  const cartas = embaralhar(baralho.pares.flatMap(([a, b], i) => [
    { par: i, face: a }, { par: i, face: b },
  ]), rnd);
  let viradas = [];
  let encontrados = 0;
  let jogadas = 0;
  let travado = false;

  alvo.innerHTML = `<p class="instrucao">Toque nas cartas e junte cada par. Quanto menos tentativas, maior a pontuação.</p>
    <div class="placar-jogo"><span id="jogadas">0 tentativas</span><span id="pares">0 de ${baralho.pares.length} pares</span></div>
    <div class="grade-memoria"></div>`;
  const grade = alvo.querySelector('.grade-memoria');

  cartas.forEach((carta, indice) => {
    const botao = criar(`<button class="carta" data-indice="${indice}" aria-label="carta ${indice + 1}">
      <span class="verso">♪</span><span class="frente">${carta.face}</span></button>`);
    botao.addEventListener('click', () => {
      if (travado || botao.classList.contains('aberta') || botao.classList.contains('achada')) return;
      botao.classList.add('aberta');
      viradas.push({ botao, carta });
      if (viradas.length < 2) return;
      jogadas++;
      alvo.querySelector('#jogadas').textContent = `${jogadas} tentativa${jogadas > 1 ? 's' : ''}`;
      const [a, b] = viradas;
      if (a.carta.par === b.carta.par) {
        a.botao.classList.add('achada');
        b.botao.classList.add('achada');
        encontrados++;
        efeito('acerto');
        alvo.querySelector('#pares').textContent = `${encontrados} de ${baralho.pares.length} pares`;
        viradas = [];
        if (encontrados === baralho.pares.length) {
          efeito('vitoria');
          const pontos = Math.max(20, 100 - Math.max(0, jogadas - baralho.pares.length) * 8);
          aoTerminar(pontos, `${jogadas} tentativas para ${baralho.pares.length} pares`);
        }
      } else {
        travado = true;
        setTimeout(() => {
          a.botao.classList.remove('aberta');
          b.botao.classList.remove('aberta');
          viradas = [];
          travado = false;
        }, 750);
      }
    });
    grade.appendChild(botao);
  });
}

// -------------------------------------------------- jogo: leitura no pentagrama
function jogoPentagrama(config, alvo, aoTerminar) {
  const claves = config.claves || ['sol'];
  const rnd = criarAleatorio(novaSemente());
  const segundos = 60;
  let restante = segundos;
  let acertos = 0;
  let erros = 0;
  let atual = null;

  alvo.innerHTML = `<p class="instrucao">Diga o nome da nota antes que o tempo acabe.</p>
    <div class="placar-jogo"><span id="relogio">${segundos}s</span><span id="pontos">0 acertos</span></div>
    <div class="palco"></div><div class="botoes-notas"></div>`;
  const palco = alvo.querySelector('.palco');
  const botoes = alvo.querySelector('.botoes-notas');

  const sortearNota = () => {
    const clave = sortear(claves, rnd);
    const posicao = inteiro(rnd, -1, 10);
    const nota = T.notaDaPosicao(clave, posicao);
    atual = { clave, nota };
    palco.innerHTML = `<div class="etiqueta-clave">${T.CLAVES[clave].nome}</div>
      ${pentagrama({ clave, notas: [{ ...nota, figura: 'semibreve' }], largura: 280 })}`;
  };

  T.LETRAS.forEach((letra) => {
    const botao = criar(`<button class="botao-nota">${letra}</button>`);
    botao.addEventListener('click', () => {
      if (restante <= 0) return;
      if (letra === atual.nota.letra) {
        acertos++;
        efeito('acerto');
        botao.classList.add('certo');
        tocarNota(atual.nota.letra, atual.nota.oitava);
      } else {
        erros++;
        efeito('erro');
        botao.classList.add('errado');
      }
      setTimeout(() => botao.classList.remove('certo', 'errado'), 250);
      alvo.querySelector('#pontos').textContent = `${acertos} acerto${acertos === 1 ? '' : 's'}`;
      sortearNota();
    });
    botoes.appendChild(botao);
  });

  sortearNota();
  const relogio = setInterval(() => {
    restante--;
    alvo.querySelector('#relogio').textContent = `${restante}s`;
    if (restante <= 0) {
      clearInterval(relogio);
      efeito('vitoria');
      aoTerminar(Math.max(0, acertos * 8 - erros * 4), `${acertos} acertos e ${erros} erros em 1 minuto`);
    }
  }, 1000);
  alvo.dataset.limpar = 'sim';
  alvo._parar = () => clearInterval(relogio);
}

// ------------------------------------------------------- jogo: fecha o compasso
function jogoRitmo(config, alvo, aoTerminar) {
  const rnd = criarAleatorio(novaSemente());
  const formulas = config.composto ? ['6/8', '9/8', '12/8'] : ['2/4', '3/4', '4/4'];
  const paleta = config.comPonto
    ? ['seminima', 'seminima.', 'minima', 'minima.', 'colcheia', 'colcheia.', 'semicolcheia']
    : ['semibreve', 'minima', 'seminima', 'colcheia', 'semicolcheia'];
  const rodadasTotais = 5;
  let rodada = 0;
  let acertos = 0;
  let erros = 0;
  let escritas = [];
  let alvoTempos = 0;
  let formula = '';

  const valorDe = (id) => {
    const pontuada = id.endsWith('.');
    const base = T.figuraPorId(pontuada ? id.slice(0, -1) : id);
    return pontuada ? base.duracao * 1.5 : base.duracao;
  };
  const soma = () => escritas.reduce((total, id) => total + valorDe(id), 0);

  alvo.innerHTML = `<p class="instrucao">Escolha as figuras que fecham o compasso exatamente — sem sobrar nem faltar.</p>
    <div class="placar-jogo"><span id="rodada">Rodada 1 de ${rodadasTotais}</span><span id="soma"></span></div>
    <div class="palco"></div>
    <div class="paleta-figuras"></div>
    <div class="acoes-jogo">
      <button class="botao secundario" id="desfazer">Apagar a última</button>
      <button class="botao" id="conferir">Conferir</button>
    </div>`;
  const palco = alvo.querySelector('.palco');
  const paletaEl = alvo.querySelector('.paleta-figuras');

  const desenhar = () => {
    palco.innerHTML = pentagrama({
      clave: 'sol', compasso: formula, largura: 320,
      notas: escritas.map((id) => ({
        letra: 'Si', oitava: 4, figura: id.endsWith('.') ? id.slice(0, -1) : id, pontuada: id.endsWith('.'),
      })),
    });
    alvo.querySelector('#soma').textContent = `${T.fracaoBonita(soma())} de ${T.fracaoBonita(alvoTempos)}`;
  };

  const novaRodada = () => {
    rodada++;
    if (rodada > rodadasTotais) {
      efeito('vitoria');
      aoTerminar(Math.max(0, acertos * 20 - erros * 5), `${acertos} de ${rodadasTotais} compassos fechados`);
      return;
    }
    formula = sortear(formulas, rnd);
    const [cima, baixo] = formula.split('/').map(Number);
    alvoTempos = cima * T.FIGURAS.find((f) => f.equivalencia === baixo).duracao;
    escritas = [];
    alvo.querySelector('#rodada').textContent = `Rodada ${rodada} de ${rodadasTotais}`;
    desenhar();
  };

  paleta.forEach((id) => {
    const pontuada = id.endsWith('.');
    const base = pontuada ? id.slice(0, -1) : id;
    const botao = criar(`<button class="botao-figura" title="${T.figuraPorId(base).nome}${pontuada ? ' pontuada' : ''}">
      ${figuraSolta(base, { pontuada, tamanho: 46 })}</button>`);
    botao.addEventListener('click', () => {
      if (soma() + valorDe(id) > alvoTempos + 1e-9) {
        efeito('erro');
        botao.classList.add('errado');
        setTimeout(() => botao.classList.remove('errado'), 250);
        return;
      }
      escritas.push(id);
      tocarNota('Si', 4, { duracao: Math.min(0.5, valorDe(id) * 0.4) });
      desenhar();
    });
    paletaEl.appendChild(botao);
  });

  alvo.querySelector('#desfazer').addEventListener('click', () => { escritas.pop(); desenhar(); });
  alvo.querySelector('#conferir').addEventListener('click', () => {
    if (Math.abs(soma() - alvoTempos) < 1e-9) { acertos++; efeito('acerto'); } else { erros++; efeito('erro'); }
    novaRodada();
  });

  novaRodada();
}

// ------------------------------------------------------------- jogo: teclado
function jogoTeclado(config, alvo, aoTerminar) {
  const rnd = criarAleatorio(novaSemente());
  const rodadasTotais = config.modo === 'escala' ? 3 : 8;
  let rodada = 0;
  let acertos = 0;
  let erros = 0;
  let esperado = [];
  let passo = 0;
  let baseAtual = null;

  alvo.innerHTML = `<p class="instrucao"></p>
    <div class="placar-jogo"><span id="rodada"></span><span id="pontos">0 acertos</span></div>
    <div class="quadro-teclado"></div>`;
  const quadro = alvo.querySelector('.quadro-teclado');
  const instrucao = alvo.querySelector('.instrucao');

  const chaveDaNota = (n) => {
    const semitom = T.semitomDaNota(n);
    const brancas = { 0: 'Dó', 2: 'Ré', 4: 'Mi', 5: 'Fá', 7: 'Sol', 9: 'Lá', 11: 'Si' };
    const pretas = { 1: 'Dó#', 3: 'Ré#', 6: 'Fá#', 8: 'Sol#', 10: 'Lá#' };
    return { nome: brancas[semitom] || pretas[semitom], semitom };
  };

  const desenhar = (marcadas = {}) => {
    quadro.innerHTML = teclado({ oitavas: 1, marcadas, interativo: true });
    quadro.querySelectorAll('[data-tecla]').forEach((tecla) => {
      tecla.addEventListener('click', () => responder(tecla.dataset.tecla, tecla));
    });
  };

  const novaRodada = () => {
    rodada++;
    if (rodada > rodadasTotais) {
      efeito('vitoria');
      aoTerminar(Math.max(0, acertos * Math.round(100 / rodadasTotais) - erros * 5), `${acertos} de ${rodadasTotais}`);
      return;
    }
    alvo.querySelector('#rodada').textContent = `Rodada ${rodada} de ${rodadasTotais}`;
    passo = 0;
    if (config.modo === 'escala') {
      const tonalidade = sortear(T.TONALIDADES.filter((t) => t.acidentes <= 4 && t.tipo !== 'bemol'), rnd);
      baseAtual = null;
      const notas = T.escala(tonalidade.maior).slice(0, 8);
      esperado = notas.map((n, i) => ({ ...chaveDaNota(n), oitava: i === 7 ? 5 : 4 }));
      instrucao.innerHTML = `Toque a escala de <b>${T.nomeDaNota(tonalidade.maior)} Maior</b>, do 1º ao 8º grau, seguindo T&nbsp;T&nbsp;st&nbsp;T&nbsp;T&nbsp;T&nbsp;st.`;
    } else if (config.modo === 'semitom') {
      const base = sortear(T.LETRAS, rnd);
      baseAtual = base;
      const acima = rnd() > 0.5;
      const semitom = (T.SEMITONS_DA_LETRA[T.LETRAS.indexOf(base)] + (acima ? 1 : 11)) % 12;
      esperado = [{ nome: chaveDaNota({ letra: base, alteracao: acima ? 1 : -1 }).nome, semitom, oitava: 4 }];
      esperado[0].semitom = semitom;
      instrucao.innerHTML = `Toque a tecla <b>um semitom ${acima ? 'acima' : 'abaixo'}</b> de <b>${base}</b>.`;
    } else {
      const base = sortear(T.LETRAS, rnd);
      baseAtual = base;
      const opcoes = [['2ª maior', 2], ['3ª maior', 4], ['3ª menor', 3], ['4ª justa', 5], ['5ª justa', 7], ['8ª justa', 12]];
      const [nome, distancia] = sortear(opcoes, rnd);
      const semitom = (T.SEMITONS_DA_LETRA[T.LETRAS.indexOf(base)] + distancia) % 12;
      esperado = [{ nome, semitom, oitava: distancia === 12 ? 5 : 4 }];
      instrucao.innerHTML = `Partindo de <b>${base}</b>, toque a nota que fica uma <b>${nome}</b> acima.`;
    }
    desenhar(baseAtual ? { [`${baseAtual}4`]: 'tonica' } : {});
  };

  const semitomDaTecla = (chave) => {
    const nome = chave.replace(/\d+$/, '');
    const tabela = { 'Dó': 0, 'Dó#': 1, 'Ré': 2, 'Ré#': 3, 'Mi': 4, 'Fá': 5, 'Fá#': 6, 'Sol': 7, 'Sol#': 8, 'Lá': 9, 'Lá#': 10, 'Si': 11 };
    return tabela[nome];
  };

  function responder(chave, tecla) {
    const semitom = semitomDaTecla(chave);
    const oitava = Number(chave.slice(-1));
    const alvoAtual = esperado[passo];
    const certo = semitom === alvoAtual.semitom && (config.modo !== 'escala' || oitava === alvoAtual.oitava);
    if (certo) {
      tecla.classList.add('marcada', 'certa');
      tocarFrequencia(440 * Math.pow(2, (semitom - 9 + (oitava - 4) * 12) / 12), { duracao: 0.4 });
      passo++;
      if (passo >= esperado.length) {
        acertos++;
        efeito('acerto');
        alvo.querySelector('#pontos').textContent = `${acertos} acerto${acertos === 1 ? '' : 's'}`;
        setTimeout(novaRodada, 500);
      }
    } else {
      erros++;
      efeito('erro');
      tecla.classList.add('errada');
      setTimeout(() => tecla.classList.remove('errada'), 300);
    }
  }

  novaRodada();
}

// --------------------------------------------------------------- jogo: ouvido
function jogoOuvido(config, alvo, aoTerminar) {
  const rnd = criarAleatorio(novaSemente());
  const rodadasTotais = 8;
  let rodada = 0;
  let acertos = 0;
  let resposta = null;

  const opcoes = config.modo === 'intensidade'
    ? ['crescendo', 'diminuendo', 'sempre igual']
    : ['subiu', 'desceu', 'ficou igual'];

  alvo.innerHTML = `<p class="instrucao">${config.modo === 'intensidade'
    ? 'Ouça as três notas e diga o que aconteceu com a intensidade.'
    : 'Ouça as duas notas e diga o que aconteceu com a altura.'}</p>
    <div class="placar-jogo"><span id="rodada"></span><span id="pontos">0 acertos</span></div>
    <div class="acoes-jogo"><button class="botao" id="tocar">▶ Ouvir de novo</button></div>
    <div class="botoes-notas" id="opcoes"></div>`;

  const tocar = () => {
    if (config.modo === 'intensidade') {
      const volumes = resposta === 'crescendo' ? [0.06, 0.16, 0.3] : resposta === 'diminuendo' ? [0.3, 0.16, 0.06] : [0.2, 0.2, 0.2];
      volumes.forEach((volume, i) => tocarFrequencia(frequencia('Sol', 4), { duracao: 0.45, volume, atraso: i * 0.55 }));
    } else {
      const base = inteiro(rnd, 0, 6);
      const segunda = resposta === 'ficou igual' ? base : resposta === 'subiu' ? Math.min(6, base + inteiro(rnd, 1, 4)) : Math.max(0, base - inteiro(rnd, 1, 4));
      const ajustado = segunda === base && resposta !== 'ficou igual' ? (resposta === 'subiu' ? base + 1 : base - 1) : segunda;
      tocarSequencia([
        frequencia(T.LETRAS[base], 4), frequencia(T.LETRAS[(ajustado + 7) % 7], ajustado > 6 ? 5 : ajustado < 0 ? 3 : 4),
      ], { intervalo: 0.7, duracao: 0.6 });
    }
  };

  const novaRodada = () => {
    rodada++;
    if (rodada > rodadasTotais) {
      efeito('vitoria');
      aoTerminar(Math.round((acertos / rodadasTotais) * 100), `${acertos} de ${rodadasTotais} de ouvido`);
      return;
    }
    alvo.querySelector('#rodada').textContent = `Rodada ${rodada} de ${rodadasTotais}`;
    resposta = sortear(opcoes, rnd);
    setTimeout(tocar, 350);
  };

  alvo.querySelector('#tocar').addEventListener('click', tocar);
  const caixa = alvo.querySelector('#opcoes');
  opcoes.forEach((opcao) => {
    const botao = criar(`<button class="botao-nota largo">${opcao}</button>`);
    botao.addEventListener('click', () => {
      if (opcao === resposta) { acertos++; efeito('acerto'); botao.classList.add('certo'); } else { efeito('erro'); botao.classList.add('errado'); }
      alvo.querySelector('#pontos').textContent = `${acertos} acerto${acertos === 1 ? '' : 's'}`;
      setTimeout(() => { botao.classList.remove('certo', 'errado'); novaRodada(); }, 500);
    });
    caixa.appendChild(botao);
  });

  novaRodada();
}

// ---------------------------------------------------------------- jogo: pulso
function jogoPulso(config, alvo, aoTerminar) {
  const compasso = config.compasso || '4/4';
  const porCompasso = compasso === '6/8' ? 2 : Number(compasso.split('/')[0]);
  const bpm = inteiro(criarAleatorio(novaSemente()), 60, 120);
  const metronomo = new Metronomo({ bpm, porCompasso });
  const batidas = [];
  const toques = [];
  let rodando = false;

  alvo.innerHTML = `<p class="instrucao">Ligue o metrônomo (${bpm} bpm, compasso ${compasso}) e toque no círculo junto com cada batida.
    Depois de 16 toques o app mostra a sua precisão.</p>
    <div class="placar-jogo"><span id="toques">0 toques</span><span id="desvio">—</span></div>
    <div class="acoes-jogo"><button class="botao" id="ligar">▶ Ligar metrônomo</button></div>
    <button class="alvo-pulso" id="bater">TOQUE<br><span>aqui</span></button>`;

  metronomo.aoBater = (numero, forte, quando) => {
    batidas.push(quando);
    const bola = alvo.querySelector('#bater');
    bola.classList.add(forte ? 'forte' : 'fraco');
    setTimeout(() => bola.classList.remove('forte', 'fraco'), 120);
  };

  alvo.querySelector('#ligar').addEventListener('click', (evento) => {
    rodando = !rodando;
    if (rodando) { metronomo.comecar(); evento.target.textContent = '■ Parar'; } else { metronomo.parar(); evento.target.textContent = '▶ Ligar metrônomo'; }
  });

  alvo.querySelector('#bater').addEventListener('click', () => {
    if (!rodando) return;
    const agora = (window.performance.now() / 1000);
    toques.push(agora);
    alvo.querySelector('#toques').textContent = `${toques.length} toques`;
    if (toques.length >= 16) {
      metronomo.parar();
      rodando = false;
      // Precisão medida pela regularidade dos intervalos entre os toques.
      const intervalos = toques.slice(1).map((t, i) => t - toques[i]);
      const media = intervalos.reduce((a, b) => a + b, 0) / intervalos.length;
      const desvio = intervalos.reduce((a, b) => a + Math.abs(b - media), 0) / intervalos.length;
      const bpmDoAluno = Math.round(60 / media);
      const erroBpm = Math.abs(bpmDoAluno - bpm);
      const pontos = Math.max(0, Math.round(100 - desvio * 400 - erroBpm * 3));
      alvo.querySelector('#desvio').textContent = `${bpmDoAluno} bpm`;
      efeito(pontos > 60 ? 'vitoria' : 'erro');
      aoTerminar(pontos, `você bateu a ${bpmDoAluno} bpm (o metrônomo estava em ${bpm}), com oscilação média de ${Math.round(desvio * 1000)} ms`);
    }
  });

  alvo._parar = () => metronomo.parar();
}

// ------------------------------------------------------------- jogo: armadura
function jogoArmadura(config, alvo, aoTerminar) {
  const rnd = criarAleatorio(novaSemente());
  const rodadasTotais = 8;
  let rodada = 0;
  let acertos = 0;
  let correta = '';

  alvo.innerHTML = `<p class="instrucao">Olhe a armadura e escolha a tonalidade maior correspondente.</p>
    <div class="placar-jogo"><span id="rodada"></span><span id="pontos">0 acertos</span></div>
    <div class="palco"></div><div class="botoes-notas" id="opcoes"></div>`;
  const palco = alvo.querySelector('.palco');
  const caixa = alvo.querySelector('#opcoes');

  const novaRodada = () => {
    rodada++;
    if (rodada > rodadasTotais) {
      efeito('vitoria');
      aoTerminar(Math.round((acertos / rodadasTotais) * 100), `${acertos} de ${rodadasTotais} armaduras`);
      return;
    }
    alvo.querySelector('#rodada').textContent = `Rodada ${rodada} de ${rodadasTotais}`;
    const tonalidade = sortear(T.TONALIDADES.filter((t) => t.acidentes <= 5), rnd);
    const clave = sortear(['sol', 'fa'], rnd);
    correta = T.nomeDaTonalidade(tonalidade, 'maior');
    palco.innerHTML = pentagrama({ clave, armadura: { letras: T.armaduraDe(tonalidade), tipo: tonalidade.tipo }, largura: 260 });
    const erradas = embaralhar(T.TONALIDADES.filter((t) => T.nomeDaTonalidade(t, 'maior') !== correta), rnd)
      .slice(0, 3).map((t) => T.nomeDaTonalidade(t, 'maior'));
    caixa.innerHTML = '';
    embaralhar([correta, ...erradas], rnd).forEach((opcao) => {
      const botao = criar(`<button class="botao-nota largo">${opcao}</button>`);
      botao.addEventListener('click', () => {
        if (opcao === correta) { acertos++; efeito('acerto'); botao.classList.add('certo'); } else { efeito('erro'); botao.classList.add('errado'); }
        alvo.querySelector('#pontos').textContent = `${acertos} acerto${acertos === 1 ? '' : 's'}`;
        setTimeout(novaRodada, 500);
      });
      caixa.appendChild(botao);
    });
  };

  novaRodada();
}

const JOGOS = {
  memoria: jogoMemoria,
  pentagrama: jogoPentagrama,
  ritmo: jogoRitmo,
  teclado: jogoTeclado,
  ouvido: jogoOuvido,
  pulso: jogoPulso,
  armadura: jogoArmadura,
};

export function iniciarJogo(config, alvo, aoTerminar) {
  if (alvo._parar) { alvo._parar(); alvo._parar = null; }
  const jogo = JOGOS[config.tipo] || jogoMemoria;
  jogo(config, alvo, aoTerminar);
}

export function pararJogo(alvo) {
  if (alvo && alvo._parar) { alvo._parar(); alvo._parar = null; }
}

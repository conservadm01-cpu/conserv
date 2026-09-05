// Desenho da notação em SVG puro: pentagrama com claves, armadura, notas,
// figuras rítmicas soltas e teclado. Nada de fonte musical externa — tudo é
// traçado aqui, para o app continuar igual offline e em qualquer celular.

import { CLAVES, LETRAS, ORDEM_BEMOIS, ORDEM_SUSTENIDOS, posicaoDaNota } from './musica.js';

const ESPACO = 10; // distância entre duas linhas do pentagrama
const TOPO = 30; // y da 5ª linha (a de cima)

// y da posição: 0 = 1ª linha (a de baixo)
const yDaPosicao = (posicao) => TOPO + 4 * ESPACO - (posicao * ESPACO) / 2;

const escape = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CLAVE_SOL = `
  <path d="M11 50 C6 50, 5 43, 10.5 42 C17.5 41, 20 49, 17.5 56 C14.5 64, 5.5 64, 3.5 55.5
           C1 44, 9 34, 13 27 C17 19, 18 10, 14 4 C10 -1, 6 6, 8 14 C10.5 25, 16 34, 17.5 44
           C19.5 56, 19 66, 14 70.5 C10 74, 4.5 71, 4.5 66 C4.5 62, 9 60.5, 10 64"
        fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`;

const CLAVE_FA = `
  <circle cx="5" cy="10" r="3.4" fill="currentColor"/>
  <path d="M5 10 C14 5, 22 12, 21.5 23 C21 37, 12 46, 2 52"
        fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="26" cy="6" r="1.9" fill="currentColor"/>
  <circle cx="26" cy="14" r="1.9" fill="currentColor"/>`;

const CLAVE_DO = `
  <rect x="0" y="0" width="2.6" height="40" fill="currentColor"/>
  <rect x="4" y="0" width="1.4" height="40" fill="currentColor"/>
  <path d="M8 0 C16 3, 12 15, 17 20 C12 25, 16 37, 8 40" fill="none" stroke="currentColor" stroke-width="2.6"/>
  <path d="M18 0 C26 3, 22 15, 27 20 C22 25, 26 37, 18 40" fill="none" stroke="currentColor" stroke-width="2.6"/>`;

const SUSTENIDO = `<g stroke="currentColor" fill="none" stroke-width="1.5">
    <path d="M2 4 L2 16"/><path d="M6 3 L6 15"/>
    <path d="M0 8.5 L8 6.5" stroke-width="2.2"/><path d="M0 12.5 L8 10.5" stroke-width="2.2"/></g>`;
const BEMOL = `<g stroke="currentColor" fill="none" stroke-width="1.5">
    <path d="M2 1 L2 15"/>
    <path d="M2 8 C7 5, 9 10, 2 15" stroke-width="1.6"/></g>`;
const BEQUADRO = `<g stroke="currentColor" fill="none" stroke-width="1.5">
    <path d="M2 2 L2 13"/><path d="M8 5 L8 16"/>
    <path d="M2 6 L8 5"/><path d="M2 12 L8 11"/></g>`;

const ACIDENTES = { 1: SUSTENIDO, '-1': BEMOL, 0: BEQUADRO };
const ALTURA_ACIDENTE = { 1: 9.5, '-1': 8, 0: 9 };

function cabeca(x, y, aberta) {
  return `<ellipse cx="${x}" cy="${y}" rx="6.2" ry="4.4" transform="rotate(-20 ${x} ${y})"
    fill="${aberta ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="${aberta ? 2 : 1.2}"/>`;
}

function bandeirola(x, y, quantidade, paraCima) {
  let saida = '';
  for (let i = 0; i < quantidade; i++) {
    const deslocamento = i * 7 * (paraCima ? 1 : -1);
    saida += paraCima
      ? `<path d="M${x} ${y + deslocamento} C${x + 9} ${y + 6 + deslocamento}, ${x + 9} ${y + 14 + deslocamento}, ${x + 3} ${y + 20 + deslocamento}"
          fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`
      : `<path d="M${x} ${y + deslocamento} C${x + 9} ${y - 6 + deslocamento}, ${x + 9} ${y - 14 + deslocamento}, ${x + 3} ${y - 20 + deslocamento}"
          fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return saida;
}

const BANDEIROLAS = { semibreve: 0, minima: 0, seminima: 0, colcheia: 1, semicolcheia: 2, fusa: 3, semifusa: 4 };
const ABERTAS = ['semibreve', 'minima'];

// Uma nota completa (cabeça + haste + bandeirolas + ponto), desenhada em torno
// de (x, y). hasteParaCima decide o lado.
export function desenharNota(x, y, figura = 'seminima', { hasteParaCima = true, pontuada = false } = {}) {
  let saida = cabeca(x, y, ABERTAS.includes(figura));
  if (figura !== 'semibreve') {
    const xHaste = hasteParaCima ? x + 5.6 : x - 5.6;
    const yFim = hasteParaCima ? y - 32 : y + 32;
    saida += `<line x1="${xHaste}" y1="${y}" x2="${xHaste}" y2="${yFim}" stroke="currentColor" stroke-width="1.8"/>`;
    saida += bandeirola(xHaste, yFim, BANDEIROLAS[figura], hasteParaCima);
  }
  if (pontuada) saida += `<circle cx="${x + 11}" cy="${y - 5}" r="1.9" fill="currentColor"/>`;
  return saida;
}

// Pausas: cada figura tem o seu desenho próprio.
export function desenharPausa(x, y, figura = 'seminima') {
  switch (figura) {
    case 'semibreve': // pendurada na 4ª linha
      return `<line x1="${x - 9}" y1="${y - 10}" x2="${x + 9}" y2="${y - 10}" stroke="currentColor" stroke-width="0.9" opacity="0.45"/>
              <rect x="${x - 6}" y="${y - 10}" width="12" height="5" fill="currentColor"/>`;
    case 'minima': // sentada na 3ª linha
      return `<line x1="${x - 9}" y1="${y}" x2="${x + 9}" y2="${y}" stroke="currentColor" stroke-width="0.9" opacity="0.45"/>
              <rect x="${x - 6}" y="${y - 5}" width="12" height="5" fill="currentColor"/>`;
    case 'seminima':
      return `<path d="M${x - 3} ${y - 14} C${x + 4} ${y - 8}, ${x - 4} ${y - 6}, ${x + 3} ${y}
                       C${x - 5} ${y - 3}, ${x + 1} ${y + 8}, ${x + 4} ${y + 12}
                       C${x - 2} ${y + 8}, ${x - 6} ${y + 4}, ${x - 1} ${y + 2}
                       C${x - 6} ${y - 2}, ${x - 6} ${y - 10}, ${x - 3} ${y - 14} Z" fill="currentColor"/>`;
    default: {
      const ganchos = { colcheia: 1, semicolcheia: 2, fusa: 3, semifusa: 4 }[figura] || 1;
      let saida = `<line x1="${x + 3}" y1="${y - 8}" x2="${x - 2}" y2="${y + 10}" stroke="currentColor" stroke-width="1.8"/>`;
      for (let i = 0; i < ganchos; i++) {
        const yg = y - 8 + i * 6;
        saida += `<circle cx="${x + 1}" cy="${yg}" r="2" fill="currentColor"/>
                  <path d="M${x + 1} ${yg} C${x - 2} ${yg + 3}, ${x - 4} ${yg + 3}, ${x - 5} ${yg + 1}"
                        fill="none" stroke="currentColor" stroke-width="1.6"/>`;
      }
      return saida;
    }
  }
}

function linhasSuplementares(x, posicao) {
  let saida = '';
  for (let p = 10; p <= posicao; p += 2) saida += `<line x1="${x - 11}" y1="${yDaPosicao(p)}" x2="${x + 11}" y2="${yDaPosicao(p)}" stroke="currentColor" stroke-width="1.3"/>`;
  for (let p = -2; p >= posicao; p -= 2) saida += `<line x1="${x - 11}" y1="${yDaPosicao(p)}" x2="${x + 11}" y2="${yDaPosicao(p)}" stroke="currentColor" stroke-width="1.3"/>`;
  return saida;
}

function desenharClave(claveId) {
  if (claveId === 'sol') return `<g transform="translate(12 ${yDaPosicao(2) - 50})" class="clave">${CLAVE_SOL}</g>`;
  if (claveId === 'fa') return `<g transform="translate(12 ${yDaPosicao(6) - 10})" class="clave">${CLAVE_FA}</g>`;
  return `<g transform="translate(12 ${yDaPosicao(8)})" class="clave">${CLAVE_DO}</g>`;
}

// Posição vertical de cada acidente da armadura, por clave. Os acidentes
// caminham sempre uma 4ª abaixo / uma 5ª acima (3 e 4 posições no pentagrama),
// que é a ordem gráfica clássica da armadura de clave.
const INICIO_DA_ARMADURA = {
  sol: { sustenido: 8, bemol: 4 },
  fa: { sustenido: 6, bemol: 2 },
  do: { sustenido: 7, bemol: 3 },
};
const PASSOS = { sustenido: [-3, 4, -3, -3, 4, -3], bemol: [3, -4, 3, -4, 3, -4] };

export function posicoesDaArmadura(claveId, tipo, quantidade) {
  const posicoes = [INICIO_DA_ARMADURA[claveId][tipo]];
  for (let i = 0; i < quantidade - 1; i++) posicoes.push(posicoes[i] + PASSOS[tipo][i]);
  return posicoes.slice(0, quantidade);
}

export function desenharArmadura(claveId, letras, tipo, xInicial) {
  const posicoes = posicoesDaArmadura(claveId, tipo, letras.length);
  let x = xInicial;
  let saida = '';
  letras.forEach((letra, i) => {
    const y = yDaPosicao(posicoes[i]);
    const glifo = tipo === 'bemol' ? BEMOL : SUSTENIDO;
    saida += `<g transform="translate(${x} ${y - ALTURA_ACIDENTE[tipo === 'bemol' ? -1 : 1]})">${glifo}</g>`;
    x += tipo === 'bemol' ? 9.5 : 11;
  });
  return { svg: saida, x };
}

/**
 * Pentagrama completo.
 * notas: [{ letra, oitava, alteracao, figura, pausa, pontuada }]
 */
export function pentagrama({
  clave = 'sol', armadura = null, compasso = null, notas = [], largura = 320, rotulos = null, destaque = -1,
} = {}) {
  const altura = 130;
  let corpo = '';
  for (let i = 0; i < 5; i++) {
    const y = TOPO + i * ESPACO;
    corpo += `<line x1="6" y1="${y}" x2="${largura - 6}" y2="${y}" stroke="currentColor" stroke-width="1.2"/>`;
  }
  corpo += desenharClave(clave);
  let x = clave === 'do' ? 48 : 42;

  if (armadura && armadura.letras && armadura.letras.length) {
    const resultado = desenharArmadura(clave, armadura.letras, armadura.tipo, x);
    corpo += resultado.svg;
    x = resultado.x + 6;
  }
  if (compasso) {
    const [cima, baixo] = String(compasso).split('/');
    corpo += `<text x="${x + 10}" y="${yDaPosicao(6) + 7}" class="formula" text-anchor="middle">${escape(cima)}</text>
              <text x="${x + 10}" y="${yDaPosicao(2) + 7}" class="formula" text-anchor="middle">${escape(baixo)}</text>`;
    x += 26;
  }

  const passo = Math.max(30, (largura - x - 20) / Math.max(notas.length, 1));
  notas.forEach((n, i) => {
    const cx = x + 18 + i * passo;
    if (n.interrogacao) {
      corpo += `<text x="${cx}" y="${yDaPosicao(4) + 9}" class="interrogacao" text-anchor="middle">?</text>`;
    } else if (n.pausa) {
      corpo += `<g class="${i === destaque ? 'destacada' : ''}">${desenharPausa(cx, yDaPosicao(4), n.figura || 'seminima')}</g>`;
    } else {
      const posicao = posicaoDaNota(clave, n.letra, n.oitava);
      const y = yDaPosicao(posicao);
      corpo += linhasSuplementares(cx, posicao);
      if (n.alteracao) corpo += `<g transform="translate(${cx - 20} ${y - ALTURA_ACIDENTE[n.alteracao]})">${ACIDENTES[n.alteracao]}</g>`;
      corpo += `<g class="${i === destaque ? 'destacada' : ''}">${desenharNota(cx, y, n.figura || 'seminima', {
        hasteParaCima: posicao < 4, pontuada: n.pontuada,
      })}</g>`;
    }
    if (rotulos && rotulos[i]) corpo += `<text x="${cx}" y="${altura - 8}" class="rotulo" text-anchor="middle">${escape(rotulos[i])}</text>`;
  });

  return `<svg viewBox="0 0 ${largura} ${altura}" class="pentagrama" role="img" xmlns="http://www.w3.org/2000/svg">${corpo}</svg>`;
}

// Figura solta (usada nos exercícios de ritmo e nos jogos de memória).
export function figuraSolta(figura, { pausa = false, pontuada = false, tamanho = 78 } = {}) {
  const corpo = pausa ? desenharPausa(30, 44, figura) : desenharNota(26, 56, figura, { hasteParaCima: true, pontuada });
  return `<svg viewBox="0 0 60 76" width="${tamanho * 0.79}" height="${tamanho}" class="figura" xmlns="http://www.w3.org/2000/svg">${corpo}</svg>`;
}

// Um compasso com uma sequência de figuras, para leitura rítmica.
export function compassoRitmico(sequencia, { formula = '4/4', largura = 320, destaque = -1 } = {}) {
  return pentagrama({
    clave: 'sol',
    compasso: formula,
    largura,
    destaque,
    notas: sequencia.map((item) => ({ letra: 'Si', oitava: 4, figura: item.figura, pausa: item.pausa, pontuada: item.pontuada })),
  });
}

// ------------------------------------------------------------------ teclado

const BRANCAS = ['Dó', 'Ré', 'Mi', 'Fá', 'Sol', 'Lá', 'Si'];
const PRETAS = [0, 1, 3, 4, 5]; // depois de Dó, Ré, Fá, Sol, Lá

export function teclado({ oitavas = 1, marcadas = {}, rotulos = true, interativo = false, larguraTecla = 30 } = {}) {
  const alturaBranca = 110;
  const total = oitavas * 7 + 1;
  const largura = total * larguraTecla;
  let corpo = '';
  for (let i = 0; i < total; i++) {
    const letra = BRANCAS[i % 7];
    const oitava = 4 + Math.floor(i / 7);
    const chave = `${letra}${oitava}`;
    const cor = marcadas[chave];
    corpo += `<rect data-tecla="${chave}" x="${i * larguraTecla}" y="0" width="${larguraTecla - 1}" height="${alturaBranca}"
      rx="3" class="tecla branca ${cor ? 'marcada ' + cor : ''} ${interativo ? 'clicavel' : ''}"/>`;
    if (rotulos) corpo += `<text x="${i * larguraTecla + larguraTecla / 2 - 0.5}" y="${alturaBranca - 8}" class="rotulo-tecla" text-anchor="middle">${letra}</text>`;
  }
  for (let i = 0; i < total - 1; i++) {
    if (!PRETAS.includes(i % 7)) continue;
    const letra = BRANCAS[i % 7];
    const oitava = 4 + Math.floor(i / 7);
    const chave = `${letra}#${oitava}`;
    const cor = marcadas[chave];
    corpo += `<rect data-tecla="${chave}" x="${i * larguraTecla + larguraTecla * 0.66}" y="0"
      width="${larguraTecla * 0.62}" height="${alturaBranca * 0.62}" rx="2"
      class="tecla preta ${cor ? 'marcada ' + cor : ''} ${interativo ? 'clicavel' : ''}"/>`;
  }
  return `<svg viewBox="0 0 ${largura} ${alturaBranca}" class="teclado" xmlns="http://www.w3.org/2000/svg">${corpo}</svg>`;
}

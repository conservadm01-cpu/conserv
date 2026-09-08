// Sorteio com semente: a mesma semente devolve sempre a mesma prova, o que
// permite refazer uma avaliação exatamente como ela caiu (e conferir um
// certificado) sem guardar as perguntas inteiras.

export function novaSemente() {
  const buffer = new Uint32Array(1);
  (globalThis.crypto || {}).getRandomValues?.(buffer);
  return buffer[0] || Math.floor(Math.random() * 4294967295);
}

export function criarAleatorio(semente) {
  let estado = (semente >>> 0) || 1;
  return function aleatorio() {
    estado |= 0;
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function inteiro(rnd, minimo, maximo) {
  return minimo + Math.floor(rnd() * (maximo - minimo + 1));
}

export function sortear(lista, rnd) {
  return lista[Math.floor(rnd() * lista.length)];
}

export function embaralhar(lista, rnd) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Sorteia n itens distintos, sem repetir.
export function sortearVarios(lista, n, rnd) {
  return embaralhar(lista, rnd).slice(0, n);
}

// Hash estável de texto (assinatura de pergunta, código de certificado).
export function hash(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase();
}

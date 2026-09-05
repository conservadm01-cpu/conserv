// Ferramentas comuns aos geradores de pergunta (MSA e instrumento).

import { embaralhar } from '../aleatorio.js';

// Monta as alternativas: a certa e as erradas tiradas do repertório do assunto.
export function alternativas(correta, repertorio, rnd, quantidade = 4) {
  const vistas = new Set([String(correta)]);
  const distratores = [];
  for (const item of embaralhar(repertorio, rnd)) {
    const texto = String(item);
    if (vistas.has(texto)) continue;
    vistas.add(texto);
    distratores.push(texto);
    if (distratores.length === quantidade - 1) break;
  }
  return embaralhar([String(correta), ...distratores], rnd);
}

export const pares = (lista) => lista.flatMap((a, i) => lista.slice(i + 1).map((b) => [a, b]));

export const maiuscula = (texto) => String(texto).charAt(0).toUpperCase() + String(texto).slice(1);

export const ORDINAIS = ['', '1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º'];

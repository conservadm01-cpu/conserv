import { ErroApp } from './erros.js';

export function texto(valor, campo, { obrigatorio = false, max = 300 } = {}) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    if (obrigatorio) throw new ErroApp(`Informe ${campo}.`);
    return null;
  }
  const limpo = String(valor).trim().replace(/\s+/g, ' ');
  if (limpo.length > max) throw new ErroApp(`${campo} passa de ${max} caracteres.`);
  return limpo;
}

export function inteiro(valor, campo, { obrigatorio = false, min = null, max = null } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw new ErroApp(`Informe ${campo}.`);
    return null;
  }
  const n = Number(valor);
  if (!Number.isInteger(n)) throw new ErroApp(`${campo} precisa ser um número inteiro.`);
  if (min !== null && n < min) throw new ErroApp(`${campo} não pode ser menor que ${min}.`);
  if (max !== null && n > max) throw new ErroApp(`${campo} não pode ser maior que ${max}.`);
  return n;
}

export function numero(valor, campo, { obrigatorio = false, min = null, max = null } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw new ErroApp(`Informe ${campo}.`);
    return null;
  }
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new ErroApp(`${campo} precisa ser um número.`);
  if (min !== null && n < min) throw new ErroApp(`${campo} não pode ser menor que ${min}.`);
  if (max !== null && n > max) throw new ErroApp(`${campo} não pode ser maior que ${max}.`);
  return n;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function data(valor, campo, { obrigatorio = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw new ErroApp(`Informe ${campo}.`);
    return null;
  }
  const limpo = String(valor).trim().slice(0, 10);
  if (!DATA.test(limpo) || Number.isNaN(Date.parse(limpo))) {
    throw new ErroApp(`${campo} precisa estar no formato AAAA-MM-DD.`);
  }
  return limpo;
}

export function opcao(valor, campo, opcoes, { obrigatorio = false, padrao = null } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw new ErroApp(`Informe ${campo}.`);
    return padrao;
  }
  const limpo = String(valor).trim();
  if (!opcoes.includes(limpo)) {
    throw new ErroApp(`${campo} precisa ser: ${opcoes.join(', ')}.`);
  }
  return limpo;
}

export function booleano(valor, padrao = true) {
  if (valor === undefined || valor === null || valor === '') return padrao ? 1 : 0;
  if (typeof valor === 'boolean') return valor ? 1 : 0;
  const s = String(valor).trim().toLowerCase();
  return ['1', 'true', 'sim', 'on'].includes(s) ? 1 : 0;
}

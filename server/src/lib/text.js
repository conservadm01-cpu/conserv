/** Normaliza texto vindo de planilha: colapsa espaços, tira acentos duplicados de caixa. */
export function limpar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && value.text) return limpar(value.text);
  if (typeof value === 'object' && value.richText) {
    return limpar(value.richText.map((r) => r.text).join(''));
  }
  if (typeof value === 'object' && value.result !== undefined) return limpar(value.result);
  const str = String(value).replace(/\s+/g, ' ').trim();
  return str === '' ? null : str;
}

/** Forma canônica para deduplicar cadastros ("Duo  Indústria " ≡ "DUO INDUSTRIA"). */
export function chave(value) {
  const str = limpar(value);
  if (!str) return null;
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const maiuscula = (value) => {
  const str = limpar(value);
  return str ? str.toUpperCase() : null;
};

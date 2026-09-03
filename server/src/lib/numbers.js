/** Converte texto/planilha ("R$ 1.234,50", "1,5", 12) em número; null quando não dá. */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object' && value.result !== undefined) return toNumber(value.result);
  let str = String(value).trim().replace(/[R$\s]/gi, '');
  if (!str || /^#/.test(str)) return null; // #REF!, #N/D etc.
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

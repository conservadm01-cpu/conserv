/** Converte Date | string | número serial do Excel em 'YYYY-MM-DD' (ou null). */
export function toISODate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    // Serial do Excel: dias desde 1899-12-30 (base do sistema 1900 já com o bug do ano bissexto).
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const br = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const [, d, m, y] = br;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export const hoje = () => new Date().toISOString().slice(0, 10);

/** Semana ISO 8601 (1-53) de uma data 'YYYY-MM-DD'. */
export function semanaISO(isoDate) {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/** Dias de atraso em relação a hoje (0 quando ainda está no prazo). */
export function diasAtraso(dataPrevista, referencia = hoje()) {
  if (!dataPrevista) return 0;
  const diff = (new Date(`${referencia}T00:00:00Z`) - new Date(`${dataPrevista}T00:00:00Z`)) / 86400000;
  return diff > 0 ? Math.floor(diff) : 0;
}

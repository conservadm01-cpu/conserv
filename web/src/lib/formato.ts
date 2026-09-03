const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUMERO = new Intl.NumberFormat('pt-BR');
const DECIMAL = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export const moeda = (v: number | null | undefined) => MOEDA.format(Number(v ?? 0));
export const numero = (v: number | null | undefined) => NUMERO.format(Number(v ?? 0));
export const decimal = (v: number | null | undefined) => DECIMAL.format(Number(v ?? 0));

/** Formato compacto para cartões de indicador: R$ 1,2 mi / R$ 419,7 mil. */
export function moedaCurta(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  if (Math.abs(n) >= 1_000_000) return `R$ ${DECIMAL.format(n / 1_000_000)} mi`;
  if (Math.abs(n) >= 1_000) return `R$ ${DECIMAL.format(n / 1_000)} mil`;
  return MOEDA.format(n);
}

export function data(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const mesCurto = (mm: string) => MESES[Number(mm) - 1]?.slice(0, 3) ?? mm;

export const hoje = () => new Date().toISOString().slice(0, 10);

export const ROTULO_STATUS: Record<string, string> = {
  ABERTA: 'Aberta',
  EM_PRODUCAO: 'Em produção',
  CONCLUIDA: 'Concluída',
  ENTREGUE: 'Entregue',
  CANCELADA: 'Cancelada',
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  NAO_APLICAVEL: 'Não se aplica',
  ABERTO: 'Aberto',
  FATURADO: 'Faturado',
  CANCELADO: 'Cancelado',
};

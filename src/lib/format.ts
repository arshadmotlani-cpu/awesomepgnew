/**
 * Display helpers. Money is stored as integer paise everywhere; UI converts.
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** Coerce SQL/driver values (bigint, numeric strings) to finite numbers for UI + RSC. */
export function asPlainNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Paise amounts for ledger/booking math — never negative, never NaN/bigint. */
export function coerceNonNegativePaise(value: unknown): number {
  return Math.max(0, Math.round(asPlainNumber(value)));
}

export function paiseToInr(paise: number | bigint | string | null | undefined): string {
  return inrFormatter.format(asPlainNumber(paise) / 100);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** ISO YYYY-MM-DD → DD/MM/YYYY for checkout-cap user messages. */
export function formatDateDdMmYyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

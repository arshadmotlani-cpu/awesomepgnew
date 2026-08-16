/**
 * Display helpers. Money is stored as integer paise everywhere; UI converts.
 * Indian numbering (en-IN): 3300000 → ₹33,00,000
 */

const inrNumberFormatter = new Intl.NumberFormat('en-IN', {
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

/**
 * Format rupee amount with Indian grouping (no currency symbol).
 * formatInrAmount(3300000) → "33,00,000"
 */
export function formatInrAmount(
  rupees: number,
  opts?: { decimals?: number; allowNegative?: boolean },
): string {
  const value = opts?.allowNegative ? rupees : Math.abs(rupees);
  const hasDecimals = opts?.decimals != null || !Number.isInteger(value);
  const decimals = opts?.decimals ?? (Number.isInteger(value) ? 0 : 2);
  const formatter =
    decimals > 0
      ? new Intl.NumberFormat('en-IN', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : inrNumberFormatter;
  const formatted = formatter.format(value);
  return rupees < 0 && opts?.allowNegative ? `-${formatted}` : formatted;
}

/** formatInrFromRupees(3300000) → "₹33,00,000" */
export function formatInrFromRupees(rupees: number, decimals?: number): string {
  const formatted = formatInrAmount(rupees, { decimals });
  return `₹${formatted}`;
}

/** Alias: paise → ₹ with Indian grouping. */
export function paiseToInr(paise: number | bigint | string | null | undefined): string {
  return formatInrFromRupees(asPlainNumber(paise) / 100);
}

/** Parse user input: strips ₹, commas, spaces. Returns rupees as number. */
export function parseInrAmountInput(raw: string): number {
  const cleaned = raw.replace(/[₹,\s]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format percentage with sensible precision.
 * formatPercent(8) → "8%", formatPercent(8.5) → "8.5%"
 */
export function formatPercent(value: number, maxDecimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  const rounded =
    maxDecimals === 0
      ? Math.round(value)
      : Number(value.toFixed(maxDecimals));
  const str = maxDecimals === 0 ? String(rounded) : rounded.toString();
  return `${str}%`;
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDisplayDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (ISO_DATE_ONLY.test(value)) return new Date(`${value}T00:00:00.000Z`);
  return new Date(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = parseDisplayDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  };
  if (typeof value === 'string' && ISO_DATE_ONLY.test(value)) {
    opts.timeZone = 'UTC';
  }
  return new Intl.DateTimeFormat('en-IN', opts).format(date);
}

/** ISO YYYY-MM-DD → DD/MM/YYYY for checkout-cap user messages. */
export function formatDateDdMmYyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = parseDisplayDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
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

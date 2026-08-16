/**
 * Coerce Owner OS ledger paise from PostgreSQL bigint before math or RSC boundaries.
 */
export function coerceWealthPaise(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  return 0;
}

export function coerceWealthBps(value: unknown): number {
  return coerceWealthPaise(value);
}

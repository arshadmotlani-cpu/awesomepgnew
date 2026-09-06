/**
 * Quick Sale discount % input helpers — whole-number percentages only (0–100).
 * Preserves 0% as "no discount". Does not change basket pricing math beyond integer bps steps.
 */

export function parseWholeDiscountPercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  // Reject decimals and non-digits (1.5, 10.25, etc.)
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

export function wholeDiscountPercentFromBps(discountBps: number): number {
  return Math.min(100, Math.max(0, Math.round(Number(discountBps) / 100)));
}

export function discountBpsFromWholePercent(percent: number): number {
  const pct = Math.min(100, Math.max(0, Math.floor(percent)));
  return pct * 100;
}

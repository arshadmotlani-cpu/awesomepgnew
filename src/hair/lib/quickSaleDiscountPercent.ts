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

export type DiscountPercentDraftParse =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'valid'; percent: number };

/** Parse in-progress discount text. Empty is allowed while editing. */
export function parseDiscountPercentDraft(raw: string): DiscountPercentDraftParse {
  const trimmed = raw.trim();
  if (trimmed === '') return { status: 'empty' };
  const pct = parseWholeDiscountPercent(trimmed);
  if (pct == null) return { status: 'invalid' };
  return { status: 'valid', percent: pct };
}

/** Normalize draft on blur: empty → 0%, invalid → revert to last committed percent. */
export function normalizeDiscountPercentOnBlur(raw: string, committedPercent: number): number {
  const parsed = parseDiscountPercentDraft(raw);
  if (parsed.status === 'valid') return parsed.percent;
  if (parsed.status === 'empty') return 0;
  return committedPercent;
}

export function overridePricePaiseForDiscountPercent(
  catalogGrossPaise: number,
  percent: number,
): number {
  const bps = discountBpsFromWholePercent(percent);
  const discountPaise = Math.round((catalogGrossPaise * bps) / 10_000);
  return Math.max(0, catalogGrossPaise - discountPaise);
}

export function rupeesToPaise(rupees: number): number {
  // Avoid floating-point drift: round with epsilon guard
  if (!Number.isFinite(rupees)) throw new Error('Invalid amount');
  return Math.round(rupees * 100 + Number.EPSILON);
}

export function rupeesStringToPaise(rupees: string): number {
  const trimmed = rupees.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('Invalid rupee amount');
  }
  const [whole, frac = ''] = trimmed.split('.');
  const paise = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return paise;
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatInr(paise: number, opts?: { showPaise?: boolean }): string {
  const rupees = paiseToRupees(paise);
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: opts?.showPaise ? 2 : 0,
    maximumFractionDigits: opts?.showPaise ? 2 : 0,
  }).format(rupees);
  return formatted;
}

export function formatInrPlain(paise: number): string {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupees);
}

/** Format a rupee amount with Indian grouping (no currency symbol). */
export function formatRupeesIndian(
  rupees: number,
  opts?: { maximumFractionDigits?: number },
): string {
  if (!Number.isFinite(rupees)) return '';
  const maxFrac = opts?.maximumFractionDigits ?? 2;
  const hasFrac = Math.abs(rupees % 1) > 1e-9;
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: hasFrac ? Math.min(2, maxFrac) : 0,
    maximumFractionDigits: maxFrac,
  }).format(rupees);
}

/**
 * Parse Indian-formatted rupee text ("4,17,300.50" / "417300") into a number.
 * Returns undefined for empty; throws for invalid.
 */
export function parseIndianRupeesInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(/,/g, '').replace(/₹/g, '').trim();
  if (!/^-?\d+(\.\d{0,2})?$/.test(normalized)) {
    throw new Error('Invalid rupee amount');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) throw new Error('Invalid rupee amount');
  return n;
}

/** Soft-parse for controlled inputs — empty → undefined; invalid → undefined while typing. */
export function tryParseIndianRupeesInput(raw: string): number | undefined {
  try {
    return parseIndianRupeesInput(raw);
  } catch {
    return undefined;
  }
}

export function calcRoiBps(profitPaise: number, investmentPaise: number): number | null {
  if (investmentPaise <= 0) return null;
  return Math.round((profitPaise * 10000) / investmentPaise);
}

export function calcHoldingDays(purchaseDate: string, saleDate?: string | null): number {
  const parseDate = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  };
  const start = parseDate(purchaseDate);
  const end = saleDate ? parseDate(saleDate) : new Date();
  const diff = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/** Settlement % = (capital returned + profit received) / total investment */
export function calcSettlementPctBps(recoveredPaise: number, investmentPaise: number): number | null {
  if (investmentPaise <= 0) return null;
  return Math.min(10000, Math.round((recoveredPaise * 10000) / investmentPaise));
}

export function normalizeRegistration(reg: string): string {
  return reg.trim().toUpperCase().replace(/\s+/g, '');
}

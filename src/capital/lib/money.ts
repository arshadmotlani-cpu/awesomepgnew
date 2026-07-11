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

/** Paise → INR display helpers (Hair UI). Storage and math stay in paise. */

function roundedPaise(paise: number): number {
  return Math.round(Number(paise) || 0);
}

function hasFractionalRupee(paise: number): boolean {
  return roundedPaise(paise) % 100 !== 0;
}

function inrDisplayFractionDigits(paise: number): { minimumFractionDigits: 0 | 2; maximumFractionDigits: 0 | 2 } {
  return hasFractionalRupee(paise)
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { minimumFractionDigits: 0, maximumFractionDigits: 0 };
}

/** Format paise as ₹ with Indian grouping; omits .00 for whole rupees. */
export function formatInrFromPaise(paise: number): string {
  const rounded = roundedPaise(paise);
  const digits = inrDisplayFractionDigits(rounded);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    ...digits,
  }).format(rounded / 100);
}

export function formatInrAmount(rupees: number): string {
  return formatInrFromPaise(Math.round(rupees * 100));
}

/** Numeric rupee string for inputs (no currency symbol); whole amounts omit decimals. */
export function formatRupeeInputFromPaise(paise: number): string {
  const rounded = Math.max(0, roundedPaise(paise));
  if (rounded % 100 === 0) return String(rounded / 100);
  return (rounded / 100).toFixed(2);
}

/** Plain ₹ string for invoice HTML (alias of canonical display). */
export function formatInrPlainFromPaise(paise: number): string {
  return formatInrFromPaise(paise);
}

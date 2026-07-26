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

/** Indian grouping for a digit string (e.g. "960000" → "9,60,000"). */
export function formatIndianDigitGroup(digits: string): string {
  if (!digits) return '';
  const cleaned = digits.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!cleaned) return '0';
  if (cleaned.length <= 3) return cleaned;
  const last3 = cleaned.slice(-3);
  let rest = cleaned.slice(0, -3);
  const parts = [last3];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return parts.join(',');
}

/**
 * Normalize live currency typing into Indian-formatted display text + numeric value.
 * Digits only (optional leading minus / up to 2 decimal places).
 */
export function normalizeIndianRupeesTyping(
  raw: string,
  opts?: { allowNegative?: boolean; allowDecimal?: boolean },
): { text: string; value: number | undefined } {
  const allowNegative = opts?.allowNegative ?? true;
  const allowDecimal = opts?.allowDecimal ?? true;
  let s = raw.replace(/₹/g, '').replace(/\s/g, '');
  if (!s) return { text: '', value: undefined };

  let negative = false;
  if (s.startsWith('-')) {
    if (!allowNegative) return { text: '', value: undefined };
    negative = true;
    s = s.slice(1);
  }
  // Ignore minus typed mid-string
  s = s.replace(/-/g, '');

  if (!allowDecimal) {
    // Ignore anything after a decimal point — whole rupees only
    const digits = s.split('.')[0]!.replace(/\D/g, '');
    if (!digits) return { text: negative ? '-' : '', value: undefined };
    const text = `${negative ? '-' : ''}${formatIndianDigitGroup(digits)}`;
    const n = Number(digits.replace(/^0+(?=\d)/, '') || '0');
    return { text, value: negative ? -n : n };
  }

  // Keep at most one dot; strip other non-digits
  const dot = s.indexOf('.');
  let intRaw: string;
  let fracRaw = '';
  let trailingDot = false;
  if (dot >= 0) {
    intRaw = s.slice(0, dot).replace(/\D/g, '');
    fracRaw = s.slice(dot + 1).replace(/\D/g, '').slice(0, 2);
    trailingDot = fracRaw.length === 0 && s.endsWith('.');
  } else {
    intRaw = s.replace(/\D/g, '');
  }

  if (!intRaw && !fracRaw && !trailingDot) {
    return { text: negative ? '-' : '', value: undefined };
  }

  const intDigits = intRaw === '' ? '0' : intRaw.replace(/^0+(?=\d)/, '');
  const intFormatted = formatIndianDigitGroup(intDigits);
  let text = `${negative ? '-' : ''}${intFormatted}`;
  if (trailingDot) text += '.';
  else if (fracRaw) text += `.${fracRaw}`;

  const normalized = `${negative ? '-' : ''}${intDigits}${fracRaw ? `.${fracRaw}` : ''}`;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return { text, value: undefined };
  // While typing trailing ".", keep display but numeric is still the integer part
  return { text, value: n };
}

/** Map caret to the same digit-count position after reformatting. */
export function caretAfterIndianFormat(
  formatted: string,
  digitsBeforeCaret: number,
): number {
  if (digitsBeforeCaret <= 0) {
    return formatted.startsWith('-') ? 1 : 0;
  }
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]!)) {
      seen++;
      if (seen >= digitsBeforeCaret) return i + 1;
    }
  }
  return formatted.length;
}

export function countDigitsBefore(text: string, caret: number): number {
  let n = 0;
  const end = Math.min(caret, text.length);
  for (let i = 0; i < end; i++) {
    if (/\d/.test(text[i]!)) n++;
  }
  return n;
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

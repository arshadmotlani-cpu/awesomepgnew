/**
 * Indian-English INR amount-in-words (presentation only).
 *
 * Numeric paise/rupees remain the source of truth. Do not persist these strings.
 * Uses Thousand / Lakh / Crore — never million / billion.
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const;

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
] as const;

const CRORE = 10_000_000;

function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t] ?? ''}${o ? ` ${ONES[o]}` : ''}`.trim();
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = h ? `${ONES[h]} Hundred` : '';
  const tail = rest ? twoDigits(rest) : '';
  return [head, tail].filter(Boolean).join(' ');
}

/** Convert a non-negative integer rupee amount (no paise) to Indian grouping words. */
export function integerRupeesToWords(rupees: number): string {
  if (!Number.isFinite(rupees) || rupees < 0) return '';
  const n = Math.floor(rupees);
  if (n === 0) return 'Zero';

  const parts: string[] = [];
  const crore = Math.floor(n / CRORE);
  let rem = n % CRORE;

  if (crore > 0) {
    parts.push(`${integerRupeesToWords(crore)} Crore`);
  }

  const lakh = Math.floor(rem / 100_000);
  rem %= 100_000;
  const thousand = Math.floor(rem / 1000);
  rem %= 1000;

  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rem) parts.push(threeDigits(rem));

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function splitRupeesAndPaise(rupees: number): { rupees: number; paise: number; negative: boolean } {
  const negative = rupees < 0 || Object.is(rupees, -0);
  const abs = Math.abs(rupees);
  const totalPaise = Math.round(abs * 100);
  return {
    negative,
    rupees: Math.floor(totalPaise / 100),
    paise: totalPaise % 100,
  };
}

/**
 * Convert a rupee amount (may include paise as decimals) to
 * "Rupees … Only" / "Negative Rupees … Only".
 */
export function rupeesToIndianWords(rupees: number): string {
  if (!Number.isFinite(rupees)) return '';
  const { rupees: whole, paise, negative } = splitRupeesAndPaise(rupees);
  const rupeeWords = integerRupeesToWords(whole);
  const prefix = negative ? 'Negative Rupees' : 'Rupees';
  if (paise === 0) {
    return `${prefix} ${rupeeWords} Only`;
  }
  return `${prefix} ${rupeeWords} and ${twoDigits(paise)} Paise Only`;
}

/** Convert integer paise to Indian amount-in-words (includes leftover paise). */
export function paiseToIndianWords(paise: number): string {
  if (!Number.isFinite(paise)) return '';
  return rupeesToIndianWords(paise / 100);
}

function stripInrInput(raw: string): string {
  return raw.replace(/₹/g, '').replace(/,/g, '').replace(/\s/g, '').trim();
}

function isEmptyInrInput(stripped: string): boolean {
  return stripped === '' || stripped === '-' || stripped === '.' || stripped === '-.';
}

function isValidInrNumericToken(token: string): boolean {
  return /^-?(?:\d+)(?:\.\d{0,2})?$/.test(token) || /^-?\.\d{1,2}$/.test(token);
}

/**
 * Live input → words.
 * Empty → null (do not show "Rupees Zero Only").
 * Invalid → null (do not guess).
 * "0" → "Rupees Zero Only".
 */
export function inrInputToWords(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const stripped = stripInrInput(raw);
  if (isEmptyInrInput(stripped)) return null;
  const token = stripped.endsWith('.') && stripped !== '.' && stripped !== '-.' ? stripped.slice(0, -1) : stripped;
  if (!isValidInrNumericToken(token)) return null;
  const n = Number(token);
  if (!Number.isFinite(n)) return null;
  return rupeesToIndianWords(n);
}

export function isBlankInrInput(raw: string): boolean {
  return isEmptyInrInput(stripInrInput(raw));
}

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

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'] as const;

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

function rupeesToWords(rupees: number): string {
  if (rupees === 0) return 'Zero';

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1000);
  const hundred = rupees % 1000;

  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Convert paise to Indian English amount in words (rupees only, rounded). */
export function paiseToIndianWords(paise: number): string {
  const rupees = Math.round(Math.max(0, paise) / 100);
  const words = rupeesToWords(rupees);
  return `Rupees ${words} Only`;
}

/** Escape a cell value for RFC 4180 CSV. */
export function escapeCsvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return lines.join('\n');
}

import { formatRupeeInputFromPaise } from '@/src/hair/lib/money';

/** Paise → rupees string for CSV export (whole rupees omit .00). */
export function paiseToCsvRupees(paise: number): string {
  return formatRupeeInputFromPaise(paise);
}

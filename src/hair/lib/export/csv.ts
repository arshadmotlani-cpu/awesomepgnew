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

/** Paise → rupees string for CSV (2 decimal places). */
export function paiseToCsvRupees(paise: number): string {
  return (Math.round(paise) / 100).toFixed(2);
}

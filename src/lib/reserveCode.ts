const PREFIX = 'BRG';
const PAD = 4;

export function formatReserveCode(year: number, sequence: number): string {
  return `${PREFIX}-${year}-${String(sequence).padStart(PAD, '0')}`;
}

export function nextReserveCode(year: number, countInYear: number): string {
  return formatReserveCode(year, countInYear + 1);
}

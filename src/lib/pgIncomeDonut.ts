import { asPlainNumber } from '@/src/lib/format';

export type DonutSlice = {
  pgId: string;
  pgName: string;
  valuePaise: number;
  color: string;
};

export const PG_INCOME_DONUT_PALETTE = [
  '#FF5A1F',
  '#22d3ee',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#60a5fa',
  '#fb923c',
];

export function buildDonutSlices(
  rows: Array<{ pgId: string; pgName: string; incomeTotalPaise: number }>,
): DonutSlice[] {
  return rows.map((row, i) => ({
    pgId: row.pgId,
    pgName: row.pgName,
    valuePaise: asPlainNumber(row.incomeTotalPaise),
    color: PG_INCOME_DONUT_PALETTE[i % PG_INCOME_DONUT_PALETTE.length],
  }));
}

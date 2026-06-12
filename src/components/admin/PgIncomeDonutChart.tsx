'use client';

import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import {
  PG_INCOME_DONUT_PALETTE,
  type DonutSlice,
} from '@/src/lib/pgIncomeDonut';

export type { DonutSlice };

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  if (endAngle - startAngle >= 359.99) {
    endAngle = startAngle + 359.99;
  }
  const outerStart = polar(cx, cy, outerR, startAngle);
  const outerEnd = polar(cx, cy, outerR, endAngle);
  const innerEnd = polar(cx, cy, innerR, endAngle);
  const innerStart = polar(cx, cy, innerR, startAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

export function PgIncomeDonutChart({
  slices,
  totalPaise,
  monthLabel,
}: {
  slices: DonutSlice[];
  totalPaise: number;
  monthLabel: string;
}) {
  const active = slices.filter((s) => s.valuePaise > 0);
  const total = active.reduce((a, s) => a + s.valuePaise, 0) || 1;

  let cursor = 0;
  const arcs = active.map((slice, i) => {
    const sweep = (slice.valuePaise / total) * 360;
    const start = cursor;
    const end = cursor + sweep;
    cursor = end;
    return {
      ...slice,
      d: arcPath(120, 120, 100, 62, start, end),
      pct: Math.round((slice.valuePaise / total) * 1000) / 10,
      color: slice.color || PG_INCOME_DONUT_PALETTE[i % PG_INCOME_DONUT_PALETTE.length],
    };
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">Income by PG</h2>
        <p className="text-xs text-apg-silver">
          Rent + electricity collected · {monthLabel}
        </p>
      </div>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className="relative shrink-0">
          <svg viewBox="0 0 240 240" className="h-52 w-52" aria-hidden>
            {arcs.length === 0 ? (
              <circle cx="120" cy="120" r="100" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="38" />
            ) : (
              arcs.map((a) => (
                <path key={a.pgId} d={a.d} fill={a.color} className="transition-opacity hover:opacity-90" />
              ))
            )}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase tracking-wide text-apg-silver">Total</span>
            <span className="text-lg font-bold text-white">{paiseToInr(totalPaise)}</span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2">
          {active.length === 0 ? (
            <li className="text-sm text-apg-silver">No collections recorded for this month yet.</li>
          ) : (
            arcs.map((a) => (
              <li key={a.pgId}>
                <Link
                  href={`/admin/pgs/${a.pgId}/map`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 transition hover:border-[#FF5A1F]/30 hover:bg-white/[0.04]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: a.color }}
                    />
                    <span className="truncate text-sm font-medium text-white">{a.pgName}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    <span className="font-semibold text-emerald-300">{paiseToInr(a.valuePaise)}</span>
                    <span className="ml-1 text-apg-silver">({a.pct}%)</span>
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

'use client';

import type { RevenueByPgRow } from '@/src/services/revenueCommandCenter';

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function RevenueMtdBarChart({
  rows,
  depositLabel = 'Deposits collected (liability)',
}: {
  rows: RevenueByPgRow[];
  depositLabel?: string;
}) {
  const top = [...rows].sort((a, b) => b.totalRevenuePaise - a.totalRevenuePaise).slice(0, 8);
  const max = Math.max(1, ...top.map((r) => r.totalRevenuePaise));

  return (
    <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <h3 className="text-sm font-semibold text-white">Revenue by PG (MTD)</h3>
      <p className="mt-1 text-xs text-apg-silver">
        SSOT: revenue command center · {depositLabel} shown separately
      </p>
      <ul className="mt-4 space-y-3">
        {top.map((row) => (
          <li key={row.pgId}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-white" title={row.pgName}>
                {row.pgName}
              </span>
              <span className="shrink-0 tabular-nums text-apg-silver">{formatInr(row.totalRevenuePaise)}</span>
            </div>
            <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="bg-[#FF5A1F]"
                style={{ width: `${(row.rentRevenuePaise / max) * 100}%` }}
                title={`Rent ${formatInr(row.rentRevenuePaise)}`}
              />
              <div
                className="bg-sky-500/80"
                style={{ width: `${(row.electricityRevenuePaise / max) * 100}%` }}
                title={`Electricity ${formatInr(row.electricityRevenuePaise)}`}
              />
              <div
                className="bg-amber-500/70"
                style={{ width: `${(row.depositRevenuePaise / max) * 100}%` }}
                title={`${depositLabel} ${formatInr(row.depositRevenuePaise)}`}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-apg-silver">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#FF5A1F]" /> Rent
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-sky-500" /> Electricity
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Deposit (liability)
        </span>
      </div>
    </section>
  );
}

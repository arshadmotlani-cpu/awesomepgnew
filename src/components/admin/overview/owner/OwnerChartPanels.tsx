'use client';

import { paiseToInr } from '@/src/lib/format';
import { buildDonutSlices, PG_INCOME_DONUT_PALETTE } from '@/src/lib/pgIncomeDonut';
import type { OwnerChartSlice } from '@/src/services/ownerDashboard';

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
  if (endAngle - startAngle >= 359.99) endAngle = startAngle + 359.99;
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

export function OwnerCollectionDonut({
  slices,
  centerLabel,
  centerSub,
}: {
  slices: OwnerChartSlice[] | undefined;
  centerLabel: string;
  centerSub?: string;
}) {
  const sliceRows = slices ?? [];
  const rows = sliceRows.map((s) => ({
    pgId: s.id,
    pgName: s.label,
    incomeTotalPaise: s.paise,
  }));
  const built = buildDonutSlices(rows);
  const active = built
    .map((b, i) => ({
      ...b,
      color: sliceRows[i]?.color ?? PG_INCOME_DONUT_PALETTE[i % PG_INCOME_DONUT_PALETTE.length],
    }))
    .filter((s) => s.valuePaise > 0);
  const total = active.reduce((a, s) => a + s.valuePaise, 0) || 1;

  const arcs = active.reduce<{ cursor: number; items: Array<{ d: string; color: string; label: string; paise: number; pct: number }> }>(
    (acc, slice) => {
      const sweep = (slice.valuePaise / total) * 360;
      const start = acc.cursor;
      const end = start + sweep;
      return {
        cursor: end,
        items: [
          ...acc.items,
          {
            d: arcPath(80, 80, 70, 44, start, end),
            color: slice.color,
            label: slice.pgName,
            paise: slice.valuePaise,
            pct: Math.round((slice.valuePaise / total) * 1000) / 10,
          },
        ],
      };
    },
    { cursor: 0, items: [] },
  );

  return (
    <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <h3 className="text-sm font-semibold text-white">Collection status</h3>
      <p className="mt-1 text-xs text-apg-silver">Collected · pending · overdue (MTD view)</p>
      {active.length === 0 ? (
        <p className="mt-8 text-center text-sm text-apg-silver">No collection breakdown yet</p>
      ) : (
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="relative shrink-0">
          <svg width={160} height={160} viewBox="0 0 160 160" aria-hidden>
            {arcs.items.map((arc) => (
              <path key={arc.label} d={arc.d} fill={arc.color} opacity={0.92} />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-lg font-semibold tabular-nums text-white">{centerLabel}</p>
            {centerSub ? <p className="text-[10px] text-apg-silver">{centerSub}</p> : null}
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2 text-xs">
          {arcs.items.map((arc) => (
            <li key={arc.label} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-apg-silver">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: arc.color }} />
                <span className="truncate">{arc.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-white">
                {paiseToInr(arc.paise)} ({arc.pct}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
      )}
    </section>
  );
}

export function OwnerRevenueCompositionChart({
  rentPaise,
  electricityPaise,
  lateFeePaise,
  otherIncomePaise,
}: {
  rentPaise: number;
  electricityPaise: number;
  lateFeePaise: number;
  otherIncomePaise: number;
}) {
  const segments = [
    { label: 'Rent', paise: rentPaise, color: '#FF5A1F' },
    { label: 'Electricity', paise: electricityPaise, color: '#38BDF8' },
    { label: 'Late fees', paise: lateFeePaise, color: '#FBBF24' },
    { label: 'Other income', paise: otherIncomePaise, color: '#A78BFA' },
  ].filter((s) => s.paise > 0);
  const total = segments.reduce((a, s) => a + s.paise, 0) || 1;

  return (
    <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <h3 className="text-sm font-semibold text-white">Revenue composition</h3>
      <p className="mt-1 text-xs text-apg-silver">Operating revenue MTD breakdown</p>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10">
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.paise / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${paiseToInr(s.paise)}`}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2 text-xs">
        {segments.length === 0 ? (
          <li className="text-apg-silver">No revenue recorded this month</li>
        ) : (
          segments.map((s) => (
            <li key={s.label} className="flex justify-between gap-2 text-apg-silver">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="tabular-nums text-white">{paiseToInr(s.paise)}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export function OwnerOccupancyDistributionBar({
  occupied,
  vacant,
  reserved,
  maintenance,
  moveOut,
}: {
  occupied: number;
  vacant: number;
  reserved: number;
  maintenance: number;
  moveOut: number;
}) {
  const segments = [
    { label: 'Occupied', count: occupied, color: '#34D399' },
    { label: 'Vacant', count: vacant, color: '#71717A' },
    { label: 'Reserved', count: reserved, color: '#38BDF8' },
    { label: 'Maintenance', count: maintenance, color: '#FBBF24' },
    { label: 'Move-out (30d)', count: moveOut, color: '#F87171' },
  ].filter((s) => s.count > 0);
  const total = segments.reduce((a, s) => a + s.count, 0) || 1;

  return (
    <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <h3 className="text-sm font-semibold text-white">Occupancy distribution</h3>
      <p className="mt-1 text-xs text-apg-silver">Bed inventory across portfolio</p>
      <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-white/10">
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-apg-silver">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}: <span className="font-medium text-white">{s.count}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

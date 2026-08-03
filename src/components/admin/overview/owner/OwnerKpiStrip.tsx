'use client';

import { OverviewStatCard } from '@/src/components/admin/OverviewStatCard';
import { formatOwnerKpiValue, type OwnerKpi } from '@/src/services/ownerDashboard';

function TrendChip({ pct, label }: { pct: number | null | undefined; label?: string }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
        up ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
      }`}
    >
      {up ? '▲' : '▼'} {Math.abs(pct)}%
      {label ? <span className="ml-1 font-normal text-apg-silver">{label}</span> : null}
    </span>
  );
}

export function OwnerKpiStrip({ kpis }: { kpis: OwnerKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-6">
      {kpis.map((kpi) => (
        <div key={kpi.id} className="space-y-2">
          <OverviewStatCard
            label={kpi.label}
            value={formatOwnerKpiValue(kpi.kind, kpi.value)}
            hint={kpi.hint}
            href={kpi.href}
            accent={kpi.accent ?? 'indigo'}
          />
          {kpi.trendPct != null ? (
            <TrendChip pct={kpi.trendPct} label={kpi.trendLabel} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

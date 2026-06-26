import Link from 'next/link';
import { ClickableOverviewCard } from '@/src/components/admin/overview/ClickableOverviewCard';
import { paiseToInr } from '@/src/lib/format';
import {
  formatOverviewMetricValue,
  type OverviewDashboardData,
  type OverviewMetric,
  type PropertyPerformanceRow,
} from '@/src/services/overviewDashboard';

function metricAccent(id: string): 'indigo' | 'emerald' | 'amber' | 'rose' | 'zinc' | 'sky' | 'violet' | 'orange' {
  if (id.includes('overdue') || id.includes('outstanding') || id.includes('alert')) return 'rose';
  if (id.includes('pending') || id.includes('review') || id.includes('blocked')) return 'amber';
  if (id.includes('rent') || id.includes('tenant') || id.includes('paid')) return 'emerald';
  if (id.includes('electricity')) return 'sky';
  if (id.includes('deposit')) return 'violet';
  if (id.includes('visitor') || id.includes('check')) return 'sky';
  if (id.includes('occupancy') || id.includes('bed')) return 'violet';
  return 'indigo';
}

function formatMetricValue(metric: OverviewMetric): string {
  if (metric.kind === 'money') return paiseToInr(metric.value);
  return formatOverviewMetricValue(metric.kind, metric.value);
}

function OverviewSectionBlock({
  emoji,
  title,
  metrics,
}: {
  emoji: string;
  title: string;
  metrics: OverviewMetric[];
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-white">
        <span className="mr-2">{emoji}</span>
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) =>
          m.href ? (
            <ClickableOverviewCard
              key={m.id}
              href={m.href}
              label={m.label}
              value={formatMetricValue(m)}
              hint={m.hint}
              accent={metricAccent(m.id)}
            />
          ) : (
            <div key={m.id} className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
              <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{m.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{formatMetricValue(m)}</p>
              {m.hint ? <p className="mt-1 text-xs text-apg-silver">{m.hint}</p> : null}
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function PropertyPerformanceTable({ rows }: { rows: PropertyPerformanceRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-apg-silver">No property data for this billing month.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 bg-[#141820] text-[10px] uppercase tracking-wide text-apg-silver">
          <tr>
            <th className="px-4 py-3 font-medium">Property</th>
            <th className="px-4 py-3 font-medium">Total Revenue</th>
            <th className="px-4 py-3 font-medium">Rent</th>
            <th className="px-4 py-3 font-medium">Electricity</th>
            <th className="px-4 py-3 font-medium">Deposit</th>
            <th className="px-4 py-3 font-medium">Occupancy</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 bg-[#1A1F27]">
          {rows.map((row) => (
            <tr key={row.pgId} className="transition hover:bg-white/[0.03]">
              <td className="px-4 py-3">
                <Link href={row.href} className="font-medium text-white hover:text-[#FF5A1F]">
                  {row.pgName}
                </Link>
              </td>
              <td className="px-4 py-3 text-white">{paiseToInr(row.totalRevenuePaise)}</td>
              <td className="px-4 py-3 text-emerald-300">{paiseToInr(row.rentRevenuePaise)}</td>
              <td className="px-4 py-3 text-sky-300">{paiseToInr(row.electricityRevenuePaise)}</td>
              <td className="px-4 py-3 text-violet-300">{paiseToInr(row.depositRevenuePaise)}</td>
              <td className="px-4 py-3 text-apg-silver">
                {row.occupancyPct}%{' '}
                <span className="text-xs">
                  ({row.occupiedBeds}/{row.totalBeds})
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OverviewDashboard({ data }: { data: OverviewDashboardData }) {
  return (
    <div className="space-y-10">
      {data.sections.map((section) => (
        <OverviewSectionBlock
          key={section.id}
          emoji={section.emoji}
          title={section.title}
          metrics={section.metrics}
        />
      ))}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-white">
          <span className="mr-2">🏢</span>
          PROPERTY PERFORMANCE (per PG)
        </h2>
        <PropertyPerformanceTable rows={data.propertyPerformance} />
      </section>

      {data.operationsAlerts.length > 0 ? (
        <OverviewSectionBlock emoji="🚨" title="OPERATIONS ALERTS" metrics={data.operationsAlerts} />
      ) : null}
    </div>
  );
}

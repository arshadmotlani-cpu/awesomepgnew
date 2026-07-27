import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import type { CollectionsDashboardKpis } from '@/src/services/collectionsDashboard';

export function CollectionsKpiStrip({ kpis }: { kpis: CollectionsDashboardKpis }) {
  const cards = [
    { label: 'Expected', amount: kpis.expectedPaise, hint: null as string | null },
    { label: 'Collected', amount: kpis.collectedPaise, hint: `${kpis.paidTodayCount} today`, accent: 'collected' as const },
    { label: 'Outstanding', amount: kpis.outstandingPaise, hint: null },
    { label: 'Overdue', amount: kpis.overduePaise, hint: `${kpis.overdueCount} bills`, accent: 'overdue' as const },
    {
      label: 'Efficiency',
      amount: null as number | null,
      hint: kpis.efficiencyPct == null ? '—' : `${kpis.efficiencyPct}%`,
      accent: 'eff' as const,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{c.label}</dt>
          <dd
            className={
              'mt-2 text-2xl font-bold tabular-nums ' +
              (c.accent === 'overdue'
                ? 'text-rose-300'
                : c.accent === 'collected'
                  ? 'text-emerald-300'
                  : 'text-white')
            }
          >
            {c.amount == null ? (c.hint ?? '—') : paiseToInr(c.amount)}
          </dd>
          {c.amount != null && c.hint ? (
            <dd className="mt-1 text-xs text-apg-silver">{c.hint}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

export function CollectionsBucketNav({
  active,
  counts,
  basePath = '/admin/collections',
}: {
  active: string;
  counts: {
    upcoming: number;
    due_today: number;
    overdue: number;
    awaiting: number;
    paid_today: number;
  };
  basePath?: string;
}) {
  const items = [
    { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
    { id: 'due_today', label: 'Due Today', count: counts.due_today },
    { id: 'overdue', label: 'Overdue', count: counts.overdue },
    { id: 'awaiting', label: 'Awaiting', count: counts.awaiting },
    { id: 'paid_today', label: 'Paid Today', count: counts.paid_today },
    { id: 'calendar', label: 'Calendar', count: null as number | null },
    { id: 'reports', label: 'Reports', count: null },
  ] as const;

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const href =
          item.id === 'calendar'
            ? `${basePath}?view=calendar`
            : item.id === 'reports'
              ? `${basePath}/reports`
              : `${basePath}?bucket=${item.id}`;
        const isActive =
          active === item.id ||
          (active === 'calendar' && item.id === 'calendar') ||
          (active === 'reports' && item.id === 'reports');
        return (
          <Link
            key={item.id}
            href={href}
            className={
              'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ' +
              (isActive
                ? 'bg-[#FF5A1F]/20 font-semibold text-white ring-1 ring-[#FF5A1F]/40'
                : 'text-apg-silver hover:bg-white/5 hover:text-white')
            }
          >
            <span>{item.label}</span>
            {item.count != null ? (
              <span className="tabular-nums text-xs text-apg-silver">{item.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

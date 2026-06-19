import { paiseToInr } from '@/src/lib/format';
import type { CollectionsCommandStats } from '@/src/lib/billing/collectionsQueue';

export function CollectionsCommandCenter({ stats }: { stats: CollectionsCommandStats }) {
  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-xl font-bold text-white">Collections command center</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Who owes money right now — start with overdue, then due today.
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Overdue"
          count={stats.overdueCount}
          amount={stats.overdueAmountPaise}
          accent="overdue"
        />
        <MetricCard
          label="Due today"
          count={stats.dueTodayCount}
          amount={stats.dueTodayAmountPaise}
          accent="today"
        />
        <MetricCard
          label="Due this week"
          count={stats.dueThisWeekCount}
          amount={stats.dueThisWeekAmountPaise}
        />
        <MetricCard
          label="Collected today"
          count={stats.collectedTodayCount}
          amount={stats.collectedTodayAmountPaise}
          accent="collected"
        />
      </dl>
    </section>
  );
}

function MetricCard({
  label,
  count,
  amount,
  accent,
}: {
  label: string;
  count: number;
  amount: number;
  accent?: 'overdue' | 'today' | 'collected';
}) {
  const amountClass =
    accent === 'overdue'
      ? 'text-rose-300'
      : accent === 'today'
        ? 'text-[#FF5A1F]'
        : accent === 'collected'
          ? 'text-emerald-300'
          : 'text-white';

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={`mt-2 text-2xl font-bold tabular-nums ${amountClass}`}>
        {paiseToInr(amount)}
      </dd>
      <dd className="mt-1 text-xs text-apg-silver">
        {count} resident{count === 1 ? '' : 's'}
      </dd>
    </div>
  );
}

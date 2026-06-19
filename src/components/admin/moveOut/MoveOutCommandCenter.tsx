import type { MoveOutCommandStats } from '@/src/lib/moveOut/moveOutPipeline';

export function MoveOutCommandCenter({ stats }: { stats: MoveOutCommandStats }) {
  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-xl font-bold text-white">Move-out command center</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Where each move-out is stuck — start with approvals and refunds that need you.
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Awaiting inspection" count={stats.awaitingInspection} accent="inspection" />
        <MetricCard label="Awaiting charges" count={stats.awaitingCharges} accent="charges" />
        <MetricCard label="Awaiting refund" count={stats.awaitingRefund} accent="refund" />
        <MetricCard label="Ready to close" count={stats.readyToClose} accent="ready" />
        <MetricCard label="Completed this month" count={stats.completedThisMonth} accent="done" />
      </dl>
    </section>
  );
}

function MetricCard({
  label,
  count,
  accent,
}: {
  label: string;
  count: number;
  accent?: 'inspection' | 'charges' | 'refund' | 'ready' | 'done';
}) {
  const countClass =
    accent === 'refund'
      ? 'text-rose-300'
      : accent === 'ready'
        ? 'text-[#FF5A1F]'
        : accent === 'done'
          ? 'text-emerald-300'
          : accent === 'charges'
            ? 'text-amber-200'
            : 'text-white';

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={`mt-2 text-2xl font-bold tabular-nums ${countClass}`}>{count}</dd>
      <dd className="mt-1 text-xs text-apg-silver">
        resident{count === 1 ? '' : 's'}
      </dd>
    </div>
  );
}

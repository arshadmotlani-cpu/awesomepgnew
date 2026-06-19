import { paiseToInr } from '@/src/lib/format';

type RentStats = {
  pendingCount: number;
  overdueCount: number;
  paidCount: number;
  collectedPaise: number;
  outstandingPaise: number;
};

export function BillingSummarySection({
  stats,
  billingMonth,
}: {
  stats: RentStats;
  billingMonth: string;
}) {
  const monthLabel = billingMonth.slice(0, 7);
  const pendingBills = stats.pendingCount + stats.overdueCount;
  const paymentStatus =
    stats.overdueCount > 0
      ? `${stats.overdueCount} overdue · ${stats.pendingCount} waiting for payment`
      : stats.pendingCount > 0
        ? `${stats.pendingCount} waiting for payment`
        : stats.paidCount > 0
          ? `${stats.paidCount} paid`
          : 'All caught up';

  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-white">Billing summary</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Rent totals for active residents · {monthLabel}
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Amount due" value={paiseToInr(stats.outstandingPaise)} accent="due" />
        <SummaryCard
          label="Rent collected"
          value={paiseToInr(stats.collectedPaise)}
          accent="collected"
        />
        <SummaryCard label="Pending bills" value={String(pendingBills)} />
        <SummaryCard label="Payment status" value={paymentStatus} compact />
      </dl>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  compact,
}: {
  label: string;
  value: string;
  accent?: 'due' | 'collected';
  compact?: boolean;
}) {
  const valueClass =
    accent === 'due'
      ? 'text-[#FF5A1F]'
      : accent === 'collected'
        ? 'text-emerald-300'
        : 'text-white';

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd
        className={
          'mt-2 font-semibold text-white ' +
          (compact ? 'text-sm leading-snug ' : 'text-xl tabular-nums ') +
          valueClass
        }
      >
        {value}
      </dd>
    </div>
  );
}

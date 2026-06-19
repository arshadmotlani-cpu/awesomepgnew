import type { CheckoutSettlementListTab } from '@/src/services/checkoutSettlement';

const TAB_LABELS: Record<CheckoutSettlementListTab, string> = {
  awaiting_resident: 'Waiting on resident',
  awaiting_review: 'Ready for your review',
  approved: 'Approved — pending refund step',
  refund_pending: 'Refund to send',
  completed: 'Done',
  archived: 'Archived',
};

export function CheckoutSettlementsSummary({
  tab,
  count,
}: {
  tab: CheckoutSettlementListTab;
  count: number;
}) {
  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-white">Checkout summary</h2>
        <p className="mt-1 text-sm text-apg-silver">
          One checkout per approved move-out. Deposit refund happens here — not on the move-out list.
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Current queue" value={TAB_LABELS[tab]} compact />
        <StatCard label="In this queue" value={String(count)} accent={count > 0 ? 'amber' : undefined} />
        <StatCard label="Next step" value={nextStepLabel(tab)} compact />
        <StatCard label="Also check" value="Move-out requests" compact hint="/admin/vacating" />
      </dl>
    </section>
  );
}

function nextStepLabel(tab: CheckoutSettlementListTab) {
  switch (tab) {
    case 'awaiting_resident':
      return 'Resident adds UPI details';
    case 'awaiting_review':
      return 'You approve refund';
    case 'approved':
      return 'Refund step next';
    case 'refund_pending':
      return 'You mark refund sent';
    case 'completed':
      return 'Nothing — done';
    case 'archived':
      return 'Hidden from daily work';
    default:
      return 'Open a settlement';
  }
}

function StatCard({
  label,
  value,
  accent,
  compact,
  hint,
}: {
  label: string;
  value: string;
  accent?: 'amber';
  compact?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd
        className={
          'mt-2 font-semibold text-white ' +
          (compact ? 'text-sm leading-snug ' : 'text-2xl tabular-nums ') +
          (accent === 'amber' ? 'text-amber-300' : '')
        }
      >
        {value}
      </dd>
      {hint ? <p className="mt-1 text-[11px] text-apg-silver">{hint}</p> : null}
    </div>
  );
}

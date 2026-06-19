import { Badge } from '@/src/components/admin/Badge';
import { paiseToInr, titleCase } from '@/src/lib/format';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export function CheckoutSettlementSummary({ detail }: { detail: CheckoutSettlementDetail }) {
  const statusLabel = plainStatus(detail.status);

  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-white">Checkout summary</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Move-out {detail.vacatingDate} · {detail.pgName} · Room {detail.roomNumber}
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Security deposit held" value={paiseToInr(detail.depositRefundablePaise)} />
        <Stat label="Final refund" value={paiseToInr(detail.preview.finalRefundPaise)} accent="emerald" />
        <Stat label="Status" value={statusLabel} compact />
        <Stat
          label="Notice fee"
          value={paiseToInr(detail.preview.noticeDeductionPaise)}
          hint={`${detail.noticeShortfallDays} days short`}
        />
      </dl>
      <p className="mt-3">
        <Badge tone={statusBadgeTone(detail.status)}>{statusLabel}</Badge>
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
  compact,
  hint,
}: {
  label: string;
  value: string;
  accent?: 'emerald';
  compact?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd
        className={
          'mt-2 font-semibold ' +
          (compact ? 'text-sm text-white ' : 'text-xl tabular-nums ') +
          (accent === 'emerald' ? 'text-emerald-300' : 'text-white')
        }
      >
        {value}
      </dd>
      {hint ? <p className="mt-1 text-[11px] text-apg-silver">{hint}</p> : null}
    </div>
  );
}

function plainStatus(status: string) {
  switch (status) {
    case 'awaiting_resident_details':
      return 'Waiting on resident';
    case 'awaiting_admin_review':
      return 'Ready for your review';
    case 'refund_pending':
      return 'Refund to send';
    case 'refund_paid':
      return 'Refund sent';
    case 'completed':
      return 'Done';
    case 'archived':
      return 'Archived';
    default:
      return titleCase(status.replace(/_/g, ' '));
  }
}

function statusBadgeTone(status: string) {
  if (status === 'completed' || status === 'refund_paid') return 'emerald' as const;
  if (status === 'refund_pending' || status === 'awaiting_admin_review') return 'amber' as const;
  return 'zinc' as const;
}

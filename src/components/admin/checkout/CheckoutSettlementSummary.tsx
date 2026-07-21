import { Badge } from '@/src/components/admin/Badge';
import { NoticeSettlementPanel } from '@/src/components/shared/NoticeDeductionBreakdown';
import { paiseToInr, titleCase } from '@/src/lib/format';
import { breakdownFromStoredNoticeSnapshot } from '@/src/lib/vacating/noticeDeductionPresentation';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export function CheckoutSettlementSummary({ detail }: { detail: CheckoutSettlementDetail }) {
  const statusLabel = plainStatus(detail.status);
  const noticeBreakdown = breakdownFromStoredNoticeSnapshot({
    noticeGivenDays: detail.noticeGivenDays,
    noticeShortfallDays: detail.noticeShortfallDays,
    noticeRentCoveredDays: detail.noticeRentCoveredDays,
    noticeChargeableDays: detail.noticeChargeableDays,
    noticeDeductionPaise: detail.preview.noticeDeductionPaise,
  });

  return (
    <section className="mb-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Move-out settlement</h2>
          <p className="mt-1 text-sm text-apg-silver">
            Leaves {detail.vacatingDate} · {detail.pgName} · Room {detail.roomNumber}
          </p>
        </div>
        <Badge tone={statusBadgeTone(detail.status)}>{statusLabel}</Badge>
      </header>
      {noticeBreakdown ? (
        <NoticeSettlementPanel settlement={noticeBreakdown} variant="admin" />
      ) : null}
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Security deposit held" value={paiseToInr(detail.depositRefundablePaise)} />
        <Stat label="Final refund" value={paiseToInr(detail.preview.finalRefundPaise)} accent="emerald" />
        {detail.preview.electricityDeductionPaise > 0 ? (
          <Stat
            label="Electricity deduction"
            value={`−${paiseToInr(detail.preview.electricityDeductionPaise)}`}
          />
        ) : null}
      </dl>
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

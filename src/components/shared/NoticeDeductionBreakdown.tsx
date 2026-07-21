import { ACCOUNT_SURFACE } from '@/src/components/customer/accountStyles';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { NoticeSettlementDisplay } from '@/src/lib/vacating/noticeDeductionPresentation';
export {
  breakdownFromStoredNoticeSnapshot as breakdownFromVacatingRow,
  toNoticeSettlementDisplay,
} from '@/src/lib/vacating/noticeDeductionPresentation';

export type NoticeSettlementPanelProps = {
  settlement: NoticeSettlementDisplay;
  variant?: 'admin' | 'resident';
  compact?: boolean;
};

/** @deprecated use NoticeSettlementPanel */
export type NoticeDeductionBreakdownProps = NoticeSettlementPanelProps & {
  breakdown: NoticeSettlementDisplay;
};

function Row({
  label,
  value,
  variant,
  accent,
}: {
  label: string;
  value: string;
  variant: 'admin' | 'resident';
  accent?: boolean;
}) {
  const labelCls = variant === 'admin' ? 'text-apg-silver' : 'text-zinc-600';
  const valueCls =
    variant === 'admin'
      ? accent
        ? 'text-amber-200 font-semibold'
        : 'text-white font-medium'
      : accent
        ? 'text-amber-800 font-semibold'
        : 'text-zinc-900 font-medium';

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className={labelCls}>{label}</dt>
      <dd className={valueCls}>{value}</dd>
    </div>
  );
}

export function NoticeSettlementPanel({
  settlement,
  variant = 'admin',
  compact = false,
}: NoticeSettlementPanelProps) {
  const shellCls =
    variant === 'admin'
      ? 'rounded-2xl border border-white/10 bg-[#1A1F27] p-4'
      : `${ACCOUNT_SURFACE} p-4`;

  const titleCls =
    variant === 'admin'
      ? 'text-xs font-semibold uppercase tracking-wide text-apg-silver'
      : 'text-xs font-semibold uppercase tracking-wide text-zinc-600';

  if (settlement.missingNoticeDays <= 0) {
    return (
      <div className={shellCls}>
        <p className={titleCls}>Notice settlement</p>
        <p
          className={`mt-2 text-sm ${variant === 'admin' ? 'text-emerald-300' : 'text-emerald-700'}`}
        >
          Compliant notice — no deposit deduction
        </p>
        <dl className={`mt-3 space-y-2 ${compact ? 'text-xs' : 'text-sm'}`}>
          <Row label="Billing cycle" value={settlement.billingCycleLabel} variant={variant} />
          <Row label="Vacating date" value={formatDate(settlement.vacatingDate)} variant={variant} />
        </dl>
      </div>
    );
  }

  return (
    <div className={shellCls}>
      <p className={titleCls}>Notice settlement</p>
      <p
        className={`mt-1 text-xs ${variant === 'admin' ? 'text-apg-silver/80' : 'text-zinc-500'}`}
      >
        Prepaid rent after vacate satisfies notice shortfall before deposit is charged.
      </p>
      <dl className={`mt-3 space-y-2 ${compact ? 'text-xs' : 'text-sm'}`}>
        <Row label="Billing cycle" value={settlement.billingCycleLabel} variant={variant} />
        <Row
          label="Paid until"
          value={settlement.paidUntilDate ? formatDate(settlement.paidUntilDate) : '—'}
          variant={variant}
        />
        <Row label="Vacating date" value={formatDate(settlement.vacatingDate)} variant={variant} />
        <Row
          label="Unused prepaid rent days"
          value={`${settlement.unusedPrepaidRentDays} days`}
          variant={variant}
        />
        <Row
          label="Required notice days"
          value={`${settlement.noticeRequiredDays} days`}
          variant={variant}
        />
        <Row
          label="Notice covered by prepaid rent"
          value={`${settlement.noticeCoveredByPrepaidRent} days`}
          variant={variant}
        />
        <Row
          label="Chargeable notice days"
          value={`${settlement.chargeableNoticeDays} days`}
          variant={variant}
          accent
        />
        <Row
          label="Notice deduction from deposit"
          value={paiseToInr(settlement.noticeDeductionPaise)}
          variant={variant}
          accent
        />
      </dl>
    </div>
  );
}

/** @deprecated use NoticeSettlementPanel */
export function NoticeDeductionBreakdown({
  breakdown,
  settlement,
  variant = 'admin',
  compact = false,
}: NoticeDeductionBreakdownProps) {
  const data = settlement ?? breakdown;
  if (!data) return null;
  return <NoticeSettlementPanel settlement={data} variant={variant} compact={compact} />;
}

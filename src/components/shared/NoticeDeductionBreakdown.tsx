import { ACCOUNT_SURFACE } from '@/src/components/customer/accountStyles';
import { paiseToInr } from '@/src/lib/format';
import {
  breakdownFromStoredNoticeSnapshot,
  type NoticeDeductionDisplayBreakdown,
} from '@/src/lib/vacating/noticeDeductionPresentation';

export type NoticeDeductionBreakdownProps = {
  breakdown: NoticeDeductionDisplayBreakdown;
  variant?: 'admin' | 'resident';
  compact?: boolean;
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
  const labelCls =
    variant === 'admin' ? 'text-apg-silver' : 'text-zinc-600';
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

export function NoticeDeductionBreakdown({
  breakdown,
  variant = 'admin',
  compact = false,
}: NoticeDeductionBreakdownProps) {
  const shellCls =
    variant === 'admin'
      ? 'rounded-2xl border border-white/10 bg-[#1A1F27] p-4'
      : `${ACCOUNT_SURFACE} p-4`;

  const titleCls =
    variant === 'admin'
      ? 'text-xs font-semibold uppercase tracking-wide text-apg-silver'
      : 'text-xs font-semibold uppercase tracking-wide text-zinc-600';

  if (breakdown.missingNoticeDays <= 0) {
    return (
      <div className={shellCls}>
        <p className={titleCls}>Notice period</p>
        <p className={`mt-2 text-sm ${variant === 'admin' ? 'text-emerald-300' : 'text-emerald-700'}`}>
          Compliant — no notice deduction
        </p>
      </div>
    );
  }

  return (
    <div className={shellCls}>
      <p className={titleCls}>Notice deduction breakdown</p>
      <dl className={`mt-3 space-y-2 ${compact ? 'text-xs' : 'text-sm'}`}>
        <Row label="Required notice" value={`${breakdown.noticeRequiredDays} days`} variant={variant} />
        <Row label="Notice given" value={`${breakdown.noticeGivenDays} days`} variant={variant} />
        <Row label="Missing notice" value={`${breakdown.missingNoticeDays} days`} variant={variant} />
        <Row
          label="Covered by paid rent"
          value={`${breakdown.rentCoveredDays} days`}
          variant={variant}
        />
        <Row
          label="Chargeable notice days"
          value={`${breakdown.chargeableNoticeDays} days`}
          variant={variant}
          accent
        />
        <Row
          label="Notice deduction"
          value={paiseToInr(breakdown.noticeDeductionPaise)}
          variant={variant}
          accent
        />
      </dl>
    </div>
  );
}

export { breakdownFromStoredNoticeSnapshot as breakdownFromVacatingRow };

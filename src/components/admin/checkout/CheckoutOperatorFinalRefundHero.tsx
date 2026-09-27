'use client';

import { buildOperatorFinalRefundBreakdown } from '@/src/lib/checkout/checkoutOperatorFinalRefund';
import { paiseToInr } from '@/src/lib/format';
import type { CheckoutSettlementDetail } from '@/src/services/checkoutSettlement';

export function CheckoutOperatorFinalRefundHero({
  detail,
  electricityDeductionOverridePaise,
  className = '',
}: {
  detail: CheckoutSettlementDetail;
  electricityDeductionOverridePaise?: number | null;
  className?: string;
}) {
  const breakdown = buildOperatorFinalRefundBreakdown(
    detail,
    electricityDeductionOverridePaise,
  );

  return (
    <section
      className={
        'rounded-3xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/10 to-[#0E1116] p-6 ' +
        className
      }
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200/90">
        Final refund to pay
      </p>
      <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-white">
        {paiseToInr(breakdown.finalRefundPaise)}
      </p>

      <dl className="mt-6 space-y-2 border-t border-white/[0.08] pt-5 text-sm">
        <Row label="Security deposit received" value={paiseToInr(breakdown.depositReceivedPaise)} />
        <Row
          label="Electricity deduction"
          value={`−${paiseToInr(breakdown.electricityDeductionPaise)}`}
          muted
        />
        <Row
          label="Other deductions"
          value={`−${paiseToInr(breakdown.otherDeductionsPaise)}`}
          muted
        />
        <Row
          label="Deposit remaining"
          value={paiseToInr(breakdown.depositRemainingPaise)}
          emphasis
        />
        <Row
          label="Unused prepaid rent"
          value={`+${paiseToInr(breakdown.unusedPrepaidRentPaise)}`}
          positive
        />
      </dl>

      <div className="my-4 border-t border-dashed border-white/15" />

      <div className="flex items-end justify-between gap-3">
        <span className="text-sm font-medium text-emerald-100">Final refund to pay</span>
        <span className="text-2xl font-semibold tabular-nums text-white">
          {paiseToInr(breakdown.finalRefundPaise)}
        </span>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  muted,
  emphasis,
  positive,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasis?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-apg-silver">{label}</dt>
      <dd
        className={
          (emphasis ? 'font-semibold text-white ' : '') +
          (positive ? 'font-medium text-emerald-300' : muted ? 'text-white/85' : 'font-medium text-white')
        }
      >
        {value}
      </dd>
    </div>
  );
}

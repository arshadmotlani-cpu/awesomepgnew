'use client';

import { ApgCard } from '@/src/components/customer/design-system';
import { paiseToInr } from '@/src/lib/format';
import type { ResidentMoveOutRefundSummary } from '@/src/lib/residents/residentMoveOutRefundSummary';

function Row({
  label,
  amountPaise,
  emphasis,
}: {
  label: string;
  amountPaise: number;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={emphasis ? 'font-semibold text-white' : 'text-apg-silver'}>{label}</span>
      <span
        className={
          emphasis
            ? 'text-base font-bold tabular-nums text-white'
            : 'tabular-nums font-medium text-white'
        }
      >
        {paiseToInr(amountPaise)}
      </span>
    </div>
  );
}

export function ResidentMoveOutRefundCard({
  summary,
  showApproxPrefix = true,
}: {
  summary: ResidentMoveOutRefundSummary;
  showApproxPrefix?: boolean;
}) {
  return (
    <ApgCard tier="resident" className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Estimated refund</h2>
        <p className="mt-1 text-xs text-apg-silver">
          Your final refund is confirmed after the final electricity reading and room inspection.
        </p>
      </div>
      <dl className="space-y-2.5">
        <Row label="Security deposit" amountPaise={summary.securityDepositPaise} />
        {summary.unusedPrepaidRentPaise > 0 ? (
          <Row label="Unused prepaid rent" amountPaise={summary.unusedPrepaidRentPaise} />
        ) : null}
        {summary.electricityDeductionPaise > 0 ? (
          <Row label="Electricity deduction" amountPaise={summary.electricityDeductionPaise} />
        ) : null}
        {summary.otherDeductionsPaise > 0 ? (
          <Row label="Other deductions" amountPaise={summary.otherDeductionsPaise} />
        ) : null}
      </dl>
      <div className="border-t border-white/10 pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-white">
            {showApproxPrefix ? 'Estimated refund' : 'Refund'}
          </span>
          <span className="text-lg font-bold tabular-nums text-emerald-300">
            {showApproxPrefix ? '≈ ' : ''}
            {paiseToInr(summary.estimatedRefundPaise)}
          </span>
        </div>
      </div>
    </ApgCard>
  );
}

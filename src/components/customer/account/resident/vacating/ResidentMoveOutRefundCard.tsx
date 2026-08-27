'use client';

import { ApgCard } from '@/src/components/customer/design-system';
import { paiseToInr } from '@/src/lib/format';
import type { ResidentMoveOutRefundSummary } from '@/src/lib/residents/residentMoveOutRefundSummary';

function Row({
  label,
  amountPaise,
  emphasis,
  deduct,
}: {
  label: string;
  amountPaise: number;
  emphasis?: boolean;
  deduct?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className={emphasis ? 'font-semibold text-white' : 'text-apg-silver'}>{label}</span>
      <span
        className={
          emphasis
            ? 'text-base font-bold tabular-nums text-white'
            : deduct
              ? 'tabular-nums font-medium text-rose-200'
              : 'tabular-nums font-medium text-white'
        }
      >
        {deduct ? '−' : ''}
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
          Security deposit and unused prepaid rent are separate. Notice shortfall comes from unused
          rent credit. Final amount is confirmed after electricity reading and room inspection.
        </p>
      </div>
      <dl className="space-y-2.5">
        <Row label="Security deposit" amountPaise={summary.securityDepositPaise} />
        {summary.tailRentPaise > 0 ? (
          <Row label="Tail rent (unpaid occupancy)" amountPaise={summary.tailRentPaise} deduct />
        ) : null}
        <Row label="Refundable deposit" amountPaise={summary.refundableDepositPaise} />
        <Row label="Unused prepaid rent" amountPaise={summary.unusedPrepaidRentPaise} />
        {summary.noticeDeductionPaise > 0 ? (
          <Row
            label="Notice deduction (from unused rent)"
            amountPaise={summary.noticeDeductionPaise}
            deduct
          />
        ) : null}
        {summary.netUnusedRentWalletCreditPaise > 0 ? (
          <Row
            label="Net unused rent credit"
            amountPaise={summary.netUnusedRentWalletCreditPaise}
          />
        ) : null}
        {summary.electricityPending ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-apg-silver">Electricity</span>
            <span className="text-xs font-medium text-amber-200/90">Pending</span>
          </div>
        ) : summary.electricityDeductionPaise + summary.otherDeductionsPaise > 0 ? (
          <Row
            label="Electricity / other deductions"
            amountPaise={summary.electricityDeductionPaise + summary.otherDeductionsPaise}
            deduct
          />
        ) : null}
      </dl>
      <div className="border-t border-white/10 pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-white">
            {showApproxPrefix ? 'Estimated refundable' : 'Refundable'}
          </span>
          <span className="text-lg font-bold tabular-nums text-emerald-300">
            {showApproxPrefix ? '≈ ' : ''}
            {paiseToInr(summary.estimatedRefundPaise)}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-apg-silver">
          ≈ Refundable deposit + net unused rent credit
          {summary.electricityPending ? ' (electricity pending)' : ''}
        </p>
      </div>
    </ApgCard>
  );
}

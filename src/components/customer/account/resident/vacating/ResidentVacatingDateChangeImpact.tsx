'use client';

import { formatDate, paiseToInr } from '@/src/lib/format';
import { PENDING_ELECTRICITY_LABEL } from '@/src/lib/checkout/settlementDisplayFormat';
import type { VacatingDateChangePreview } from '@/src/services/vacatingDateChange';
import { buildResidentMoveOutRefundSummary } from '@/src/lib/residents/residentMoveOutRefundSummary';

function ImpactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-apg-silver">{label}</span>
      <span className="font-medium tabular-nums text-white">{value}</span>
    </div>
  );
}

export function ResidentVacatingDateChangeImpact({
  preview,
}: {
  preview: VacatingDateChangePreview;
}) {
  const requested = buildResidentMoveOutRefundSummary(
    preview.requestedEstimatedSettlement.waterfall,
  );
  const deductionsPaise =
    requested.electricityDeductionPaise + requested.otherDeductionsPaise;

  const noticeChargePaise =
    preview.requestedEstimatedSettlement.waterfall.notice.fromDepositPaise +
    preview.requestedEstimatedSettlement.waterfall.notice.fromUnusedRentPaise;

  return (
    <div className="space-y-3 border-t border-white/10 pt-4">
      {preview.noticeCompliant ? (
        <p className="text-xs text-emerald-300/90">
          ✓ {preview.noticeComplianceLabel ?? '5-day notice requirement satisfied'}
        </p>
      ) : (
        <p className="text-xs text-amber-200/90">
          This date gives less than 5 days notice. A notice shortfall charge applies before
          confirming.
        </p>
      )}
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">
            Current final stay date
          </p>
          <p className="font-medium text-white">{formatDate(preview.currentVacatingDate)}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-apg-orange">
            New final stay date
          </p>
          <p className="font-medium text-white">{formatDate(preview.requestedVacatingDate)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
        <p className="text-xs font-semibold text-white">Estimated impact</p>
        {requested.unusedPrepaidRentPaise > 0 ? (
          <ImpactRow
            label="Unused prepaid rent"
            value={paiseToInr(requested.unusedPrepaidRentPaise)}
          />
        ) : null}
        {preview.direction === 'later' && (preview.additionalStayDays ?? 0) > 0 ? (
          <ImpactRow
            label="Additional stay"
            value={`${preview.additionalStayDays ?? 0} days`}
          />
        ) : null}
        {preview.direction === 'later' && (preview.additionalRentPaise ?? 0) > 0 ? (
          <ImpactRow
            label="Additional rent"
            value={paiseToInr(preview.additionalRentPaise ?? 0)}
          />
        ) : null}
        <ImpactRow
          label="Security deposit held"
          value={paiseToInr(preview.requestedEstimatedSettlement.depositHeldPaise)}
        />
        {noticeChargePaise > 0 ? (
          <ImpactRow label="Notice shortfall charge" value={paiseToInr(noticeChargePaise)} />
        ) : null}
        <ImpactRow
          label="Electricity / deductions"
          value={
            deductionsPaise > 0
              ? paiseToInr(deductionsPaise)
              : preview.requestedEstimatedSettlement.waterfall.depositBucket.electricityPaise ===
                  0 &&
                preview.requestedEstimatedSettlement.mode === 'estimate'
              ? PENDING_ELECTRICITY_LABEL
              : paiseToInr(0)
          }
        />
        <div className="border-t border-white/10 pt-2">
          <ImpactRow
            label="Current refundable balance"
            value={paiseToInr(preview.requestedEstimatedRefundPaise)}
          />
        </div>
      </div>

      <p className="text-xs text-apg-silver">{preview.refundDeltaLabel}</p>
      <p className="text-xs text-apg-silver">
        Current estimate {paiseToInr(preview.currentEstimatedRefundPaise)} → New estimate{' '}
        {paiseToInr(preview.requestedEstimatedRefundPaise)}
      </p>
    </div>
  );
}

'use client';

import type { ResidentMoveOutRequestPreview } from '@/src/lib/vacating/residentMoveOutRequestPreview';
import { ApgCard } from '@/src/components/customer/design-system';
import { formatDate, paiseToInr } from '@/src/lib/format';

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="text-apg-silver">{label}</dt>
      <dd className={`text-right font-medium ${accent ? 'text-emerald-400' : 'text-white'}`}>{value}</dd>
    </div>
  );
}

type Props = {
  preview: ResidentMoveOutRequestPreview;
  loading?: boolean;
};

export function ResidentMoveOutRequestPreviewPanel({ preview, loading }: Props) {
  const { rent, electricity, notice, settlement } = preview;

  return (
    <div className="space-y-4" data-testid="move-out-settlement-preview">
      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-apg-silver">Your final stay date</p>
          <p className="mt-0.5 font-semibold text-white">{preview.finalStayDateLabel}</p>
        </div>
        <div>
          <p className="text-xs text-apg-silver">Bed becomes available</p>
          <p className="mt-0.5 font-semibold text-white">{preview.bedAvailableLabel}</p>
        </div>
        <div>
          <p className="text-xs text-apg-silver">Rent charged through</p>
          <p className="mt-0.5 font-semibold text-white">{preview.rentChargedThroughLabel}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-apg-silver">Updating settlement estimate…</p>
      ) : null}

      <ApgCard tier="resident" className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">Notice</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-apg-silver">Submitted</dt>
            <dd className="font-medium text-white">{formatDate(notice.noticeSubmittedDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Required notice</dt>
            <dd className="font-medium text-white">{notice.requiredNoticeDays} days</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Selected move-out</dt>
            <dd className="font-medium text-white">{formatDate(notice.selectedMoveOutDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Notice status</dt>
            <dd className={`font-medium ${notice.compliant ? 'text-emerald-400' : 'text-amber-300'}`}>
              {notice.compliant ? '✓ ' : ''}
              {notice.statusLabel}
            </dd>
          </div>
        </dl>
      </ApgCard>

      <ApgCard tier="resident" className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
            Your move-out settlement
          </p>
          {rent.headline ? (
            <p className="mt-1 text-sm text-apg-silver">{rent.headline}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-apg-silver/80">{rent.billingCycleNote}</p>
        </div>

        <div className="space-y-2 border-t border-white/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
            {rent.monthLabel} rent
          </p>
          <dl className="space-y-2">
            <Row label="Monthly rent" value={paiseToInr(rent.monthlyRentPaise)} />
            <Row label={rent.scenario === 'paid' ? 'Paid' : 'Already paid'} value={paiseToInr(rent.paidPaise)} />
            {rent.scenario === 'unpaid' ? (
              <>
                <Row label={`Rent through ${preview.rentChargedThroughLabel}`} value={paiseToInr(rent.rentThroughVacatingPaise)} />
                <Row
                  label="Amount included in final settlement"
                  value={paiseToInr(rent.finalRentSettlementPaise)}
                />
                <Row label="Remaining days after move-out" value="Not charged" />
              </>
            ) : null}
            {rent.scenario === 'paid' ? (
              <>
                <Row
                  label={`Rent used through ${preview.rentChargedThroughLabel}`}
                  value={paiseToInr(rent.rentThroughVacatingPaise)}
                />
                <Row label="Unused prepaid rent" value={paiseToInr(rent.unusedPrepaidRentPaise)} accent />
                <p className="text-[11px] text-emerald-300/90">
                  Unused prepaid rent will be credited to your wallet.
                </p>
              </>
            ) : null}
            {rent.scenario === 'partial' ? (
              <>
                <Row label="Remaining rent liability" value={paiseToInr(rent.remainingRentLiabilityPaise)} />
                <Row label="Move-out-date adjustment" value={paiseToInr(rent.rentThroughVacatingPaise)} />
                <Row
                  label="Final rent amount used in settlement"
                  value={paiseToInr(rent.finalRentSettlementPaise)}
                />
              </>
            ) : null}
          </dl>
        </div>

        <div className="space-y-2 border-t border-white/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Electricity</p>
          {electricity.previousBillPaise > 0 ? (
            <>
              <Row label="Previous bill" value={paiseToInr(electricity.previousBillPaise)} />
              <p className="text-[11px] text-apg-silver">
                Status: {electricity.previousBillStatus === 'pending' ? 'Pending' : 'Due'} — included in
                final settlement.
              </p>
            </>
          ) : null}
          <Row label="Current stay electricity" value={electricity.currentStayLabel} />
          <Row
            label="Final amount"
            value={
              electricity.finalAmountPending
                ? 'Pending final calculation'
                : electricity.finalAmountPaise != null
                  ? paiseToInr(electricity.finalAmountPaise)
                  : '—'
            }
          />
          <p className="text-[11px] text-apg-silver">{electricity.summaryLine}</p>
        </div>

        <div className="space-y-2 border-t border-white/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
            Move-out settlement
          </p>
          <dl className="space-y-2">
            <Row label="Deposit held" value={paiseToInr(settlement.depositHeldPaise)} />
            <Row
              label={`Rent through ${preview.rentChargedThroughLabel.split(' ').slice(0, 2).join(' ')}`}
              value={paiseToInr(settlement.rentThroughVacatingPaise)}
            />
            {settlement.unusedPrepaidRentPaise > 0 ? (
              <Row label="Unused prepaid rent" value={paiseToInr(settlement.unusedPrepaidRentPaise)} accent />
            ) : null}
            <Row
              label="Electricity due"
              value={
                settlement.electricityPending
                  ? 'Pending final calculation'
                  : settlement.electricityDuePaise != null
                    ? paiseToInr(settlement.electricityDuePaise)
                    : paiseToInr(0)
              }
            />
            {settlement.otherDeductionsPaise > 0 ? (
              <Row label="Other deductions" value={paiseToInr(settlement.otherDeductionsPaise)} />
            ) : null}
          </dl>
          <div className="border-t border-white/10 pt-3">
            <Row
              label="Estimated amount to wallet"
              value={`${settlement.showApproxPrefix ? '~' : ''}${paiseToInr(settlement.estimatedWalletPaise)}`}
              accent
            />
          </div>
          <p className="text-[11px] text-apg-silver">
            Deposit is shown separately from rent. This is a projection — final settlement is confirmed
            after admin review.
          </p>
        </div>
      </ApgCard>
    </div>
  );
}

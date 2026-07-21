'use client';

import { paiseToInr } from '@/src/lib/format';
import type { PaymentReviewBreakdown } from '@/src/lib/operations/paymentReviewBreakdown';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

function Row({
  label,
  value,
  emphasize = false,
  tone,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-emerald-300'
      : tone === 'warning'
        ? 'text-amber-200'
        : tone === 'danger'
          ? 'text-rose-300'
          : emphasize
            ? 'text-white'
            : 'text-white';

  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="text-apg-silver">{label}</dt>
      <dd
        className={`shrink-0 text-right tabular-nums ${
          emphasize ? 'text-base font-semibold' : 'font-medium'
        } ${valueClass}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Decision-first payment review — what happened and what needs attention. Allocation is edited at approve time. */
export function PaymentReviewEssentials({
  item,
  breakdown,
}: {
  item: PendingPaymentReviewItem;
  breakdown: PaymentReviewBreakdown;
}) {
  const contextLine = [breakdown.pgName, breakdown.roomBed, breakdown.stayDuration]
    .filter(Boolean)
    .join(' · ');

  const diffLabel =
    breakdown.differenceTone === 'exact'
      ? `${paiseToInr(0)} ✓`
      : breakdown.differenceTone === 'short'
        ? `${paiseToInr(Math.abs(breakdown.differencePaise))} short`
        : `${paiseToInr(breakdown.differencePaise)} extra`;

  const showAttention =
    breakdown.differenceTone !== 'exact' ||
    breakdown.priorOutstandingDuePaise > 0 ||
    item.bookingPaymentReview?.canPartialApprove;

  return (
    <div className="rounded-xl border border-white/10 bg-[#121820] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{breakdown.bookingType}</p>
          {contextLine ? (
            <p className="mt-0.5 text-xs text-apg-silver">{contextLine}</p>
          ) : null}
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
          {breakdown.statusLabel}
        </span>
      </div>

      <div className="my-4 border-t border-white/10" />

      <dl className="space-y-2.5">
        {breakdown.roomChargesDuePaise > 0 ? (
          <Row label="Room charges due" value={paiseToInr(breakdown.roomChargesDuePaise)} />
        ) : null}
        {breakdown.securityDepositDuePaise > 0 ? (
          <Row
            label="Security deposit due"
            value={paiseToInr(breakdown.securityDepositDuePaise)}
          />
        ) : null}
        {breakdown.priorOutstandingDuePaise > 0 ? (
          <Row
            label="Prior outstanding"
            value={paiseToInr(breakdown.priorOutstandingDuePaise)}
            tone="warning"
          />
        ) : null}
        <Row label="Total expected" value={paiseToInr(breakdown.totalExpectedPaise)} emphasize />
        <Row
          label="Resident paid"
          value={paiseToInr(breakdown.receivedPaise)}
          emphasize
          tone="success"
        />
      </dl>

      {showAttention ? (
        <div className="mt-4 space-y-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100">
          {breakdown.differenceTone !== 'exact' ? (
            <Row
              label="Difference"
              value={diffLabel}
              tone={breakdown.differenceTone === 'short' ? 'warning' : 'danger'}
            />
          ) : null}
          {breakdown.differenceTone === 'short' && breakdown.remainingBalancePaise > 0 ? (
            <p>{paiseToInr(breakdown.remainingBalancePaise)} still due after this payment.</p>
          ) : null}
          {breakdown.differenceTone === 'excess' ? (
            <p>Payment exceeds expected — split the extra when allocating.</p>
          ) : null}
          {item.bookingPaymentReview?.canPartialApprove ? (
            <p>Partial deposit expected — set deposit balance due date when allocating.</p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-4 text-xs text-apg-silver">
        Approve opens editable rent / deposit / electricity allocation. You decide where every rupee goes.
      </p>
    </div>
  );
}

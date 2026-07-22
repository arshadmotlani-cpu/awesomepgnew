'use client';

import { paiseToInr } from '@/src/lib/format';
import type { PaymentReviewBreakdown } from '@/src/lib/operations/paymentReviewBreakdown';

function Row({
  label,
  value,
  emphasize = false,
  tone,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  tone?: 'success' | 'warning' | 'danger' | 'muted';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-emerald-300'
      : tone === 'warning'
        ? 'text-amber-200'
        : tone === 'danger'
          ? 'text-rose-300'
          : tone === 'muted'
            ? 'text-apg-silver'
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

/**
 * Decision-first payment summary for admin review — what happened, what needs attention.
 */
export function PaymentBreakdownSection({
  breakdown,
}: {
  breakdown: PaymentReviewBreakdown;
}) {
  const diffLabel =
    breakdown.differenceTone === 'exact'
      ? `${paiseToInr(0)} ✓`
      : breakdown.differenceTone === 'short'
        ? `${paiseToInr(Math.abs(breakdown.differencePaise))} short`
        : `${paiseToInr(breakdown.differencePaise)} extra`;

  const diffTone =
    breakdown.differenceTone === 'exact'
      ? 'success'
      : breakdown.differenceTone === 'short'
        ? 'warning'
        : 'danger';

  const contextLine = [breakdown.pgName, breakdown.roomBed, breakdown.stayDuration]
    .filter(Boolean)
    .join(' · ');

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
          <Row label="Room charges" value={paiseToInr(breakdown.roomChargesDuePaise)} />
        ) : null}
        {breakdown.securityDepositDuePaise > 0 ? (
          <Row
            label="Security deposit"
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
        <Row
          label="Total expected"
          value={paiseToInr(breakdown.totalExpectedPaise)}
          emphasize
        />
        <Row
          label="Resident paid"
          value={paiseToInr(breakdown.receivedPaise)}
          emphasize
          tone="success"
        />
        <Row label="Difference" value={diffLabel} tone={diffTone} emphasize />
      </dl>

      {breakdown.differenceTone === 'short' && breakdown.remainingBalancePaise > 0 ? (
        <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {paiseToInr(breakdown.remainingBalancePaise)} still due after this payment.
        </p>
      ) : null}
      {breakdown.differenceTone === 'excess' ? (
        <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          Payment exceeds expected — review the screenshot before approving.
        </p>
      ) : null}
    </div>
  );
}

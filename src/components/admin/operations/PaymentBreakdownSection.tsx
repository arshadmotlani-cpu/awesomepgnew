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
 * 5-second payment story for admins — computed from booking/invoice SSOT.
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

  return (
    <div className="rounded-xl border border-white/10 bg-[#121820] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-apg-silver/80">
        Payment breakdown
      </p>

      <dl className="mt-3 space-y-2.5">
        <Row label="Booking Type" value={breakdown.bookingType} />
        <Row label="PG" value={breakdown.pgName} />
        <Row label="Room" value={breakdown.roomBed} />
        {breakdown.stayDuration ? (
          <Row label="Stay Duration" value={breakdown.stayDuration} />
        ) : null}
      </dl>

      <div className="my-4 border-t border-white/10" />

      <dl className="space-y-2.5">
        {breakdown.roomChargesDuePaise > 0 ? (
          <Row label="Room Charges" value={paiseToInr(breakdown.roomChargesDuePaise)} />
        ) : null}
        {breakdown.securityDepositDuePaise > 0 ? (
          <Row
            label="Security Deposit"
            value={paiseToInr(breakdown.securityDepositDuePaise)}
          />
        ) : null}
        {breakdown.priorOutstandingDuePaise > 0 ? (
          <Row
            label="Prior Outstanding"
            value={paiseToInr(breakdown.priorOutstandingDuePaise)}
          />
        ) : null}
        <Row
          label="Total Expected"
          value={paiseToInr(breakdown.totalExpectedPaise)}
          emphasize
        />
        <Row
          label="Payment Screenshot Amount"
          value={paiseToInr(breakdown.receivedPaise)}
          emphasize
          tone="success"
        />
        <Row label="Difference" value={diffLabel} tone={diffTone} emphasize />
        <Row label="Payment Status" value={breakdown.statusLabel} />
      </dl>

      <div className="my-4 border-t border-white/10" />

      <p className="text-[11px] font-semibold uppercase tracking-widest text-apg-silver/80">
        Payment allocation
      </p>
      <p className="mt-1 text-xs text-apg-silver">
        Where every rupee goes when you approve.
      </p>

      <dl className="mt-3 space-y-2.5">
        <Row
          label="Resident Paid"
          value={paiseToInr(breakdown.receivedPaise)}
          emphasize
        />
        {breakdown.roomChargesPaidPaise > 0 ? (
          <Row
            label={
              breakdown.differenceTone === 'short' &&
              breakdown.roomChargesPaidPaise >= breakdown.roomChargesDuePaise
                ? 'Room Charges ✓'
                : 'Room Charges'
            }
            value={paiseToInr(breakdown.roomChargesPaidPaise)}
            tone="success"
          />
        ) : null}
        {breakdown.depositPaidPaise > 0 || breakdown.securityDepositDuePaise > 0 ? (
          <Row
            label={
              breakdown.differenceTone === 'short' ? 'Deposit Paid' : 'Security Deposit'
            }
            value={paiseToInr(breakdown.depositPaidPaise)}
            tone={breakdown.depositPaidPaise > 0 ? 'success' : 'muted'}
          />
        ) : null}
        {breakdown.depositRemainingPaise > 0 ? (
          <Row
            label="Deposit Remaining"
            value={paiseToInr(breakdown.depositRemainingPaise)}
            tone="warning"
          />
        ) : null}
        {breakdown.priorPaidPaise > 0 ? (
          <Row
            label="Prior Outstanding Paid"
            value={paiseToInr(breakdown.priorPaidPaise)}
          />
        ) : null}
        {breakdown.extraReceivedPaise > 0 ? (
          <>
            <Row
              label="Expected Payment"
              value={paiseToInr(breakdown.totalExpectedPaise)}
            />
            <Row
              label="Extra Received"
              value={paiseToInr(breakdown.extraReceivedPaise)}
              tone="danger"
              emphasize
            />
          </>
        ) : null}
        <Row
          label="Remaining Balance"
          value={paiseToInr(breakdown.remainingBalancePaise)}
          emphasize
          tone={breakdown.remainingBalancePaise === 0 ? 'success' : 'warning'}
        />
      </dl>
    </div>
  );
}

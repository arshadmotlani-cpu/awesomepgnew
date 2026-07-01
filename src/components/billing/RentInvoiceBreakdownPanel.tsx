'use client';

import { formatDate, paiseToInr } from '@/src/lib/format';
import type { RentInvoiceBreakdown } from '@/src/lib/billing/rentInvoiceBreakdownTypes';

type Theme = 'light' | 'dark';

type Props = {
  breakdown: RentInvoiceBreakdown;
  theme?: Theme;
};

export function RentInvoiceBreakdownPanel({ breakdown, theme = 'light' }: Props) {
  const dark = theme === 'dark';
  const shell = dark
    ? 'rounded-2xl border border-white/10 bg-white/[0.03]'
    : 'rounded-2xl border border-zinc-200 bg-zinc-50';
  const heading = dark ? 'text-apg-silver' : 'text-zinc-500';
  const text = dark ? 'text-white' : 'text-zinc-900';
  const muted = dark ? 'text-apg-silver' : 'text-zinc-600';
  const divider = dark ? 'border-white/10' : 'border-zinc-200';

  return (
    <section className={`${shell} p-4 sm:p-5`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>
        Rent calculation
      </p>
      <p className={`mt-1 text-sm font-medium ${text}`}>
        {breakdown.billingMonthLabel} · Invoice {breakdown.invoiceNumber}
      </p>

      <dl className={`mt-4 space-y-2 text-sm ${text}`}>
        <Row label="Billing month" value={breakdown.billingMonthLabel} muted={muted} />
        <Row label="Monthly rent" value={paiseToInr(breakdown.monthlyRentPaise)} muted={muted} />
        <Row label="Occupancy" value={breakdown.occupancyLabel} muted={muted} />
        <Row label="Room / bed" value={`${breakdown.roomNumber} · ${breakdown.bedCode}`} muted={muted} />
        {breakdown.discountsPaise > 0 ? (
          <Row label="Discounts" value={`−${paiseToInr(breakdown.discountsPaise)}`} muted={muted} />
        ) : null}
        {breakdown.creditsPaise > 0 ? (
          <Row label="Credits applied" value={`−${paiseToInr(breakdown.creditsPaise)}`} muted={muted} />
        ) : null}
        {breakdown.previousBalancePaise > 0 ? (
          <Row
            label="Previous balance"
            value={paiseToInr(breakdown.previousBalancePaise)}
            muted={muted}
          />
        ) : null}
        {breakdown.proration ? (
          <>
            <div className={`border-t pt-3 ${divider}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${heading}`}>
                Pro-rated stay
              </p>
            </div>
            {breakdown.proration.checkInDate ? (
              <Row label="Check-in date" value={formatDate(breakdown.proration.checkInDate)} muted={muted} />
            ) : null}
            {breakdown.proration.checkOutDate ? (
              <Row
                label="Checkout date"
                value={formatDate(breakdown.proration.checkOutDate)}
                muted={muted}
              />
            ) : null}
            <Row
              label="Days stayed"
              value={`${breakdown.proration.daysStayed} of ${breakdown.proration.daysInMonth}`}
              muted={muted}
            />
            <Row
              label="Calculated share"
              value={paiseToInr(breakdown.proration.calculatedSharePaise)}
              muted={muted}
            />
            {breakdown.proration.amountAlreadyCollectedPaise > 0 ? (
              <Row
                label="Amount already collected"
                value={`−${paiseToInr(breakdown.proration.amountAlreadyCollectedPaise)}`}
                muted={muted}
              />
            ) : null}
            {breakdown.proration.remainingAmountPaise !== breakdown.proration.calculatedSharePaise ? (
              <Row
                label="Remaining amount"
                value={paiseToInr(breakdown.proration.remainingAmountPaise)}
                muted={muted}
              />
            ) : null}
          </>
        ) : null}
        <div className={`border-t pt-2 ${divider}`}>
          <Row label="Final amount" value={paiseToInr(breakdown.finalRentPaise)} muted={muted} emphasis />
        </div>
        {breakdown.lateFeePaise > 0 ? (
          <Row label="Late fee" value={paiseToInr(breakdown.lateFeePaise)} muted={muted} />
        ) : null}
        {(breakdown.paidPrincipalPaise > 0 || breakdown.paidLateFeePaise > 0) && (
          <Row
            label="Already paid"
            value={`−${paiseToInr(breakdown.paidPrincipalPaise + breakdown.paidLateFeePaise)}`}
            muted={muted}
          />
        )}
        <Row
          label="Balance due"
          value={paiseToInr(breakdown.balanceDuePaise)}
          muted={muted}
          accent
        />
        <Row label="Due date" value={formatDate(breakdown.dueDate)} muted={muted} />
      </dl>
    </section>
  );
}

function Row({
  label,
  value,
  muted,
  emphasis,
  accent,
}: {
  label: string;
  value: string;
  muted: string;
  emphasis?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className={muted}>{label}</dt>
      <dd
        className={
          accent
            ? 'text-lg font-bold text-[#FF5A1F]'
            : emphasis
              ? 'font-semibold tabular-nums'
              : 'font-medium tabular-nums text-right'
        }
      >
        {value}
      </dd>
    </div>
  );
}

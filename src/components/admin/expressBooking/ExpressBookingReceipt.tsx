'use client';

import { paiseToInr } from '@/src/lib/format';
import type {
  ExpressBookingQuote,
  ExpressBookingResidentContext,
  ExpressBookingStayType,
  ExpressBookingPaymentStatus,
} from '@/src/lib/admin/expressBookingTypes';
import { posGlassCard } from '@/src/components/admin/expressBooking/expressBookingStyles';

export function ExpressBookingReceipt({
  residentName,
  ctx,
  stayType,
  quote,
  depositPaidPaise,
  amountReceivedPaise,
  paymentStatus,
  selectedBedLabel,
}: {
  residentName: string;
  ctx: ExpressBookingResidentContext | null;
  stayType: ExpressBookingStayType;
  quote: ExpressBookingQuote | null;
  depositPaidPaise: number;
  amountReceivedPaise: number;
  paymentStatus: ExpressBookingPaymentStatus;
  selectedBedLabel: string | null;
}) {
  const rentPaise = quote?.rentPaise ?? 0;
  const totalPaise =
    stayType === 'continue' ? rentPaise + (quote?.depositPaise ?? 0) : rentPaise;

  let alreadyPaid = depositPaidPaise;
  if (paymentStatus === 'paid_in_full') {
    alreadyPaid += rentPaise;
  } else if (paymentStatus === 'partially_paid') {
    alreadyPaid += amountReceivedPaise;
  }

  const balanceDue = Math.max(0, totalPaise - alreadyPaid);

  return (
    <div className={`${posGlassCard} sticky top-4`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#FF5A1F]">
        Invoice preview
      </p>
      <div className="mt-4 space-y-3 border-b border-white/10 pb-4 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-apg-silver">Resident</span>
          <span className="text-right font-medium text-white">{residentName || '—'}</span>
        </div>
        {ctx?.activeTenancy ? (
          <div className="flex justify-between gap-4">
            <span className="text-apg-silver">Current bed</span>
            <span className="text-right text-white">
              {ctx.activeTenancy.pgName} · {ctx.activeTenancy.roomNumber} ·{' '}
              {ctx.activeTenancy.bedCode}
            </span>
          </div>
        ) : null}
        {selectedBedLabel ? (
          <div className="flex justify-between gap-4">
            <span className="text-apg-silver">New booking bed</span>
            <span className="text-right text-white">{selectedBedLabel}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <span className="text-apg-silver">Stay</span>
          <span className="text-white">
            {stayType === 'fixed' ? 'Fixed stay' : 'Monthly stay'}
            {quote?.isHistorical ? ' · historical' : ''}
          </span>
        </div>
        {stayType === 'fixed' && quote && quote.days > 0 ? (
          <>
            <div className="flex justify-between gap-4">
              <span className="text-apg-silver">Days</span>
              <span className="text-white">{quote.days}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-apg-silver">Daily rate</span>
              <span className="text-white">{paiseToInr(quote.dailyRatePaise)}</span>
            </div>
          </>
        ) : null}
        <div className="flex justify-between gap-4">
          <span className="text-apg-silver">Total rent</span>
          <span className="text-white">{paiseToInr(rentPaise)}</span>
        </div>
        {stayType === 'continue' && quote ? (
          <div className="flex justify-between gap-4">
            <span className="text-apg-silver">Deposit</span>
            <span className="text-white">{paiseToInr(quote.depositPaise)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <span className="text-apg-silver">Already paid</span>
          <span className="text-emerald-300">{paiseToInr(alreadyPaid)}</span>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-apg-muted">
          Balance due
        </span>
        <span className="text-3xl font-bold tabular-nums text-white">
          {paiseToInr(balanceDue)}
        </span>
      </div>
    </div>
  );
}

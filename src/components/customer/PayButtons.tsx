'use client';

import { QrPaymentNotice } from './QrPaymentNotice';

/** Booking checkout now uses PG QR payments instead of Razorpay. */
export function RazorpayCheckoutButton({
  bookingCode,
  totalLabel,
}: {
  bookingCode: string;
  totalLabel: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">
        Booking <span className="font-mono font-medium">{bookingCode}</span> — total{' '}
        <span className="font-semibold">{totalLabel}</span>
      </p>
      <QrPaymentNotice
        title="Complete payment via QR"
        description="Find your PG on the listings page, open Payments, choose the right category (e.g. Deposit or Rent), pay via UPI QR, and upload your screenshot for approval."
      />
    </div>
  );
}

export function MockPayButton({
  bookingCode,
  totalLabel,
}: {
  bookingCode: string;
  amountPaise: number;
  totalLabel: string;
}) {
  return <RazorpayCheckoutButton bookingCode={bookingCode} totalLabel={totalLabel} />;
}

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
        description="Scan the Rent, Deposit & Booking UPI QR (shiba.motlani@oksbi), pay the exact amount shown, and upload your screenshot for approval."
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

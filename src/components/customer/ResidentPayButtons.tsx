'use client';

import { QrPaymentNotice } from './QrPaymentNotice';

export function ResidentPayButtons({
  purpose,
  totalLabel,
}: {
  invoiceId: string;
  purpose: 'rent' | 'electricity';
  totalLabel: string;
  amountPaise?: number;
  provider?: 'mock' | 'razorpay';
}) {
  const categoryHint = purpose === 'rent' ? 'Rent' : 'Electricity';
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">
        Amount due: <span className="font-semibold">{totalLabel}</span>
      </p>
      <QrPaymentNotice
        title={`Pay ${categoryHint} via QR`}
        description={`Open your PG on /pgs, go to Payments, select "${categoryHint}", scan the QR, pay via UPI, and upload your screenshot.`}
      />
    </div>
  );
}

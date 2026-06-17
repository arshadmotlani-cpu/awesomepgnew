'use client';

import { DepositRefundRequestForm } from '@/src/components/customer/account/DepositRefundRequestForm';

export function ResidentRequestForms({
  bookingId,
  refundableBalancePaise,
  hasOpenVacating,
}: {
  bookingId: string;
  refundableBalancePaise: number;
  hasOpenVacating: boolean;
}) {
  return (
    <div className="grid gap-4">
      {hasOpenVacating ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          You have a vacating notice on file. After admin approves vacating, submit the refund
          request below with your <strong>final meter photo</strong> (or average billing fallback)
          and <strong>UPI ID or QR</strong> so we can process your deposit refund.
        </div>
      ) : null}

      <DepositRefundRequestForm
        bookingId={bookingId}
        refundableBalancePaise={refundableBalancePaise}
      />
    </div>
  );
}

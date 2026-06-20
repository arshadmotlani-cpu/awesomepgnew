'use client';

import { DepositRefundRequestForm } from '@/src/components/customer/account/DepositRefundRequestForm';
import { getDepositRefundEligibility } from '@/src/lib/vacating/depositRefundEligibility';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';

export function ResidentRequestForms({
  bookingId,
  refundableBalancePaise,
  vacating,
}: {
  bookingId: string;
  refundableBalancePaise: number;
  vacating: VacatingForBookingRow | null;
}) {
  const eligibility = getDepositRefundEligibility({ vacating });

  if (!eligibility.canRequestRefund) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">Deposit refund locked</p>
        <p className="mt-1 text-xs">{eligibility.lockReason}</p>
      </div>
    );
  }

  return (
    <DepositRefundRequestForm
      bookingId={bookingId}
      refundableBalancePaise={refundableBalancePaise}
      estimatedDeductionPaise={vacating?.deductionPaise ?? 0}
    />
  );
}

'use client';

import { useState } from 'react';
import { ApgCard } from '@/src/components/customer/design-system';
import { DepositRefundRequestForm } from '@/src/components/customer/account/DepositRefundRequestForm';
import type { DepositRefundSettlementPreview } from '@/src/lib/deposits/depositRefundSettlementPreview';

const PRIMARY_BTN =
  'flex w-full min-h-[52px] items-center justify-center rounded-xl bg-[#FF5A1F] px-6 py-3.5 text-base font-semibold text-white hover:brightness-110';

export function ResidentRequestForms({
  bookingId,
  customerId,
  refundableBalancePaise,
  hasOpenVacating,
  settlementPreview = null,
}: {
  bookingId: string;
  customerId?: string;
  refundableBalancePaise: number;
  hasOpenVacating: boolean;
  settlementPreview?: DepositRefundSettlementPreview | null;
}) {
  const [showRefundForm, setShowRefundForm] = useState(false);

  return (
    <div className="grid gap-4">
      {hasOpenVacating ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          You have a vacating notice on file. After checkout is complete, use{' '}
          <strong>Request Refund</strong> below with your final meter photo (if applicable) and UPI
          details so we can process your deposit refund.
        </div>
      ) : null}

      {!showRefundForm ? (
        <ApgCard tier="account" className="p-5">
          <h3 className="text-sm font-semibold text-zinc-900">Request refund</h3>
          <p className="mt-1 text-xs text-zinc-600">
            Submit your UPI ID or QR code, final electricity meter photo (if metered), and optional
            remarks. Track status here in your Wallet.
          </p>
          <button
            type="button"
            onClick={() => setShowRefundForm(true)}
            className={`${PRIMARY_BTN} mt-4`}
          >
            Request refund
          </button>
        </ApgCard>
      ) : (
        <DepositRefundRequestForm
          bookingId={bookingId}
          customerId={customerId}
          refundableBalancePaise={refundableBalancePaise}
          settlementPreview={settlementPreview}
          onSubmitted={() => setShowRefundForm(false)}
        />
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { ConfirmationGate } from '@/src/components/customer/design-system';
import { DepositRefundRequestForm } from '@/src/components/customer/account/DepositRefundRequestForm';
import { RequestSuccessState } from '@/src/components/customer/account/resident/requests/RequestSuccessState';
import { residentTabHref } from '@/src/lib/accountNavigation';
import { paiseToInr } from '@/src/lib/format';

export function DepositRefundRequestFlow({
  bookingId,
  refundableBalancePaise,
  estimatedDeductionPaise = 0,
  onDone,
  onBack,
}: {
  bookingId: string;
  refundableBalancePaise: number;
  estimatedDeductionPaise?: number;
  onDone: () => void;
  onBack: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <RequestSuccessState
        title="Refund review pending"
        statusLabel="Pending admin review"
        nextStep="Admin will verify your meter reading, calculate final electricity, and process your deposit refund."
        primaryHref={residentTabHref('requests')}
        primaryLabel="Back to requests"
      />
    );
  }

  if (!confirmed) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="text-xs text-zinc-500 hover:text-zinc-800">
          ← Back
        </button>
        <ConfirmationGate
          title="Submit deposit refund details?"
          message={
            <>
              You are sharing refund details for{' '}
              <strong>{paiseToInr(refundableBalancePaise)}</strong> held as deposit. Admin will
              verify your final meter reading and process your refund.
            </>
          }
          confirmLabel="Continue to form"
          cancelLabel="Go back"
          onConfirm={() => setConfirmed(true)}
          onCancel={onBack}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setConfirmed(false)}
        className="text-xs text-zinc-500 hover:text-zinc-800"
      >
        ← Back to confirmation
      </button>
      <DepositRefundRequestForm
        bookingId={bookingId}
        refundableBalancePaise={refundableBalancePaise}
        estimatedDeductionPaise={estimatedDeductionPaise}
        onSubmitted={() => setSubmitted(true)}
      />
    </div>
  );
}

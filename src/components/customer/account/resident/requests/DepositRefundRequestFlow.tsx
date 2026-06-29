'use client';

import { useState } from 'react';
import { ConfirmationGate } from '@/src/components/customer/design-system';
import { DepositRefundRequestForm } from '@/src/components/customer/account/DepositRefundRequestForm';
import { RequestSuccessState } from '@/src/components/customer/account/resident/requests/RequestSuccessState';
import { residentTabHref } from '@/src/lib/accountNavigation';
import { paiseToInr, coerceNonNegativePaise } from '@/src/lib/format';

export function DepositRefundRequestFlow({
  bookingId,
  customerId,
  refundableBalancePaise,
  estimatedDeductionPaise = 0,
  rejectionReason = null,
  onDone,
  onBack,
}: {
  bookingId: string;
  customerId?: string;
  refundableBalancePaise: number;
  estimatedDeductionPaise?: number;
  rejectionReason?: string | null;
  onDone: () => void;
  onBack: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const depositHeld = coerceNonNegativePaise(refundableBalancePaise);
  const noticeDeduction = coerceNonNegativePaise(estimatedDeductionPaise);

  if (!bookingId.trim()) {
    return (
      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">Refund request unavailable</p>
        <p className="text-sm text-zinc-600">We could not find your booking for this refund request.</p>
        <button type="button" onClick={onBack} className="text-sm font-semibold text-indigo-600">
          ← Back
        </button>
      </div>
    );
  }

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
        {rejectionReason ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Please fix and resubmit: {rejectionReason}
          </p>
        ) : null}
        <ConfirmationGate
          title="Submit deposit refund details?"
          message={
            <>
              You are sharing refund details for{' '}
              <strong>{paiseToInr(depositHeld)}</strong> held as deposit. Admin will verify your
              final meter reading and process your refund.
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
        customerId={customerId}
        refundableBalancePaise={depositHeld}
        estimatedDeductionPaise={noticeDeduction}
        onSubmitted={() => setSubmitted(true)}
      />
    </div>
  );
}

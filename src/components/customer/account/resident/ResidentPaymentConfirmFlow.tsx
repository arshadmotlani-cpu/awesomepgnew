'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ConfirmationGate } from '@/src/components/customer/design-system';
import { UpiPaymentProofForm } from '@/src/components/customer/UpiPaymentProofForm';
import { ResidentPaymentSuccess } from '@/src/components/customer/account/resident/ResidentPaymentSuccess';

type SubmitResult = { ok: boolean; message?: string };

type Props = {
  confirmMessage: React.ReactNode;
  amountLabel: string;
  instructions?: string;
  qrImageUrl?: string | null;
  upiId?: string | null;
  existingProofUrl?: string | null;
  proofViewHref?: string;
  rejectionReason?: string | null;
  rejectionMessage?: string | null;
  uploadScreenshot: (formData: FormData) => Promise<string>;
  submitProof: (args: { screenshotUrl: string; transactionRef?: string }) => Promise<SubmitResult>;
  successChecklist: string[];
  backHref: string;
};

type Step = 'confirm' | 'pay' | 'success';

/**
 * Step 2 (ConfirmationGate) → UPI pay → Step 3 success.
 * Step 1 review is rendered by the server page above this component.
 */
export function ResidentPaymentConfirmFlow({
  confirmMessage,
  amountLabel,
  instructions,
  qrImageUrl,
  upiId,
  existingProofUrl,
  proofViewHref,
  rejectionReason,
  rejectionMessage,
  uploadScreenshot,
  submitProof,
  successChecklist,
  backHref,
}: Props) {
  const [step, setStep] = useState<Step>(
    existingProofUrl && !rejectionReason ? 'success' : 'confirm',
  );

  const rejectionBanner =
    rejectionReason || rejectionMessage ? (
      <div className="mb-6 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">
        <p className="font-semibold text-rose-200">Payment rejected</p>
        {rejectionReason ? (
          <p className="mt-2">
            <span className="font-medium">Reason:</span> {rejectionReason}
          </p>
        ) : null}
        {rejectionMessage ? <p className="mt-2 text-apg-silver">{rejectionMessage}</p> : null}
        <p className="mt-3 text-xs text-rose-100/90">Please upload a new payment screenshot below.</p>
      </div>
    ) : null;

  if (step === 'success') {
    return (
      <>
        {rejectionBanner}
        <ResidentPaymentSuccess
        amountLabel={amountLabel}
        checklist={successChecklist}
        backHref={backHref}
      />
      </>
    );
  }

  if (step === 'confirm') {
    return (
      <>
        {rejectionBanner}
        <ConfirmationGate
        title="Confirm payment"
        message={confirmMessage}
        confirmLabel="Confirm payment"
        cancelLabel="Go back"
        onConfirm={() => setStep('pay')}
        onCancel={() => {
          if (typeof window !== 'undefined') window.history.back();
        }}
      />
      </>
    );
  }

  return (
    <>
      {rejectionBanner}
      <UpiPaymentProofForm
      variant="light"
      amountLabel={amountLabel}
      instructions={instructions}
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      existingProofUrl={existingProofUrl}
      proofViewHref={proofViewHref}
      uploadScreenshot={uploadScreenshot}
      submitProof={async (args) => {
        const result = await submitProof(args);
        if (result.ok) setStep('success');
        return result;
      }}
      doneMessage=""
      heading="Pay with UPI"
    />
    </>
  );
}

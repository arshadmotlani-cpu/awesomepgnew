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
  uploadScreenshot,
  submitProof,
  successChecklist,
  backHref,
}: Props) {
  const [step, setStep] = useState<Step>(existingProofUrl ? 'success' : 'confirm');

  if (step === 'success') {
    return (
      <ResidentPaymentSuccess
        amountLabel={amountLabel}
        checklist={successChecklist}
        backHref={backHref}
      />
    );
  }

  if (step === 'confirm') {
    return (
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
    );
  }

  return (
    <UpiPaymentProofForm
      variant="light"
      amountLabel={amountLabel}
      instructions={instructions}
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      existingProofUrl={existingProofUrl}
      uploadScreenshot={uploadScreenshot}
      submitProof={async (args) => {
        const result = await submitProof(args);
        if (result.ok) setStep('success');
        return result;
      }}
      doneMessage=""
      heading="Pay with UPI"
    />
  );
}

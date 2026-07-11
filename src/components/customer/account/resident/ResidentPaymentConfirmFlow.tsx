'use client';

import { useState } from 'react';
import { ConfirmationGate } from '@/src/components/customer/design-system';
import { UpiPaymentProofForm } from '@/src/components/customer/UpiPaymentProofForm';
import { ResidentPaymentSuccess } from '@/src/components/customer/account/resident/ResidentPaymentSuccess';
import { PaymentRejectionStatusPanel } from '@/src/components/customer/payments/PaymentRejectionStatusPanel';

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
  rejectedAt?: Date | string | null;
  uploadScreenshot: (formData: FormData) => Promise<string>;
  submitProof: (args: { screenshotUrl: string; transactionRef?: string }) => Promise<SubmitResult>;
  logContext?: {
    page: string;
    invoiceId?: string;
    bookingId?: string;
    residentId?: string;
    paymentLinkId?: string;
    membershipId?: string;
    extensionId?: string;
  };
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
  rejectedAt,
  uploadScreenshot,
  submitProof,
  logContext,
  successChecklist,
  backHref,
}: Props) {
  const [step, setStep] = useState<Step>(
    existingProofUrl && !rejectionReason ? 'success' : 'confirm',
  );

  const rejectionBanner =
    rejectionReason || rejectionMessage ? (
      <div className="mb-6">
        <PaymentRejectionStatusPanel
          reasonLabel={rejectionReason ?? 'Payment rejected'}
          residentMessage={rejectionMessage}
          rejectedAt={rejectedAt}
          actionHref="#upload-new-screenshot"
          actionLabel="Upload New Screenshot"
          showTimeline
        />
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
      <div id="upload-new-screenshot">
        <UpiPaymentProofForm
          variant="light"
          amountLabel={amountLabel}
          instructions={instructions}
          qrImageUrl={qrImageUrl}
          upiId={upiId}
          existingProofUrl={existingProofUrl}
          proofViewHref={proofViewHref}
          uploadScreenshot={uploadScreenshot}
          logContext={logContext}
          submitProof={async (args) => {
            const result = await submitProof(args);
            if (result.ok) setStep('success');
            return result;
          }}
        />
      </div>
    </>
  );
}

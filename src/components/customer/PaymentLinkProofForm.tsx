'use client';

import { UpiPaymentProofForm } from '@/src/components/customer/UpiPaymentProofForm';
import {
  submitPaymentLinkProofAction,
  uploadPaymentLinkScreenshotAction,
} from '@/app/(customer)/pay/actions';

export function PaymentLinkProofForm({
  linkId,
  amountLabel,
  qrImageUrl,
  existingProofUrl,
  title,
}: {
  linkId: string;
  amountLabel: string;
  qrImageUrl?: string | null;
  existingProofUrl?: string | null;
  title?: string | null;
}) {
  return (
    <UpiPaymentProofForm
      amountLabel={amountLabel}
      heading={title ? `Pay: ${title}` : 'Pay via QR + upload proof'}
      instructions="Scan the QR, pay the exact amount via UPI, then upload a screenshot of the payment."
      qrImageUrl={qrImageUrl}
      existingProofUrl={existingProofUrl}
      uploadScreenshot={async (formData) => {
        formData.set('linkId', linkId);
        return uploadPaymentLinkScreenshotAction(formData);
      }}
      submitProof={async ({ screenshotUrl }) => {
        const result = await submitPaymentLinkProofAction(linkId, screenshotUrl);
        return { ok: result.ok, message: result.ok ? undefined : result.message };
      }}
    />
  );
}

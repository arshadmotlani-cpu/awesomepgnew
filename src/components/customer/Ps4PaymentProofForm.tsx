'use client';

import { customerPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { UpiPaymentProofForm } from './UpiPaymentProofForm';

export function Ps4PaymentProofForm({
  membershipId,
  amountLabel,
  uploadScreenshot,
  existingProofUrl,
  qrImageUrl,
  upiId,
}: {
  membershipId: string;
  amountLabel: string;
  uploadScreenshot: (formData: FormData) => Promise<string>;
  existingProofUrl?: string | null;
  qrImageUrl?: string | null;
  upiId?: string | null;
}) {
  return (
    <UpiPaymentProofForm
      amountLabel={amountLabel}
      heading="Pay PS4 add-on via UPI"
      instructions="Scan the QR, pay the PS4 gaming maintenance add-on via UPI, then upload your payment screenshot."
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      existingProofUrl={existingProofUrl}
      proofViewHref={customerPaymentProofViewUrl('playstation', membershipId)}
      uploadScreenshot={uploadScreenshot}
      doneMessage="Payment proof submitted. Your PS4 lounge access activates once admin verifies the UPI payment (usually within a few hours)."
      submitProof={async ({ screenshotUrl, transactionRef }) => {
        const res = await fetch(`/api/playstation/membership/${membershipId}/payment-proof`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentProofUrl: screenshotUrl,
            transactionRef,
          }),
        });
        const data = (await res.json()) as { ok: boolean; message?: string };
        return { ok: res.ok && data.ok, message: data.message };
      }}
    />
  );
}

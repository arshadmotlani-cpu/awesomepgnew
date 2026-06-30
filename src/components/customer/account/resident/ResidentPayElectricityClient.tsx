'use client';

import { customerPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { ResidentPaymentConfirmFlow } from '@/src/components/customer/account/resident/ResidentPaymentConfirmFlow';

export function ResidentPayElectricityClient({
  invoiceId,
  amountLabel,
  confirmMessage,
  qrImageUrl,
  upiId,
  existingProofUrl,
  uploadScreenshot,
  backHref,
}: {
  invoiceId: string;
  amountLabel: string;
  confirmMessage: string;
  qrImageUrl?: string | null;
  upiId?: string | null;
  existingProofUrl?: string | null;
  uploadScreenshot: (formData: FormData) => Promise<string>;
  backHref: string;
}) {
  return (
    <ResidentPaymentConfirmFlow
      confirmMessage={confirmMessage}
      amountLabel={amountLabel}
      instructions="Scan the QR, pay the exact amount due via UPI, then upload a photo of the payment."
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      existingProofUrl={existingProofUrl}
      proofViewHref={customerPaymentProofViewUrl('electricity', invoiceId)}
      uploadScreenshot={uploadScreenshot}
      submitProof={async ({ screenshotUrl }) => {
        const res = await fetch(`/api/electricity-invoice/${invoiceId}/payment-proof`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentProofUrl: screenshotUrl }),
        });
        const data = (await res.json()) as { ok: boolean; message?: string };
        return { ok: res.ok && data.ok, message: data.message };
      }}
      successChecklist={[
        'Payment screenshot saved on your electricity invoice',
        'Bill status will show as processing until verified',
        'Your wallet statement updates after approval',
      ]}
      backHref={backHref}
    />
  );
}

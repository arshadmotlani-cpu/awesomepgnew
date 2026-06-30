'use client';

import { customerPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { UpiPaymentProofForm } from './UpiPaymentProofForm';

export function ElectricityPaymentProofForm({
  invoiceId,
  amountLabel,
  uploadScreenshot,
  existingProofUrl,
  qrImageUrl,
  upiId,
}: {
  invoiceId: string;
  amountLabel: string;
  uploadScreenshot: (formData: FormData) => Promise<string>;
  existingProofUrl?: string | null;
  qrImageUrl?: string | null;
  upiId?: string | null;
}) {
  return (
    <UpiPaymentProofForm
      amountLabel={amountLabel}
      instructions="Scan the electricity / daily / reservation QR, pay via UPI, then upload a photo of the payment."
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      existingProofUrl={existingProofUrl}
      proofViewHref={customerPaymentProofViewUrl('electricity', invoiceId)}
      uploadScreenshot={uploadScreenshot}
      submitProof={async ({ screenshotUrl, transactionRef }) => {
        const res = await fetch(`/api/electricity-invoice/${invoiceId}/payment-proof`, {
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

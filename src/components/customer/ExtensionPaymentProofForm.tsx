'use client';

import { customerPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { UpiPaymentProofForm } from './UpiPaymentProofForm';

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function ExtensionPaymentProofForm({
  extensionId,
  amountLabel,
  uploadScreenshot,
  existingProofUrl,
  qrImageUrl,
  upiId,
}: {
  extensionId: string;
  amountLabel: string;
  uploadScreenshot: (formData: FormData) => Promise<string>;
  existingProofUrl?: string | null;
  qrImageUrl?: string | null;
  upiId?: string | null;
}) {
  return (
    <UpiPaymentProofForm
      amountLabel={amountLabel}
      heading="Pay extension via QR + upload proof"
      instructions="Scan the rent / deposit QR, pay the extension amount via UPI, then upload a photo of the payment."
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      existingProofUrl={existingProofUrl}
      proofViewHref={customerPaymentProofViewUrl('extension', extensionId)}
      uploadScreenshot={uploadScreenshot}
      logContext={{ page: 'extension-payment', extensionId }}
      submitProof={async ({ screenshotUrl, transactionRef }) => {
        const res = await fetch(`/api/stay-extension/${extensionId}/payment-proof`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentProofUrl: screenshotUrl,
            transactionRef,
          }),
        });
        const data = await safeJson<{ ok: boolean; message?: string }>(res);
        return { ok: Boolean(res.ok && data?.ok), message: data?.message ?? 'Request failed.' };
      }}
    />
  );
}

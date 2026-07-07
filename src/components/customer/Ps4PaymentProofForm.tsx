'use client';

import { customerPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { PS4_LOUNGE_HEADLINE, PS4_LOUNGE_HOURLY_NOTE } from '@/src/lib/playstation/plans';
import { UpiPaymentProofForm } from './UpiPaymentProofForm';

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

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
      instructions={`${PS4_LOUNGE_HEADLINE}. ${PS4_LOUNGE_HOURLY_NOTE} Scan the QR, pay the exact add-on amount via UPI, then upload your payment screenshot.`}
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      existingProofUrl={existingProofUrl}
      proofViewHref={customerPaymentProofViewUrl('playstation', membershipId)}
      uploadScreenshot={uploadScreenshot}
      logContext={{ page: 'ps4-payment', membershipId }}
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
        const data = await safeJson<{ ok: boolean; message?: string }>(res);
        return { ok: Boolean(res.ok && data?.ok), message: data?.message ?? 'Request failed.' };
      }}
    />
  );
}

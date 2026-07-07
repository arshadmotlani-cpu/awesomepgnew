'use client';

import { customerPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { ResidentPaymentConfirmFlow } from '@/src/components/customer/account/resident/ResidentPaymentConfirmFlow';

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function ResidentPayRentClient({
  invoiceId,
  amountLabel,
  confirmMessage,
  qrImageUrl,
  upiId,
  existingProofUrl,
  rejectionReason,
  rejectionMessage,
  uploadScreenshot,
  backHref,
  residentId,
}: {
  invoiceId: string;
  amountLabel: string;
  confirmMessage: string;
  qrImageUrl?: string | null;
  upiId?: string | null;
  existingProofUrl?: string | null;
  rejectionReason?: string | null;
  rejectionMessage?: string | null;
  uploadScreenshot: (formData: FormData) => Promise<string>;
  backHref: string;
  residentId?: string;
}) {
  return (
    <ResidentPaymentConfirmFlow
      confirmMessage={confirmMessage}
      amountLabel={amountLabel}
      instructions="Scan the QR, pay the exact amount due via UPI, then upload a photo of the payment."
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      existingProofUrl={existingProofUrl}
      rejectionReason={rejectionReason}
      rejectionMessage={rejectionMessage}
      proofViewHref={customerPaymentProofViewUrl('rent', invoiceId)}
      uploadScreenshot={uploadScreenshot}
      logContext={{ page: 'resident-pay-rent', invoiceId, residentId }}
      submitProof={async ({ screenshotUrl }) => {
        const res = await fetch(`/api/rent-invoice/${invoiceId}/payment-proof`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentProofUrl: screenshotUrl }),
        });
        const data = await safeJson<{ ok: boolean; message?: string }>(res);
        return { ok: Boolean(res.ok && data?.ok), message: data?.message ?? 'Request failed.' };
      }}
      successChecklist={[
        'Payment screenshot saved on your invoice',
        'Bill status will show as processing until verified',
        'Your wallet statement updates after approval',
      ]}
      backHref={backHref}
    />
  );
}

'use client';

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
  existingTransactionRef,
  qrImageUrl,
  upiId,
  rejectionReason,
  rejectionMessage,
}: {
  membershipId: string;
  amountLabel: string;
  existingTransactionRef?: string | null;
  qrImageUrl?: string | null;
  upiId?: string | null;
  rejectionReason?: string | null;
  rejectionMessage?: string | null;
}) {
  return (
    <UpiPaymentProofForm
      amountLabel={amountLabel}
      heading="Pay PS4 add-on via UPI"
      instructions={`${PS4_LOUNGE_HEADLINE}. ${PS4_LOUNGE_HOURLY_NOTE} Scan the QR, pay the exact add-on amount via UPI, then enter the transaction ID.`}
      qrImageUrl={qrImageUrl}
      upiId={upiId}
      existingTransactionRef={existingTransactionRef}
      rejectionReason={rejectionReason}
      rejectionMessage={rejectionMessage}
      logContext={{ page: 'ps4-payment', membershipId, uploadType: 'ps4_payment' }}
      doneMessage="Payment submitted. Your PS4 lounge access activates once admin verifies the UPI transaction ID (usually within a few hours)."
      submitProof={async ({ screenshotUrl, transactionRef }) => {
        const res = await fetch(`/api/playstation/membership/${membershipId}/payment-proof`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentProofUrl: screenshotUrl ?? null,
            transactionRef,
          }),
        });
        const data = await safeJson<{ ok: boolean; message?: string }>(res);
        return { ok: Boolean(res.ok && data?.ok), message: data?.message ?? 'Request failed.' };
      }}
    />
  );
}
